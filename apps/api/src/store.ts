import { type Plan, type AuditEvent, PlanSchema, AuditEventSchema } from '@fangio/schema';
import { promises as fs } from 'fs';
import { join } from 'path';

// In-memory storage
const plans = new Map<string, Plan>();
const events = new Map<string, AuditEvent[]>();
const listeners = new Map<string, Set<(event: AuditEvent) => void>>();

function getDataDir(): string {
  return process.env.FANGIO_DATA_DIR || join(process.cwd(), '.fangio');
}

function getPlansDir(): string {
  return join(getDataDir(), 'plans');
}

function getRunsDir(): string {
  return join(getDataDir(), 'runs');
}

async function persistPlan(plan: Plan): Promise<void> {
  const plansDir = getPlansDir();
  const filePath = join(plansDir, `${plan.planId}.json`);
  await fs.mkdir(plansDir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(plan, null, 2), 'utf-8');
}

// Store a plan
export async function storePlan(plan: Plan): Promise<void> {
  plans.set(plan.planId, plan);
  if (!events.has(plan.planId)) {
    events.set(plan.planId, []);
  }

  try {
    await persistPlan(plan);
  } catch (error) {
    console.error(`Failed to persist plan ${plan.planId}:`, error);
  }
}

// Get a plan
export function getPlan(planId: string): Plan | undefined {
  return plans.get(planId);
}

export async function getPlanOrLoad(planId: string): Promise<Plan | undefined> {
  const existingPlan = plans.get(planId);
  if (existingPlan) {
    return existingPlan;
  }

  const loadedPlan = await loadPlan(planId);
  if (!loadedPlan) {
    return undefined;
  }

  plans.set(planId, loadedPlan);
  if (!events.has(planId)) {
    events.set(planId, []);
  }

  return loadedPlan;
}

// Update a plan
export async function updatePlan(plan: Plan): Promise<void> {
  plans.set(plan.planId, plan);

  try {
    await persistPlan(plan);
  } catch (error) {
    console.error(`Failed to update persisted plan ${plan.planId}:`, error);
  }
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

  const runsDir = getRunsDir();
  const filePath = join(runsDir, `${planId}.json`);

  try {
    await fs.mkdir(runsDir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(planEvents, null, 2), 'utf-8');
  } catch (error) {
    console.error(`Failed to persist run ${planId}:`, error);
  }
}

// Load a plan from disk
export async function loadPlan(planId: string): Promise<Plan | null> {
  const plansDir = getPlansDir();
  const filePath = join(plansDir, `${planId}.json`);

  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return PlanSchema.parse(JSON.parse(data));
  } catch (_error) {
    return null;
  }
}

// Load a run from disk
export async function loadRun(planId: string): Promise<AuditEvent[] | null> {
  const runsDir = getRunsDir();
  const filePath = join(runsDir, `${planId}.json`);

  try {
    const data = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed.map((item) => AuditEventSchema.parse(item)) : null;
  } catch (_error) {
    return null;
  }
}

// Test helper: clear in-memory state
export function resetStore(): void {
  plans.clear();
  events.clear();
  listeners.clear();
}
