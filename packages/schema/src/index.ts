import { z } from 'zod';

// RiskLevel schema and type
export const RiskLevelSchema = z.enum(['low', 'medium', 'high']);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

// PlanStep schema and type
export const PlanStepSchema = z.object({
  id: z.string(),
  tool: z.string(),
  args: z.record(z.unknown()),
  risk: RiskLevelSchema,
  description: z.string(),
  approved: z.boolean().default(false),
  approvedAt: z.string().optional(),
});
export type PlanStep = z.infer<typeof PlanStepSchema>;

// Plan schema and type
export const PlanSchema = z.object({
  planId: z.string(),
  goal: z.string(),
  steps: z.array(PlanStepSchema),
  createdAt: z.string(),
});
export type Plan = z.infer<typeof PlanSchema>;

// AuditEvent schema and type
export const AuditEventTypeSchema = z.enum([
  'plan.created',
  'step.approved',
  'step.started',
  'step.output',
  'step.error',
  'step.finished',
  'execution.finished',
]);
export type AuditEventType = z.infer<typeof AuditEventTypeSchema>;

export const AuditEventSchema = z.object({
  planId: z.string(),
  type: AuditEventTypeSchema,
  stepId: z.string().optional(),
  data: z.unknown().optional(),
  timestamp: z.string(),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;
