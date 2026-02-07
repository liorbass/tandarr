import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { PinAuth } from './PinAuth';
import { ConnectionStatus } from './ConnectionStatus';
import type { PlexLibrary } from '../../shared/types';
import '../styles/config.css';

const serverIp = signal('');
const plexToken = signal('');
const isSaving = signal(false);
const hasExistingToken = signal(false);
const isLoading = signal(true);

// Auth method and PIN flow state
const authMethod = signal<'pin' | 'manual'>('pin');
const showPinAuth = signal(false);

// Connection testing state
const connectionStatus = signal<'idle' | 'testing' | 'success' | 'error'>(
  'idle',
);
const serverName = signal('');
const connectionError = signal('');

// Library state
interface LibraryWithCount extends PlexLibrary {
  movieCount?: number;
}
const libraries = signal<LibraryWithCount[]>([]);
const selectedLibrary = signal<string | null>(null);
const selectedLibraryTitle = signal('');
const selectedMovieCount = signal<number | undefined>(undefined);

async function loadExistingConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    if (data.hasConfig) {
      // Extract IP from stored URL format (http://IP:32400)
      const storedIp = data.plexServerIp || '';
      const match = storedIp.match(/^https?:\/\/(.+):32400$/);
      serverIp.value = match ? match[1] : storedIp;
      hasExistingToken.value = data.plexToken === '***';

      if (data.selectedLibraryId) {
        selectedLibrary.value = data.selectedLibraryId;
      }

      // If we have a saved config, auto-test on load
      if (data.plexServerIp && data.plexToken === '***') {
        await testAndLoadLibraries();
      }
    }
  } catch {
    // Config not available yet, that's fine
  } finally {
    isLoading.value = false;
  }
}

async function testAndLoadLibraries() {
  connectionStatus.value = 'testing';
  connectionError.value = '';

  try {
    const res = await fetch('/api/plex/test-and-libraries', {
      method: 'POST',
    });
    const data = await res.json();

    if (data.connection.ok) {
      connectionStatus.value = 'success';
      serverName.value = data.connection.serverName || 'Plex Server';
      libraries.value = data.libraries || [];

      // If we have a previously selected library, update the display
      if (selectedLibrary.value && libraries.value.length > 0) {
        const lib = libraries.value.find(
          (l) => l.key === selectedLibrary.value,
        );
        if (lib) {
          selectedLibraryTitle.value = lib.title;
          selectedMovieCount.value = lib.movieCount;
        }
      } else if (libraries.value.length === 1) {
        // Auto-select if only one library
        await handleLibrarySelect(libraries.value[0].key);
      }
    } else {
      connectionStatus.value = 'error';
      connectionError.value = data.connection.error || 'Connection failed';
    }
  } catch {
    connectionStatus.value = 'error';
    connectionError.value = 'Failed to reach server';
  }
}

