import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildApp } from './app.js';
import { resetPlanRateLimiter } from './routes/plan.js';
import { resetStore, storePlan } from './store.js';
import type { Plan } from '@fangio/schema';

function createPlan(planId: string): Plan {
  return {
    planId,
    goal: 'integration test goal',
    createdAt: '2026-02-19T00:00:00.000Z',
    steps: [
      {
        id: 'step-1',
        tool: 'git.status',
        args: {},
        risk: 'low',
        description: 'Check repository status',
        approved: false,
      },
    ],
  };
}

test('POST /api/plan rejects malformed request payload via Zod validation', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'fangio-api-zod-'));
  process.env.FANGIO_DATA_DIR = dataDir;
  process.env.NODE_ENV = 'test';
  delete process.env.LLM_API_KEY;
  delete process.env.GITHUB_TOKEN;
  resetPlanRateLimiter();
  resetStore();

  const app = await buildApp({ logger: false });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/plan',
      payload: {},
    });

    assert.equal(response.statusCode, 400);
    assert.match(response.body, /goal/i);
  } finally {
    await app.close();
    resetPlanRateLimiter();
    resetStore();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('POST /api/plan enforces rate limits per client IP', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'fangio-api-rate-'));
  process.env.FANGIO_DATA_DIR = dataDir;
  process.env.NODE_ENV = 'test';
  process.env.PLAN_RATE_LIMIT_MAX = '1';
  process.env.PLAN_RATE_LIMIT_WINDOW_MS = '60000';
  delete process.env.LLM_API_KEY;
  delete process.env.GITHUB_TOKEN;
  resetPlanRateLimiter();
  resetStore();

  const app = await buildApp({ logger: false });
  try {
    const first = await app.inject({
      method: 'POST',
      url: '/api/plan',
      payload: { goal: 'check repository health' },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/api/plan',
      payload: { goal: 'check repository health again' },
    });

    assert.equal(first.statusCode, 200);
    assert.equal(second.statusCode, 429);
    assert.match(second.body, /rate limit/i);
  } finally {
    await app.close();
    delete process.env.PLAN_RATE_LIMIT_MAX;
    delete process.env.PLAN_RATE_LIMIT_WINDOW_MS;
    resetPlanRateLimiter();
    resetStore();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('POST /api/execute rejects expired approvals and requires re-approval', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'fangio-api-expiry-'));
  process.env.FANGIO_DATA_DIR = dataDir;
  process.env.NODE_ENV = 'test';
  process.env.APPROVAL_TTL_MINUTES = '1';
  resetPlanRateLimiter();
  resetStore();

  const app = await buildApp({ logger: false });
  try {
    const plan = createPlan('plan-expired-approval');
    plan.steps[0].approved = true;
    plan.steps[0].approvedAt = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    await storePlan(plan);

    const response = await app.inject({
      method: 'POST',
      url: '/api/execute',
      payload: { planId: plan.planId },
    });
    const body = JSON.parse(response.body);

    assert.equal(response.statusCode, 400);
    assert.equal(body.error, 'One or more step approvals have expired and must be re-approved');
    assert.deepEqual(body.expiredStepIds, ['step-1']);
  } finally {
    await app.close();
    delete process.env.APPROVAL_TTL_MINUTES;
    resetPlanRateLimiter();
    resetStore();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('POST /api/execute can load persisted plans after in-memory reset', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'fangio-api-load-'));
  process.env.FANGIO_DATA_DIR = dataDir;
  process.env.NODE_ENV = 'test';
  resetPlanRateLimiter();
  resetStore();

  const app = await buildApp({ logger: false });
  try {
    const plan = createPlan('plan-from-disk');
    await storePlan(plan);

    resetStore();
    const response = await app.inject({
      method: 'POST',
      url: '/api/execute',
      payload: { planId: plan.planId },
    });
    const body = JSON.parse(response.body);

    assert.equal(response.statusCode, 400);
    assert.equal(body.error, 'Not all steps are approved');
    assert.deepEqual(body.unapprovedStepIds, ['step-1']);
  } finally {
    await app.close();
    resetPlanRateLimiter();
    resetStore();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('POST /api/plan stores trace metadata and emits it in plan.created events', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'fangio-api-trace-'));
  process.env.FANGIO_DATA_DIR = dataDir;
  process.env.NODE_ENV = 'test';
  delete process.env.LLM_API_KEY;
  delete process.env.GITHUB_TOKEN;
  resetPlanRateLimiter();
  resetStore();

  const app = await buildApp({ logger: false });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/plan',
      payload: {
        goal: 'trace metadata test',
        traceId: 'trace-123',
        responseId: 'resp-123',
        channel: 'copilot_studio',
      },
    });
    const body = JSON.parse(response.body);

    assert.equal(response.statusCode, 200);
    assert.equal(body.plan.metadata.traceId, 'trace-123');
    assert.equal(body.plan.metadata.responseId, 'resp-123');
    assert.equal(body.plan.metadata.channel, 'copilot_studio');

    const replay = await app.inject({
      method: 'GET',
      url: `/api/replay?planId=${body.planId}`,
    });
    const replayBody = JSON.parse(replay.body);
    const planCreated = replayBody.events.find((event: any) => event.type === 'plan.created');

    assert.equal(planCreated.data.traceId, 'trace-123');
    assert.equal(planCreated.data.responseId, 'resp-123');
    assert.equal(planCreated.data.channel, 'copilot_studio');
  } finally {
    await app.close();
    resetPlanRateLimiter();
    resetStore();
    await rm(dataDir, { recursive: true, force: true });
  }
});
