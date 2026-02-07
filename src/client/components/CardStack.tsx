import { useRef, useState, useCallback } from 'preact/hooks';
import { cardBuffer, currentCard, advanceCard, swipedCount, totalPoolSize, deckStep } from '../services/deck-state';
import { sendSwipe, send } from '../services/ws-client';
import { currentMatch, swipeProgress } from '../services/match-state';
import { CardDetail } from './CardDetail';
import { MatchPopup } from './MatchPopup';
import { SwipeCard } from './SwipeCard';
import { SwipeControls } from './SwipeControls';
import { useSwipeGesture } from '../hooks/useSwipeGesture';
import type { DeckCard } from '../../shared/types';
import '../styles/swipe.css';

const SWIPE_ONBOARDING_KEY = 'tandarr-swipe-onboarding-seen';

export function CardStack() {
  const [detailCard, setDetailCard] = useState<DeckCard | null>(null);
  const [flyDirection, setFlyDirection] = useState<'left' | 'right' | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(
    () => !localStorage.getItem(SWIPE_ONBOARDING_KEY)
  );
  const cardRef = useRef<HTMLDivElement>(null);

  function dismissOnboarding() {
    localStorage.setItem(SWIPE_ONBOARDING_KEY, '1');
    setShowOnboarding(false);
  }

  const handleSwipeCommit = useCallback((direction: 'left' | 'right') => {
    setIsAnimating(true);
    setFlyDirection(direction);
    const card = currentCard.value;
    if (card) {
      sendSwipe(card.ratingKey, direction);
    }
    setTimeout(() => {
      advanceCard();
      setFlyDirection(null);
      setIsAnimating(false);
    }, 400);
  }, []);

  const handleTap = useCallback(() => {
    const card = currentCard.value;
    if (card) {
      setDetailCard(card);
    }
  }, []);

  const { state: swipeState, handlers } = useSwipeGesture(cardRef, {
    onSwipeCommit: handleSwipeCommit,
    onTap: handleTap,
  });

  const buffer = cardBuffer.value;
  const card = currentCard.value;

  // Deck exhausted -- buffer empty while swiping
  if (!card && deckStep.value === 'swiping') {
    return (
      <div class="card-stack-container">
        <div class="deck-exhausted">
          <h2>All done!</h2>
          <p>Waiting for everyone to finish swiping...</p>
        </div>
      </div>
    );
  }

  // No card (not yet started)
  if (!card) return null;

  // Get up to 3 cards for the stack from the buffer
  const visibleCards = buffer.slice(0, 3);

  // Build transform for top card from gesture state
  const gs = swipeState.value;
  const hasGesture = gs.isDragging || gs.offsetX !== 0 || gs.offsetY !== 0;
  const topStyle = flyDirection
    ? undefined  // fly-off class handles transform
    : hasGesture
      ? `transform: translate(${gs.offsetX}px, ${gs.offsetY}px) rotate(${gs.rotation}deg); transition: none;`
      : undefined;  // at rest: let CSS transition handle card promotion

  // Fly-off class for top card
  const flyClass = flyDirection === 'left' ? ' fly-left' : flyDirection === 'right' ? ' fly-right' : '';

  return (
    <div class="card-stack-container">
      {/* Onboarding overlay for new users */}
      {showOnboarding && (
        <div class="onboarding-overlay" onClick={dismissOnboarding}>
          <div class="onboarding-card" onClick={(e) => e.stopPropagation()}>
            <h2 class="onboarding-title">Time to swipe</h2>
            <div class="onboarding-steps">
              <div class="onboarding-step">
                <span class="onboarding-icon onboarding-icon-like">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                  </svg>
                </span>
                <p><strong>Swipe right</strong> or tap the heart to like a movie</p>
              </div>
              <div class="onboarding-step">
                <span class="onboarding-icon onboarding-icon-nope">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                    <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
                  </svg>
                </span>
                <p><strong>Swipe left</strong> or tap the X to pass</p>
              </div>
              <div class="onboarding-step">
                <span class="onboarding-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </span>
                <p><strong>Tap the card</strong> to see more details about the movie</p>
              </div>
              <div class="onboarding-step">
                <span class="onboarding-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </span>
                <p>When everyone likes the same movie, <strong>it's a match!</strong></p>
              </div>
            </div>
            <div class="onboarding-actions">
              <button class="onboarding-skip" onClick={dismissOnboarding} type="button">
                Skip
              </button>
              <button class="onboarding-got-it" onClick={dismissOnboarding} type="button">
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top zone: progress text */}
      <div class="swipe-top">
        <p class="swipe-progress">
          {swipedCount.value + 1} of {totalPoolSize.value}
        </p>
        {swipeProgress.value && card && swipeProgress.value.ratingKey === card.ratingKey && (
          <p class="vote-progress">
            {swipeProgress.value.count} of {swipeProgress.value.total} voted
          </p>
        )}
      </div>

      {/* Middle zone: card (fills remaining space, card centered) */}
      <div class="swipe-middle">
        <div class="card-stack">
          {/* Render in reverse for correct DOM stacking (last = on top) */}
          {visibleCards.slice().reverse().map((c, reverseIdx) => {
            const stackIndex = visibleCards.length - 1 - reverseIdx;
            const isTop = stackIndex === 0;

            return (
              <SwipeCard
                key={c.ratingKey}
                card={c}
                isTop={isTop}
                stackIndex={stackIndex}
                style={isTop ? topStyle : undefined}
                stampOpacity={isTop ? gs.stampOpacity : 0}
                onPointerDown={isTop ? handlers.onPointerDown : undefined}
                onPointerMove={isTop ? handlers.onPointerMove : undefined}
                onPointerUp={isTop ? handlers.onPointerUp : undefined}
                ref={isTop ? cardRef : undefined}
                flyClass={isTop ? flyClass : undefined}
              />
            );
          })}
        </div>
      </div>

      {/* Bottom zone: controls (always pinned) */}
      <SwipeControls onSwipe={handleSwipeCommit} disabled={isAnimating} />

      {detailCard && (
        <CardDetail card={detailCard} onClose={() => setDetailCard(null)} />
      )}

      {currentMatch.value && (
        <MatchPopup
          card={currentMatch.value.card}
          onSelect={() => {
            send({ type: 'select_match', ratingKey: currentMatch.value!.card.ratingKey });
          }}
          onRegret={() => {
            send({ type: 'regret_match', ratingKey: currentMatch.value!.card.ratingKey });
          }}
        />
      )}
    </div>
  );
}
