import { signal } from '@preact/signals';
import type { ClientMessage, ServerMessage, RoomInfo, ParticipantInfo, DeckOptions } from '../../shared/types';
import { DEFAULT_DECK_OPTIONS } from '../../shared/types';
import { filterStep, overlapCount, readyParticipants, isReady } from './filter-state';
import { loadInitialCards, appendCards, needsMoreCards, markRequestPending, resetDeck, REQUEST_BATCH_SIZE } from './deck-state';
import { addMatch, dismissMatch, endSession, showNearMisses, resetMatchState, swipeProgress } from './match-state';
import { addToast } from './toast-state';

// --- Exported signals for reactive UI binding ---
export const wsStatus = signal<'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error'>('disconnected');
export const roomState = signal<RoomInfo | null>(null);
export const roomError = signal<string | null>(null);
export const deckOptions = signal<DeckOptions>({ ...DEFAULT_DECK_OPTIONS });

// --- Private module state ---
let ws: WebSocket | null = null;
const messageHandlers = new Map<string, (data: ServerMessage) => void>();

// --- Session persistence (survives refresh + tab close) ---
const SESSION_STORAGE_KEY = 'tandarr-session';

interface StoredSession {
  sessionToken: string;
  nickname: string;
  roomCode: string;
}

function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

function saveSession(data: StoredSession): void {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data));
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_STORAGE_KEY);
  sessionToken = null;
}

export function getStoredSession(): StoredSession | null {
  return loadSession();
}

// --- Reconnection state ---
let sessionToken: string | null = loadSession()?.sessionToken ?? null;
let intentionalDisconnect = false;
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

const BASE_DELAY = 1000;    // 1 second
const MAX_DELAY = 30_000;   // 30 seconds
const MAX_ATTEMPTS = 10;

// --- Reconnect helper functions ---

function getReconnectDelay(): number {
  const exponential = BASE_DELAY * Math.pow(2, reconnectAttempts);
  const capped = Math.min(exponential, MAX_DELAY);
  return capped + Math.random() * 1000; // Add 0-1s jitter
}

function cancelReconnect(): void {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect(): void {
  if (intentionalDisconnect || reconnectAttempts >= MAX_ATTEMPTS) {
    wsStatus.value = 'disconnected';
    clearSession();
    roomState.value = null;
    return;
  }
  wsStatus.value = 'reconnecting';
  reconnectTimer = setTimeout(() => {
    reconnectAttempts++;
    connect();
  }, getReconnectDelay());
}

// --- Exported functions ---

export function connect(): void {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return; // Already connected or connecting
  }

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${protocol}//${location.host}/ws`;

  wsStatus.value = 'connecting';
  ws = new WebSocket(url);

  ws.onopen = () => {
    wsStatus.value = 'connected';
    // If we have a session token, attempt to reclaim the session
    if (sessionToken) {
      send({ type: 'reconnect', sessionToken });
    }
    reconnectAttempts = 0;
    intentionalDisconnect = false;
  };

  ws.onclose = () => {
    ws = null;
    if (!intentionalDisconnect && sessionToken) {
      // Unintentional disconnect with active session -- attempt reconnect
      // Keep roomState intact so UI doesn't flash during reconnection
      scheduleReconnect();
    } else {
      wsStatus.value = 'disconnected';
      roomState.value = null;
    }
  };

  ws.onerror = () => {
    // Set error status but let onclose handle cleanup and reconnection
    // (onerror is always followed by onclose)
    wsStatus.value = 'error';
  };

  ws.onmessage = (event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data as string) as ServerMessage;
      const handler = messageHandlers.get(msg.type);
      if (handler) {
        handler(msg);
      }
    } catch {
      // Ignore malformed messages
    }
  };
}

export function send(message: ClientMessage): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

export function disconnect(): void {
  intentionalDisconnect = true;
  clearSession();
  cancelReconnect();
  reconnectAttempts = 0;
  ws?.close();
  ws = null;
  roomState.value = null;
  wsStatus.value = 'disconnected';
  filterStep.value = 'idle';
  overlapCount.value = null;
  readyParticipants.value = new Set();
  isReady.value = false;
  resetDeck();
  resetMatchState();
  deckOptions.value = { ...DEFAULT_DECK_OPTIONS };
}

