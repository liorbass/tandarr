import type { WebSocket } from 'ws';
import type { DeckCard, DeckOptions, ParticipantInfo, RoomInfo, ServerMessage, UserFilterState } from '../../shared/types.js';
import { DEFAULT_DECK_OPTIONS } from '../../shared/types.js';
import { generateRoomCode, normalizeCode } from './room-code.js';
import { getAvatarColor, getInitial } from '../../shared/avatar.js';
import { readCache } from './library-cache.js';
import { buildMasterPool, initProbabilityPool, sampleFromPool, updatePoolWeights, moviePassesFilter } from './deck-builder.js';
import type { ProbabilityPool } from './deck-builder.js';
import { randomUUID } from 'node:crypto';

const INITIAL_BATCH = 5;
const SERVER_MAX_CLAMP = 10;

interface Participant {
  id: string;
  nickname: string;
  socket: WebSocket | null;
  color: string;
  initial: string;
  isHost: boolean;
  sessionToken: string;
  connectionStatus: 'connected' | 'reconnecting';
  disconnectedAt: number | null;
}

interface Room {
  code: string;
  hostId: string;
  participants: Map<string, Participant>;
  createdAt: number;
  phase: 'lobby' | 'filtering' | 'swiping';
  filterStates: Map<string, UserFilterState>;
  readyParticipants: Set<string>;
  deckOptions: DeckOptions;
  // Probability pool system (replaces deck/userDecks/userDeckPositions)
  masterCards: DeckCard[] | null;
  probabilityPools: Map<string, ProbabilityPool>;
  rightSwipeCounts: Map<string, number>;
  leftSwipeCounts: Map<string, number>;
  swipeVotes: Map<string, Set<string>>;
  swipeCounts: Map<string, number>;
  sessionStatus: 'swiping' | 'session_ended';
}

const MAX_PARTICIPANTS = 4;
const RECONNECT_GRACE_PERIOD = 30_000; // 30 seconds

const rooms = new Map<string, Room>();
const socketToRoom = new Map<WebSocket, string>();
const socketToId = new Map<WebSocket, string>();

// Session token lookup maps for reconnection
const sessionTokenToRoom = new Map<string, string>();
const sessionTokenToId = new Map<string, string>();

// Grace period timers for disconnected participants
const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

function toParticipantInfo(p: Participant): ParticipantInfo {
  return {
    id: p.id,
    nickname: p.nickname,
    color: p.color,
    initial: p.initial,
    isHost: p.isHost,
    connectionStatus: p.connectionStatus,
  };
}

function getRoomPhase(room: Room): 'lobby' | 'filtering' | 'swiping' {
  return room.phase;
}

function toRoomInfo(room: Room, forSocket: WebSocket, sessionToken?: string): RoomInfo {
  const forId = socketToId.get(forSocket)!;
  const participants = Array.from(room.participants.values()).map(toParticipantInfo);
  const you = participants.find(p => p.id === forId)!;
  const info: RoomInfo = { code: room.code, you, participants, phase: getRoomPhase(room) };
  if (sessionToken) {
    info.sessionToken = sessionToken;
  }
  return info;
}

function broadcast(room: Room, message: ServerMessage, exclude?: WebSocket): void {
  const data = JSON.stringify(message);
  for (const p of room.participants.values()) {
    if (p.socket && p.socket !== exclude && p.socket.readyState === 1) {
      p.socket.send(data);
    }
  }
}

function deduplicateNickname(nickname: string, room: Room): string {
  const existing = new Set(
    Array.from(room.participants.values()).map(p => p.nickname.toLowerCase())
  );
  if (!existing.has(nickname.toLowerCase())) return nickname;

  for (let i = 2; i <= room.participants.size + 2; i++) {
    const candidate = `${nickname}${i}`;
    if (!existing.has(candidate.toLowerCase())) return candidate;
  }
  return `${nickname}${Date.now() % 1000}`;
}

function validateNickname(nickname: string): string | null {
  if (!nickname || nickname.length < 2) return 'Nickname must be at least 2 characters.';
  if (nickname.length > 12) return 'Nickname must be at most 12 characters.';
  return null;
}

/**
 * Remove a participant from a room, handling host transfer, session cleanup,
 * and broadcasting participant_left. Used by grace period expiry and leaveRoom.
 */
