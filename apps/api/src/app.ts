import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { planRoute } from './routes/plan.js';
import { approveRoute } from './routes/approve.js';
import { executeRoute } from './routes/execute.js';
import { eventsRoute } from './routes/events.js';
import { replayRoute } from './routes/replay.js';
import { statusRoute } from './routes/status.js';

interface BuildAppOptions {
  logger?: boolean;
}

function getCorsOrigin(): boolean | string[] | RegExp[] {
  const configuredOrigins = process.env.CORS_ORIGINS?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configuredOrigins && configuredOrigins.length > 0) {
    return configuredOrigins;
  }

  if (process.env.NODE_ENV !== 'production') {
    return [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/];
  }

  return false;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: options.logger ?? true,
  });

  await fastify.register(cors, {
    origin: getCorsOrigin(),
    credentials: true,
  });

  await planRoute(fastify);
  await approveRoute(fastify);
  await executeRoute(fastify);
  await eventsRoute(fastify);
  await replayRoute(fastify);
  await statusRoute(fastify);

  fastify.get('/health', async () => ({ status: 'ok' }));

  return fastify;
}
