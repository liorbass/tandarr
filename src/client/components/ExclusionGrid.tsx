import { filteredMovies, excludedKeys, toggleExclusion } from '../services/filter-state';

export function ExclusionGrid() {
  const movies = filteredMovies.value;
  const excluded = excludedKeys.value;

  if (movies.length === 0) {
    return (
      <div class="filter-empty">
        No movies match the current filters.
      </div>
    );
  }

  return (
    <div class="exclusion-grid-wrap">
      <div class="exclusion-grid">
        {movies.map((movie) => (
          <button
            key={movie.ratingKey}
            class={`grid-item${excluded.has(movie.ratingKey) ? ' grid-item-excluded' : ''}`}
            onClick={() => toggleExclusion(movie.ratingKey)}
            type="button"
          >
            <img
              src={`/api/poster/${movie.ratingKey}?width=300`}
              alt={movie.title}
              loading="lazy"
              class="grid-poster"
            />
            {excluded.has(movie.ratingKey) && (
              <div class="excluded-overlay">
                <span class="strikethrough-line" />
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
