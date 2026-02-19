import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getPlanOrLoad, updatePlan } from '../store.js';
import { executePlan } from '../engine.js';

const ExecutePlanSchema = z.object({
  planId: z.string(),
});

function getApprovalTtlMs(): number | null {
  const ttlMinutes = Number.parseInt(process.env.APPROVAL_TTL_MINUTES || '15', 10);
  if (!Number.isFinite(ttlMinutes) || ttlMinutes <= 0) {
    return null;
  }
  return ttlMinutes * 60 * 1000;
}

export async function executeRoute(fastify: FastifyInstance) {
  fastify.post('/api/execute', async (request, reply) => {
    try {
      // Validate request body
      const body = ExecutePlanSchema.parse(request.body);

      // Get plan
      const plan = await getPlanOrLoad(body.planId);
      if (!plan) {
        reply.status(404);
        return { error: 'Plan not found' };
      }

      // Check if all steps are approved
      const unapprovedSteps = plan.steps.filter((step) => !step.approved);
      if (unapprovedSteps.length > 0) {
        reply.status(400);
        return {
          error: 'Not all steps are approved',
          unapprovedStepIds: unapprovedSteps.map((s) => s.id),
        };
      }

      // Check if approvals are still valid
      const approvalTtlMs = getApprovalTtlMs();
      if (approvalTtlMs !== null) {
        const nowMs = Date.now();
        const expiredSteps = plan.steps.filter((step) => {
          if (!step.approved) {
            return false;
          }

          if (!step.approvedAt) {
            return true;
          }

          const approvedAtMs = Date.parse(step.approvedAt);
          return Number.isNaN(approvedAtMs) || nowMs - approvedAtMs > approvalTtlMs;
        });

        if (expiredSteps.length > 0) {
          for (const step of expiredSteps) {
            step.approved = false;
            step.approvedAt = undefined;
          }
          await updatePlan(plan);

          reply.status(400);
          return {
            error: 'One or more step approvals have expired and must be re-approved',
            expiredStepIds: expiredSteps.map((step) => step.id),
          };
        }
      }

      // Kick off async execution (don't await)
      executePlan(body.planId).catch((error) => {
        console.error('Execution error:', error);
      });

      return { ok: true };
    } catch (error: any) {
      reply.status(400);
      return { error: error.message || 'Invalid request' };
    }
  });
}
