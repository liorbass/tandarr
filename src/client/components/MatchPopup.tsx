import type { DeckCard } from '../../shared/types';
import '../styles/match.css';

interface MatchPopupProps {
  card: DeckCard;
  onSelect: () => void;
  onRegret: () => void;
}

export function MatchPopup({ card, onSelect, onRegret }: MatchPopupProps) {
  return (
    <div class="match-overlay">
      <div class="match-popup">
        <h2 class="match-title">It's a Match!</h2>
        <img
          class="match-poster"
          src={`/api/poster/${card.ratingKey}?width=400`}
          alt={card.title}
        />
        <h3 class="match-movie-title">
          {card.title} ({card.year})
        </h3>
        <p class="match-movie-genres">{card.genres.join(', ')}</p>
        <div class="match-actions">
          <button class="match-btn match-btn-regret" onClick={onRegret}>
            Keep Swiping
          </button>
          <button class="match-btn match-btn-select" onClick={onSelect}>
            Watch This!
          </button>
        </div>
      </div>
    </div>
  );
}
