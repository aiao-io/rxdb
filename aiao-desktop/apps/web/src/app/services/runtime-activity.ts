import { I18N } from '@aiao/rxdb-i18n-angular';
import { DOCUMENT } from '@angular/common';
import { DestroyRef, Service, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';

import { runtimeOf } from './desktop-apps';
import { AppInstanceState, AppResourceState, DesktopWindow } from './desktop-window';
import { Session } from './session';
import { WindowManager } from './window-manager';

const STATE_KEYS: Record<AppInstanceState, string> = {
  registered: 'apps.activity.state.waiting',
  loading: 'apps.activity.state.loading',
  ready: 'apps.activity.state.ready',
  closing: 'apps.activity.state.closing',
  closed: 'apps.activity.state.closed',
  failed: 'apps.activity.state.failed'
};
const RESOURCE_KEYS: Record<AppResourceState, string> = {
  unmanaged: 'apps.activity.resource.managedByApp',
  pending: 'apps.activity.resource.starting',
  running: 'apps.activity.resource.rendering',
  paused: 'apps.activity.resource.paused',
  failed: 'apps.activity.resource.failed'
};

/** 当前桌面的真实窗口与可见性；只有应用主动回报时才展示资源暂停状态。 */
@Service({ autoProvided: false })
export class RuntimeActivity {
  private readonly document = inject(DOCUMENT);
  private readonly session = inject(Session);
  private readonly wm = inject(WindowManager);
  private readonly i18nRuntime = inject(I18N);
  private readonly locale = toSignal(this.i18nRuntime.locale$, { requireSync: true });
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
        win.app.kind === 'web' ? this.t('apps.activity.source.webApp')
        : runtimeOf(win.app) === 'bundled-html' ? this.t('apps.activity.source.bundledGame')
        : this.t('apps.activity.source.builtInApp'),
      state: this.t(STATE_KEYS[win.state()]),
      visibility: this.visibility(win),
      resources: this.t(RESOURCE_KEYS[win.resourceState()]),
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

  /** 给界面的文案按当前语言解析：先读 locale 信号注册依赖，rows 等 computed 随语言切换重建。 */
  private t(key: string): string {
    this.locale();
    return this.i18nRuntime.t(key);
  }

  private visibility(win: DesktopWindow): string {
    if (!this.available()) return this.t('apps.activity.visibility.desktopHidden');
    if (win.minimized() || win.hidden()) return this.t('apps.activity.visibility.minimized');
    return this.wm.focused() === win ?
        this.t('apps.activity.visibility.foreground')
      : this.t('apps.activity.visibility.background');
  }
}