function removeParticipant(room: Room, participantId: string): void {
  const participant = room.participants.get(participantId);
  if (!participant) return;

  // Clean up session token maps
  sessionTokenToRoom.delete(participant.sessionToken);
  sessionTokenToId.delete(participant.sessionToken);

  // Cancel any pending grace timer
  const timer = disconnectTimers.get(participantId);
  if (timer) {
    clearTimeout(timer);
    disconnectTimers.delete(participantId);
  }

  // Clean up socket maps if socket still exists
  if (participant.socket) {
    socketToRoom.delete(participant.socket);
    socketToId.delete(participant.socket);
  }

  // Clean up filter state and probability pool
  room.filterStates.delete(participantId);
  room.readyParticipants.delete(participantId);
  room.probabilityPools.delete(participantId);

  room.participants.delete(participantId);

  if (room.participants.size === 0) {
    rooms.delete(room.code);
    return;
  }

  let newHostId: string | undefined;
  if (room.hostId === participantId) {
    const nextParticipant = room.participants.values().next().value!;
    nextParticipant.isHost = true;
    room.hostId = nextParticipant.id;
    newHostId = nextParticipant.id;
  }

  broadcast(room, { type: 'participant_left', participantId, newHostId });
}

export function createRoom(socket: WebSocket, nickname: string): RoomInfo | string {
  const error = validateNickname(nickname);
  if (error) return error;

  const code = generateRoomCode(new Set(rooms.keys()));
  const id = randomUUID();
  const sessionToken = randomUUID();
  const participant: Participant = {
    id,
    nickname,
    socket,
    color: getAvatarColor(nickname),
    initial: getInitial(nickname),
    isHost: true,
    sessionToken,
    connectionStatus: 'connected',
    disconnectedAt: null,
  };

  const room: Room = {
    code,
    hostId: id,
    participants: new Map([[id, participant]]),
    createdAt: Date.now(),
    phase: 'lobby',
    filterStates: new Map(),
    readyParticipants: new Set(),
    deckOptions: { ...DEFAULT_DECK_OPTIONS },
    masterCards: null,
    probabilityPools: new Map(),
    rightSwipeCounts: new Map(),
    leftSwipeCounts: new Map(),
    swipeVotes: new Map(),
    swipeCounts: new Map(),
    sessionStatus: 'swiping',
  };

  rooms.set(code, room);
  socketToRoom.set(socket, code);
  socketToId.set(socket, id);
  sessionTokenToRoom.set(sessionToken, code);
  sessionTokenToId.set(sessionToken, id);

  return toRoomInfo(room, socket, sessionToken);
}

export function joinRoom(socket: WebSocket, code: string, nickname: string): RoomInfo | string {
  const error = validateNickname(nickname);
  if (error) return error;

  const normalized = normalizeCode(code);
  const room = rooms.get(normalized);
  if (!room) return 'Room not found. Check the code and try again.';
  if (room.participants.size >= MAX_PARTICIPANTS) return 'Room is full.';

  const dedupedNickname = deduplicateNickname(nickname, room);
  const id = randomUUID();
  const sessionToken = randomUUID();
  const participant: Participant = {
    id,
    nickname: dedupedNickname,
    socket,
    color: getAvatarColor(dedupedNickname),
    initial: getInitial(dedupedNickname),
    isHost: false,
    sessionToken,
    connectionStatus: 'connected',
    disconnectedAt: null,
  };

  room.participants.set(id, participant);
  socketToRoom.set(socket, normalized);
  socketToId.set(socket, id);
  sessionTokenToRoom.set(sessionToken, normalized);
  sessionTokenToId.set(sessionToken, id);

  // Broadcast to existing participants before returning
  broadcast(room, { type: 'participant_joined', participant: toParticipantInfo(participant) }, socket);

  return toRoomInfo(room, socket, sessionToken);
}

export function leaveRoom(socket: WebSocket): void {
  const code = socketToRoom.get(socket);
  if (!code) return;

  const id = socketToId.get(socket);
  if (!id) return;

  const room = rooms.get(code);
  if (!room) return;

  // Clean up socket maps
  socketToRoom.delete(socket);
  socketToId.delete(socket);

  // Use shared removal logic (handles session tokens, timers, host transfer, broadcast)
  removeParticipant(room, id);
}

export function kickParticipant(socket: WebSocket, targetId: string): void {
  const code = socketToRoom.get(socket);
  if (!code) return;

  const kickerId = socketToId.get(socket);
  if (!kickerId) return;

  const room = rooms.get(code);
  if (!room) return;

  if (room.hostId !== kickerId) return;

  const target = room.participants.get(targetId);
  if (!target) return;

  // Send kicked message to target (only if socket is connected)
  if (target.socket && target.socket.readyState === 1) {
    target.socket.send(JSON.stringify({
      type: 'kicked',
      reason: 'You were removed from the room by the host.',
    } satisfies ServerMessage));
    target.socket.close();
  }

  // Clean up socket maps for target (if socket exists)
  if (target.socket) {
    socketToRoom.delete(target.socket);
    socketToId.delete(target.socket);
  }

  removeParticipant(room, targetId);
}

