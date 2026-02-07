import type { FastifyInstance } from 'fastify';

const PLEX_TV_URL = 'https://plex.tv/api/v2';
const CLIENT_ID = 'tandarr-app';

export default async function pinRoutes(fastify: FastifyInstance) {
  fastify.post('/pin', async (_request, reply) => {
    try {
      const res = await fetch(`${PLEX_TV_URL}/pins`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          'X-Plex-Product': 'Tandarr',
          'X-Plex-Client-Identifier': CLIENT_ID,
        }),
      });

      if (!res.ok) {
        reply.code(502).send({ error: 'Failed to create PIN with Plex' });
        return;
      }

      const data = await res.json();
      return { id: data.id, code: data.code };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      reply.code(502).send({ error: `Plex PIN creation failed: ${message}` });
    }
  });

  fastify.get<{ Params: { id: string } }>('/pin/:id', async (request, reply) => {
    const { id } = request.params;

    try {
      const res = await fetch(`${PLEX_TV_URL}/pins/${id}`, {
        headers: {
          Accept: 'application/json',
          'X-Plex-Client-Identifier': CLIENT_ID,
        },
      });

      if (!res.ok) {
        reply.code(502).send({ error: 'Failed to check PIN status' });
        return;
      }

      const data = await res.json();

      if (data.authToken) {
        return { claimed: true, authToken: data.authToken };
      }

      return { claimed: false };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      reply.code(502).send({ error: `PIN check failed: ${message}` });
    }
  });
}
