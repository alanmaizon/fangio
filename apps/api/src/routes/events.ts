import type { FastifyInstance, FastifyReply } from 'fastify';
import { getEvents, addListener, removeListener } from '../store.js';
import type { AuditEvent } from '@fangio/schema';

export async function eventsRoute(fastify: FastifyInstance) {
  fastify.get('/api/events', async (request, reply) => {
    const planId = (request.query as any).planId;

    if (!planId) {
      reply.status(400);
      return { error: 'planId query parameter is required' };
    }

    // Set headers for SSE
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    // Send existing events
    const existingEvents = getEvents(planId);
    for (const event of existingEvents) {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    // Set up listener for new events
    const listener = (event: AuditEvent) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    addListener(planId, listener);

    // Handle connection close
    request.raw.on('close', () => {
      removeListener(planId, listener);
    });

    // Keep connection alive
    const keepAlive = setInterval(() => {
      reply.raw.write(': keepalive\n\n');
    }, 30000);

    request.raw.on('close', () => {
      clearInterval(keepAlive);
    });
  });
}
