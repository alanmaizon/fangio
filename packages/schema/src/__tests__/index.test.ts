import { describe, it, expect } from 'vitest';
import {
  RiskLevelSchema,
  PlanStepSchema,
  PlanSchema,
  AuditEventSchema,
  AuditEventTypeSchema,
} from '../index.js';

describe('RiskLevelSchema', () => {
  it('accepts valid risk levels', () => {
    expect(RiskLevelSchema.parse('low')).toBe('low');
    expect(RiskLevelSchema.parse('medium')).toBe('medium');
    expect(RiskLevelSchema.parse('high')).toBe('high');
  });

  it('rejects invalid risk levels', () => {
    expect(() => RiskLevelSchema.parse('critical')).toThrow();
    expect(() => RiskLevelSchema.parse('')).toThrow();
  });
});

describe('PlanStepSchema', () => {
  it('validates a complete plan step', () => {
    const step = {
      id: 'step-1',
      tool: 'docker.ps',
      args: {},
      risk: 'low',
      description: 'List containers',
      approved: true,
    };
    expect(PlanStepSchema.parse(step)).toEqual(step);
  });

  it('defaults approved to false', () => {
    const step = {
      id: 'step-1',
      tool: 'docker.ps',
      args: {},
      risk: 'low',
      description: 'List containers',
    };
    const parsed = PlanStepSchema.parse(step);
    expect(parsed.approved).toBe(false);
  });

  it('rejects missing required fields', () => {
    expect(() => PlanStepSchema.parse({ id: 'step-1' })).toThrow();
  });
});

describe('PlanSchema', () => {
  it('validates a complete plan', () => {
    const plan = {
      planId: 'plan-123',
      goal: 'Diagnose slow API',
      steps: [
        {
          id: 'step-1',
          tool: 'docker.ps',
          args: {},
          risk: 'low',
          description: 'List containers',
          approved: true,
        },
      ],
      createdAt: new Date().toISOString(),
    };
    expect(PlanSchema.parse(plan)).toEqual(plan);
  });

  it('allows empty steps array', () => {
    const plan = {
      planId: 'plan-123',
      goal: 'Test',
      steps: [],
      createdAt: new Date().toISOString(),
    };
    expect(PlanSchema.parse(plan).steps).toEqual([]);
  });
});

describe('AuditEventSchema', () => {
  it('validates a plan.created event', () => {
    const event = {
      planId: 'plan-123',
      type: 'plan.created',
      timestamp: new Date().toISOString(),
    };
    expect(AuditEventSchema.parse(event)).toEqual(event);
  });

  it('validates an event with stepId and data', () => {
    const event = {
      planId: 'plan-123',
      type: 'step.output',
      stepId: 'step-1',
      data: { stdout: 'hello', stderr: '', exitCode: 0 },
      timestamp: new Date().toISOString(),
    };
    expect(AuditEventSchema.parse(event)).toEqual(event);
  });

  it('rejects invalid event types', () => {
    expect(() =>
      AuditEventSchema.parse({
        planId: 'plan-123',
        type: 'invalid.type',
        timestamp: new Date().toISOString(),
      })
    ).toThrow();
  });
});

describe('AuditEventTypeSchema', () => {
  it('accepts all valid event types', () => {
    const types = [
      'plan.created',
      'step.approved',
      'step.started',
      'step.output',
      'step.error',
      'step.finished',
      'execution.finished',
    ];
    for (const type of types) {
      expect(AuditEventTypeSchema.parse(type)).toBe(type);
    }
  });
});
