import type { Movie, UserFilterState, DeckCard, DeckOptions, DeckOptionIntensity } from '../../shared/types.js';

// --- Intensity multiplier map ---
// 1.0 = baseline (no effect), higher = stronger bias in weighted shuffle
const INTENSITY_MAP: Record<DeckOptionIntensity, number> = {
  low: 1.5,
  medium: 3.0,
  high: 6.0,
};

// --- Wild card injection percentages by intensity ---
const WILD_CARD_PERCENT: Record<DeckOptionIntensity, number> = {
  low: 0.05,
  medium: 0.10,
  high: 0.20,
};

// --- Probability Pool Types (server-only) ---

export interface PoolEntry {
  card: DeckCard;
  baseWeight: number;
  dynamicWeight: number;
  isWildCard: boolean;
}

export interface ProbabilityPool {
  unseen: Map<string, PoolEntry>;   // ratingKey → entry (not yet served)
  served: Map<string, PoolEntry>;   // ratingKey → entry (sent to client, not yet swiped)
  swiped: Map<string, PoolEntry>;   // ratingKey → entry (user has swiped)
  totalSize: number;                // original pool size (unseen + served + swiped)
}

/**
 * Single source of truth for filter matching.
 * Determines whether a movie passes a single user's filter state.
 */
export function moviePassesFilter(movie: Movie, filter: UserFilterState): boolean {
  if (filter.selectedGenres.length > 0) {
    if (!movie.genres.some(g => filter.selectedGenres.includes(g))) return false;
  }
  if (filter.selectedDecades.length > 0) {
    const decade = `${Math.floor(movie.year / 10) * 10}s`;
    if (!filter.selectedDecades.includes(decade)) return false;
  }
  if (filter.hideWatched && movie.viewCount > 0) return false;
  if (filter.excludedKeys.includes(movie.ratingKey)) return false;
  return true;
}

/**
 * Convert a full Movie to a DeckCard (display-only subset, no viewCount).
 */
export function movieToDeckCard(movie: Movie): DeckCard {
  return {
    ratingKey: movie.ratingKey,
    title: movie.title,
    year: movie.year,
    genres: movie.genres,
    rating: movie.rating,
    audienceRating: movie.audienceRating,
    duration: movie.duration,
    summary: movie.summary,
    contentRating: movie.contentRating,
    addedAt: movie.addedAt,
  };
}

/**
 * Fisher-Yates (Knuth) shuffle — uniform random, in-place on a copy.
 * Returns a new array; does not mutate the input.
 */
export function fisherYatesShuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Compute the weight for a single deck card based on enabled DeckOptions.
 * Base weight is 1.0. Each enabled option adds to the weight.
 *
 * @param card - The deck card to weight
 * @param options - Host-configured deck options
 * @param now - Current time in milliseconds (Date.now())
 */
export function computeCardWeight(
  card: DeckCard,
  options: DeckOptions,
  now: number,
): number {
  let weight = 1.0;

  // Recently Released Boost: newer movies (by release year) get higher weight
  if (options.recentlyReleasedBoost.enabled) {
    const currentYear = new Date(now).getFullYear();
    const recency = Math.max(0, Math.min(1, (card.year - 1950) / (currentYear - 1950)));
    weight += recency * INTENSITY_MAP[options.recentlyReleasedBoost.intensity];
  }

  // Recently Added Boost: movies recently added to Plex get higher weight
  if (options.recentlyAddedBoost.enabled) {
    const ageMs = now - card.addedAt * 1000; // addedAt is seconds, now is ms
    const addedRecency = Math.max(0, 1 - ageMs / (365 * 24 * 60 * 60 * 1000));
    weight += addedRecency * INTENSITY_MAP[options.recentlyAddedBoost.intensity];
  }

  // Floor at 0.01 to avoid zero/negative weights
  return Math.max(weight, 0.01);
}

/**
 * Inject wild cards from the full library (ignoring ALL filters) into the card list.
 * Returns the augmented card list AND the set of wild card ratingKeys.
 */
