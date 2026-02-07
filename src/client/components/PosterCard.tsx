import { useState } from 'preact/hooks';
import type { Movie } from '../../shared/types';

function formatRuntime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

interface PosterCardProps {
  movie: Movie;
}

export function PosterCard({ movie }: PosterCardProps) {
  const [active, setActive] = useState(false);
  const watched = movie.viewCount > 0;

  return (
    <div
      class={`poster-card${watched ? ' watched' : ''}${active ? ' active' : ''}`}
      onClick={() => setActive((prev) => !prev)}
    >
      <img
        src={`/api/poster/${movie.ratingKey}`}
        alt={movie.title}
        loading="lazy"
      />
      {!watched && <span class="unwatched-badge" />}
      <div class="poster-overlay">
        <div class="poster-title">{movie.title}</div>
        <div class="poster-meta">
          {movie.year} | {movie.genres.slice(0, 2).join(', ') || 'N/A'} |{' '}
          {movie.rating != null ? movie.rating.toFixed(1) : '--'} |{' '}
          {formatRuntime(movie.duration)}
        </div>
      </div>
    </div>
  );
}
