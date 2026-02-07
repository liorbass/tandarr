import { useRef, useCallback } from 'preact/hooks';
import type { DeckCard } from '../../shared/types';

interface CardDetailProps {
  card: DeckCard;
  onClose: () => void;
}

function formatRuntime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

const DISMISS_THRESHOLD = 120;

export function CardDetail({ card, onClose }: CardDetailProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const startY = useRef(0);
  const currentY = useRef(0);

  const onPointerDown = useCallback((e: PointerEvent) => {
    dragging.current = true;
    startY.current = e.clientY;
    currentY.current = 0;
    const el = sheetRef.current;
    if (el) {
      el.style.transition = 'none';
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  }, []);

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (!dragging.current) return;
    const dy = Math.max(0, e.clientY - startY.current); // only allow downward
    currentY.current = dy;
    const el = sheetRef.current;
    if (el) {
      el.style.transform = `translateY(${dy}px)`;
    }
  }, []);

  const onPointerUp = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    const el = sheetRef.current;
    if (!el) return;

    el.style.transition = '';
    if (currentY.current > DISMISS_THRESHOLD) {
      el.style.transform = 'translateY(100%)';
      setTimeout(onClose, 300);
    } else {
      el.style.transform = '';
    }
  }, [onClose]);

  return (
    <div class="card-detail-overlay" onClick={onClose}>
      <div ref={sheetRef} class="card-detail" onClick={(e) => e.stopPropagation()}>
        <div
          class="card-detail-handle"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
        <button class="card-detail-close" onClick={onClose} aria-label="Close">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <img
          class="card-detail-poster"
          src={`/api/poster/${card.ratingKey}?width=600`}
          alt={card.title}
        />

        <div class="card-detail-content">
          <h2>
            {card.title} ({card.year})
          </h2>

          <div class="card-detail-meta">
            {card.contentRating || 'NR'} | {formatRuntime(card.duration)} |{' '}
            {card.genres.join(', ')}
          </div>

          {card.rating != null && (
            <div class="card-detail-ratings">
              Critic: {card.rating.toFixed(1)}/10
              {card.audienceRating != null &&
                ` | Audience: ${card.audienceRating.toFixed(1)}/10`}
            </div>
          )}

          <p class="card-detail-summary">{card.summary}</p>
        </div>
      </div>
    </div>
  );
}
