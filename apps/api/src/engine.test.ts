import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { executePlan } from './engine.js';
import { getEvents, loadRun, resetStore, storePlan } from './store.js';
import type { Plan } from '@fangio/schema';

function createBasePlan(planId: string): Plan {
  return {
    planId,
    goal: 'engine test goal',
    createdAt: '2026-02-19T00:00:00.000Z',
    steps: [],
  };
}

test('engine executes approved steps and persists replayable events', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'fangio-engine-ok-'));
  process.env.FANGIO_DATA_DIR = dataDir;
  resetStore();

  try {
    const plan: Plan = createBasePlan('plan-engine-success');
    plan.metadata = {
      traceId: 'trace-engine-success',
      responseId: 'resp-engine-success',
      channel: 'activity_protocol',
    };
    plan.steps.push({
      id: 'step-1',
      tool: 'git.status',
      args: {},
      risk: 'low',
      description: 'Check repository status',
      approved: true,
      approvedAt: '2026-02-19T00:00:01.000Z',
    });

    await storePlan(plan);
    await executePlan(plan.planId);

    const events = getEvents(plan.planId);
    assert.deepEqual(
      events.map((event) => event.type),
      ['step.started', 'step.output', 'step.finished', 'execution.finished']
    );
    for (const event of events) {
      assert.equal((event.data as any).traceId, 'trace-engine-success');
      assert.equal((event.data as any).responseId, 'resp-engine-success');
      assert.equal((event.data as any).channel, 'activity_protocol');
    }

    resetStore();
    const replayedEvents = await loadRun(plan.planId);
    assert.deepEqual(replayedEvents, events);
  } finally {
    resetStore();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('engine emits step.error for unknown tools without crashing execution', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'fangio-engine-error-'));
  process.env.FANGIO_DATA_DIR = dataDir;
  resetStore();

  try {
    const plan: Plan = createBasePlan('plan-engine-unknown-tool');
    plan.metadata = {
      traceId: 'trace-engine-error',
      responseId: 'resp-engine-error',
      channel: 'copilot_studio',
    };
    plan.steps.push({
      id: 'step-1',
      tool: 'tool.does.not.exist',
      args: {},
      risk: 'low',
      description: 'Fail with unknown tool',
      approved: true,
      approvedAt: '2026-02-19T00:00:01.000Z',
    });

    await storePlan(plan);
    await executePlan(plan.planId);

    const events = getEvents(plan.planId);
    assert.deepEqual(
      events.map((event) => event.type),
      ['step.started', 'step.error', 'step.finished', 'execution.finished']
    );
    for (const event of events) {
      assert.equal((event.data as any).traceId, 'trace-engine-error');
      assert.equal((event.data as any).responseId, 'resp-engine-error');
      assert.equal((event.data as any).channel, 'copilot_studio');
    }
  } finally {
    resetStore();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('engine skips unapproved steps and records the skip as an error event', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'fangio-engine-skip-'));
  process.env.FANGIO_DATA_DIR = dataDir;
  resetStore();

  try {
    const plan: Plan = createBasePlan('plan-engine-unapproved');
    plan.metadata = {
      traceId: 'trace-engine-skip',
      responseId: 'resp-engine-skip',
      channel: 'playground',
    };
    plan.steps.push({
      id: 'step-1',
      tool: 'git.status',
      args: {},
      risk: 'high',
      description: 'Should be skipped',
      approved: false,
    });

    await storePlan(plan);
    await executePlan(plan.planId);

    const events = getEvents(plan.planId);
    assert.deepEqual(
      events.map((event) => event.type),
      ['step.error', 'step.finished', 'execution.finished']
    );
    assert.match(JSON.stringify(events[0].data), /not approved/i);
    for (const event of events) {
      assert.equal((event.data as any).traceId, 'trace-engine-skip');
      assert.equal((event.data as any).responseId, 'resp-engine-skip');
      assert.equal((event.data as any).channel, 'playground');
    }
  } finally {
    resetStore();
    await rm(dataDir, { recursive: true, force: true });
  }
});