export function handleDisconnect(socket: WebSocket): void {
  const code = socketToRoom.get(socket);
  if (!code) return;

  const id = socketToId.get(socket);
  if (!id) return;

  const room = rooms.get(code);
  if (!room) return;

  const participant = room.participants.get(id);
  if (!participant) return;

  // Mark as reconnecting instead of removing immediately
  participant.socket = null;
  participant.connectionStatus = 'reconnecting';
  participant.disconnectedAt = Date.now();

  // Clean up socket maps (this socket is dead)
  socketToRoom.delete(socket);
  socketToId.delete(socket);

  // Notify remaining participants of status change
  broadcast(room, {
    type: 'participant_status_changed',
    participantId: id,
    connectionStatus: 'reconnecting',
  });

  // Set grace period timer -- after RECONNECT_GRACE_PERIOD, remove participant
  const timer = setTimeout(() => {
    disconnectTimers.delete(id);
    removeParticipant(room, id);
  }, RECONNECT_GRACE_PERIOD);

  disconnectTimers.set(id, timer);
}

export function reconnectParticipant(socket: WebSocket, sessionToken: string): { roomInfo: RoomInfo; replay: ServerMessage[] } | string {
  const code = sessionTokenToRoom.get(sessionToken);
  const id = sessionTokenToId.get(sessionToken);

  if (!code || !id) {
    return 'Session expired. Please rejoin the room.';
  }

  const room = rooms.get(code);
  if (!room) {
    return 'Session expired. Please rejoin the room.';
  }

  const participant = room.participants.get(id);
  if (!participant) {
    return 'Session expired. Please rejoin the room.';
  }

  // Clear the grace period timer
  const timer = disconnectTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    disconnectTimers.delete(id);
  }

  // Reassign socket and restore connected status
  participant.socket = socket;
  participant.connectionStatus = 'connected';
  participant.disconnectedAt = null;

  // Update socket lookup maps
  socketToRoom.set(socket, code);
  socketToId.set(socket, id);

  // Notify other participants of reconnection
  broadcast(room, {
    type: 'participant_status_changed',
    participantId: id,
    connectionStatus: 'connected',
  }, socket);

  const roomInfo = toRoomInfo(room, socket, participant.sessionToken);

  // Build replay messages so client can restore to the correct step
  const replay: ServerMessage[] = [];
  const phase = getRoomPhase(room);

  if (phase === 'filtering' || phase === 'swiping') {
    replay.push({ type: 'start_filtering' });
    // Replay who is ready
    for (const readyId of room.readyParticipants) {
      replay.push({ type: 'participant_ready', participantId: readyId });
    }
  }

  if (phase === 'swiping') {
    const pool = room.probabilityPools.get(id);
    if (pool) {
      // Send currently served (in-flight) cards so client can resume
      const servedCards = Array.from(pool.served.values()).map(e => e.card);
      const swipedSoFar = pool.swiped.size;
      replay.push({
        type: 'swiping_started',
        totalPoolSize: pool.totalSize,
        cards: servedCards,
        swipedSoFar,
      });
    }
  }

  return { roomInfo, replay };
}

// --- Filter / Ready Protocol (Phase 5) ---

function sendTo(socket: WebSocket | null, message: ServerMessage): void {
  if (socket && socket.readyState === 1) {
    socket.send(JSON.stringify(message));
  }
}

async function computeAndBroadcastOverlap(room: Room): Promise<number> {
  const cache = await readCache();
  const movies = cache?.movies ?? [];

  const readyFilters = Array.from(room.readyParticipants).map(
    pid => room.filterStates.get(pid)!,
  );

  const intersection = movies.filter(movie =>
    readyFilters.every(filter => moviePassesFilter(movie, filter)),
  );

  // Broadcast overlap_count to all ready participants
  for (const pid of room.readyParticipants) {
    const participant = room.participants.get(pid);
    if (participant) {
      sendTo(participant.socket, { type: 'overlap_count', count: intersection.length });
    }
  }

  return intersection.length;
}

