const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001';

export interface Plan {
  planId: string;
  goal: string;
  steps: PlanStep[];
  createdAt: string;
  metadata?: {
    traceId: string;
    channel: string;
    responseId: string;
  };
}

export interface PlanStep {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  risk: 'low' | 'medium' | 'high';
  description: string;
  approved: boolean;
  approvedAt?: string;
}

export interface AuditEvent {
  planId: string;
  type: string;
  stepId?: string;
  data?: unknown;
  timestamp: string;
}

export async function createPlan(goal: string): Promise<{ planId: string; plan: Plan }> {
  const response = await fetch(`${API_BASE_URL}/api/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ goal }),
  });

  if (!response.ok) {
    throw new Error('Failed to create plan');
  }

  return response.json();
}

export async function approveSteps(planId: string, stepIds: string[]): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ planId, stepIds }),
  });

  if (!response.ok) {
    throw new Error('Failed to approve steps');
  }
}

export async function executePlan(planId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ planId }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to execute plan');
  }
}

export function subscribeEvents(
  planId: string,
  onEvent: (event: AuditEvent) => void
): () => void {
  const eventSource = new EventSource(`${API_BASE_URL}/api/events?planId=${planId}`);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onEvent(data);
    } catch (error) {
      console.error('Failed to parse event:', error);
    }
  };

  eventSource.onerror = (error) => {
    console.error('EventSource error:', error);
  };

  return () => {
    eventSource.close();
  };
}

export async function getReplay(planId: string): Promise<{ events: AuditEvent[] }> {
  const response = await fetch(`${API_BASE_URL}/api/replay?planId=${planId}`);

  if (!response.ok) {
    throw new Error('Failed to get replay');
  }

  return response.json();
}

export async function getStatus(): Promise<{
  mode: 'live' | 'demo';
  provider: string;
  model: string;
}> {
  const res = await fetch(`${API_BASE_URL}/api/status`);
  return res.json();
}
