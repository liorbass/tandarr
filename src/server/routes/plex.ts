import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../services/config.js';
import {
  testConnection,
  getLibraries,
  getMovieCount,
} from '../services/plex.js';

export default async function plexRoutes(fastify: FastifyInstance) {
  fastify.post('/test', async () => {
    const config = await loadConfig();

    if (!config.plexServerIp || !config.plexToken) {
      return { ok: false, error: 'Plex server IP and token are required' };
    }

    return testConnection(config.plexServerIp, config.plexToken);
  });

  fastify.get('/libraries', async () => {
    const config = await loadConfig();

    if (!config.plexServerIp || !config.plexToken) {
      return [];
    }

    return getLibraries(config.plexServerIp, config.plexToken);
  });

  fastify.post('/test-and-libraries', async () => {
    const config = await loadConfig();

    if (!config.plexServerIp || !config.plexToken) {
      return {
        connection: { ok: false, error: 'Plex server IP and token are required' },
        libraries: [],
      };
    }

    const connection = await testConnection(
      config.plexServerIp,
      config.plexToken,
    );

    if (!connection.ok) {
      return { connection, libraries: [] };
    }

    try {
      const libs = await getLibraries(config.plexServerIp, config.plexToken);

      // Fetch movie count for each library
      const librariesWithCounts = await Promise.all(
        libs.map(async (lib) => {
          try {
            const movieCount = await getMovieCount(
              config.plexServerIp,
              config.plexToken,
              lib.key,
            );
            return { ...lib, movieCount };
          } catch {
            return { ...lib, movieCount: 0 };
          }
        }),
      );

      return { connection, libraries: librariesWithCounts };
    } catch {
      // Connection succeeded but library fetch failed
      return { connection, libraries: [] };
    }
  });
}
