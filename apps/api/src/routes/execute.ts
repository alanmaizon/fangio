import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getPlan } from '../store.js';
import { executePlan } from '../engine.js';

const ExecutePlanSchema = z.object({
  planId: z.string(),
});

export async function executeRoute(fastify: FastifyInstance) {
  fastify.post('/api/execute', async (request, reply) => {
    try {
      // Validate request body
      const body = ExecutePlanSchema.parse(request.body);

      // Get plan
      const plan = getPlan(body.planId);
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
