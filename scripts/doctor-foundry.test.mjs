import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runFoundryDoctor } from './doctor-foundry-lib.mjs';

test('doctor fails when Foundry credentials are missing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fangio-doctor-auth-'));
  try {
    const result = await runFoundryDoctor({
      cwd: root,
      env: {},
      dataDir: join(root, '.fangio'),
    });
    const authCheck = result.checks.find((check) => check.id === 'foundry-auth');

    assert.equal(result.status, 'fail');
    assert.equal(authCheck?.status, 'fail');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('doctor flags legacy custom_MCP schema key as failure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fangio-doctor-mcp-'));
  const configPath = join(root, 'foundry.doctor.json');
  try {
    await writeFile(
      configPath,
      JSON.stringify(
        {
          custom_MCP: [{ name: 'legacy' }],
        },
        null,
        2
      ),
      'utf-8'
    );

    const result = await runFoundryDoctor({
      cwd: root,
      env: {
        AZURE_AI_PROJECT_CONNECTION_STRING:
          'Endpoint=https://demo.eastus.models.ai.azure.com;Authentication=ApiKey',
        AZURE_AI_MODEL_DEPLOYMENT: 'gpt-4o',
      },
      dataDir: join(root, '.fangio'),
    });
    const mcpCheck = result.checks.find((check) => check.id === 'mcp-schema');

    assert.equal(mcpCheck?.status, 'fail');
    assert.match(mcpCheck?.message || '', /legacy/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('doctor detects channel parity drift', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fangio-doctor-parity-'));
  const configPath = join(root, 'foundry.doctor.json');
  try {
    await writeFile(
      configPath,
      JSON.stringify(
        {
          channelBaseline: 'playground',
          channels: {
            playground: { enabled: true, tools: ['git.status', 'http.probe'] },
            copilot_studio: { enabled: true, tools: ['git.status'] },
          },
          mcp: [{ name: 'learn', url: 'https://example.com/mcp' }],
        },
        null,
        2
      ),
      'utf-8'
    );

    const result = await runFoundryDoctor({
      cwd: root,
      env: {
        AZURE_AI_PROJECT_CONNECTION_STRING:
          'Endpoint=https://demo.eastus.models.ai.azure.com;Authentication=ApiKey',
        AZURE_AI_MODEL_DEPLOYMENT: 'gpt-4o',
      },
      dataDir: join(root, '.fangio'),
    });
    const parityCheck = result.checks.find((check) => check.id === 'channel-parity');

    assert.equal(parityCheck?.status, 'fail');
    assert.match(parityCheck?.message || '', /differs|vulnerability/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('doctor fails trace completeness when required fields are missing in runs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fangio-doctor-trace-'));
  const dataDir = join(root, '.fangio');
  const runsDir = join(dataDir, 'runs');
  const configPath = join(root, 'foundry.doctor.json');

  try {
    await writeFile(
      configPath,
      JSON.stringify(
        {
          channels: {
            playground: { enabled: true, tools: ['git.status'] },
            activity_protocol: { enabled: true, tools: ['git.status'] },
          },
          mcp: [{ name: 'learn', url: 'https://example.com/mcp' }],
          expectedTraceFields: ['traceId', 'channel'],
        },
        null,
        2
      ),
      'utf-8'
    );

    await mkdir(runsDir, { recursive: true });
    await writeFile(
      join(runsDir, 'run-1.json'),
      JSON.stringify(
        [
          {
            planId: 'plan-1',
            type: 'step.started',
            data: { tool: 'git.status' },
            timestamp: '2026-02-19T00:00:00.000Z',
          },
        ],
        null,
        2
      ),
      'utf-8'
    );

    const result = await runFoundryDoctor({
      cwd: root,
      env: {
        AZURE_AI_PROJECT_CONNECTION_STRING:
          'Endpoint=https://demo.eastus.models.ai.azure.com;Authentication=ApiKey',
        AZURE_AI_MODEL_DEPLOYMENT: 'gpt-4o',
      },
      dataDir,
    });
    const traceCheck = result.checks.find((check) => check.id === 'trace-completeness');

    assert.equal(traceCheck?.status, 'fail');
    assert.equal(traceCheck?.details?.missingByField?.traceId, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