export function setDeckOptions(socket: WebSocket, options: DeckOptions): void {
  const code = socketToRoom.get(socket);
  if (!code) return;

  const callerId = socketToId.get(socket);
  if (!callerId) return;

  const room = rooms.get(code);
  if (!room) return;

  // Only the host can set deck options
  if (room.hostId !== callerId) return;

  room.deckOptions = options;

  // Broadcast to ALL participants (including host, for confirmation)
  const data = JSON.stringify({ type: 'deck_options_changed', options } satisfies ServerMessage);
  for (const p of room.participants.values()) {
    if (p.socket && p.socket.readyState === 1) {
      p.socket.send(data);
    }
  }
}

export function startFiltering(socket: WebSocket): void {
  const code = socketToRoom.get(socket);
  if (!code) return;

  const callerId = socketToId.get(socket);
  if (!callerId) return;

  const room = rooms.get(code);
  if (!room) return;

  // Only the host can start filtering
  if (room.hostId !== callerId) return;

  // Need at least 2 participants
  if (room.participants.size < 2) {
    sendTo(socket, { type: 'error', message: 'Need at least 2 participants to start.' });
    return;
  }

  room.phase = 'filtering';

  // Broadcast to ALL participants (including host)
  const data = JSON.stringify({ type: 'start_filtering' } satisfies ServerMessage);
  for (const p of room.participants.values()) {
    if (p.socket && p.socket.readyState === 1) {
      p.socket.send(data);
    }
  }
}

export async function setReady(socket: WebSocket, filterState: UserFilterState): Promise<void> {
  const code = socketToRoom.get(socket);
  if (!code) return;

  const participantId = socketToId.get(socket);
  if (!participantId) return;

  const room = rooms.get(code);
  if (!room) return;

  // Store filter state and mark ready
  room.filterStates.set(participantId, filterState);
  room.readyParticipants.add(participantId);

  // Broadcast participant_ready to all OTHER participants
  broadcast(room, { type: 'participant_ready', participantId }, socket);

  // Compute and broadcast overlap to all ready participants
  await computeAndBroadcastOverlap(room);

  // Check if ALL participants are ready -- build pool and distribute initial batch
  if (room.readyParticipants.size === room.participants.size) {
    const cache = await readCache();
    const movies = cache?.movies ?? [];
    const filters = Array.from(room.filterStates.values());

    // Build master pool using host's DeckOptions
    const { cards, wildCardKeys } = buildMasterPool(movies, filters, room.deckOptions);
    room.masterCards = cards;

    // Initialize per-user probability pools and reset swipe tracking
    room.probabilityPools = new Map();
    room.rightSwipeCounts = new Map();
    room.leftSwipeCounts = new Map();
    room.swipeVotes = new Map();
    room.swipeCounts = new Map();
    room.sessionStatus = 'swiping';
    room.phase = 'swiping';

    for (const p of room.participants.values()) {
      const pool = initProbabilityPool(cards, wildCardKeys, room.deckOptions);
      room.probabilityPools.set(p.id, pool);

      // Sample initial batch for this user
      const initialCards = sampleFromPool(pool, INITIAL_BATCH);

      if (p.socket && p.socket.readyState === 1) {
        p.socket.send(JSON.stringify({
          type: 'swiping_started',
          totalPoolSize: pool.totalSize,
          cards: initialCards,
        } satisfies ServerMessage));
      }
    }
  }
}

export async function setUnready(socket: WebSocket): Promise<void> {
  const code = socketToRoom.get(socket);
  if (!code) return;

  const participantId = socketToId.get(socket);
  if (!participantId) return;

  const room = rooms.get(code);
  if (!room) return;

  // Remove ready state
  room.readyParticipants.delete(participantId);
  room.filterStates.delete(participantId);

  // Broadcast participant_unready to all OTHER participants
  broadcast(room, { type: 'participant_unready', participantId }, socket);

  // Recompute overlap for remaining ready participants (if any)
  if (room.readyParticipants.size > 0) {
    await computeAndBroadcastOverlap(room);
  }
}

// --- Swipe Handler + Match Detection ---

