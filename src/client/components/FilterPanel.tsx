import { useEffect, useState } from 'preact/hooks';
import {
  availableGenres,
  availableDecades,
  selectedGenres,
  selectedDecades,
  hideWatched,
  excludedKeys,
  remainingCount,
  overlapCount,
  readyParticipants,
  isReady,
  toggleGenre,
  toggleDecade,
  toggleHideWatched,
  selectAllGenres,
  clearAllGenres,
  selectAllDecades,
  clearAllDecades,
  loadMovies,
  setOnUnready,
} from '../services/filter-state';
import { send, roomState } from '../services/ws-client';
import { ExclusionGrid } from './ExclusionGrid';
import type { UserFilterState } from '../../shared/types';
import '../styles/filter.css';

const ONBOARDING_KEY = 'tandarr-filter-onboarding-seen';

export function FilterPanel() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(
    () => !localStorage.getItem(ONBOARDING_KEY)
  );

  function dismissOnboarding() {
    localStorage.setItem(ONBOARDING_KEY, '1');
    setShowOnboarding(false);
  }

  // On mount: fetch movies and set up unready callback
  useEffect(() => {
    let cancelled = false;

    async function fetchMovies() {
      try {
        const res = await fetch('/api/library');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.movies) {
          loadMovies(data.movies);
        }
      } catch {
        // Silently fail - user will see empty state
      }
    }

    fetchMovies();

    // Register the unready callback so filter-state can send WS message
    setOnUnready(() => {
      send({ type: 'set_unready' });
    });

    return () => {
      cancelled = true;
      setOnUnready(null);
    };
  }, []);

  function handleReady() {
    if (isReady.value) return;

    const filterState: UserFilterState = {
      selectedGenres: Array.from(selectedGenres.value),
      selectedDecades: Array.from(selectedDecades.value),
      hideWatched: hideWatched.value,
      excludedKeys: Array.from(excludedKeys.value),
    };
    send({ type: 'set_ready', filterState });
    isReady.value = true;
  }

  const room = roomState.value;
  const totalParticipants = room?.participants.length ?? 0;
  const readyCount = readyParticipants.value.size;
  const overlap = overlapCount.value;
  const ready = isReady.value;
  const remaining = remainingCount.value;
  const activeFilterCount =
    selectedGenres.value.size + selectedDecades.value.size + (hideWatched.value ? 1 : 0);

  return (
    <div class="filter-panel">
      {/* Onboarding overlay for new users */}
      {showOnboarding && (
        <div class="onboarding-overlay" onClick={dismissOnboarding}>
          <div class="onboarding-card" onClick={(e) => e.stopPropagation()}>
            <h2 class="onboarding-title">How it works</h2>
            <div class="onboarding-steps">
              <div class="onboarding-step">
                <span class="onboarding-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
                    <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
                    <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
                    <line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" />
                    <line x1="17" y1="16" x2="23" y2="16" />
                  </svg>
                </span>
                <p><strong>Filter</strong> by genre, decade, or watched status using the Filters button</p>
              </div>
              <div class="onboarding-step">
                <span class="onboarding-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </span>
                <p><strong>Exclude</strong> specific movies by tapping their poster</p>
              </div>
              <div class="onboarding-step">
                <span class="onboarding-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </span>
                <p><strong>Ready up</strong> when you're done — swiping begins once everyone is ready</p>
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

      {/* Left drawer backdrop */}
      <div
        class={`drawer-backdrop${drawerOpen ? ' visible' : ''}`}
        onClick={() => setDrawerOpen(false)}
      />

      {/* Left drawer with filter controls */}
      <div class={`filter-drawer${drawerOpen ? ' open' : ''}`}>
        <div class="drawer-header">
          <h2>Filters</h2>
          <button class="drawer-close" onClick={() => setDrawerOpen(false)} type="button">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Genre chips */}
        <div class="filter-section">
          <div class="section-header">
            <label class="section-label">Genres</label>
            <div class="section-actions">
              <button type="button" class="section-action" onClick={selectAllGenres}>All</button>
              <span class="section-action-sep">/</span>
              <button type="button" class="section-action" onClick={clearAllGenres}>None</button>
            </div>
          </div>
          <div class="chip-container">
            {availableGenres.value.map((genre) => (
              <button
                key={genre}
                class={selectedGenres.value.has(genre) ? 'chip chip-selected' : 'chip'}
                onClick={() => toggleGenre(genre)}
                type="button"
              >
                {genre}
              </button>
            ))}
          </div>
        </div>

        {/* Decade chips */}
        <div class="filter-section">
          <div class="section-header">
            <label class="section-label">Decades</label>
            <div class="section-actions">
              <button type="button" class="section-action" onClick={selectAllDecades}>All</button>
              <span class="section-action-sep">/</span>
              <button type="button" class="section-action" onClick={clearAllDecades}>None</button>
            </div>
          </div>
          <div class="chip-container">
            {availableDecades.value.map((decade) => (
              <button
                key={decade}
                class={selectedDecades.value.has(decade) ? 'chip chip-selected' : 'chip'}
                onClick={() => toggleDecade(decade)}
                type="button"
              >
                {decade}
              </button>
            ))}
          </div>
        </div>

        {/* Watched toggle */}
        <div class="filter-section">
          <div class="watched-toggle">
            <span class="toggle-label">Hide watched</span>
            <input
              type="checkbox"
              class="toggle-switch"
              checked={hideWatched.value}
              onChange={toggleHideWatched}
            />
          </div>
        </div>
      </div>

      {/* Header */}
      <div class="filter-header">
        <button class="filter-drawer-btn" onClick={() => setDrawerOpen(true)} type="button">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
            <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
            <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
            <line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" />
            <line x1="17" y1="16" x2="23" y2="16" />
          </svg>
          Filters
          {activeFilterCount > 0 && (
            <span class="filter-badge">{activeFilterCount}</span>
          )}
        </button>
        <div class="filter-header-text">
          <h1>Pick Movies</h1>
          <p class="remaining-count">{remaining} movie{remaining !== 1 ? 's' : ''} remaining</p>
        </div>
      </div>

      {/* Exclusion grid */}
      <div class="filter-section grid-section">
        <label class="section-label">Tap to exclude</label>
        <ExclusionGrid />
      </div>

      {/* Ready section */}
      <div class="ready-section">
        <button
          class={`ready-btn${ready ? ' is-ready' : ''}`}
          onClick={handleReady}
          type="button"
        >
          {ready ? 'Ready!' : "I'm Ready"}
        </button>

        <div class="ready-info">
          {totalParticipants > 0 && (
            <span class="ready-count">{readyCount} of {totalParticipants} ready</span>
          )}

          {ready && overlap !== null && overlap > 0 && (
            <span class="overlap-count">{overlap} movie{overlap !== 1 ? 's' : ''} in common</span>
          )}

          {ready && overlap !== null && overlap === 0 && (
            <span class="overlap-warning">No movies match all filters!</span>
          )}
        </div>
      </div>
    </div>
  );
}
