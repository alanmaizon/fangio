import assert from 'node:assert/strict';
import test from 'node:test';
import { executeTool } from './index.js';

test('executeTool throws when tool does not exist in catalog', async () => {
  await assert.rejects(
    executeTool('tool.that.does.not.exist', {}),
    /Tool "tool\.that\.does\.not\.exist" not found in catalog/
  );
});

test('executeTool enforces Zod validation before command execution', async () => {
  await assert.rejects(executeTool('http.probe', { url: 'not-a-valid-url' }), /Invalid url/i);
});

test('filesystem.search rejects paths outside allowed roots', async () => {
  const originalAllowedPaths = process.env.FANGIO_ALLOWED_PATHS;
  process.env.FANGIO_ALLOWED_PATHS = process.cwd();

  try {
    const result = await executeTool('filesystem.search', {
      path: '..',
      pattern: '*.ts',
    });

    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /outside allowed roots/i);
  } finally {
    if (originalAllowedPaths === undefined) {
      delete process.env.FANGIO_ALLOWED_PATHS;
    } else {
      process.env.FANGIO_ALLOWED_PATHS = originalAllowedPaths;
    }
  }
});

test('filesystem.search executes successfully for allowed paths', async () => {
  const result = await executeTool('filesystem.search', {
    path: '.',
    pattern: '*.md',
  });

  assert.equal(result.exitCode, 0);
  assert.equal(typeof result.stdout, 'string');
  assert.equal(typeof result.stderr, 'string');
});
