import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';

/** 登录 / 注册：认证宿主是 Supabase Auth（邮箱 + 密码）。 */
@Component({
  selector: 'app-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="bg-base-200 grid min-h-dvh place-items-center p-4">
      <form class="card bg-base-100 w-full max-w-sm shadow" (submit)="submit($event, 'signIn')">
        <div class="card-body gap-4">
          <h1 class="card-title">局域网 P2P 文件共享</h1>
          <p class="text-sm opacity-70">
            同一个账号在两台设备（或两个浏览器）上登录，文件就在设备之间直传；持有声明经 Supabase 同步。
          </p>
          <label class="input w-full">
            <span class="label">邮箱</span>
            <input
              type="email"
              name="email"
              autocomplete="username"
              required
              data-testid="login-email"
              [value]="email()"
              (input)="email.set($any($event.target).value)"
            />
          </label>
          <label class="input w-full">
            <span class="label">密码</span>
            <input
              type="password"
              name="password"
              autocomplete="current-password"
              minlength="6"
              required
              data-testid="login-password"
              [value]="password()"
              (input)="password.set($any($event.target).value)"
            />
          </label>
          @if (error(); as message) {
            <div role="alert" class="alert alert-error text-sm" data-testid="login-error">{{ message }}</div>
          }
          <div class="card-actions">
            <button class="btn btn-primary flex-1" type="submit" data-testid="login-sign-in" [disabled]="busy()">
              登录
            </button>
            <button
              class="btn flex-1"
              type="button"
              data-testid="login-sign-up"
              [disabled]="busy()"
              (click)="submit($event, 'signUp')"
            >
              注册
            </button>
          </div>
        </div>
      </form>
    </main>
  `
})
export default class LoginPage {
  readonly #auth = inject(AuthService);
  readonly #router = inject(Router);
  readonly email = signal('');
  readonly password = signal('');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  async submit(event: Event, action: 'signIn' | 'signUp'): Promise<void> {
    event.preventDefault();
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.#auth[action](this.email().trim(), this.password());
      await this.#router.navigateByUrl('/');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.busy.set(false);
    }
  }
}
