import { Component, inject, signal } from '@angular/core';

import { DesktopData } from '../../data/desktop-data';
import { USER_PROFILE } from '../../shared/user-profile';

/** 退出确认要说明的清除范围（与数据问题阻断界面的抹除范围一致）。 */
const SIGN_OUT_WARNING =
  'Signing out erases all desktop data: files, settings, app records and previous restore copies are permanently removed. Games, terminal runtime images, remote apps and downloaded backups are kept. Close other desktop tabs first.';

/**
 * 设置侧栏头像的账户弹出层：显示账户信息，Sign Out 要再确认一次；确认后抹掉全部本地数据并刷新页面，
 * 失败时在弹出层里说明原因，可以重试。抹除范围与数据问题阻断界面一致（ADESK-US-106）。
 */
@Component({
  selector: 'app-account-menu',
  host: { class: 'panel', role: 'dialog', 'aria-label': 'Apple Account', style: 'min-width: 250px' },
  template: `
    <div class="row" style="height: 38px; margin-bottom: 2px">
      <img
        [src]="avatar"
        alt=""
        height="34"
        style="width: 34px; height: 34px; border-radius: 50%; object-fit: cover"
        width="34"
      />
      <span style="display: flex; flex-direction: column">
        <b data-account-name style="font-size: 13px; font-weight: 600">{{ name }}</b>
        <span style="font-size: 11px; color: var(--txt-2)">Apple Account</span>
      </span>
    </div>
    <div class="sep"></div>
    @if (failure()) {
      <p class="sub" data-account-failure role="alert" style="margin: 6px 2px; color: var(--red)">
        Couldn’t sign out: {{ failure() }}
      </p>
    }
    @if (confirming()) {
      <p class="sub" data-account-warning style="margin: 6px 2px">{{ SIGN_OUT_WARNING }}</p>
      <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px">
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
      <button class="row" (click)="ask()" data-account-signout tabindex="0" type="button">
        <span class="nm">Sign Out…</span>
      </button>
    }
  `
})
export class AccountMenu {
  private readonly data = inject(DesktopData);
  protected readonly name = USER_PROFILE.name;
  protected readonly avatar = USER_PROFILE.avatar;
  protected readonly SIGN_OUT_WARNING = SIGN_OUT_WARNING;
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
