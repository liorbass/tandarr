import { sessionResult, nearMisses, sessionStep } from '../services/match-state';
import type { DeckCard } from '../../shared/types';
import '../styles/match.css';

interface ResultScreenProps {
  onBackToLobby: () => void;
}

function formatRuntime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function truncateSummary(summary: string, maxLen = 200): string {
  if (summary.length <= maxLen) return summary;
  return summary.slice(0, maxLen).trimEnd() + '...';
}

function ChosenResult({ card, selectedBy, onBackToLobby }: { card: DeckCard; selectedBy: string; onBackToLobby: () => void }) {
  return (
    <div class="result-screen">
      <h2 class="result-heading">Tonight's Pick</h2>
      <img
        class="result-poster"
        src={`/api/poster/${card.ratingKey}?width=400`}
        alt={card.title}
      />
      <h3 class="result-title">{card.title} ({card.year})</h3>
      <p class="result-meta">
        {card.genres.join(', ')}
        {card.duration > 0 && <> &middot; {formatRuntime(card.duration)}</>}
        {card.rating !== null && <> &middot; {card.rating.toFixed(1)}</>}
      </p>
      {card.summary && (
        <p class="result-summary">{truncateSummary(card.summary)}</p>
      )}
      <p class="result-selected-by">Selected by {selectedBy}</p>
      <button class="result-back-btn" onClick={onBackToLobby}>
        Back to Lobby
      </button>
    </div>
  );
}

function NearMissResult({ misses, onBackToLobby }: { misses: Array<{ card: DeckCard; agreement: number }>; onBackToLobby: () => void }) {
  return (
    <div class="result-screen">
      <h2 class="near-miss-heading">No Matches Found</h2>
      <p class="near-miss-subtitle">Here are your closest picks:</p>

      {misses.length === 0 ? (
        <p class="near-miss-empty">No one swiped right on any movie</p>
      ) : (
        <div class="near-miss-list">
          {misses.map((item, i) => (
            <div class="near-miss-item" key={item.card.ratingKey}>
              <span class="near-miss-rank">#{i + 1}</span>
              <img
                class="near-miss-poster"
                src={`/api/poster/${item.card.ratingKey}?width=120`}
                alt={item.card.title}
              />
              <div class="near-miss-info">
                <div class="near-miss-title">{item.card.title}</div>
                <div class="near-miss-year">{item.card.year}</div>
              </div>
              <span class="near-miss-agreement">{item.agreement}%</span>
            </div>
          ))}
        </div>
      )}

      <button class="result-back-btn" onClick={onBackToLobby}>
        Back to Lobby
      </button>
    </div>
  );
}

export function ResultScreen({ onBackToLobby }: ResultScreenProps) {
  const step = sessionStep.value;
  const result = sessionResult.value;
  const misses = nearMisses.value;

  if (step === 'result' && result) {
    return (
      <ChosenResult
        card={result.card}
        selectedBy={result.selectedBy}
        onBackToLobby={onBackToLobby}
      />
    );
  }

  if (step === 'no_match') {
    return <NearMissResult misses={misses} onBackToLobby={onBackToLobby} />;
  }

  // Fallback -- shouldn't reach here if wired correctly
  return null;
}
