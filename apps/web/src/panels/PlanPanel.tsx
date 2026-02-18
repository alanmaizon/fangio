import { useState, useEffect } from 'react';
import type { Plan, PlanStep } from '../lib/api';

interface PlanPanelProps {
  plan: Plan | null;
  onExecute: () => void;
}

export function PlanPanel({ plan, onExecute }: PlanPanelProps) {
  const [localPlan, setLocalPlan] = useState<Plan | null>(plan);
  const [executing, setExecuting] = useState(false);

  useEffect(() => {
    setLocalPlan(plan);
  }, [plan]);

  if (!localPlan) {
    return (
      <div className="panel">
        <h2>📋 Plan</h2>
        <div className="empty-state">
          <p>No plan yet. Create one to get started!</p>
        </div>
      </div>
    );
  }

  const handleApprove = async (stepId: string) => {
    if (!localPlan) return;

    try {
      const { approveSteps } = await import('../lib/api');
      await approveSteps(localPlan.planId, [stepId]);

      // Update local state
      setLocalPlan({
        ...localPlan,
        steps: localPlan.steps.map((step) =>
          step.id === stepId ? { ...step, approved: true } : step
        ),
      });
    } catch (error) {
      console.error('Failed to approve step:', error);
      alert('Failed to approve step. Check console for details.');
    }
  };

  const handleExecute = async () => {
    setExecuting(true);
    try {
      await onExecute();
    } catch (error) {
      console.error('Failed to execute plan:', error);
      alert('Failed to execute plan. Check console for details.');
    } finally {
      setExecuting(false);
    }
  };

  const allApproved = localPlan.steps.every((step) => step.approved);

  return (
    <div className="panel">
      <h2>📋 Plan</h2>
      <div className="plan-header">
        <p className="plan-goal">{localPlan.goal}</p>
        <p className="plan-meta">{localPlan.steps.length} steps</p>
      </div>

      <div className="steps-list">
        {localPlan.steps.map((step) => (
          <StepCard key={step.id} step={step} onApprove={handleApprove} />
        ))}
      </div>

      <div className="plan-actions">
        <button
          className="btn btn-execute"
          onClick={handleExecute}
          disabled={!allApproved || executing}
        >
          {executing ? 'Executing...' : '▶️ Execute Plan'}
        </button>
        {!allApproved && (
          <p className="warning-text">⚠️ Approve all steps before executing</p>
        )}
      </div>
    </div>
  );
}

interface StepCardProps {
  step: PlanStep;
  onApprove: (stepId: string) => void;
}

function StepCard({ step, onApprove }: StepCardProps) {
  const riskColor = {
    low: 'risk-low',
    medium: 'risk-medium',
    high: 'risk-high',
  }[step.risk];

  return (
    <div className="step-card">
      <div className="step-header">
        <span className={`risk-chip ${riskColor}`}>{step.risk}</span>
        <code className="tool-name">{step.tool}</code>
      </div>
      <p className="step-description">{step.description}</p>
      <details className="step-args">
        <summary>Arguments</summary>
        <pre>{JSON.stringify(step.args, null, 2)}</pre>
      </details>
      {!step.approved && step.risk !== 'low' && (
        <button className="btn btn-approve" onClick={() => onApprove(step.id)}>
          ✓ Approve
        </button>
      )}
      {step.approved && <span className="approved-badge">✓ Approved</span>}
    </div>
  );
}
