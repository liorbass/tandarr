export interface AppConfig {
  plexServerIp: string;
  plexToken: string;
  selectedLibraryId: string | null;
}

export interface PlexLibrary {
  key: string;
  type: string;
  title: string;
}

export interface ConnectionResult {
  ok: boolean;
  serverName?: string;
  movieCount?: number;
  libraryTitle?: string;
  error?: string;
}

export interface Movie {
  ratingKey: string;
  title: string;
  year: number;
  genres: string[];
  rating: number | null;         // critic rating 0-10
  audienceRating: number | null; // audience rating 0-10
  duration: number;              // runtime in minutes (converted from Plex ms)
  summary: string;
  contentRating: string;         // PG-13, R, etc.
  viewCount: number;             // 0 = unwatched (Plex omits field for unwatched, default to 0)
  addedAt: number;               // Unix timestamp (seconds) when added to Plex library
}

export interface LibraryState {
  movies: Movie[];
  fromCache: boolean;
  needsSync?: boolean;
  refreshing?: boolean;
}

export interface SyncStatus {
  syncing: boolean;
  progress: { loaded: number; total: number };
}

// --- Filter State (Phase 5) ---

export interface UserFilterState {
  selectedGenres: string[];
  selectedDecades: string[];
  hideWatched: boolean;
  excludedKeys: string[];
}

// --- Deck Options & Cards (Phase 6) ---

export type DeckOptionIntensity = 'low' | 'medium' | 'high';

export interface DeckOptionEntry {
  enabled: boolean;
  intensity: DeckOptionIntensity;
}

export interface DeckOptions {
  wildCards: DeckOptionEntry;
  boostRightSwipes: DeckOptionEntry;
  demoteLeftSwipes: DeckOptionEntry;
  recentlyReleasedBoost: DeckOptionEntry;
  recentlyAddedBoost: DeckOptionEntry;
}

export const DEFAULT_DECK_OPTIONS: DeckOptions = {
  wildCards: { enabled: true, intensity: 'medium' },
  boostRightSwipes: { enabled: true, intensity: 'medium' },
  demoteLeftSwipes: { enabled: true, intensity: 'medium' },
  recentlyReleasedBoost: { enabled: true, intensity: 'medium' },
  recentlyAddedBoost: { enabled: true, intensity: 'medium' },
};

export interface DeckCard {
  ratingKey: string;
  title: string;
  year: number;
  genres: string[];
  rating: number | null;
  audienceRating: number | null;
  duration: number;
  summary: string;
  contentRating: string;
  addedAt: number;
}

// --- WebSocket Message Types (Phase 3+) ---

// Client -> Server messages
export type ClientMessage =
  | { type: 'create_room'; nickname: string }
  | { type: 'join_room'; code: string; nickname: string }
  | { type: 'leave_room' }
  | { type: 'kick'; targetId: string }
  | { type: 'reconnect'; sessionToken: string }
  | { type: 'start_filtering' }
  | { type: 'set_ready'; filterState: UserFilterState }
  | { type: 'set_unready' }
  | { type: 'set_deck_options'; options: DeckOptions }
  | { type: 'swipe'; ratingKey: string; direction: 'left' | 'right' }
  | { type: 'request_cards'; count: number }
  | { type: 'select_match'; ratingKey: string }
  | { type: 'regret_match'; ratingKey: string };

// Server -> Client messages
export type ServerMessage =
  | { type: 'room_created'; room: RoomInfo }
  | { type: 'room_joined'; room: RoomInfo }
  | { type: 'reconnected'; room: RoomInfo }
  | { type: 'participant_joined'; participant: ParticipantInfo }
  | { type: 'participant_left'; participantId: string; newHostId?: string }
  | { type: 'participant_status_changed'; participantId: string; connectionStatus: 'connected' | 'reconnecting' }
  | { type: 'kicked'; reason: string }
  | { type: 'host_changed'; newHostId: string }
  | { type: 'error'; message: string }
  | { type: 'start_filtering' }
  | { type: 'participant_ready'; participantId: string }
  | { type: 'participant_unready'; participantId: string }
  | { type: 'overlap_count'; count: number }
  | { type: 'swiping_started'; totalPoolSize: number; cards: DeckCard[]; swipedSoFar?: number }
  | { type: 'cards_served'; cards: DeckCard[] }
  | { type: 'deck_options_changed'; options: DeckOptions }
  | { type: 'match_found'; card: DeckCard }
  | { type: 'match_dismissed'; ratingKey: string }
  | { type: 'session_ended'; card: DeckCard; selectedBy: string }
  | { type: 'swipe_progress'; ratingKey: string; swipedCount: number; totalParticipants: number }
  | { type: 'no_match'; nearMisses: Array<{ card: DeckCard; agreement: number }> };

// Shared data shapes for room state
export interface ParticipantInfo {
  id: string;
  nickname: string;
  color: string; // Avatar background color (hex from curated palette)
  initial: string; // First character uppercase
  isHost: boolean;
  connectionStatus?: 'connected' | 'reconnecting';
}

export type RoomPhase = 'lobby' | 'filtering' | 'swiping';

export interface RoomInfo {
  code: string;
  you: ParticipantInfo;
  participants: ParticipantInfo[];
  sessionToken?: string;
  phase?: RoomPhase;
}
