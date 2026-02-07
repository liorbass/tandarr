import { signal, computed } from '@preact/signals';
import type { DeckCard } from '../../shared/types';

// --- Constants ---
export const BUFFER_LOW_WATERMARK = 2;
export const REQUEST_BATCH_SIZE = 5;

// --- Core state signals ---
export const cardBuffer = signal<DeckCard[]>([]);
export const swipedCount = signal(0);
export const totalPoolSize = signal(0);

// --- Request tracking ---
let requestPending = false;

// --- Computed signals ---
export const currentCard = computed<DeckCard | null>(() => {
  const buf = cardBuffer.value;
  return buf.length > 0 ? buf[0] : null;
});

// --- Flow signal ---
export const deckStep = signal<'idle' | 'swiping'>('idle');

// --- Helper functions ---

export function loadInitialCards(cards: DeckCard[], total: number, swipedSoFar?: number): void {
  cardBuffer.value = cards;
  swipedCount.value = swipedSoFar ?? 0;
  totalPoolSize.value = total;
  requestPending = false;
  deckStep.value = 'swiping';
}

export function appendCards(cards: DeckCard[]): void {
  cardBuffer.value = [...cardBuffer.value, ...cards];
  requestPending = false;
}

export function advanceCard(): void {
  const buf = cardBuffer.value;
  if (buf.length > 0) {
    cardBuffer.value = buf.slice(1);
    swipedCount.value = swipedCount.value + 1;
  }
}

export function needsMoreCards(): boolean {
  return cardBuffer.value.length <= BUFFER_LOW_WATERMARK && !requestPending;
}

export function markRequestPending(): void {
  requestPending = true;
}

export function resetDeck(): void {
  cardBuffer.value = [];
  swipedCount.value = 0;
  totalPoolSize.value = 0;
  requestPending = false;
  deckStep.value = 'idle';
}