export function handleSwipe(socket: WebSocket, ratingKey: string, direction: 'left' | 'right'): void {
  const code = socketToRoom.get(socket);
  if (!code) return;

  const participantId = socketToId.get(socket);
  if (!participantId) return;

  const room = rooms.get(code);
  if (!room) return;

  // Ignore swipes if pools haven't been built yet or session already ended
  if (room.masterCards === null) return;
  if (room.sessionStatus === 'session_ended') return;

  const pool = room.probabilityPools.get(participantId);
  if (!pool) return;

  // Move card from served → swiped
  const entry = pool.served.get(ratingKey);
  if (entry) {
    pool.served.delete(ratingKey);
    pool.swiped.set(ratingKey, entry);
  }

  // Record vote on right swipe
  if (direction === 'right') {
    let voters = room.swipeVotes.get(ratingKey);
    if (!voters) {
      voters = new Set();
      room.swipeVotes.set(ratingKey, voters);
    }
    voters.add(participantId);

    // Track room-level right swipe counts
    const prevRight = room.rightSwipeCounts.get(ratingKey) ?? 0;
    room.rightSwipeCounts.set(ratingKey, prevRight + 1);
  } else {
    // Track room-level left swipe counts
    const prevLeft = room.leftSwipeCounts.get(ratingKey) ?? 0;
    room.leftSwipeCounts.set(ratingKey, prevLeft + 1);
  }

  // Track total swipes per movie (any direction) for progress
  const prevCount = room.swipeCounts.get(ratingKey) ?? 0;
  room.swipeCounts.set(ratingKey, prevCount + 1);

  // Propagate weight changes to all OTHER users' unseen pools
  for (const [pid, otherPool] of room.probabilityPools) {
    if (pid === participantId) continue;
    updatePoolWeights(otherPool, ratingKey, direction, room.deckOptions);
  }

  // Broadcast swipe progress (direction-agnostic count)
  broadcast(room, {
    type: 'swipe_progress',
    ratingKey,
    swipedCount: room.swipeCounts.get(ratingKey)!,
    totalParticipants: room.participants.size,
  });

  // Check for match on right swipes
  if (direction === 'right') {
    const voters = room.swipeVotes.get(ratingKey);
    if (voters && voters.size === room.participants.size) {
      const matchedCard = room.masterCards.find(c => c.ratingKey === ratingKey);
      if (matchedCard) {
        broadcast(room, { type: 'match_found', card: matchedCard });
      }
    }
  }

  // Check if ALL participants have exhausted their pools
  const allExhausted = Array.from(room.probabilityPools.values()).every(
    p => p.unseen.size === 0 && p.served.size === 0,
  );
  if (allExhausted) {
    const nearMisses = computeNearMisses(room);
    broadcast(room, { type: 'no_match', nearMisses });
    room.sessionStatus = 'session_ended';
  }
}

// --- Request Cards Handler ---

export function handleRequestCards(socket: WebSocket, count: number): void {
  const code = socketToRoom.get(socket);
  if (!code) return;

  const participantId = socketToId.get(socket);
  if (!participantId) return;

  const room = rooms.get(code);
  if (!room) return;

  if (room.sessionStatus === 'session_ended') return;

  const pool = room.probabilityPools.get(participantId);
  if (!pool) return;

  const clampedCount = Math.min(Math.max(count, 1), SERVER_MAX_CLAMP);
  const cards = sampleFromPool(pool, clampedCount);

  if (cards.length > 0) {
    sendTo(socket, { type: 'cards_served', cards });
  }
}

// --- Near-Miss Computation ---

function computeNearMisses(room: Room): Array<{ card: DeckCard; agreement: number }> {
  const totalParticipants = room.participants.size;
  const results: Array<{ card: DeckCard; agreement: number }> = [];

  for (const [ratingKey, voters] of room.swipeVotes) {
    if (voters.size < totalParticipants && voters.size > 0) {
      const card = room.masterCards?.find(c => c.ratingKey === ratingKey);
      if (card) {
        results.push({
          card,
          agreement: Math.round((voters.size / totalParticipants) * 100),
        });
      }
    }
  }

  results.sort((a, b) => b.agreement - a.agreement);
  return results.slice(0, 10);
}

// --- Match Lifecycle Handlers ---

export function handleSelectMatch(socket: WebSocket, ratingKey: string): void {
  const code = socketToRoom.get(socket);
  if (!code) return;
  const participantId = socketToId.get(socket);
  if (!participantId) return;
  const room = rooms.get(code);
  if (!room) return;

  // Guard: first select wins
  if (room.sessionStatus === 'session_ended') return;

  const card = room.masterCards?.find(c => c.ratingKey === ratingKey);
  if (!card) return;

  const participant = room.participants.get(participantId);
  const selectedBy = participant?.nickname ?? 'Unknown';

  room.sessionStatus = 'session_ended';
  broadcast(room, { type: 'session_ended', card, selectedBy });
}

export function handleRegretMatch(socket: WebSocket, ratingKey: string): void {
  const code = socketToRoom.get(socket);
  if (!code) return;
  const room = rooms.get(code);
  if (!room) return;

  if (room.sessionStatus === 'session_ended') return;

  broadcast(room, { type: 'match_dismissed', ratingKey });
}
