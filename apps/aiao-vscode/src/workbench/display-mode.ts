/** `desktop-window` 由 Aiao Desktop 的透明窗口设置（见 host-window.ts），不从浏览器显示模式推断。 */
export type WorkbenchDisplayMode = 'browser' | 'standalone' | 'window-controls-overlay' | 'desktop-window';

export interface DisplayModeEnvironment {
  readonly matchMedia?: (query: string) => { readonly matches: boolean };
}

export function getWorkbenchDisplayMode(environment: DisplayModeEnvironment | null | undefined): WorkbenchDisplayMode {
  if (environment?.matchMedia?.('(display-mode: window-controls-overlay)').matches)
    return 'window-controls-overlay';
  if (environment?.matchMedia?.('(display-mode: standalone)').matches) return 'standalone';
  return 'browser';
}