async function handleSave() {
  if (!serverIp.value.trim()) {
    connectionStatus.value = 'error';
    connectionError.value = 'Please enter a server IP address.';
    return;
  }

  if (!plexToken.value && !hasExistingToken.value) {
    connectionStatus.value = 'error';
    connectionError.value = 'Please provide a Plex auth token.';
    return;
  }

  isSaving.value = true;

  try {
    const body: { plexServerIp: string; plexToken?: string } = {
      plexServerIp: serverIp.value.trim(),
    };

    // Only send token if user entered a new one
    if (plexToken.value) {
      body.plexToken = plexToken.value;
    }

    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Server returned ${res.status}`);
    }

    hasExistingToken.value = hasExistingToken.value || !!plexToken.value;
    plexToken.value = '';
  } catch (err) {
    connectionStatus.value = 'error';
    connectionError.value =
      err instanceof Error ? err.message : 'Failed to save configuration.';
    isSaving.value = false;
    return;
  } finally {
    isSaving.value = false;
  }

  // Auto-test connection after save
  await testAndLoadLibraries();
}

async function handlePinTokenReceived(token: string) {
  showPinAuth.value = false;
  plexToken.value = token;
  hasExistingToken.value = true;

  // Save token to config immediately
  try {
    const body: { plexServerIp: string; plexToken: string } = {
      plexServerIp: serverIp.value.trim(),
      plexToken: token,
    };

    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    plexToken.value = '';

    // If we have an IP, auto-test
    if (serverIp.value.trim()) {
      await testAndLoadLibraries();
    }
  } catch {
    connectionStatus.value = 'error';
    connectionError.value = 'Failed to save token.';
  }
}

async function handleLibrarySelect(libraryKey: string) {
  selectedLibrary.value = libraryKey;

  const lib = libraries.value.find((l) => l.key === libraryKey);
  if (lib) {
    selectedLibraryTitle.value = lib.title;
    selectedMovieCount.value = lib.movieCount;
  }

  // Persist library selection
  try {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plexServerIp: serverIp.value.trim(),
        selectedLibraryId: libraryKey,
      }),
    });
  } catch {
    // Non-critical -- selection still works in memory
  }
}

export function ConfigPage() {
  useEffect(() => {
    loadExistingConfig();
  }, []);

  if (isLoading.value) {
    return null;
  }

  return (
    <div class="config-page">
      <div class="config-header">
        <a href="/" class="settings-btn" title="Back to Library" aria-label="Back to Library">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </a>
      </div>

      <div class="config-card">
        <h1>Plex Server Setup</h1>
        <p class="config-subtitle">
          Connect to your Plex Media Server to get started.
        </p>

        {/* Auth method tabs */}
        <div class="auth-tabs">
          <button
            class={`auth-tab ${authMethod.value === 'pin' ? 'active' : ''}`}
            onClick={() => {
              authMethod.value = 'pin';
              showPinAuth.value = false;
            }}
          >
            Sign in with Plex
          </button>
          <button
            class={`auth-tab ${authMethod.value === 'manual' ? 'active' : ''}`}
            onClick={() => {
              authMethod.value = 'manual';
              showPinAuth.value = false;
            }}
          >
            Manual Token
          </button>
        </div>

        {/* PIN auth section */}
        {authMethod.value === 'pin' && (
          <div class="auth-section">
            {showPinAuth.value ? (
              <PinAuth
                onTokenReceived={handlePinTokenReceived}
                onCancel={() => {
                  showPinAuth.value = false;
                }}
              />
            ) : (
              <div class="pin-start">
                {hasExistingToken.value ? (
                  <p class="token-status">
                    Token saved. You can sign in again to get a new token.
                  </p>
                ) : null}
                <button
                  class="plex-signin-btn"
                  onClick={() => {
                    showPinAuth.value = true;
                  }}
                >
                  {hasExistingToken.value
                    ? 'Sign in with Plex Again'
                    : 'Sign in with Plex'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Manual token section */}
        {authMethod.value === 'manual' && (
          <div class="auth-section">
            <div class="config-field">
              <label for="plex-token">Plex Auth Token</label>
              <input
                id="plex-token"
                type="password"
                placeholder={
                  hasExistingToken.value
                    ? 'Token saved \u2014 enter new to replace'
                    : 'Paste your Plex token'
                }
                value={plexToken.value}
                onInput={(e) => {
                  plexToken.value = (e.target as HTMLInputElement).value;
                }}
              />
            </div>
          </div>
        )}

        {/* Server IP (always visible) */}
        <div class="config-field">
          <label for="server-ip">Server IP Address</label>
          <input
            id="server-ip"
            type="text"
            placeholder="e.g., 192.168.1.100"
            value={serverIp.value}
            onInput={(e) => {
              serverIp.value = (e.target as HTMLInputElement).value;
            }}
          />
          <p class="help-text">
            Enter your Plex server's IP address (port 32400 is added
            automatically).
          </p>
        </div>

        <button
          class="config-save-btn"
          onClick={handleSave}
          disabled={isSaving.value}
        >
          {isSaving.value ? 'Saving\u2026' : 'Save & Test Connection'}
        </button>

        {/* Connection status */}
        <ConnectionStatus
          status={connectionStatus.value}
          serverName={serverName.value}
          movieCount={selectedMovieCount.value}
          libraryTitle={selectedLibraryTitle.value}
          error={connectionError.value}
        />

        {/* Library picker (after successful connection) */}
        {connectionStatus.value === 'success' && libraries.value.length > 0 && (
          <div class="config-field library-picker">
            <label for="library-select">Movie Library</label>
            <select
              id="library-select"
              value={selectedLibrary.value || ''}
              onChange={(e) => {
                const key = (e.target as HTMLSelectElement).value;
                if (key) {
                  handleLibrarySelect(key);
                }
              }}
            >
              <option value="" disabled>
                Select a library...
              </option>
              {libraries.value.map((lib) => (
                <option key={lib.key} value={lib.key}>
                  {lib.title}
                  {lib.movieCount !== undefined
                    ? ` (${lib.movieCount.toLocaleString()} movies)`
                    : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {connectionStatus.value === 'success' &&
          libraries.value.length === 0 && (
            <div class="config-status error">
              No movie libraries found on this Plex server.
            </div>
          )}
      </div>
    </div>
  );
}