function injectWildCards(
  cards: DeckCard[],
  allMovies: Movie[],
  deckKeys: Set<string>,
  options: DeckOptions,
): { cards: DeckCard[]; wildCardKeys: Set<string> } {
  const wildCardKeys = new Set<string>();

  if (!options.wildCards.enabled) return { cards, wildCardKeys };

  const percent = WILD_CARD_PERCENT[options.wildCards.intensity];
  const count = Math.max(1, Math.round(cards.length * percent));

  const candidates = allMovies.filter(m => !deckKeys.has(m.ratingKey));
  if (candidates.length === 0) return { cards, wildCardKeys };

  const sampleSize = Math.min(count, candidates.length);
  const shuffled = [...candidates];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const selected = shuffled.slice(0, sampleSize);

  const result = [...cards];
  for (const movie of selected) {
    const card = movieToDeckCard(movie);
    wildCardKeys.add(card.ratingKey);
    result.push(card);
  }

  return { cards: result, wildCardKeys };
}

/**
 * Build the master pool: compute filter intersection, inject wild cards,
 * and return all cards with their wild card status.
 *
 * @returns cards array and set of wild card ratingKeys
 */
export function buildMasterPool(
  allMovies: Movie[],
  filters: UserFilterState[],
  options: DeckOptions,
): { cards: DeckCard[]; wildCardKeys: Set<string> } {
  // Step 1: Compute intersection (movies passing ALL users' filters)
  const intersection = allMovies.filter(movie =>
    filters.every(filter => moviePassesFilter(movie, filter)),
  );

  // Step 2: Convert to DeckCard
  const cards = intersection.map(movieToDeckCard);

  // Step 3: Inject wild cards (from full library, ignoring ALL filters)
  const deckKeys = new Set(cards.map(c => c.ratingKey));
  return injectWildCards(cards, allMovies, deckKeys, options);
}

/**
 * Create a per-user probability pool from the master card list.
 * Each card gets a base weight computed from DeckOptions (recently released/added boosts).
 */
export function initProbabilityPool(
  cards: DeckCard[],
  wildCardKeys: Set<string>,
  options: DeckOptions,
): ProbabilityPool {
  const now = Date.now();
  const unseen = new Map<string, PoolEntry>();

  for (const card of cards) {
    const baseWeight = computeCardWeight(card, options, now);
    unseen.set(card.ratingKey, {
      card,
      baseWeight,
      dynamicWeight: baseWeight,
      isWildCard: wildCardKeys.has(card.ratingKey),
    });
  }

  return {
    unseen,
    served: new Map(),
    swiped: new Map(),
    totalSize: cards.length,
  };
}

/**
 * Weighted random sample from the unseen pool.
 * Moves sampled entries from `unseen` → `served`.
 * Returns the sampled DeckCards in order.
 */
export function sampleFromPool(pool: ProbabilityPool, count: number): DeckCard[] {
  const available = Array.from(pool.unseen.values());
  if (available.length === 0) return [];

  const sampleSize = Math.min(count, available.length);
  const sampled: DeckCard[] = [];

  // Build a working copy for weighted selection
  const candidates = available.map(e => ({ entry: e, weight: Math.max(e.dynamicWeight, 0.01) }));

  for (let i = 0; i < sampleSize; i++) {
    const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
    let random = Math.random() * totalWeight;

    for (let j = 0; j < candidates.length; j++) {
      random -= candidates[j].weight;
      if (random <= 0) {
        const selected = candidates[j].entry;
        sampled.push(selected.card);

        // Move from unseen → served
        pool.unseen.delete(selected.card.ratingKey);
        pool.served.set(selected.card.ratingKey, selected);

        // Remove from candidates
        candidates.splice(j, 1);
        break;
      }
    }
  }

  return sampled;
}

/**
 * Update the dynamic weight of a single unseen entry based on another user's swipe.
 * Only affects entries still in the `unseen` set.
 */
export function updatePoolWeights(
  pool: ProbabilityPool,
  ratingKey: string,
  direction: 'left' | 'right',
  options: DeckOptions,
): void {
  const entry = pool.unseen.get(ratingKey);
  if (!entry) return; // Already served or swiped — no effect

  if (direction === 'right' && options.boostRightSwipes.enabled) {
    entry.dynamicWeight += INTENSITY_MAP[options.boostRightSwipes.intensity];
  }

  if (direction === 'left' && options.demoteLeftSwipes.enabled) {
    entry.dynamicWeight -= INTENSITY_MAP[options.demoteLeftSwipes.intensity];
    entry.dynamicWeight = Math.max(entry.dynamicWeight, 0.01);
  }
}
