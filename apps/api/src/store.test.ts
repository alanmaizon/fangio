import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  emitEvent,
  getEvents,
  getPlan,
  getPlanOrLoad,
  loadRun,
  persistRun,
  resetStore,
  storePlan,
} from './store.js';
import type { Plan } from '@fangio/schema';

function createPlan(planId: string): Plan {
  return {
    planId,
    goal: 'test goal',
    createdAt: '2026-02-19T00:00:00.000Z',
    steps: [
      {
        id: 'step-1',
        tool: 'git.status',
        args: {},
        risk: 'low',
        description: 'Check repository status',
        approved: true,
        approvedAt: '2026-02-19T00:00:01.000Z',
      },
    ],
  };
}

test('store persists plans and can load them after memory reset', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'fangio-store-test-'));
  process.env.FANGIO_DATA_DIR = dataDir;
  resetStore();

  try {
    const plan = createPlan('plan-store-1');
    await storePlan(plan);

    assert.deepEqual(getPlan(plan.planId), plan);

    resetStore();
    assert.equal(getPlan(plan.planId), undefined);

    const loadedPlan = await getPlanOrLoad(plan.planId);
    assert.deepEqual(loadedPlan, plan);
  } finally {
    resetStore();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('replay remains deterministic after persisting and reloading events', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'fangio-run-test-'));
  process.env.FANGIO_DATA_DIR = dataDir;
  resetStore();

  try {
    const planId = 'plan-run-1';
    emitEvent({
      planId,
      type: 'plan.created',
      data: { goal: 'test', stepCount: 1 },
      timestamp: '2026-02-19T00:00:00.000Z',
    });
    emitEvent({
      planId,
      type: 'step.started',
      stepId: 'step-1',
      data: { tool: 'git.status', args: {} },
      timestamp: '2026-02-19T00:00:01.000Z',
    });
    emitEvent({
      planId,
      type: 'step.finished',
      stepId: 'step-1',
      timestamp: '2026-02-19T00:00:02.000Z',
    });

    const eventsBeforePersist = getEvents(planId);
    await persistRun(planId);

    resetStore();
    const loadedEvents = await loadRun(planId);

    assert.deepEqual(loadedEvents, eventsBeforePersist);
  } finally {
    resetStore();
    await rm(dataDir, { recursive: true, force: true });
  }
});
