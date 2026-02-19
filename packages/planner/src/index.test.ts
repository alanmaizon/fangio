import assert from 'node:assert/strict';
import test from 'node:test';
import { generatePlan } from './index.js';

test('generatePlan uses demo mode when no API key is configured', async () => {
  const originalApiKey = process.env.LLM_API_KEY;
  const originalGitHubToken = process.env.GITHUB_TOKEN;
  delete process.env.LLM_API_KEY;
  delete process.env.GITHUB_TOKEN;

  try {
    const plan = await generatePlan('diagnose API latency');
    assert.equal(plan.goal, 'diagnose API latency');
    assert.ok(plan.steps.length > 0);
  } finally {
    if (originalApiKey === undefined) {
      delete process.env.LLM_API_KEY;
    } else {
      process.env.LLM_API_KEY = originalApiKey;
    }
    if (originalGitHubToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = originalGitHubToken;
    }
  }
});

test('generatePlan falls back to demo mode when LLM response is malformed JSON', async () => {
  const originalApiKey = process.env.LLM_API_KEY;
  const originalBaseUrl = process.env.LLM_BASE_URL;
  const originalFetch = globalThis.fetch;

  process.env.LLM_API_KEY = 'test-key';
  process.env.LLM_BASE_URL = 'http://example.test';

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: 'this is not json' } }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );

  try {
    const plan = await generatePlan('validate malformed llm response');
    assert.equal(plan.goal, 'validate malformed llm response');
    assert.ok(plan.planId.startsWith('plan-'));
    assert.ok(plan.steps.length > 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.LLM_API_KEY;
    } else {
      process.env.LLM_API_KEY = originalApiKey;
    }
    if (originalBaseUrl === undefined) {
      delete process.env.LLM_BASE_URL;
    } else {
      process.env.LLM_BASE_URL = originalBaseUrl;
    }
  }
});

test('generatePlan falls back to demo mode when LLM JSON fails Zod schema validation', async () => {
  const originalApiKey = process.env.LLM_API_KEY;
  const originalBaseUrl = process.env.LLM_BASE_URL;
  const originalFetch = globalThis.fetch;

  process.env.LLM_API_KEY = 'test-key';
  process.env.LLM_BASE_URL = 'http://example.test';

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                planId: 'bad-plan',
                goal: 'missing required fields',
                steps: [],
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );

  try {
    const plan = await generatePlan('schema validation fallback check');
    assert.equal(plan.goal, 'schema validation fallback check');
    assert.ok(plan.planId.startsWith('plan-'));
    assert.ok(plan.steps.length > 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.LLM_API_KEY;
    } else {
      process.env.LLM_API_KEY = originalApiKey;
    }
    if (originalBaseUrl === undefined) {
      delete process.env.LLM_BASE_URL;
    } else {
      process.env.LLM_BASE_URL = originalBaseUrl;
    }
  }
});
