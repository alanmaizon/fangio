import { PlanSchema, type Plan } from '@fangio/schema';
import type { FangioPlanAst } from './ast.js';

export function compileAstToPlan(ast: FangioPlanAst): Plan {
  const plan: Plan = {
    planId: ast.planId ?? `plan-${Date.now()}`,
    goal: ast.goal,
    createdAt: ast.createdAt ?? new Date().toISOString(),
    steps: ast.steps.map((step) => ({
      id: step.id,
      tool: step.tool,
      args: step.args,
      risk: step.risk,
      description: step.description,
      approved: step.approved ?? false,
      approvedAt: step.approvedAt,
    })),
    metadata: ast.metadata,
  };

  return PlanSchema.parse(plan);
}
