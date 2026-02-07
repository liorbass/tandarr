import type { FastifyInstance } from 'fastify';
import { Readable } from 'node:stream';
import { loadConfig } from '../services/config.js';

export default async function posterRoutes(fastify: FastifyInstance) {
  fastify.get<{
    Params: { ratingKey: string };
    Querystring: { width?: string };
  }>('/poster/:ratingKey', async (request, reply) => {
    const { ratingKey } = request.params;
    const width = Math.max(1, parseInt(request.query.width || '300', 10) || 300);
    const height = Math.round(width * 1.5);

    const config = await loadConfig();
    if (!config.plexServerIp || !config.plexToken) {
      return reply.code(503).send({ error: 'Plex not configured' });
    }

    const thumbPath = `/library/metadata/${ratingKey}/thumb`;
    const transcodeUrl = `${config.plexServerIp}/photo/:/transcode?url=${encodeURIComponent(thumbPath)}&width=${width}&height=${height}&minSize=1&upscale=1`;

    try {
      const response = await fetch(transcodeUrl, {
        headers: {
          'X-Plex-Token': config.plexToken,
        },
      });

      if (!response.ok || !response.body) {
        return reply.code(response.status || 502).send({
          error: `Plex returned ${response.status}`,
        });
      }

      const contentType = response.headers.get('content-type') || 'image/jpeg';

      reply.header('Content-Type', contentType);
      reply.header('Cache-Control', 'public, max-age=86400');

      const nodeStream = Readable.fromWeb(
        response.body as import('node:stream/web').ReadableStream,
      );

      return reply.send(nodeStream);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      request.log.error({ err }, 'Poster proxy error');
      return reply.code(502).send({ error: `Failed to fetch poster: ${message}` });
    }
  });
}
