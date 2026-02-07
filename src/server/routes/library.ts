import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../services/config.js';
import { fetchAllMovies } from '../services/plex.js';
import {
  readCache,
  writeCache,
  isCacheStale,
} from '../services/library-cache.js';

const REFRESH_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

// Module-scoped sync state (survives across requests)
let syncInProgress = false;
let syncProgress = { loaded: 0, total: 0 };

async function triggerBackgroundSync(
  log: FastifyInstance['log'],
): Promise<void> {
  if (syncInProgress) return;

  const config = await loadConfig();
  if (!config.plexServerIp || !config.plexToken || !config.selectedLibraryId) {
    return;
  }

  syncInProgress = true;
  syncProgress = { loaded: 0, total: 0 };

  // Fire and forget -- do NOT await in the caller
  fetchAllMovies(
    config.plexServerIp,
    config.plexToken,
    config.selectedLibraryId,
    (progress) => {
      syncProgress = progress;
    },
  )
    .then(async (movies) => {
      await writeCache(config.selectedLibraryId!, movies);
      log.info(
        { count: movies.length },
        'Library sync complete, cache written',
      );
    })
    .catch((err: unknown) => {
      log.error({ err }, 'Library sync failed');
    })
    .finally(() => {
      syncInProgress = false;
    });
}

export default async function libraryRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  // GET /library -- returns cached movies or signals need for sync
  fastify.get('/library', async () => {
    const cache = await readCache();

    if (cache && !isCacheStale(cache, REFRESH_INTERVAL_MS)) {
      return { movies: cache.movies, fromCache: true };
    }

    if (cache) {
      // Return stale cache, kick off background refresh
      triggerBackgroundSync(fastify.log);
      return { movies: cache.movies, fromCache: true, refreshing: true };
    }

    // No cache at all
    return { movies: [], fromCache: false, needsSync: true };
  });

  // POST /library/refresh -- manual sync trigger
  fastify.post('/library/refresh', async (_request, reply) => {
    if (syncInProgress) {
      return { status: 'already_running', progress: syncProgress };
    }

    const config = await loadConfig();
    if (
      !config.plexServerIp ||
      !config.plexToken ||
      !config.selectedLibraryId
    ) {
      return reply
        .code(400)
        .send({ error: 'Plex not configured or no library selected' });
    }

    triggerBackgroundSync(fastify.log);
    return { status: 'started' };
  });

  // GET /library/status -- sync progress polling
  fastify.get('/library/status', async () => {
    return {
      syncing: syncInProgress,
      progress: syncProgress,
    };
  });

  // Background refresh timer: check cache staleness every 4 hours
  const timer = setInterval(async () => {
    const cache = await readCache();
    if (cache && isCacheStale(cache, REFRESH_INTERVAL_MS)) {
      fastify.log.info('Background refresh: cache stale, triggering sync');
      triggerBackgroundSync(fastify.log);
    }
  }, REFRESH_INTERVAL_MS);

  // Clean up timer when server closes
  fastify.addHook('onClose', () => {
    clearInterval(timer);
  });
}
