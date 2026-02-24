import assert from 'node:assert/strict';
import test from 'node:test';
import { compileFangioScript, parseFangioScript } from './index.js';

test('parseFangioScript parses valid DSL into AST', () => {
  const source = `
plan "Review repository state" {
  planId "plan-123"
  createdAt "2026-02-24T00:00:00.000Z"
  metadata {
    traceId "trace-123"
    channel "copilot_studio"
    responseId "resp-123"
  }
  step "step-1" {
    tool "git.status"
    risk low
    description "Check git status"
    approved false
    args { path: ".", depth: 1, includeIgnored: false }
  }
}
`;

  const ast = parseFangioScript(source);
  assert.equal(ast.goal, 'Review repository state');
  assert.equal(ast.planId, 'plan-123');
  assert.equal(ast.steps.length, 1);
  assert.equal(ast.steps[0]?.tool, 'git.status');
});

test('compileFangioScript compiles to expected Plan JSON', () => {
  const source = `
plan "Inspect repo" {
  planId "plan-42"
  createdAt "2026-02-24T01:02:03.000Z"
  step "step-1" {
    tool "filesystem.search"
    risk medium
    description "Search docs"
    args { query: "fangio", limit: 3, flags: ["-n"] }
  }
}
`;

  const plan = compileFangioScript(source);
  assert.deepEqual(plan, {
    planId: 'plan-42',
    goal: 'Inspect repo',
    createdAt: '2026-02-24T01:02:03.000Z',
    steps: [
      {
        id: 'step-1',
        tool: 'filesystem.search',
        args: { query: 'fangio', limit: 3, flags: ['-n'] },
        risk: 'medium',
        description: 'Search docs',
        approved: false,
        approvedAt: undefined,
      },
    ],
    metadata: undefined,
  });
});

test('invalid DSL returns helpful line and column errors', () => {
  const source = `
plan "Broken plan" {
  step "step-1" {
    tool "git.status"
    risk low
`;

  assert.throws(() => parseFangioScript(source), /line \d+, column \d+/);
});
