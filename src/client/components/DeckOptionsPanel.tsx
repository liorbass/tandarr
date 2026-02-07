import { useState } from 'preact/hooks';
import type { DeckOptions, DeckOptionIntensity } from '../../shared/types';
import { DEFAULT_DECK_OPTIONS } from '../../shared/types';
import { send } from '../services/ws-client';
import '../styles/deck-options.css';

interface OptionDef {
  key: keyof DeckOptions;
  label: string;
}

const OPTION_DEFS: OptionDef[] = [
  { key: 'wildCards', label: 'Wild Cards' },
  { key: 'boostRightSwipes', label: 'Boost Right-Swipes' },
  { key: 'demoteLeftSwipes', label: 'Demote Left-Swipes' },
  { key: 'recentlyReleasedBoost', label: 'Recently Released' },
  { key: 'recentlyAddedBoost', label: 'Recently Added' },
];

const INTENSITIES: DeckOptionIntensity[] = ['low', 'medium', 'high'];

const INTENSITY_LABELS: Record<DeckOptionIntensity, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

interface DeckOptionsPanelProps {
  initialOptions?: DeckOptions;
}

export function DeckOptionsPanel({ initialOptions }: DeckOptionsPanelProps) {
  const [options, setOptions] = useState<DeckOptions>(
    initialOptions ?? { ...DEFAULT_DECK_OPTIONS }
  );
  const [expandedKeys, setExpandedKeys] = useState<Set<keyof DeckOptions>>(new Set());

  function update(next: DeckOptions) {
    setOptions(next);
    send({ type: 'set_deck_options', options: next });
  }

  function handleToggle(key: keyof DeckOptions) {
    const entry = options[key];
    const next: DeckOptions = {
      ...options,
      [key]: { ...entry, enabled: !entry.enabled },
    };
    update(next);
  }

  function handleIntensity(key: keyof DeckOptions, intensity: DeckOptionIntensity) {
    const entry = options[key];
    if (entry.intensity === intensity) return;
    const next: DeckOptions = {
      ...options,
      [key]: { ...entry, intensity },
    };
    update(next);
  }

  function toggleExpanded(key: keyof DeckOptions) {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div class="deck-options">
      <p class="deck-options-title">Deck Options</p>
      {OPTION_DEFS.map((def) => {
        const entry = options[def.key];
        const isExpanded = expandedKeys.has(def.key);
        return (
          <div key={def.key} class="deck-option">
            <div class="deck-option-header">
              <div class="deck-option-info">
                <span class="deck-option-label">{def.label}</span>
                {entry.enabled && (
                  <button
                    type="button"
                    class="deck-intensity-inline"
                    onClick={() => toggleExpanded(def.key)}
                  >
                    <span class="deck-intensity-current">{INTENSITY_LABELS[entry.intensity]}</span>
                    <span class={`deck-intensity-chevron${isExpanded ? ' expanded' : ''}`}>&#9662;</span>
                  </button>
                )}
              </div>
              <label class="deck-toggle">
                <input
                  type="checkbox"
                  checked={entry.enabled}
                  onChange={() => handleToggle(def.key)}
                />
                <span class="deck-toggle-track" />
                <span class="deck-toggle-knob" />
              </label>
            </div>
            {entry.enabled && isExpanded && (
              <div class="deck-intensity">
                {INTENSITIES.map((level) => (
                  <button
                    key={level}
                    type="button"
                    class={`deck-intensity-btn${entry.intensity === level ? ' active' : ''}`}
                    onClick={() => handleIntensity(def.key, level)}
                  >
                    {INTENSITY_LABELS[level]}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
