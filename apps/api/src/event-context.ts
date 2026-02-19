import { randomUUID } from 'node:crypto';
import type { Plan, PlanMetadata } from '@fangio/schema';

function readFirstHeaderValue(value: string | string[] | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function sanitizeText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function createPlanMetadata(options: {
  traceId?: unknown;
  responseId?: unknown;
  channel?: unknown;
  headerChannel?: string | string[] | undefined;
}): PlanMetadata {
  const traceId = sanitizeText(options.traceId) || randomUUID();
  const responseId = sanitizeText(options.responseId) || randomUUID();
  const channel =
    sanitizeText(options.channel) || sanitizeText(readFirstHeaderValue(options.headerChannel)) || 'api';

  return { traceId, responseId, channel };
}

export function getEventContext(plan: Plan): PlanMetadata {
  if (plan.metadata) {
    return plan.metadata;
  }

  // Fallback for legacy plans created before metadata support.
  return {
    traceId: plan.planId,
    responseId: plan.planId,
    channel: 'unknown',
  };
}

export function withEventContext(
  plan: Plan,
  data: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    ...data,
    ...getEventContext(plan),
  };
}
