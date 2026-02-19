import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const doctorCliPath = fileURLToPath(new URL('./doctor-foundry.mjs', import.meta.url));

function runDoctorCli({ cwd, args = [], env = {} }) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [doctorCliPath, ...args], {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

test('doctor exits zero on warnings in default mode', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fangio-doctor-cli-warn-'));
  try {
    const result = await runDoctorCli({
      cwd: root,
      env: {
        AZURE_AI_PROJECT_CONNECTION_STRING:
          'Endpoint=https://demo.eastus.models.ai.azure.com;Authentication=ApiKey',
        AZURE_AI_MODEL_DEPLOYMENT: 'gpt-4o',
      },
    });

    assert.equal(result.code, 0);
    assert.match(result.stdout, /Status:\s+WARN/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('doctor exits non-zero on warnings in strict mode', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fangio-doctor-cli-strict-'));
  try {
    const result = await runDoctorCli({
      cwd: root,
      args: ['--strict'],
      env: {
        AZURE_AI_PROJECT_CONNECTION_STRING:
          'Endpoint=https://demo.eastus.models.ai.azure.com;Authentication=ApiKey',
        AZURE_AI_MODEL_DEPLOYMENT: 'gpt-4o',
      },
    });

    assert.equal(result.code, 1);
    assert.match(result.stdout, /Strict mode:\s+enabled/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
