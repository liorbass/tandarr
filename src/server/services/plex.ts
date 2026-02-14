import type { ConnectionResult, Movie, PlexLibrary } from '../../shared/types.js';

const PLEX_HEADERS = {
  Accept: 'application/json',
  'X-Plex-Client-Identifier': 'tandarr-app',
  'X-Plex-Product': 'Tandarr',
  'X-Plex-Version': '1.0.0',
};

export async function testConnection(
  serverUrl: string,
  token: string,
): Promise<ConnectionResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(`${serverUrl}/`, {
      headers: {
        ...PLEX_HEADERS,
        'X-Plex-Token': token,
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.status === 401) {
      return { ok: false, error: 'Invalid authentication token' };
    }
    if (!res.ok) {
      return { ok: false, error: `Server returned HTTP ${res.status}` };
    }

    const data = await res.json();
    const serverName = data.MediaContainer?.friendlyName ?? 'Plex Server';

    return { ok: true, serverName };
  } catch (err: unknown) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === 'AbortError') {
      // Extract host from URL for user-friendly message
      let host = serverUrl;
      try {
        const url = new URL(serverUrl);
        host = `${url.hostname}:${url.port || '32400'}`;
      } catch {
        // keep raw serverUrl
      }
      return {
        ok: false,
        error: `Can't reach server at ${host} -- check that Plex is running and on the same network`,
      };
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { ok: false, error: `Connection failed: ${message}` };
  }
}

export async function getLibraries(
  serverUrl: string,
  token: string,
): Promise<PlexLibrary[]> {
  const res = await fetch(`${serverUrl}/library/sections`, {
    headers: {
      ...PLEX_HEADERS,
      'X-Plex-Token': token,
    },
  });

  if (!res.ok) {
    throw new Error('Failed to fetch libraries');
  }

  const data = await res.json();
  const directories = data.MediaContainer?.Directory ?? [];

  return directories
    .filter((d: { type: string }) => d.type === 'movie')
    .map((d: { key: string; type: string; title: string }) => ({
      key: d.key,
      type: d.type,
      title: d.title,
    }));
}

export async function getMovieCount(
  serverUrl: string,
  token: string,
  sectionKey: string,
): Promise<number> {
  // Use X-Plex-Container-Size=0 to get just the count without fetching items
  const res = await fetch(
    `${serverUrl}/library/sections/${sectionKey}/all?X-Plex-Container-Size=0`,
    {
      headers: {
        ...PLEX_HEADERS,
        'X-Plex-Token': token,
      },
    },
  );

  if (!res.ok) {
    throw new Error('Failed to fetch movie count');
  }

  const data = await res.json();
  const container = data.MediaContainer;
  const totalSize = container?.totalSize ?? container?.size;

  if (totalSize != null) {
    return totalSize;
  }

  // Fallback: try with Container-Size=1 and read totalSize/size
  const fallbackRes = await fetch(
    `${serverUrl}/library/sections/${sectionKey}/all?X-Plex-Container-Size=1`,
    {
      headers: {
        ...PLEX_HEADERS,
        'X-Plex-Token': token,
      },
    },
  );

  if (!fallbackRes.ok) {
    return 0;
  }

  const fallbackData = await fallbackRes.json();
  const fb = fallbackData.MediaContainer;
  return fb?.totalSize ?? fb?.size ?? 0;
}

interface PlexMovieRaw {
  ratingKey: string;
  title: string;
  year?: number;
  rating?: number;
  audienceRating?: number;
  duration?: number;
  summary?: string;
  contentRating?: string;
  viewCount?: number;
  addedAt?: number;
  Genre?: Array<{ id: number; filter: string; tag: string }>;
}

function mapPlexMovie(raw: PlexMovieRaw): Movie {
  return {
    ratingKey: raw.ratingKey,
    title: raw.title,
    year: raw.year ?? 0,
    genres: (raw.Genre ?? []).map((g) => g.tag),
    rating: raw.rating ?? null,
    audienceRating: raw.audienceRating ?? null,
    duration: Math.round((raw.duration ?? 0) / 60000),
    summary: raw.summary ?? '',
    contentRating: raw.contentRating ?? '',
    viewCount: raw.viewCount ?? 0,
    addedAt: raw.addedAt ?? 0,
  };
}

export async function fetchAllMovies(
  serverUrl: string,
  token: string,
  sectionKey: string,
  onProgress?: (progress: { loaded: number; total: number }) => void,
): Promise<Movie[]> {
  const PAGE_SIZE = 100;
  const allMovies: Movie[] = [];
  let offset = 0;
  let totalSize = -1;

  while (totalSize === -1 || offset < totalSize) {
    const res = await fetch(
      `${serverUrl}/library/sections/${sectionKey}/all?X-Plex-Container-Start=${offset}&X-Plex-Container-Size=${PAGE_SIZE}`,
      {
        headers: {
          ...PLEX_HEADERS,
          'X-Plex-Token': token,
        },
      },
    );

    if (!res.ok) {
      throw new Error(`Plex API error: ${res.status}`);
    }

    const data = await res.json();
    const container = data.MediaContainer;

    if (totalSize === -1) {
      totalSize = container.totalSize ?? container.size ?? 0;
    }

    const movies = ((container.Metadata ?? []) as PlexMovieRaw[]).map(
      mapPlexMovie,
    );
    allMovies.push(...movies);
    offset += PAGE_SIZE;

    if (onProgress) {
      onProgress({ loaded: allMovies.length, total: totalSize });
    }
  }

  return allMovies;
}
