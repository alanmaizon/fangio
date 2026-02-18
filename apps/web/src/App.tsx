import { useState } from 'react';
import { GoalPanel } from './panels/GoalPanel';
import { PlanPanel } from './panels/PlanPanel';
import { TimelinePanel } from './panels/TimelinePanel';
import type { Plan } from './lib/api';
import './App.css';

function App() {
  const [currentPlan, setCurrentPlan] = useState<Plan | null>(null);
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);

  const handlePlanCreated = (planId: string, plan: Plan) => {
    setCurrentPlan(plan);
    setCurrentPlanId(planId);
  };

  const handleExecute = async () => {
    if (!currentPlanId) return;

    const { executePlan } = await import('./lib/api');
    await executePlan(currentPlanId);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>🏁 Fangio</h1>
        <p className="tagline">Trusted Agent Runtime</p>
      </header>

      <div className="app-body">
        <GoalPanel onPlanCreated={handlePlanCreated} />
        <PlanPanel plan={currentPlan} onExecute={handleExecute} />
        <TimelinePanel planId={currentPlanId} />
      </div>
    </div>
  );
}

export default App;
