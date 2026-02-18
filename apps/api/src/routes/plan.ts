import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { generatePlan } from '@fangio/planner';
import { storePlan, emitEvent } from '../store.js';

const CreatePlanSchema = z.object({
  goal: z.string().min(1),
});

export async function planRoute(fastify: FastifyInstance) {
  fastify.post('/api/plan', async (request, reply) => {
    try {
      // Validate request body
      const body = CreatePlanSchema.parse(request.body);

      // Generate plan
      const plan = await generatePlan(body.goal);

      // Auto-approve low-risk steps
      for (const step of plan.steps) {
        if (step.risk === 'low') {
          step.approved = true;
        }
      }

      // Store plan
      storePlan(plan);

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
