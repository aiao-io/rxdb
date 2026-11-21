import { Component } from '@angular/core';

import { Icon } from '../../../shared/icon';

/** 隐私与安全：每个权限一行，图标色块各有各的颜色。 */
@Component({
  selector: 'app-privacy-pane',
  imports: [Icon],
  host: { style: 'display: contents' },
  template: `
    <div class="st-group">
      @for (item of items; track item[0]) {
        <div class="st-item">
          <span
            class="bg"
            [style.background]="item[2]"
            style="width: 20px; height: 20px; border-radius: 5px; color: #fff; display: grid; place-items: center"
            ><svg [appIcon]="item[1]" style="width: 13px; height: 13px"></svg
          ></span>
          <div class="lb" style="min-width: 0; flex: 1">{{ item[0] }}</div>
          <div class="rt"><svg appIcon="g-chev-r"></svg></div>
        </div>
      }
    </div>
    <div class="st-group">
      <div class="st-item">
        <div class="lb">Allow applications from</div>
        <div class="rt">
          <button class="btn">App Store &amp; known developers <svg appIcon="g-chev-d"></svg></button>
        </div>
      </div>
    </div>
  `
})
export class PrivacyPane {
  protected readonly items = [
    ['Location Services', 'g-network', '#0a84ff'],
    ['Contacts', 'g-hand', '#ff9f0a'],
    ['Calendars', 'g-clock-a', '#ff375f'],
    ['Photos', 'g-gallery', '#bf5af2'],
    ['Camera', 'g-display', '#8e8e93'],
    ['Microphone', 'g-vol-hi', '#ff375f'],
    ['Screen & System Audio Recording', 'g-display', '#8e8e93'],
    ['Full Disk Access', 'g-hd', '#8e8e93'],
    ['FileVault', 'g-lock', '#30d158']
  ] as const;
}
