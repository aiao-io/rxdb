export type WorkbenchDisplayMode = 'browser' | 'standalone' | 'window-controls-overlay';

export interface DisplayModeEnvironment {
  readonly matchMedia?: (query: string) => { readonly matches: boolean };
}

export function getWorkbenchDisplayMode(environment: DisplayModeEnvironment | null | undefined): WorkbenchDisplayMode {
  if (environment?.matchMedia?.('(display-mode: window-controls-overlay)').matches)
    return 'window-controls-overlay';
  if (environment?.matchMedia?.('(display-mode: standalone)').matches) return 'standalone';
  return 'browser';
}