export function onMessage(type: string, handler: (data: ServerMessage) => void): void {
  messageHandlers.set(type, handler);
}

export function offMessage(type: string): void {
  messageHandlers.delete(type);
}

// --- Visibility change listener for mobile backgrounding ---
document.addEventListener('visibilitychange', () => {
  if (
    document.visibilityState === 'visible' &&
    sessionToken &&
    !intentionalDisconnect &&
    (!ws || ws.readyState !== WebSocket.OPEN)
  ) {
    cancelReconnect();
    reconnectAttempts = 0;
    connect();
  }
});

// --- Built-in message handlers (registered at module init) ---

// Helper to look up participant nickname by ID
function getNickname(participantId: string): string {
  const room = roomState.value;
  if (!room) return 'Someone';
  if (room.you.id === participantId) return room.you.nickname;
  const p = room.participants.find((p) => p.id === participantId);
  return p ? p.nickname : 'Someone';
}

// Helper to create a new RoomInfo object (triggers signal update)
function updateRoomState(updater: (current: RoomInfo) => RoomInfo): void {
  const current = roomState.value;
  if (current) {
    roomState.value = updater(current);
  }
}

messageHandlers.set('room_created', (msg) => {
  const data = msg as Extract<ServerMessage, { type: 'room_created' }>;
  roomState.value = data.room;
  roomError.value = null;
  intentionalDisconnect = false;
  if (data.room.sessionToken) {
    sessionToken = data.room.sessionToken;
    saveSession({ sessionToken: data.room.sessionToken, nickname: data.room.you.nickname, roomCode: data.room.code });
  }
});

messageHandlers.set('room_joined', (msg) => {
  const data = msg as Extract<ServerMessage, { type: 'room_joined' }>;
  roomState.value = data.room;
  roomError.value = null;
  intentionalDisconnect = false;
  if (data.room.sessionToken) {
    sessionToken = data.room.sessionToken;
    saveSession({ sessionToken: data.room.sessionToken, nickname: data.room.you.nickname, roomCode: data.room.code });
  }
});

messageHandlers.set('reconnected', (msg) => {
  const data = msg as Extract<ServerMessage, { type: 'reconnected' }>;
  roomState.value = data.room;
  if (data.room.sessionToken) {
    sessionToken = data.room.sessionToken;
    saveSession({ sessionToken: data.room.sessionToken, nickname: data.room.you.nickname, roomCode: data.room.code });
  }
  roomError.value = null;
});

messageHandlers.set('participant_joined', (msg) => {
  const data = msg as Extract<ServerMessage, { type: 'participant_joined' }>;
  addToast(`${data.participant.nickname} joined`);
  updateRoomState((current) => ({
    ...current,
    participants: [...current.participants, data.participant],
  }));
});

messageHandlers.set('participant_left', (msg) => {
  const data = msg as Extract<ServerMessage, { type: 'participant_left' }>;
  addToast(`${getNickname(data.participantId)} left`, 'warning');
  updateRoomState((current) => {
    let participants = current.participants.filter((p) => p.id !== data.participantId);
    if (data.newHostId) {
      participants = participants.map((p): ParticipantInfo => ({
        ...p,
        isHost: p.id === data.newHostId,
      }));
    }
    const you: ParticipantInfo = data.newHostId && current.you.id === data.newHostId
      ? { ...current.you, isHost: true }
      : current.you;
    return { ...current, participants, you };
  });
});

messageHandlers.set('participant_status_changed', (msg) => {
  const data = msg as Extract<ServerMessage, { type: 'participant_status_changed' }>;
  updateRoomState((current) => ({
    ...current,
    participants: current.participants.map((p) =>
      p.id === data.participantId
        ? { ...p, connectionStatus: data.connectionStatus }
        : p
    ),
  }));
});

