import type { Plan, AuditEvent } from '@fangio/schema';
import { promises as fs } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// In-memory storage
const plans = new Map<string, Plan>();
const events = new Map<string, AuditEvent[]>();
const listeners = new Map<string, Set<(event: AuditEvent) => void>>();

// Store a plan
export function storePlan(plan: Plan): void {
  plans.set(plan.planId, plan);
  events.set(plan.planId, []);
}

// Get a plan
export function getPlan(planId: string): Plan | undefined {
  return plans.get(planId);
}

// Update a plan
export function updatePlan(plan: Plan): void {
  plans.set(plan.planId, plan);
}

// Emit an event
export function emitEvent(event: AuditEvent): void {
  const planEvents = events.get(event.planId) || [];
  planEvents.push(event);
  events.set(event.planId, planEvents);

  // Notify listeners
  const planListeners = listeners.get(event.planId);
  if (planListeners) {
    for (const listener of planListeners) {
      listener(event);
    }
  }
}

// Get all events for a plan
export function getEvents(planId: string): AuditEvent[] {
  return events.get(planId) || [];
}

// Add a listener for events
export function addListener(planId: string, listener: (event: AuditEvent) => void): void {
  if (!listeners.has(planId)) {
    listeners.set(planId, new Set());
  }
  listeners.get(planId)!.add(listener);
}

// Remove a listener
export function removeListener(planId: string, listener: (event: AuditEvent) => void): void {
  const planListeners = listeners.get(planId);
  if (planListeners) {
    planListeners.delete(listener);
    if (planListeners.size === 0) {
      listeners.delete(planId);
    }
  }
}

// Persist a run to disk
export async function persistRun(planId: string): Promise<void> {
  const planEvents = events.get(planId);
  if (!planEvents) {
    return;
  }

  const runsDir = join(__dirname, 'runs');
  const filePath = join(runsDir, `${planId}.json`);

  try {
    await fs.mkdir(runsDir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(planEvents, null, 2), 'utf-8');
  } catch (error) {
    console.error(`Failed to persist run ${planId}:`, error);
  }
}

// Load a run from disk
export async function loadRun(planId: string): Promise<AuditEvent[] | null> {
  const runsDir = join(__dirname, 'runs');
  const filePath = join(runsDir, `${planId}.json`);

  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
}
