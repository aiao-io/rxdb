import type { Observable, Subscription } from 'rxjs';

export interface EncryptionFacadeState {
  isLocked: boolean;
  isInitialized: () => Promise<boolean>;
  lockChange$: Observable<boolean>;
}

interface EncryptionFacadeHandlers<T extends EncryptionFacadeState> {
  onReady: (facade: T) => void;
  onInitialized: (initialized: boolean) => void;
  onLockChange: (locked: boolean) => void;
  onError: (error: unknown) => void;
}

export function bindEncryptionFacade<T extends EncryptionFacadeState>(
  facadePromise: Promise<T>,
  handlers: EncryptionFacadeHandlers<T>
): () => void {
  let active = true;
  let subscription: Subscription | undefined;

  void facadePromise.then(
    facade => {
      if (!active) return;
      handlers.onReady(facade);
      void facade.isInitialized().then(
        initialized => {
          if (active) handlers.onInitialized(initialized);
        },
        error => {
          if (active) handlers.onError(error);
        }
      );
      subscription = facade.lockChange$.subscribe({
        next: locked => {
          if (active) handlers.onLockChange(locked);
        },
        error: error => {
          if (active) handlers.onError(error);
        }
      });
    },
    error => {
      if (active) handlers.onError(error);
    }
  );

  return () => {
    active = false;
    subscription?.unsubscribe();
    subscription = undefined;
  };
}
