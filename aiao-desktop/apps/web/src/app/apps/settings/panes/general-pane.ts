import { useI18n } from '@aiao/rxdb-i18n-angular';
import { Component, inject } from '@angular/core';

import { Toast } from '../../../services/toast';
import { WindowManager } from '../../../services/window-manager';
import { Icon } from '../../../shared/icon';

interface GeneralRow {
  /** 目录 key（命名空间 `desktop`）。 */
  readonly label: string;
  readonly icon: string;
  /** 打开目标的动作；没有动作的只是展示行（没有 chevron、不可点）。 */
  readonly run?: () => void;
}

/** 通用：About 打开「关于本机」窗口，Software Update 弹提示，其余条目是静态信息。 */
@Component({
  selector: 'app-general-pane',
  imports: [Icon],
  host: { style: 'display: contents' },
  template: `
    <div class="st-group">
      @for (row of rows; track row.label) {
        <div
          class="st-item"
          [attr.aria-label]="row.run ? i18n.t(row.label) : null"
          [attr.role]="row.run ? 'button' : null"
          [attr.tabindex]="row.run ? 0 : null"
          (click)="row.run?.()"
          (keydown.enter)="row.run?.()"
        >
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
            ><svg [appIcon]="row.icon" style="width: 13px; height: 13px"></svg
          ></span>
          <div class="lb" style="min-width: 0; flex: 1">{{ i18n.t(row.label) }}</div>
          @if (row.run) {
            <div class="rt"><svg appIcon="g-chev-r"></svg></div>
          }
        </div>
      }
    </div>
    <div class="st-label">{{ i18n.t('general.thisMac') }}</div>
    <div class="st-group">
      <div class="st-item">
        <div class="lb" style="min-width: 0; flex: 1">
          MacBook Pro 16″ · Apple M4 Max · 128 GB
          <div class="hint">macOS Tahoe 26.0 (26A5240b) — {{ i18n.t('general.upToDate') }}</div>
        </div>
        <div class="rt">
          <button class="btn pri" (click)="about()">{{ i18n.t('general.moreInfo') }}</button>
        </div>
      </div>
    </div>
  `
})
export class GeneralPane {
  private readonly wm = inject(WindowManager);
  private readonly toast = inject(Toast);
  protected readonly i18n = useI18n();

  protected readonly rows: readonly GeneralRow[] = [
    { label: 'general.about', icon: 'g-gear', run: () => this.about() },
    {
      label: 'general.softwareUpdate',
      icon: 'g-download',
      run: () => this.toast.show(this.i18n.t('general.upToDateToast'))
    },
    { label: 'general.storage', icon: 'g-hd' },
    { label: 'general.airdrop', icon: 'g-airdrop' },
    { label: 'general.loginItems', icon: 'g-apps' },
    { label: 'general.dateTime', icon: 'g-clock-a' },
    { label: 'general.sharing', icon: 'g-share' },
    { label: 'general.timeMachine', icon: 'g-clock-a' }
  ];

  protected about(): void {
    this.wm.open('about');
  }
}
