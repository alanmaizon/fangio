import type { Plan } from '@fangio/schema';

// Demo plan 1: Diagnose slow Docker API
export const dockerDiagnosisPlan: Plan = {
  planId: 'demo-docker-diagnosis',
  goal: 'Diagnose why my dockerized API is slow',
  createdAt: new Date().toISOString(),
  steps: [
    {
      id: 'step-1',
      tool: 'docker.ps',
      args: {},
      risk: 'low',
      description: 'List all running Docker containers to identify the API container',
      approved: true,
    },
    {
      id: 'step-2',
      tool: 'docker.stats',
      args: {},
      risk: 'low',
      description: 'Check resource usage (CPU, memory) across all containers',
      approved: true,
    },
    {
      id: 'step-3',
      tool: 'docker.logs',
      args: { container: 'api' },
      risk: 'low',
      description: 'Examine recent logs from the API container for errors or warnings',
      approved: true,
    },
    {
      id: 'step-4',
      tool: 'http.probe',
      args: { url: 'http://localhost:8787/health' },
      risk: 'low',
      description: 'Probe the API health endpoint to measure response time',
      approved: true,
    },
  ],
};

// Demo plan 2: Check repository health
export const repoHealthPlan: Plan = {
  planId: 'demo-repo-health',
  goal: 'Check repository health',
  createdAt: new Date().toISOString(),
  steps: [
    {
      id: 'step-1',
      tool: 'git.status',
      args: {},
      risk: 'low',
      description: 'Check Git repository status for uncommitted changes',
      approved: true,
    },
    {
      id: 'step-2',
      tool: 'filesystem.search',
      args: { path: '.', pattern: '*.log' },
      risk: 'low',
      description: 'Search for log files that might be accidentally committed',
      approved: true,
    },
    {
      id: 'step-3',
      tool: 'filesystem.search',
      args: { path: '.', pattern: 'node_modules' },
      risk: 'low',
      description: 'Check for large directories that should be gitignored',
      approved: true,
    },
  ],
};

// Get a demo plan by goal or return the first one
export function getDemoPlan(goal: string): Plan {
  const goalLower = goal.toLowerCase();

  if (goalLower.includes('docker') || goalLower.includes('slow') || goalLower.includes('api')) {
    return {
      ...dockerDiagnosisPlan,
      planId: `plan-${Date.now()}`,
      goal,
      createdAt: new Date().toISOString(),
    };
  }

  if (goalLower.includes('repo') || goalLower.includes('git') || goalLower.includes('health')) {
    return {
      ...repoHealthPlan,
      planId: `plan-${Date.now()}`,
      goal,
      createdAt: new Date().toISOString(),
    };
  }

  // Default to docker diagnosis
  return {
    ...dockerDiagnosisPlan,
    planId: `plan-${Date.now()}`,
    goal,
    createdAt: new Date().toISOString(),
  };
}
