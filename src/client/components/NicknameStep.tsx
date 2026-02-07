import { useState } from 'preact/hooks';
import { send, roomError } from '../services/ws-client';

interface NicknameStepProps {
  mode: 'create' | 'join';
  joinCode?: string;
  onBack: () => void;
}

const MIN_LENGTH = 2;
const MAX_LENGTH = 12;

export function NicknameStep({ mode, joinCode, onBack }: NicknameStepProps) {
  const [nickname, setNickname] = useState('');
  const [validation, setValidation] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const trimmed = nickname.trim();
  const charCount = trimmed.length;

  function handleSubmit(e: Event) {
    e.preventDefault();

    if (charCount < MIN_LENGTH) {
      setValidation(`Name must be at least ${MIN_LENGTH} characters`);
      return;
    }
    if (charCount > MAX_LENGTH) {
      setValidation(`Name must be ${MAX_LENGTH} characters or fewer`);
      return;
    }

    setValidation(null);
    roomError.value = null;
    setSubmitted(true);

    if (mode === 'create') {
      send({ type: 'create_room', nickname: trimmed });
    } else {
      send({ type: 'join_room', code: joinCode!, nickname: trimmed });
    }
  }

  function countClass(): string {
    if (charCount >= MAX_LENGTH) return 'nickname-count at-limit';
    if (charCount >= MAX_LENGTH - 2) return 'nickname-count near-limit';
    return 'nickname-count';
  }

  const hasError = validation || roomError.value;

  return (
    <div class="nickname-step">
      <img src="/icon.svg" alt="Tandarr" class="room-logo" width="72" height="72" />
      <h2>What should we call you?</h2>
      <p class="nickname-subtitle">
        {mode === 'create' ? 'Pick a name for the room' : 'Pick a name to join with'}
      </p>

      <form class="nickname-form" onSubmit={handleSubmit}>
        <div class="nickname-field">
          <input
            type="text"
            class={`nickname-input${validation ? ' invalid' : ''}`}
            placeholder="Your name"
            value={nickname}
            maxLength={MAX_LENGTH}
            onInput={(e) => {
              setNickname((e.target as HTMLInputElement).value);
              setValidation(null);
              if (roomError.value) roomError.value = null;
              setSubmitted(false);
            }}
            autoFocus
          />
          <span class={countClass()}>
            {charCount}/{MAX_LENGTH}
          </span>
        </div>

        {validation && <p class="nickname-validation">{validation}</p>}
        {!validation && roomError.value && (
          <div class="room-error">{roomError.value}</div>
        )}

        <button
          type="submit"
          class="nickname-submit-btn"
          disabled={submitted && !hasError}
        >
          {mode === 'create' ? 'Create Room' : 'Join Room'}
        </button>
      </form>

      <button class="back-btn" onClick={onBack} type="button">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back
      </button>
    </div>
  );
}
