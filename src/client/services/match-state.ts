import { signal, computed } from '@preact/signals';
import type { DeckCard } from '../../shared/types';

// --- Core state signals ---

/** FIFO queue of pending match popups */
export const matchQueue = signal<Array<{ card: DeckCard }>>([]);

/** The accepted match result (movie + who selected it) */
export const sessionResult = signal<{ card: DeckCard; selectedBy: string } | null>(null);

/** Near-miss fallback list when session ends with no match */
export const nearMisses = signal<Array<{ card: DeckCard; agreement: number }>>([]);

/** Drives RoomPage step transitions for match lifecycle */
export const sessionStep = signal<'active' | 'result' | 'no_match'>('active');

/** Swipe progress for current card (how many participants have swiped) */
export const swipeProgress = signal<{ ratingKey: string; count: number; total: number } | null>(null);

// --- Computed signals ---

/** First item in matchQueue, or null if empty (one popup at a time) */
export const currentMatch = computed<{ card: DeckCard } | null>(() => {
  const queue = matchQueue.value;
  return queue.length > 0 ? queue[0] : null;
});

// --- Helper functions ---

/** Append a match to the FIFO queue */
export function addMatch(card: DeckCard): void {
  matchQueue.value = [...matchQueue.value, { card }];
}

/** Remove the first item from matchQueue (shift) */
export function dismissMatch(): void {
  matchQueue.value = matchQueue.value.slice(1);
}

/** Set the accepted match result, clear queue, transition to result step */
export function endSession(card: DeckCard, selectedBy: string): void {
  sessionResult.value = { card, selectedBy };
  matchQueue.value = [];
  sessionStep.value = 'result';
}

/** Set near-miss list and transition to no_match step */
export function showNearMisses(misses: Array<{ card: DeckCard; agreement: number }>): void {
  nearMisses.value = misses;
  sessionStep.value = 'no_match';
}

/** Reset all match state to initial values (called on disconnect/leave) */
export function resetMatchState(): void {
  matchQueue.value = [];
  sessionResult.value = null;
  nearMisses.value = [];
  sessionStep.value = 'active';
  swipeProgress.value = null;
}
