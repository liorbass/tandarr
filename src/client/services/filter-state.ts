import { signal, computed } from '@preact/signals';
import type { Movie } from '../../shared/types';

// --- Core state signals ---
export const allMovies = signal<Movie[]>([]);
export const selectedGenres = signal<Set<string>>(new Set());
export const selectedDecades = signal<Set<string>>(new Set());
export const hideWatched = signal(false);
export const excludedKeys = signal<Set<string>>(new Set());

// --- Computed signals (derived, no manual updates) ---

export const availableGenres = computed(() => {
  const genres = new Set<string>();
  for (const m of allMovies.value) {
    for (const g of m.genres) {
      genres.add(g);
    }
  }
  return [...genres].sort();
});

export const availableDecades = computed(() => {
  const decades = new Set<string>();
  for (const m of allMovies.value) {
    if (m.year > 0) {
      decades.add(`${Math.floor(m.year / 10) * 10}s`);
    }
  }
  return [...decades].sort();
});

export const filteredMovies = computed(() => {
  let movies = allMovies.value;

  if (selectedGenres.value.size > 0) {
    movies = movies.filter(m => m.genres.some(g => selectedGenres.value.has(g)));
  }

  if (selectedDecades.value.size > 0) {
    movies = movies.filter(m => {
      const decade = `${Math.floor(m.year / 10) * 10}s`;
      return selectedDecades.value.has(decade);
    });
  }

  if (hideWatched.value) {
    movies = movies.filter(m => m.viewCount === 0);
  }

  return movies;
});

export const remainingCount = computed(() => {
  const excluded = excludedKeys.value;
  return filteredMovies.value.filter(m => !excluded.has(m.ratingKey)).length;
});

// --- Multiplayer state signals ---
export const overlapCount = signal<number | null>(null);
export const readyParticipants = signal<Set<string>>(new Set());
export const isReady = signal(false);

// --- Flow signal ---
export const filterStep = signal<'idle' | 'filtering'>('idle');

// --- Unready callback mechanism ---
export let onUnready: (() => void) | null = null;

export function setOnUnready(cb: (() => void) | null): void {
  onUnready = cb;
}

// --- Helper to auto-unready when filter changes ---
function autoUnready(): void {
  if (isReady.value) {
    isReady.value = false;
    onUnready?.();
  }
}

// --- Helper functions ---

export function selectAllGenres(): void {
  selectedGenres.value = new Set(availableGenres.value);
  autoUnready();
}

export function clearAllGenres(): void {
  selectedGenres.value = new Set();
  autoUnready();
}

export function selectAllDecades(): void {
  selectedDecades.value = new Set(availableDecades.value);
  autoUnready();
}

export function clearAllDecades(): void {
  selectedDecades.value = new Set();
  autoUnready();
}

export function toggleGenre(genre: string): void {
  const next = new Set(selectedGenres.value);
  if (next.has(genre)) {
    next.delete(genre);
  } else {
    next.add(genre);
  }
  selectedGenres.value = next;
  autoUnready();
}

export function toggleDecade(decade: string): void {
  const next = new Set(selectedDecades.value);
  if (next.has(decade)) {
    next.delete(decade);
  } else {
    next.add(decade);
  }
  selectedDecades.value = next;
  autoUnready();
}

export function toggleHideWatched(): void {
  hideWatched.value = !hideWatched.value;
  autoUnready();
}

export function toggleExclusion(ratingKey: string): void {
  const next = new Set(excludedKeys.value);
  if (next.has(ratingKey)) {
    next.delete(ratingKey);
  } else {
    next.add(ratingKey);
  }
  excludedKeys.value = next;
  autoUnready();
}

export function resetFilters(): void {
  // Reset to all-selected (matching loadMovies default)
  selectedGenres.value = new Set(availableGenres.value);
  selectedDecades.value = new Set(availableDecades.value);
  hideWatched.value = false;
  // Do NOT clear excludedKeys
  autoUnready();
}

export function loadMovies(movies: Movie[]): void {
  allMovies.value = movies;
  // Default: all genres selected so chips appear active
  if (selectedGenres.value.size === 0) {
    const genres = new Set<string>();
    for (const m of movies) {
      for (const g of m.genres) genres.add(g);
    }
    selectedGenres.value = genres;
  }
  // Default: all decades selected
  if (selectedDecades.value.size === 0) {
    const decades = new Set<string>();
    for (const m of movies) {
      if (m.year > 0) decades.add(`${Math.floor(m.year / 10) * 10}s`);
    }
    selectedDecades.value = decades;
  }
}
