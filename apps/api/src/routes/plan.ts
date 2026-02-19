import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { generatePlan } from '@fangio/planner';
import { storePlan, emitEvent } from '../store.js';

const CreatePlanSchema = z.object({
  goal: z.string().min(1),
});

const planRequestCounters = new Map<string, { count: number; windowStartMs: number }>();

function getPlanRateLimitConfig(): { maxRequests: number; windowMs: number } {
  const maxRequests = Number.parseInt(process.env.PLAN_RATE_LIMIT_MAX || '30', 10);
  const windowMs = Number.parseInt(process.env.PLAN_RATE_LIMIT_WINDOW_MS || '60000', 10);

  return {
    maxRequests: Number.isFinite(maxRequests) && maxRequests > 0 ? maxRequests : 30,
    windowMs: Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 60000,
  };
}

function isPlanRateLimited(clientIp: string): boolean {
  const nowMs = Date.now();
  const { maxRequests, windowMs } = getPlanRateLimitConfig();
  const current = planRequestCounters.get(clientIp);

  if (!current || nowMs - current.windowStartMs >= windowMs) {
    planRequestCounters.set(clientIp, { count: 1, windowStartMs: nowMs });
    return false;
  }

  if (current.count >= maxRequests) {
    return true;
  }

  current.count += 1;
  return false;
}

export function resetPlanRateLimiter(): void {
  planRequestCounters.clear();
}

export async function planRoute(fastify: FastifyInstance) {
  fastify.post('/api/plan', async (request, reply) => {
    try {
      const clientIp = request.ip || 'unknown';
      if (isPlanRateLimited(clientIp)) {
        reply.status(429);
        return { error: 'Rate limit exceeded for plan creation' };
      }

      // Validate request body
      const body = CreatePlanSchema.parse(request.body);

      // Generate plan
      const plan = await generatePlan(body.goal);
      const approvalTimestamp = new Date().toISOString();

      // Auto-approve low-risk steps
      for (const step of plan.steps) {
        if (step.risk === 'low') {
          step.approved = true;
          step.approvedAt = approvalTimestamp;
        } else if (step.approved && !step.approvedAt) {
          step.approvedAt = approvalTimestamp;
        }
      }

      // Store plan
      await storePlan(plan);

      // Emit plan.created event
      emitEvent({
        planId: plan.planId,
        type: 'plan.created',
        data: { goal: plan.goal, stepCount: plan.steps.length },
        timestamp: new Date().toISOString(),
      });

      return { planId: plan.planId, plan };
    } catch (error: any) {
      reply.status(400);
      return { error: error.message || 'Invalid request' };
    }
  });
}
