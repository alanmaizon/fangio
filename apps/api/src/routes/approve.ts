import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getPlan, updatePlan, emitEvent } from '../store.js';

const ApproveStepsSchema = z.object({
  planId: z.string(),
  stepIds: z.array(z.string()),
});

export async function approveRoute(fastify: FastifyInstance) {
  fastify.post('/api/approve', async (request, reply) => {
    try {
      // Validate request body
      const body = ApproveStepsSchema.parse(request.body);

      // Get plan
      const plan = getPlan(body.planId);
      if (!plan) {
        reply.status(404);
        return { error: 'Plan not found' };
      }

      // Update approved status for specified steps
      for (const stepId of body.stepIds) {
        const step = plan.steps.find((s) => s.id === stepId);
        if (step) {
          step.approved = true;

          // Emit step.approved event
          emitEvent({
            planId: body.planId,
            type: 'step.approved',
            stepId,
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Update plan
      updatePlan(plan);

      return { ok: true };
    } catch (error: any) {
      reply.status(400);
      return { error: error.message || 'Invalid request' };
    }
  });
}
