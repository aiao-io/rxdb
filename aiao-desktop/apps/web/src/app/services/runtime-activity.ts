import { DOCUMENT } from '@angular/common';
import { DestroyRef, Service, computed, inject, signal } from '@angular/core';

import { runtimeOf } from './desktop-apps';
import { AppInstanceState, AppResourceState, DesktopWindow } from './desktop-window';
import { Session } from './session';
import { WindowManager } from './window-manager';

const STATES: Record<AppInstanceState, string> = {
  registered: 'Waiting',
  loading: 'Loading',
  ready: 'Ready',
  closing: 'Closing',
  closed: 'Closed',
  failed: 'Failed'
};
const RESOURCES: Record<AppResourceState, string> = {
  unmanaged: 'Managed by app',
  pending: 'Starting',
  running: 'Rendering',
  paused: 'Rendering and audio paused',
  failed: 'Pause or resume failed'
};

/** 当前桌面的真实窗口与可见性；只有应用主动回报时才展示资源暂停状态。 */
@Service({ autoProvided: false })
export class RuntimeActivity {
  private readonly document = inject(DOCUMENT);
  private readonly session = inject(Session);
  private readonly wm = inject(WindowManager);
  private readonly pageHidden = signal(this.document.hidden);
  readonly available = computed(
    () => !this.pageHidden() && !this.session.locked() && this.session.sleep() === 'awake' && !this.session.boot()
  );
  readonly rows = computed(() =>
    this.wm.windows().map(win => ({
      id: win.id,
      appId: win.appId,
      title: win.title(),
      source:
        win.app.kind === 'web' ? 'Web app'
        : runtimeOf(win.app) === 'bundled-html' ? 'Bundled game'
        : 'Built-in app',
      state: STATES[win.state()],
      visibility: this.visibility(win),
      resources: RESOURCES[win.resourceState()],
      failure: win.resourceFailure() ?? win.failure(),
      closing: win.closing() || win.closePending()
    }))
  );

  constructor() {
    const update = () => this.pageHidden.set(this.document.hidden);
    this.document.addEventListener('visibilitychange', update);
    inject(DestroyRef).onDestroy(() => this.document.removeEventListener('visibilitychange', update));
  }

  visible(win: DesktopWindow): boolean {
    return this.available() && !win.minimized() && !win.hidden() && !win.closing() && win.state() !== 'closed';
  }

  private visibility(win: DesktopWindow): string {
    if (!this.available()) return 'Desktop hidden';
    if (win.minimized() || win.hidden()) return 'Minimized';
    return this.wm.focused() === win ? 'Foreground' : 'Background';
  }
}
