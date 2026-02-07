import { toasts } from '../services/toast-state';

export function RoomToast() {
  const items = toasts.value;
  if (items.length === 0) return null;

  return (
    <div class="room-toast-container">
      {items.map((t) => (
        <div key={t.id} class={`room-toast room-toast-${t.type}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
