import { useState, useEffect } from 'react';
import type { AuditEvent } from '../lib/api';

interface TimelinePanelProps {
  planId: string | null;
}

export function TimelinePanel({ planId }: TimelinePanelProps) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [replaying, setReplaying] = useState(false);

  useEffect(() => {
    if (!planId) {
      setEvents([]);
      return;
    }

    // Dynamic import to avoid issues at build time
    import('../lib/api').then(({ subscribeEvents }) => {
      const unsubscribe = subscribeEvents(planId, (event: AuditEvent) => {
        setEvents((prev) => [...prev, event]);
      });

      return () => {
        unsubscribe();
      };
    });
  }, [planId]);

  const handleReplay = async () => {
    if (!planId) return;

    setReplaying(true);
    setEvents([]);

    try {
      const { getReplay } = await import('../lib/api');
      const { events: replayEvents } = await getReplay(planId);

      // Play events with a small delay
      for (const event of replayEvents) {
        setEvents((prev) => [...prev, event]);
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    } catch (error) {
      console.error('Failed to replay:', error);
      alert('Failed to replay. Check console for details.');
    } finally {
      setReplaying(false);
    }
  };

  if (!planId) {
    return (
      <div className="panel">
        <h2>⏱️ Timeline</h2>
        <div className="empty-state">
          <p>Create a plan to see events here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="timeline-header">
        <h2>⏱️ Timeline</h2>
        <button className="btn btn-replay" onClick={handleReplay} disabled={replaying}>
          {replaying ? '⟳ Replaying...' : '⟳ Replay'}
        </button>
      </div>

      <div className="events-list">
        {events.length === 0 ? (
          <div className="empty-state">
            <p>Waiting for events...</p>
          </div>
        ) : (
          events.map((event, index) => <EventCard key={index} event={event} />)
        )}
      </div>
    </div>
  );
}

interface EventCardProps {
  event: AuditEvent;
}

function EventCard({ event }: EventCardProps) {
  const eventTypeClass = event.type.replace('.', '-');
  const time = new Date(event.timestamp).toLocaleTimeString();

  return (
    <div className={`event-card event-${eventTypeClass}`}>
      <div className="event-header">
        <span className="event-type">{event.type}</span>
        <span className="event-time">{time}</span>
      </div>
      {event.stepId && <div className="event-step">Step: {event.stepId}</div>}
      {event.data ? (
        <details className="event-data">
          <summary>Data</summary>
          <pre>{JSON.stringify(event.data, null, 2)}</pre>
        </details>
      ) : null}
    </div>
  );
}
