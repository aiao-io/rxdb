import { readonly, ref } from 'vue';

export type ToastType = 'error' | 'success' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

const DEFAULT_DURATION_MS = 4000;
const toasts = ref<ToastItem[]>([]);

function push(message: string, type: ToastType, durationMs = DEFAULT_DURATION_MS): string {
  const id = crypto.randomUUID();
  toasts.value = [...toasts.value, { id, message, type }];
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id);
  }, durationMs);
  return id;
}

function dismiss(id: string): void {
  toasts.value = toasts.value.filter(t => t.id !== id);
}

export function useToast() {
  return {
    toasts: readonly(toasts),
    error: (message: string, durationMs?: number) => push(message, 'error', durationMs),
    success: (message: string, durationMs?: number) => push(message, 'success', durationMs),
    info: (message: string, durationMs?: number) => push(message, 'info', durationMs),
    dismiss
  };
}

export function formatErrorMessage(prefix: string, err: unknown): string {
  const detail = err instanceof Error ? err.message : String(err);
  return `${prefix}: ${detail}`;
}
