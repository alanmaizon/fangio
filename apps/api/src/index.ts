import { config } from 'dotenv';
import { buildApp } from './app.js';

// Load environment variables
config();

const PORT = parseInt(process.env.PORT || '3001', 10);
const fastify = await buildApp({ logger: true });

// Start server
try {
  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`🏁 Fangio API server listening on http://localhost:${PORT}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
