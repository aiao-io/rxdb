import {
  Component,
  ElementRef,
  ViewEncapsulation,
  afterNextRender,
  viewChild
} from '@angular/core';
import { LEGACY_MARKUP } from './legacy-markup';
import { startLegacyRuntime } from './runtime/runtime-entry';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
  encapsulation: ViewEncapsulation.None
})
export class App {
  private readonly desktopHost = viewChild.required<ElementRef<HTMLElement>>('desktopHost');

  constructor() {
    afterNextRender(() => {
      this.desktopHost().nativeElement.innerHTML = LEGACY_MARKUP;
      startLegacyRuntime();
    });
  }
}

declare global {
  interface Window {
    __AIAO_DESKTOP_RUNTIME_LOADED__?: boolean;
    WM?: unknown;
    APPS?: unknown;
    Pop?: unknown;
    Dock?: unknown;
    MenuBar?: unknown;
    Theme?: unknown;
    SYS?: unknown;
    Wall?: unknown;
    Screen?: unknown;
    Desktop?: unknown;
    Launchpad?: unknown;
    Spotlight?: unknown;
    NotifCenter?: unknown;
    Startup?: unknown;
  }
}
