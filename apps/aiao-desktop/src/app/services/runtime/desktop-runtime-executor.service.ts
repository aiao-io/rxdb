import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { DestroyRef, Injectable, NgZone, PLATFORM_ID, Renderer2, RendererFactory2, inject } from '@angular/core';

import { DesktopRuntimeBridgeService } from './desktop-runtime-bridge.service';

/** 在 Angular 渲染完成后执行桌面运行时，并把 DOM 边界限制在一个适配器内。 */
@Injectable({ providedIn: 'root' })
export class DesktopRuntimeExecutorService {
  private readonly bridge = inject(DesktopRuntimeBridgeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly zone = inject(NgZone);
  private readonly renderer: Renderer2 = inject(RendererFactory2).createRenderer(null, null);
  private script: HTMLScriptElement | null = null;

  execute(sources: readonly string[]): void {
    if (!isPlatformBrowser(this.platformId) || this.script) return;

    const host = this.document.body ?? this.document.documentElement;
    if (!host) return;

    this.bridge.install();
    const script = this.renderer.createElement('script') as HTMLScriptElement;
    const source = [...sources, this.runtimeExports()].join('\n');

    this.renderer.setProperty(script, 'type', 'text/javascript');
    this.renderer.setProperty(script, 'text', source);
    this.script = script;

    this.zone.runOutsideAngular(() => {
      this.renderer.appendChild(host, script);
      this.renderer.removeChild(host, script);
    });

    this.destroyRef.onDestroy(() => {
      this.script = null;
    });
  }

  private runtimeExports(): string {
    return `window.__aiaoRuntimeBridge?.publish({
      WM,
      APPS,
      Pop,
      Dock,
      MenuBar,
      Theme,
      SYS,
      Wall,
      Screen,
      Desktop,
      Launchpad,
      Spotlight,
      NotifCenter,
      Startup
    });`;
  }
}
