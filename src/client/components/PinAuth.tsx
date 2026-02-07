import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';

interface PinAuthProps {
  onTokenReceived: (token: string) => void;
  onCancel: () => void;
}

const pinCode = signal<string | null>(null);
const pinId = signal<number | null>(null);
const pinError = signal<string | null>(null);
const pinExpired = signal(false);

const PIN_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const POLL_INTERVAL_MS = 2000;

function resetPinState() {
  pinCode.value = null;
  pinId.value = null;
  pinError.value = null;
  pinExpired.value = false;
}

async function createPin() {
  resetPinState();

  try {
    const res = await fetch('/api/plex/pin', { method: 'POST' });
    if (!res.ok) {
      pinError.value = 'Failed to create PIN. Please try again.';
      return;
    }
    const data = await res.json();
    pinId.value = data.id;
    pinCode.value = data.code;
  } catch {
    pinError.value = 'Failed to reach server. Please try again.';
  }
}

export function PinAuth({ onTokenReceived, onCancel }: PinAuthProps) {
  useEffect(() => {
    createPin();
    return () => resetPinState();
  }, []);

  useEffect(() => {
    if (!pinId.value || pinExpired.value) return;

    const startTime = Date.now();

    const interval = setInterval(async () => {
      // Check expiration
      if (Date.now() - startTime > PIN_TIMEOUT_MS) {
        pinExpired.value = true;
        clearInterval(interval);
        return;
      }

      try {
        const res = await fetch(`/api/plex/pin/${pinId.value}`);
        if (!res.ok) return;

        const data = await res.json();
        if (data.claimed && data.authToken) {
          clearInterval(interval);
          onTokenReceived(data.authToken);
        }
      } catch {
        // Silently retry on network errors
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [pinId.value, pinExpired.value, onTokenReceived]);

  if (pinError.value) {
    return (
      <div class="pin-auth">
        <p class="pin-error">{pinError.value}</p>
        <button class="pin-retry-btn" onClick={() => createPin()}>
          Try Again
        </button>
        <button class="pin-cancel-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    );
  }

  if (pinExpired.value) {
    return (
      <div class="pin-auth">
        <p class="pin-error">PIN expired -- please try again.</p>
        <button class="pin-retry-btn" onClick={() => createPin()}>
          Get New PIN
        </button>
        <button class="pin-cancel-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    );
  }

  if (!pinCode.value) {
    return (
      <div class="pin-auth">
        <p class="pin-loading">Getting PIN...</p>
      </div>
    );
  }

  return (
    <div class="pin-auth">
      <div class="pin-code">{pinCode.value}</div>
      <p class="pin-instructions">
        Go to{' '}
        <a
          href="https://plex.tv/link"
          target="_blank"
          rel="noopener noreferrer"
        >
          plex.tv/link
        </a>{' '}
        and enter this code
      </p>
      <p class="pin-waiting">Waiting for authorization...</p>
      <button class="pin-cancel-btn" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
