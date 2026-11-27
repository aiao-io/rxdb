import { Component, computed, inject } from '@angular/core';

import { Preferences } from '../../../data/preferences';

/** 免打扰开关的偏好键：与通知系统共用（开启时横幅静音但仍进通知中心）。 */
export const FOCUS_DND_KEY = 'focus:dnd';
/** 通知横幅开关的偏好键：通知系统据此决定是否弹横幅。 */
export const NOTIFICATION_BANNERS_KEY = 'notifications:banners';

const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

/**
 * 通知：免打扰与横幅开关。值直接存偏好表（键与通知系统共用），
 * 开关状态以偏好表为准——别的标签页改了这里也会跟着变。
 */
@Component({
  selector: 'app-notifications-pane',
  imports: [],
  host: { style: 'display: contents' },
  template: `
    <div class="st-label">Focus</div>
    <div class="st-group">
      <div class="st-item">
        <div class="lb" style="min-width: 0; flex: 1">
          Do Not Disturb
          <div class="hint">While on, notifications go to Notification Centre without banners or sounds.</div>
        </div>
        <div class="rt">
          <div
            class="sw"
            [attr.aria-checked]="dnd()"
            [class.on]="dnd()"
            (click)="setDnd(!dnd())"
            (keydown.enter)="setDnd(!dnd())"
            aria-label="Do Not Disturb"
            data-k="dnd"
            role="switch"
            tabindex="0"
          ></div>
        </div>
      </div>
    </div>
    <div class="st-label">Notifications</div>
    <div class="st-group">
      <div class="st-item">
        <div class="lb" style="min-width: 0; flex: 1">
          Show notification banners
          <div class="hint">Banners appear in the top-right corner and dismiss after a few seconds.</div>
        </div>
        <div class="rt">
          <div
            class="sw"
            [attr.aria-checked]="banners()"
            [class.on]="banners()"
            (click)="setBanners(!banners())"
            (keydown.enter)="setBanners(!banners())"
            aria-label="Show notification banners"
            data-k="banners"
            role="switch"
            tabindex="0"
          ></div>
        </div>
      </div>
    </div>
  `
})
export class NotificationsPane {
  private readonly preferences = inject(Preferences);

  /** 免打扰状态；库里还没有这个键时默认关闭。 */
  protected readonly dnd = computed(() => this.preferences.get(FOCUS_DND_KEY, isBoolean) ?? false);
  /** 横幅开关；库里还没有这个键时默认开启。 */
  protected readonly banners = computed(() => this.preferences.get(NOTIFICATION_BANNERS_KEY, isBoolean) ?? true);

  protected setDnd(on: boolean): void {
    void this.preferences.set(FOCUS_DND_KEY, on);
  }

  protected setBanners(on: boolean): void {
    void this.preferences.set(NOTIFICATION_BANNERS_KEY, on);
  }
}
