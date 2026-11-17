import { OrbitRuntime, createOrbit } from '@aiao/orbit';
import { DestroyRef, Service, effect, inject } from '@angular/core';

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
      throw new Error('This application release is no longer installed. Open it again from App Store.');
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
}
