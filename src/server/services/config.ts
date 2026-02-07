import { readFile, writeFile, access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { AppConfig } from '../../shared/types.js';

const CONFIG_DIR = process.env.CONFIG_DIR || process.cwd();
const CONFIG_PATH = path.join(CONFIG_DIR, 'tandarr-config.json');

const DEFAULT_CONFIG: AppConfig = {
  plexServerIp: '',
  plexToken: '',
  selectedLibraryId: null,
};

export async function loadConfig(): Promise<AppConfig> {
  await mkdir(CONFIG_DIR, { recursive: true });
  try {
    const raw = await readFile(CONFIG_PATH, 'utf-8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function seedConfigFromEnv(): Promise<void> {
  const plexUrl = process.env.PLEX_URL;
  const plexToken = process.env.PLEX_TOKEN;
  if (!plexUrl && !plexToken) return;

  const config = await loadConfig();
  let changed = false;

  if (plexUrl && !config.plexServerIp) {
    config.plexServerIp = plexUrl;
    changed = true;
  }
  if (plexToken && !config.plexToken) {
    config.plexToken = plexToken;
    changed = true;
  }

  if (changed) {
    await saveConfig(config);
  }
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

export async function configExists(): Promise<boolean> {
  try {
    await access(CONFIG_PATH);
    const config = await loadConfig();
    return config.plexServerIp !== '';
  } catch {
    return false;
  }
}
