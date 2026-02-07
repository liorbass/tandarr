import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Movie } from '../../shared/types.js';

const CONFIG_DIR = process.env.CONFIG_DIR || process.cwd();
export const CACHE_PATH = path.join(CONFIG_DIR, 'tandarr-library-cache.json');
const CACHE_TMP = CACHE_PATH + '.tmp';

export interface CacheData {
  version: 1;
  fetchedAt: number;
  sectionKey: string;
  movies: Movie[];
}

export async function readCache(): Promise<CacheData | null> {
  try {
    const raw = await readFile(CACHE_PATH, 'utf-8');
    return JSON.parse(raw) as CacheData;
  } catch {
    return null;
  }
}

export async function writeCache(
  sectionKey: string,
  movies: Movie[],
): Promise<void> {
  const data: CacheData = {
    version: 1,
    fetchedAt: Date.now(),
    sectionKey,
    movies,
  };
  // Atomic write: write to temp file first, then rename
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CACHE_TMP, JSON.stringify(data), 'utf-8');
  await rename(CACHE_TMP, CACHE_PATH);
}

export function isCacheStale(cache: CacheData, maxAgeMs: number): boolean {
  return Date.now() - cache.fetchedAt > maxAgeMs;
}
