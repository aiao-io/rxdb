import { Component, inject } from '@angular/core';

import { WindowManager } from '../../services/window-manager';
import { TrafficLights } from '../../shared/traffic-lights';

/** 「关于本机」。 */
@Component({
  selector: 'app-about',
  imports: [TrafficLights],
  host: { style: 'display: contents' },
  template: `
    <div class="tb plain" data-drag>
      <div class="title"></div>
      <div class="tbz"><app-traffic-lights /></div>
      <div class="grow"></div>
      <div class="tbz"></div>
    </div>
    <div class="about">
      <svg class="mark" viewBox="0 0 15 18"><use href="#g-apple" /></svg>
      <h1>MacBook Pro</h1>
      <div class="ver">16‑inch, 2026</div>
      <dl>
        <dt>Chip</dt>
        <dd>Apple M4 Max</dd>
        <dt>Memory</dt>
        <dd>128 GB</dd>
        <dt>Startup disk</dt>
        <dd>Macintosh HD</dd>
        <dt>Serial number</dt>
        <dd>C02PR4S3NX26</dd>
        <dt>macOS</dt>
        <dd>Tahoe 26.0 (26A5240b)</dd>
        <dt>Display</dt>
        <dd>{{ display }}</dd>
        <dt>Rendered by</dt>
        <dd>one HTML file</dd>
      </dl>
      <div class="btns">
        <button class="btn" (click)="wm.open('settings', { section: 'general' })" data-more>More Info…</button>
        <button class="btn" (click)="wm.open('terminal')" data-rep>System Report…</button>
      </div>
      <div
        style="margin-top: auto; padding-top: 16px; font-size: 10.5px; color: var(--txt-3); text-align: center; line-height: 1.5"
      >
        ™ and © 2026 Apple Inc.<br />All rights reserved.
      </div>
    </div>
  `
})
export class AboutApp {
  protected readonly wm = inject(WindowManager);
  protected readonly display = `${innerWidth * 2} × ${innerHeight * 2} @ 120 Hz`;
}
