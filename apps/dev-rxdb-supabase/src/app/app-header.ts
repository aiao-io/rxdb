import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-header',
  styles: [
    `
      :host {
        pointer-events: none;
      }
      :host {
        .btn {
          pointer-events: auto;
        }
      }
    `
  ],
  template: `<div
    class="flex items-center justify-between p-1"
    id="layout-topbar"
    aria-label="Navbar"
    role="navigation"
  >
    <div class="inline-flex items-center gap-3"></div>
    <div class="hidden items-center gap-1 2xl:inline-flex"></div>
  </div>`,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppHeader {}
