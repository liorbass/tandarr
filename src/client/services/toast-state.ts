import { signal } from '@preact/signals';

export type ToastType = 'info' | 'success' | 'warning';

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

let nextId = 0;

export const toasts = signal<Toast[]>([]);

export function addToast(message: string, type: ToastType = 'info'): void {
  const id = nextId++;
  toasts.value = [...toasts.value, { id, message, type }];
  setTimeout(() => removeToast(id), 3000);
}

export function removeToast(id: number): void {
  toasts.value = toasts.value.filter((t) => t.id !== id);
}
