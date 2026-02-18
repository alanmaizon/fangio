import { useState, useEffect } from 'react';
import type { Plan } from '../lib/api';

interface GoalPanelProps {
  onPlanCreated: (planId: string, plan: Plan) => void;
}

interface ProviderStatus {
  mode: 'live' | 'demo';
  provider: string;
  model: string;
}

export function GoalPanel({ onPlanCreated }: GoalPanelProps) {
  const [goal, setGoal] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<ProviderStatus | null>(null);

  useEffect(() => {
    // Fetch provider status on mount
    const fetchStatus = async () => {
      try {
        const { getStatus } = await import('../lib/api');
        const statusData = await getStatus();
        setStatus(statusData);
      } catch (error) {
        console.error('Failed to fetch status:', error);
      }
    };
    fetchStatus();
  }, []);

  const handleSubmit = async (customGoal?: string) => {
    const goalToSubmit = customGoal || goal;
    if (!goalToSubmit.trim()) return;

    setLoading(true);
    try {
      const { createPlan } = await import('../lib/api');
      const { planId, plan } = await createPlan(goalToSubmit);
      onPlanCreated(planId, plan);
      setGoal('');
    } catch (error) {
      console.error('Failed to create plan:', error);
      alert('Failed to create plan. Check console for details.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="panel">
      <h2>🎯 Goal</h2>
      
      {/* Provider Status Badge */}
      {status && (
        <div className="provider-status" style={{
          padding: '8px 12px',
          marginBottom: '16px',
          borderRadius: '6px',
          fontSize: '14px',
          backgroundColor: status.mode === 'live' 
            ? (status.provider === 'GitHub Models' ? '#238636' : '#0969da')
            : '#9a6700',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span>{status.mode === 'live' 
            ? (status.provider === 'GitHub Models' ? '🟢' : '🔵')
            : '🟡'}</span>
          <span>
            <strong>{status.provider}</strong>
            {status.mode === 'live' && ` (${status.model})`}
          </span>
        </div>
      )}
      
      <div className="goal-input-section">
        <textarea
          className="goal-input"
          placeholder="Enter your goal here..."
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          disabled={loading}
        />
        <button
          className="btn btn-primary"
          onClick={() => handleSubmit()}
          disabled={loading || !goal.trim()}
        >
          {loading ? 'Creating Plan...' : 'Create Plan'}
        </button>
      </div>

      <div className="preset-section">
        <h3>Presets</h3>
        <div className="preset-buttons">
          <button
            className="btn btn-preset"
            onClick={() => handleSubmit('Diagnose why my dockerized API is slow')}
            disabled={loading}
          >
            🐳 Diagnose Slow Docker API
          </button>
          <button
            className="btn btn-preset"
            onClick={() => handleSubmit('Check repository health')}
            disabled={loading}
          >
            📊 Check Repo Health
          </button>
        </div>
      </div>
    </div>
  );
}
