import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from 'dotenv';
import { planRoute } from './routes/plan.js';
import { approveRoute } from './routes/approve.js';
import { executeRoute } from './routes/execute.js';
import { eventsRoute } from './routes/events.js';
import { replayRoute } from './routes/replay.js';
import { statusRoute } from './routes/status.js';

// Load environment variables
config();

const PORT = parseInt(process.env.PORT || '3001', 10);

// Create Fastify instance
const fastify = Fastify({
  logger: true,
});

// Enable CORS for local development
await fastify.register(cors, {
  origin: true,
  credentials: true,
});

// Register routes
await planRoute(fastify);
await approveRoute(fastify);
await executeRoute(fastify);
await eventsRoute(fastify);
await replayRoute(fastify);
await statusRoute(fastify);

// Health check endpoint
fastify.get('/health', async () => {
  return { status: 'ok' };
});

// Start server
try {
  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`🏁 Fangio API server listening on http://localhost:${PORT}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
