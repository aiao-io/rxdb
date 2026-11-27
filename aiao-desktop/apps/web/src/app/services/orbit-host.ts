import { OrbitRuntime, createOrbit } from '@aiao/orbit';
import { I18N } from '@aiao/rxdb-i18n-angular';
import { DestroyRef, Service, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';

import { isWindowFailure } from '../apps/web-app/web-app-failure';
import { ApplicationRegistry } from './application-registry';
import { DESKTOP_APPS, WebAppManifest, webAppOrigins } from './desktop-apps';

export interface AppOrbitConnection {
  readonly runtime: OrbitRuntime;
  dispose(): void;
}

const reportError = (error: unknown): void => {
  if (!isWindowFailure(error)) console.error(error);
};

/** 预装应用共用内核；批准安装的每个窗口仅信任自己的来源，清单变更立即撤销旧内核。 */
@Service({ autoProvided: false })
export class OrbitHost {
  private readonly apps = inject(ApplicationRegistry).apps;
  /** 可选注入：没有 i18n 运行时（如纯单元测试）时文案回退英文原文。 */
  private readonly i18nRuntime = inject(I18N, { optional: true }) ?? undefined;
  private readonly locale = this.i18nRuntime ? toSignal(this.i18nRuntime.locale$, { requireSync: true }) : undefined;
  private readonly connections = new Map<AppOrbitConnection, WebAppManifest>();
  readonly runtime = createOrbit({ allowedOrigins: webAppOrigins(inject(DESKTOP_APPS)), onError: reportError });

  constructor() {
    effect(() => {
      const apps = this.apps();
      for (const [connection, app] of this.connections)
        if (JSON.stringify(apps[app.id]) !== JSON.stringify(app)) connection.dispose();
    });
    inject(DestroyRef).onDestroy(() => {
      for (const connection of this.connections.keys()) connection.dispose();
      this.runtime.dispose();
    });
  }

  connect(app: WebAppManifest): AppOrbitConnection {
    if (JSON.stringify(this.apps()[app.id]) !== JSON.stringify(app))
      throw new Error(
        this.t(
          'error.orbit.releaseNotInstalled',
          'This application release is no longer installed. Open it again from App Store.'
        )
      );
    if (app.installScope !== 'approved-catalog') return { runtime: this.runtime, dispose: () => undefined };
    const runtime = createOrbit({ allowedOrigins: [new URL(app.web.url).origin], onError: reportError });
    const connection: AppOrbitConnection = {
      runtime,
      dispose: () => {
        if (this.connections.delete(connection)) runtime.dispose();
      }
    };
    this.connections.set(connection, app);
    return connection;
  }

  /** 给界面的文案按当前语言解析；错误在抛出时定格。未绑定运行时时回退英文原文。 */
  private t(key: string, english: string): string {
    const runtime = this.i18nRuntime;
    if (!runtime || !this.locale) return english;
    this.locale();
    return runtime.t(key);
  }
}
