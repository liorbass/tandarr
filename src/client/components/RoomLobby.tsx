import { useState } from 'preact/hooks';
import { roomState, roomError, wsStatus, deckOptions, send, disconnect } from '../services/ws-client';
import { DeckOptionsPanel } from './DeckOptionsPanel';
import type { ParticipantInfo } from '../../shared/types';

interface RoomLobbyProps {
  onLeave: () => void;
}

export function RoomLobby({ onLeave }: RoomLobbyProps) {
  const [copied, setCopied] = useState(false);

  const state = roomState.value;
  const status = wsStatus.value;

  // If no room state and not reconnecting, show error (kicked or fully disconnected)
  if (!state && status !== 'reconnecting') {
    return (
      <div class="room-lobby">
        <div class="room-error">
          {roomError.value ?? 'Disconnected from room'}
        </div>
        <button class="leave-btn" onClick={onLeave}>
          Back
        </button>
      </div>
    );
  }

  // Reconnecting but no room state yet -- show banner only
  if (!state) {
    return (
      <div class="room-lobby">
        <div class="reconnecting-banner">
          <span class="reconnecting-spinner" />
          Reconnecting...
        </div>
      </div>
    );
  }

  const code = state.code;
  const you = state.you;
  const participants = state.participants;
  const isHost = you.isHost;

  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleKick(target: ParticipantInfo) {
    send({ type: 'kick', targetId: target.id });
  }

  function handleStartFiltering() {
    send({ type: 'start_filtering' });
  }

  function handleLeave() {
    send({ type: 'leave_room' });
    disconnect();
    onLeave();
  }

  return (
    <div class="room-lobby">
      {!isHost && (
        <img src="/icon.svg" alt="" class="room-logo lobby-logo" width="56" height="56" />
      )}

      {/* Reconnecting banner (own connection recovering) */}
      {status === 'reconnecting' && (
        <div class="reconnecting-banner">
          <span class="reconnecting-spinner" />
          Reconnecting...
        </div>
      )}

      {/* Room code display */}
      <div class="room-code-section">
        <span class="room-code-label">Share this code</span>
        <div class="room-code-chars">
          {code.split('').map((char, i) => (
            <span key={i} class="room-code-char">
              {char}
            </span>
          ))}
        </div>
        <button class="copy-btn" onClick={handleCopy} type="button">
          {copied ? 'Copied!' : 'Copy Code'}
        </button>
      </div>

      {/* Participant list */}
      <div class="participant-section">
        <div class="player-count">
          {participants.length} / 4 players
        </div>
        <ul class="participant-list">
          {participants.map((p) => (
            <li key={p.id} class="participant-item">
              <div
                class="participant-avatar"
                style={{ backgroundColor: p.color }}
              >
                {p.initial}
              </div>
              <span class="participant-name">{p.nickname}</span>
              <span
                class={`status-dot ${
                  p.connectionStatus === 'reconnecting'
                    ? 'status-reconnecting'
                    : 'status-connected'
                }`}
                title={p.connectionStatus === 'reconnecting' ? 'Reconnecting...' : 'Connected'}
              />
              {p.isHost && <span class="host-badge">Host</span>}
              {p.id === you.id && <span class="you-badge">(You)</span>}
              {isHost && p.id !== you.id && (
                <button
                  class="kick-btn"
                  onClick={() => handleKick(p)}
                  type="button"
                >
                  Kick
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Deck options (host only) */}
      {isHost && (
        <DeckOptionsPanel initialOptions={deckOptions.value} />
      )}

      {/* Start button (host only, needs 2+ players) */}
      {isHost && (
        <button
          class="start-btn"
          type="button"
          disabled={participants.length < 2}
          onClick={handleStartFiltering}
        >
          {participants.length < 2
            ? 'Waiting for players...'
            : 'Start Swiping'}
        </button>
      )}
      {!isHost && (
        <p class="waiting-msg">Waiting for host to start...</p>
      )}

      {/* Leave button */}
      <button class="leave-btn" onClick={handleLeave} type="button">
        Leave Room
      </button>
    </div>
  );
}
