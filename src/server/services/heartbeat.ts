import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';

const HEARTBEAT_INTERVAL = 30_000; // 30 seconds

export function setupHeartbeat(fastify: FastifyInstance): void {
  const wss = fastify.websocketServer;

  const interval = setInterval(() => {
    for (const client of wss.clients) {
      const ws = client as WebSocket & { isAlive: boolean };
      if (ws.isAlive === false) {
        ws.terminate(); // triggers 'close' event -> handleDisconnect
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_INTERVAL);

  fastify.addHook('onClose', () => {
    clearInterval(interval);
  });
}
