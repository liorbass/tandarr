import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import type { Movie, LibraryState, SyncStatus } from '../../shared/types';
import { PosterCard } from './PosterCard';
import { SkeletonCard } from './SkeletonCard';
import '../styles/library.css';

type SortKey = 'title' | 'year' | 'rating';

function sortMovies(movies: Movie[], sortBy: SortKey): Movie[] {
  const sorted = [...movies];
  switch (sortBy) {
    case 'title':
      sorted.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case 'year':
      sorted.sort((a, b) => b.year - a.year);
      break;
    case 'rating':
      sorted.sort((a, b) => {
        const ra = a.rating ?? -1;
        const rb = b.rating ?? -1;
        return rb - ra;
      });
      break;
  }
  return sorted;
}

export function LibraryPage() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ loaded: 0, total: 0 });
  const [sortBy, setSortBy] = useState<SortKey>('title');
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showError = useCallback((msg: string) => {
    setError(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setError(null), 4000);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const fetchLibrary = useCallback(async () => {
    try {
      const res = await fetch('/api/library');
      if (!res.ok) throw new Error(`Library fetch failed (${res.status})`);
      const data: LibraryState = await res.json();

      if (data.movies && data.movies.length > 0) {
        setMovies(data.movies);
      }
      setIsLoading(false);

      // If server says a sync is needed or already running, start polling
      if (data.needsSync) {
        triggerRefresh();
      } else if (data.refreshing) {
        startPolling();
      }
    } catch (err) {
      setIsLoading(false);
      if (movies.length > 0) {
        showError(
          err instanceof Error ? err.message : 'Failed to load library',
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    setIsSyncing(true);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/library/status');
        if (!res.ok) return;
        const status: SyncStatus = await res.json();
        setSyncProgress(status.progress);

        if (!status.syncing) {
          stopPolling();
          setIsSyncing(false);
          // Fetch fresh data
          try {
            const libRes = await fetch('/api/library');
            if (libRes.ok) {
              const data: LibraryState = await libRes.json();
              if (data.movies && data.movies.length > 0) {
                setMovies(data.movies);
              }
            }
          } catch {
            // Keep existing movies on fetch failure
          }
        }
      } catch {
        // Polling error -- will retry next interval
      }
    }, 500);
  }, [stopPolling]);

  const triggerRefresh = useCallback(async () => {
    try {
      const res = await fetch('/api/library/refresh', { method: 'POST' });
      if (!res.ok) throw new Error(`Refresh failed (${res.status})`);
      const data = await res.json();
      if (data.status === 'already_syncing') {
        showError('Sync already in progress');
      }
      startPolling();
    } catch (err) {
      showError(
        err instanceof Error ? err.message : 'Failed to trigger refresh',
      );
    }
  }, [startPolling, showError]);

  // Initial load
  useEffect(() => {
    fetchLibrary();
    return () => {
      stopPolling();
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sorted = sortMovies(movies, sortBy);
  const hasMovies = movies.length > 0;

  return (
    <div class="library-page">
      <div class="library-header">
        <div class="sort-controls">
          {(['title', 'year', 'rating'] as SortKey[]).map((key) => (
            <button
              key={key}
              class={`sort-btn${sortBy === key ? ' active' : ''}`}
              onClick={() => setSortBy(key)}
            >
              {key.charAt(0).toUpperCase() + key.slice(1)}
            </button>
          ))}
        </div>
        <button
          class={`refresh-btn${isSyncing ? ' spinning' : ''}`}
          onClick={triggerRefresh}
          disabled={isSyncing}
          title="Refresh library"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
          </svg>
          Refresh
        </button>
        <div class="header-spacer" />
        <a href="/room" class="watch-together-btn" title="Start a watch session">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          Watch Together
        </a>
        <a href="/config" class="settings-link" title="Settings">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </a>
        {isSyncing && (
          <div class="sync-progress">
            Loading movies...{' '}
            {syncProgress.total > 0
              ? `${syncProgress.loaded.toLocaleString()} / ${syncProgress.total.toLocaleString()}`
              : ''}
          </div>
        )}
      </div>

      {/* Empty state: no movies and not loading */}
      {!isLoading && !isSyncing && !hasMovies && (
        <div class="library-empty">
          <p>No movies loaded yet.</p>
          <p>
            <a href="/config">Configure your Plex server</a> or click Refresh to
            sync.
          </p>
          <a href="/room" class="empty-watch-link">
            Or join a watch session
          </a>
        </div>
      )}

      <div class="poster-grid">
        {/* Show skeleton cards during initial sync with no movies */}
        {(isLoading || (isSyncing && !hasMovies)) && (
          <SkeletonCard count={24} />
        )}

        {/* Poster cards for loaded movies */}
        {sorted.map((movie) => (
          <PosterCard key={movie.ratingKey} movie={movie} />
        ))}

        {/* A few trailing skeletons when syncing with existing movies */}
        {isSyncing && hasMovies && <SkeletonCard count={4} />}
      </div>

      {/* Error toast */}
      {error && <div class="error-toast">{error}</div>}

      {/* Floating Watch Together button */}
      <a href="/room" class="watch-fab">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        Watch Together
      </a>
    </div>
  );
}
