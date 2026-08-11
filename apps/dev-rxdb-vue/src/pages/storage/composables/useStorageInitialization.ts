import { computed, ref, shallowRef } from 'vue';

export type StorageInitializationStatus = 'checking' | 'ready' | 'unavailable' | 'error';

interface StorageInitializationOptions {
  checkAvailability: () => Promise<boolean>;
  open: (path: string) => Promise<void>;
}

export function useStorageInitialization(options: StorageInitializationOptions) {
  const status = ref<StorageInitializationStatus>('checking');
  const error = shallowRef<unknown | null>(null);
  const isReady = computed(() => status.value === 'ready');

  async function start(path: string): Promise<void> {
    status.value = 'checking';
    error.value = null;

    try {
      if (!(await options.checkAvailability())) {
        status.value = 'unavailable';
        return;
      }

      await options.open(path);
      status.value = 'ready';
    } catch (cause) {
      error.value = cause;
      status.value = 'error';
    }
  }

  return { error, isReady, start, status };
}
