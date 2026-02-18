import type { FastifyInstance } from 'fastify';
import { getEvents, loadRun } from '../store.js';

export async function replayRoute(fastify: FastifyInstance) {
  fastify.get('/api/replay', async (request, reply) => {
    const planId = (request.query as any).planId;

    if (!planId) {
      reply.status(400);
      return { error: 'planId query parameter is required' };
    }

    // Try to get events from memory first
    let events = getEvents(planId);

    // If not in memory, try to load from disk
    if (events.length === 0) {
      const loadedEvents = await loadRun(planId);
      if (loadedEvents) {
        events = loadedEvents;
      }
    }

    return { events };
  });
}
