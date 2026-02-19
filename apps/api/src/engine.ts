import { executeTool } from '@fangio/tools';
import { getPlanOrLoad, emitEvent, persistRun } from './store.js';
import { withEventContext } from './event-context.js';

export async function executePlan(planId: string): Promise<void> {
  const plan = await getPlanOrLoad(planId);
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
          data: withEventContext(plan, { error: 'High-risk step not approved, skipping' }),
          timestamp: new Date().toISOString(),
        });
      } else {
        emitEvent({
          planId,
          type: 'step.error',
          stepId: step.id,
          data: withEventContext(plan, { error: 'Step not approved, skipping' }),
          timestamp: new Date().toISOString(),
        });
      }
      emitEvent({
        planId,
        type: 'step.finished',
        stepId: step.id,
        data: withEventContext(plan),
        timestamp: new Date().toISOString(),
      });
      continue;
    }

    // Emit step started event
    emitEvent({
      planId,
      type: 'step.started',
      stepId: step.id,
      data: withEventContext(plan, { tool: step.tool, args: step.args }),
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
        data: withEventContext(plan, result),
        timestamp: new Date().toISOString(),
      });

      // Emit step finished event
      emitEvent({
        planId,
        type: 'step.finished',
        stepId: step.id,
        data: withEventContext(plan),
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      // Emit step error event
      emitEvent({
        planId,
        type: 'step.error',
        stepId: step.id,
        data: withEventContext(plan, { error: error.message || String(error) }),
        timestamp: new Date().toISOString(),
      });

      // Still emit finished
      emitEvent({
        planId,
        type: 'step.finished',
        stepId: step.id,
        data: withEventContext(plan),
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Emit execution finished event
  emitEvent({
    planId,
    type: 'execution.finished',
    data: withEventContext(plan),
    timestamp: new Date().toISOString(),
  });

  // Persist the run to disk
  await persistRun(planId);
}
