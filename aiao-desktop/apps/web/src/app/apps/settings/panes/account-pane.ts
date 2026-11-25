import { Component, inject, signal } from '@angular/core';

import { DesktopData } from '../../../data/desktop-data';
import { Icon } from '../../../shared/icon';
import { USER_PROFILE } from '../../../shared/user-profile';

/** 退出确认要说明的清除范围（与数据问题阻断界面的抹除范围一致）。 */
const SIGN_OUT_WARNING =
  'Signing out erases all desktop data: files, settings, app records and previous restore copies are permanently removed. Games, terminal runtime images, remote apps and downloaded backups are kept. Close other desktop tabs first.';

interface AccountRow {
  readonly label: string;
  readonly value: string;
  readonly icon: string;
  readonly bg: string;
}

/**
 * 账户详情页（ADESK-US-131）：设置侧栏点头像进入，按 macOS 账户页布局——大头像与姓名在上，
 * 账户内容信息居中，页尾是 Sign Out。Sign Out 要再确认一次；确认后抹掉全部本地数据并刷新页面，
 * 失败时在页面上说明原因，可以重试。抹除范围与数据问题阻断界面一致（ADESK-US-106）。
 */
@Component({
  selector: 'app-account-pane',
  imports: [Icon],
  host: { style: 'display: contents' },
  template: `
    <div data-account-pane>
      <div style="display: flex; align-items: center; gap: 16px; padding: 6px 4px 22px">
        <img
          [src]="avatar"
          alt=""
          height="80"
          style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover"
          width="80"
        />
        <div>
          <div data-account-name style="font-size: 24px; font-weight: 600; letter-spacing: -0.02em">
            {{ name }}
          </div>
          <div style="font-size: 13px; color: var(--txt-2)">Apple Account</div>
        </div>
      </div>

      <div class="st-label">Account</div>
      <div class="st-group">
        @for (row of rows; track row.label) {
          <div class="st-item">
            <span
              class="bg"
              style="
                width: 20px;
                height: 20px;
                border-radius: 5px;
                color: #fff;
                display: grid;
                place-items: center;
              "
              [style.background]="row.bg"
              ><svg [appIcon]="row.icon" style="width: 13px; height: 13px"></svg
            ></span>
            <div class="lb" style="min-width: 0; flex: 1">{{ row.label }}</div>
            <div class="rt" style="color: var(--txt-2)">{{ row.value }}</div>
          </div>
        }
      </div>

      @if (failure()) {
        <p data-account-failure role="alert" style="margin: 12px 4px 0; color: var(--red); font-size: 12.5px">
          Couldn’t sign out: {{ failure() }}
        </p>
      }
      @if (confirming()) {
        <p
          data-account-warning
          style="margin: 14px 4px 0; color: var(--red); font-size: 12.5px; font-weight: 500; line-height: 1.5"
        >
          {{ SIGN_OUT_WARNING }}
        </p>
        <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px; padding: 0 4px">
          <button class="btn" [disabled]="signingOut()" (click)="cancel()" data-account-cancel tabindex="0" type="button">
            Cancel
          </button>
          <button
            class="btn"
            [disabled]="signingOut()"
            (click)="signOut()"
            data-account-confirm
            style="background: var(--red); color: #fff"
            tabindex="0"
            type="button"
          >
            {{ signingOut() ? 'Signing Out…' : 'Sign Out' }}
          </button>
        </div>
      } @else {
        <div style="margin-top: 14px; padding: 0 4px">
          <button class="btn" (click)="ask()" data-account-signout style="color: var(--red)" tabindex="0" type="button">
            Sign Out…
          </button>
        </div>
      }
    </div>
  `
})
export class AccountPane {
  private readonly data = inject(DesktopData);
  protected readonly name = USER_PROFILE.name;
  protected readonly avatar = USER_PROFILE.avatar;
  protected readonly SIGN_OUT_WARNING = SIGN_OUT_WARNING;
  protected readonly rows: readonly AccountRow[] = [
    { label: 'Sign-In & Security', value: 'Password', icon: 'g-lock', bg: '#8e8e93' },
    { label: 'iCloud', value: 'On', icon: 'g-cloud', bg: '#0a84ff' },
    { label: 'Devices', value: 'This Mac', icon: 'g-desktop', bg: '#8e8e93' }
  ];
  protected readonly confirming = signal(false);
  protected readonly signingOut = signal(false);
  protected readonly failure = signal('');

  protected ask(): void {
    this.failure.set('');
    this.confirming.set(true);
  }

  protected cancel(): void {
    this.confirming.set(false);
  }

  protected async signOut(): Promise<void> {
    if (this.signingOut()) return;
    this.signingOut.set(true);
    this.failure.set('');
    try {
      await this.data.eraseLocalData();
      location.reload();
    } catch (error) {
      this.failure.set(error instanceof Error ? error.message : String(error));
      this.signingOut.set(false);
      this.confirming.set(false);
    }
  }
}
