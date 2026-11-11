import { Component, ViewEncapsulation } from '@angular/core';
import { DesktopPage } from './pages/desktop-page';

@Component({
  selector: 'app-root',
  imports: [DesktopPage],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  encapsulation: ViewEncapsulation.None
})
export class App {}

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
