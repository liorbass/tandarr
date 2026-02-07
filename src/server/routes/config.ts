import type { FastifyInstance } from 'fastify';
import { loadConfig, saveConfig, configExists } from '../services/config.js';

function sanitizeIp(ip: string): string {
  let cleaned = ip.trim();
  cleaned = cleaned.replace(/^https?:\/\//, '');
  // Remove trailing slash and port if accidentally included
  cleaned = cleaned.replace(/:\d+\/?$/, '');
  cleaned = cleaned.replace(/\/$/, '');
  return cleaned;
}

function redactToken(token: string): string {
  return token ? '***' : '';
}

export default async function configRoutes(fastify: FastifyInstance) {
  fastify.get('/config', async () => {
    const config = await loadConfig();
    return {
      ...config,
      plexToken: redactToken(config.plexToken),
      hasConfig: config.plexServerIp !== '',
    };
  });

  fastify.post<{
    Body: {
      plexServerIp: string;
      plexToken?: string;
      selectedLibraryId?: string | null;
    };
  }>('/config', async (request) => {
    const { plexServerIp, plexToken, selectedLibraryId } = request.body;
    const existing = await loadConfig();

    const cleanIp = sanitizeIp(plexServerIp);

    // Preserve existing token if new one not provided or is the redacted placeholder
    const resolvedToken =
      plexToken && plexToken !== '***' ? plexToken : existing.plexToken;

    const config = {
      plexServerIp: cleanIp ? `http://${cleanIp}:32400` : '',
      plexToken: resolvedToken,
      selectedLibraryId:
        selectedLibraryId !== undefined
          ? selectedLibraryId
          : existing.selectedLibraryId,
    };

    await saveConfig(config);

    return {
      saved: true,
      config: {
        ...config,
        plexToken: redactToken(config.plexToken),
      },
    };
  });

  fastify.get('/config/exists', async () => {
    const exists = await configExists();
    return { exists };
  });
}
