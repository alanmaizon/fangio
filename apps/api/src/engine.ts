import type { Plan } from '@fangio/schema';
import { executeTool } from '@fangio/tools';
import { getPlan, emitEvent, persistRun } from './store.js';

export async function executePlan(planId: string): Promise<void> {
  const plan = getPlan(planId);
  if (!plan) {
    throw new Error(`Plan ${planId} not found`);
  }

  for (const step of plan.steps) {
    // Check if step is approved
    if (!step.approved) {
      if (step.risk === 'high') {
        emitEvent({
          planId,
          type: 'step.error',
          stepId: step.id,
          data: { error: 'High-risk step not approved, skipping' },
          timestamp: new Date().toISOString(),
        });
      } else {
        emitEvent({
          planId,
          type: 'step.error',
          stepId: step.id,
          data: { error: 'Step not approved, skipping' },
          timestamp: new Date().toISOString(),
        });
      }
      emitEvent({
        planId,
        type: 'step.finished',
        stepId: step.id,
        timestamp: new Date().toISOString(),
      });
      continue;
    }

    // Emit step started event
    emitEvent({
      planId,
      type: 'step.started',
      stepId: step.id,
      data: { tool: step.tool, args: step.args },
      timestamp: new Date().toISOString(),
    });

    try {
      // Execute the tool
      const result = await executeTool(step.tool, step.args);

      // Emit step output event
      emitEvent({
        planId,
        type: 'step.output',
        stepId: step.id,
        data: result,
        timestamp: new Date().toISOString(),
      });

      // Emit step finished event
      emitEvent({
        planId,
        type: 'step.finished',
        stepId: step.id,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      // Emit step error event
      emitEvent({
        planId,
        type: 'step.error',
        stepId: step.id,
        data: { error: error.message || String(error) },
        timestamp: new Date().toISOString(),
      });

      // Still emit finished
      emitEvent({
        planId,
        type: 'step.finished',
        stepId: step.id,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Emit execution finished event
  emitEvent({
    planId,
    type: 'execution.finished',
    timestamp: new Date().toISOString(),
  });

  // Persist the run to disk
  await persistRun(planId);
}