messageHandlers.set('kicked', (msg) => {
  const data = msg as Extract<ServerMessage, { type: 'kicked' }>;
  // Kicked is an intentional removal -- do not reconnect
  intentionalDisconnect = true;
  clearSession();
  cancelReconnect();
  roomState.value = null;
  roomError.value = data.reason;
  filterStep.value = 'idle';
  overlapCount.value = null;
  readyParticipants.value = new Set();
  isReady.value = false;
  resetDeck();
  resetMatchState();
  deckOptions.value = { ...DEFAULT_DECK_OPTIONS };
});

messageHandlers.set('host_changed', (msg) => {
  const data = msg as Extract<ServerMessage, { type: 'host_changed' }>;
  updateRoomState((current) => {
    const participants = current.participants.map((p): ParticipantInfo => ({
      ...p,
      isHost: p.id === data.newHostId,
    }));
    const you: ParticipantInfo = current.you.id === data.newHostId
      ? { ...current.you, isHost: true }
      : { ...current.you, isHost: false };
    return { ...current, participants, you };
  });
});

messageHandlers.set('error', (msg) => {
  const data = msg as Extract<ServerMessage, { type: 'error' }>;
  roomError.value = data.message;
  // If reconnect failed (session expired), clear stored session
  if (!roomState.value && sessionToken) {
    clearSession();
  }
});

// --- Filter protocol handlers (Phase 5) ---

messageHandlers.set('start_filtering', () => {
  filterStep.value = 'filtering';
});

messageHandlers.set('participant_ready', (msg) => {
  const data = msg as Extract<ServerMessage, { type: 'participant_ready' }>;
  addToast(`${getNickname(data.participantId)} is ready`, 'success');
  readyParticipants.value = new Set([...readyParticipants.value, data.participantId]);
});

messageHandlers.set('participant_unready', (msg) => {
  const data = msg as Extract<ServerMessage, { type: 'participant_unready' }>;
  addToast(`${getNickname(data.participantId)} unreadied`);
  const next = new Set(readyParticipants.value);
  next.delete(data.participantId);
  readyParticipants.value = next;
});

messageHandlers.set('overlap_count', (msg) => {
  const data = msg as Extract<ServerMessage, { type: 'overlap_count' }>;
  overlapCount.value = data.count;
});

messageHandlers.set('swiping_started', (msg) => {
  const data = msg as Extract<ServerMessage, { type: 'swiping_started' }>;
  overlapCount.value = data.totalPoolSize;
  loadInitialCards(data.cards, data.totalPoolSize, data.swipedSoFar);
});

messageHandlers.set('cards_served', (msg) => {
  const data = msg as Extract<ServerMessage, { type: 'cards_served' }>;
  appendCards(data.cards);
});

// --- Deck options handler (Phase 6) ---

messageHandlers.set('deck_options_changed', (msg) => {
  const data = msg as Extract<ServerMessage, { type: 'deck_options_changed' }>;
  deckOptions.value = data.options;
});

// --- Swipe helper (Phase 7) ---

export function sendSwipe(ratingKey: string, direction: 'left' | 'right'): void {
  send({ type: 'swipe', ratingKey, direction });

  // Request more cards from the server if buffer is running low
  if (needsMoreCards()) {
    markRequestPending();
    send({ type: 'request_cards', count: REQUEST_BATCH_SIZE });
  }
}

// --- Match lifecycle handlers (Phase 8) ---

messageHandlers.set('match_found', (msg) => {
  const data = msg as Extract<ServerMessage, { type: 'match_found' }>;
  addMatch(data.card);
});

messageHandlers.set('match_dismissed', (_msg) => {
  // Dismiss the current match popup (server confirmed regret)
  dismissMatch();
});

messageHandlers.set('session_ended', (msg) => {
  const data = msg as Extract<ServerMessage, { type: 'session_ended' }>;
  endSession(data.card, data.selectedBy);
});

messageHandlers.set('swipe_progress', (msg) => {
  const data = msg as Extract<ServerMessage, { type: 'swipe_progress' }>;
  swipeProgress.value = {
    ratingKey: data.ratingKey,
    count: data.swipedCount,
    total: data.totalParticipants,
  };
});

messageHandlers.set('no_match', (msg) => {
  const data = msg as Extract<ServerMessage, { type: 'no_match' }>;
  showNearMisses(data.nearMisses);
});
