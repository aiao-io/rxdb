import { Component } from '@angular/core';

import { Icon } from '../../../shared/icon';

/** 通用：一串只能看的条目，外加「这台 Mac」的型号。 */
@Component({
  selector: 'app-general-pane',
  imports: [Icon],
  host: { style: 'display: contents' },
  template: `
    <div class="st-group">
      @for (item of items; track item[0]) {
        <div class="st-item">
          <span
            class="bg"
            style="
              width: 20px;
              height: 20px;
              border-radius: 5px;
              background: #8e8e93;
              color: #fff;
              display: grid;
              place-items: center;
            "
            ><svg [appIcon]="item[1]" style="width: 13px; height: 13px"></svg
          ></span>
          <div class="lb" style="min-width: 0; flex: 1">{{ item[0] }}</div>
          <div class="rt"><svg appIcon="g-chev-r"></svg></div>
        </div>
      }
    </div>
    <div class="st-label">This Mac</div>
    <div class="st-group">
      <div class="st-item">
        <div class="lb" style="min-width: 0; flex: 1">
          MacBook Pro 16″ · Apple M4 Max · 128 GB
          <div class="hint">macOS Tahoe 26.0 (26A5240b) — up to date</div>
        </div>
        <div class="rt"><button class="btn pri">More Info…</button></div>
      </div>
    </div>
  `
})
export class GeneralPane {
  protected readonly items = [
    ['About', 'g-gear'],
    ['Software Update', 'g-download'],
    ['Storage', 'g-hd'],
    ['AirDrop & Handoff', 'g-airdrop'],
    ['Login Items & Extensions', 'g-apps'],
    ['Language & Region', 'g-globe'],
    ['Date & Time', 'g-clock-a'],
    ['Sharing', 'g-share'],
    ['Time Machine', 'g-clock-a']
  ] as const;
}
