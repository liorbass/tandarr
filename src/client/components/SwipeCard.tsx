import { forwardRef } from 'preact/compat';
import type { DeckCard } from '../../shared/types';

interface SwipeCardProps {
  card: DeckCard;
  isTop: boolean;
  stackIndex: number;
  style?: string;
  stampOpacity?: number;
  flyClass?: string;
  onPointerDown?: (e: PointerEvent) => void;
  onPointerMove?: (e: PointerEvent) => void;
  onPointerUp?: (e: PointerEvent) => void;
}

export function formatRuntime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export const SwipeCard = forwardRef<HTMLDivElement, SwipeCardProps>(function SwipeCard({
  card,
  isTop,
  stackIndex,
  style,
  stampOpacity,
  flyClass,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}, ref) {
  const likeOpacity = Math.max(0, stampOpacity ?? 0);
  const nopeOpacity = Math.max(0, -(stampOpacity ?? 0));

  const truncatedSummary =
    card.summary.length > 100
      ? card.summary.slice(0, 100) + '\u2026'
      : card.summary;

  const className = `swipe-card${isTop ? ' swipe-card-top' : ''}${flyClass || ''}`;

  return (
    <div
      ref={ref}
      class={className}
      data-stack={stackIndex}
      style={isTop ? style : undefined}
      onPointerDown={isTop ? onPointerDown : undefined}
      onPointerMove={isTop ? onPointerMove : undefined}
      onPointerUp={isTop ? onPointerUp : undefined}
    >
      <img
        class="swipe-card-poster"
        src={`/api/poster/${card.ratingKey}?width=400`}
        alt={card.title}
        loading="eager"
      />
      <div class="swipe-card-info">
        <h3 class="swipe-card-title">{card.title}</h3>
        <p class="swipe-card-meta">
          {card.year} | {formatRuntime(card.duration)}
          {card.rating != null ? ` | ${card.rating.toFixed(1)}` : ''}
        </p>
        <p class="swipe-card-summary">{truncatedSummary}</p>
      </div>

      <div
        class="swipe-stamp swipe-stamp-like"
        style={`opacity: ${likeOpacity}`}
      >
        LIKE
      </div>
      <div
        class="swipe-stamp swipe-stamp-nope"
        style={`opacity: ${nopeOpacity}`}
      >
        NOPE
      </div>
    </div>
  );
});
