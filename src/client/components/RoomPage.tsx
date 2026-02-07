import { useState, useEffect } from 'preact/hooks';
import { useSignalEffect } from '@preact/signals';
import { connect, disconnect, roomState, roomError, getStoredSession, clearSession } from '../services/ws-client';
import { filterStep, overlapCount, readyParticipants, isReady } from '../services/filter-state';
import { deckStep, cardBuffer, resetDeck } from '../services/deck-state';
import { sessionStep, resetMatchState } from '../services/match-state';
import { NicknameStep } from './NicknameStep';
import { RoomLobby } from './RoomLobby';
import { FilterPanel } from './FilterPanel';
import { CardStack } from './CardStack';
import { ResultScreen } from './ResultScreen';
import { RoomToast } from './RoomToast';
import '../styles/room.css';

type Step = 'choose' | 'nickname-create' | 'nickname-join' | 'reconnecting' | 'lobby' | 'filtering' | 'swiping' | 'result';

export function RoomPage() {
  // If we have a stored session, start in reconnecting state
  const stored = getStoredSession();
  const [step, setStep] = useState<Step>(stored ? 'reconnecting' : 'choose');
  const [joinCode, setJoinCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);

  // Connect WebSocket on mount, disconnect on unmount
  useEffect(() => {
    connect();
    // If reconnecting and no room state arrives within 5s, fall back to choose
    if (stored) {
      const timeout = setTimeout(() => {
        if (!roomState.value) {
          clearSession();
          setStep('choose');
        }
      }, 5000);
      return () => { clearTimeout(timeout); disconnect(); };
    }
    return () => disconnect();
  }, []);

  // Transition to lobby when roomState becomes set (signal subscription)
  useSignalEffect(() => {
    if (roomState.value && step !== 'lobby' && step !== 'filtering' && step !== 'swiping' && step !== 'result') {
      setStep('lobby');
    }
    // If reconnecting and roomState is cleared (session expired), go to choose
    if (!roomState.value && step === 'reconnecting') {
      clearSession();
      setStep('choose');
    }
  });

  // Transition to filtering when server broadcasts start_filtering
  useSignalEffect(() => {
    if (filterStep.value === 'filtering' && step !== 'filtering') {
      setStep('filtering');
    }
  });

  // Transition to swiping when deck is loaded (swiping_started with cards)
  useSignalEffect(() => {
    if (deckStep.value === 'swiping' && step !== 'swiping') {
      setStep('swiping');
    }
  });

  // Transition to result when session ends (match accepted or no match)
  useSignalEffect(() => {
    if (sessionStep.value === 'result' || sessionStep.value === 'no_match') {
      setStep('result');
    }
  });

  function handleJoinSubmit(e: Event) {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 4) {
      setCodeError('Enter a 4-character room code');
      return;
    }
    setCodeError(null);
    roomError.value = null;
    setJoinCode(code);
    setStep('nickname-join');
  }

  function handleBackToChoose() {
    setStep('choose');
    roomError.value = null;
  }

  // Reconnecting step (restoring session after refresh)
  if (step === 'reconnecting') {
    return (
      <div class="room-page">
        <div class="room-choose">
          <img src="/icon.svg" alt="Tandarr" class="room-logo" width="72" height="72" />
          <h2>Reconnecting...</h2>
          <p class="room-subtitle">Restoring your session</p>
        </div>
      </div>
    );
  }

  // Choose step
  if (step === 'choose') {
    return (
      <div class="room-page">
        <div class="room-choose">
          <img src="/logo.svg" alt="Tandarr" class="room-logo-wordmark" />
          <p class="room-subtitle">Start a room or join one with a code</p>

          <button class="create-btn" onClick={() => setStep('nickname-create')}>
            Create Room
          </button>

          <div class="room-divider">or</div>

          <div class="join-section">
            <label>Have a room code?</label>
            <form class="join-row" onSubmit={handleJoinSubmit}>
              <input
                type="text"
                class="room-code-input"
                placeholder="ABCD"
                maxLength={4}
                value={joinCode}
                onInput={(e) => {
                  const val = (e.target as HTMLInputElement).value.toUpperCase();
                  setJoinCode(val);
                  setCodeError(null);
                  if (roomError.value) roomError.value = null;
                }}
              />
              <button type="submit" class="join-btn">
                Join
              </button>
            </form>
            {codeError && <div class="room-error">{codeError}</div>}
            {!codeError && roomError.value && (
              <div class="room-error">{roomError.value}</div>
            )}
          </div>

          <a href="/" class="back-link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back to library
          </a>
        </div>
      </div>
    );
  }

  // Nickname steps
  if (step === 'nickname-create' || step === 'nickname-join') {
    return (
      <div class="room-page">
        <NicknameStep
          mode={step === 'nickname-create' ? 'create' : 'join'}
          joinCode={joinCode}
          onBack={handleBackToChoose}
        />
      </div>
    );
  }

  // Result step (session ended -- match accepted or no match)
  if (step === 'result') {
    return (
      <div class="room-page">
        <ResultScreen onBackToLobby={() => {
          resetMatchState();
          resetDeck();
          filterStep.value = 'idle';
          isReady.value = false;
          readyParticipants.value = new Set();
          overlapCount.value = null;
          setStep('lobby');
        }} />
        <RoomToast />
      </div>
    );
  }

  // Swiping step
  if (step === 'swiping') {
    const cards = cardBuffer.value;

    if (cards.length === 0) {
      return (
        <div class="room-page">
          <div class="deck-empty">
            <h2>No movies in common</h2>
            <p>Everyone's filters don't overlap on any movies. Try broadening your selections.</p>
            <button class="back-to-filters-btn" onClick={() => {
              resetDeck();
              filterStep.value = 'filtering';
              setStep('filtering');
            }}>Back to Filters</button>
          </div>
          <RoomToast />
        </div>
      );
    }

    return (
      <div class="room-page">
        <CardStack />
        <RoomToast />
      </div>
    );
  }

  // Filtering step
  if (step === 'filtering') {
    return (
      <div class="room-page">
        <FilterPanel />
        <RoomToast />
      </div>
    );
  }

  // Lobby step
  return (
    <div class="room-page">
      <RoomLobby onLeave={() => { setStep('choose'); disconnect(); }} />
      <RoomToast />
    </div>
  );
}
