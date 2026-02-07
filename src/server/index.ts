import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = Fastify({ logger: true });

await app.register(fastifyCors);

// Register WebSocket plugin (must be before WS routes)
import websocket from '@fastify/websocket';
await app.register(websocket);

import wsRoutes from './routes/ws.js';
await app.register(wsRoutes);

import { setupHeartbeat } from './services/heartbeat.js';
setupHeartbeat(app);

// Register API routes
import configRoutes from './routes/config.js';
await app.register(configRoutes, { prefix: '/api' });

import plexRoutes from './routes/plex.js';
await app.register(plexRoutes, { prefix: '/api/plex' });

import pinRoutes from './routes/pin.js';
await app.register(pinRoutes, { prefix: '/api/plex' });

import posterRoutes from './routes/poster.js';
await app.register(posterRoutes, { prefix: '/api' });

import libraryRoutes from './routes/library.js';
await app.register(libraryRoutes, { prefix: '/api' });

// Seed config from environment variables (PLEX_URL, PLEX_TOKEN) on first boot
import { seedConfigFromEnv } from './services/config.js';
await seedConfigFromEnv();

// Health check endpoint
app.get('/api/health', async () => {
  return { status: 'ok' };
});

// Production: serve Vite-built static files
if (process.env.NODE_ENV === 'production') {
  await app.register(fastifyStatic, {
    root: path.join(__dirname, '../client'),
  });

  // SPA fallback: serve index.html for all non-API routes
  app.setNotFoundHandler((request, reply) => {
    if (!request.url.startsWith('/api')) {
      return reply.sendFile('index.html');
    }
    reply.code(404).send({ error: 'Not found' });
  });
}

const port = parseInt(process.env.PORT || '3000', 10);
await app.listen({ port, host: '0.0.0.0' });
console.log(`Tandarr server running on http://0.0.0.0:${port}`);

// Graceful shutdown
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    app.log.info({ signal }, 'Received signal, shutting down');
    await app.close();
    process.exit(0);
  });
}
