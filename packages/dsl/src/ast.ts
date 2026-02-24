import type { RiskLevel } from '@fangio/schema';

export interface FangioPlanAst {
  goal: string;
  planId?: string;
  createdAt?: string;
  metadata?: {
    traceId: string;
    channel: string;
    responseId: string;
  };
  steps: FangioStepAst[];
}

export interface FangioStepAst {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  risk: RiskLevel;
  description: string;
  approved?: boolean;
  approvedAt?: string;
}
