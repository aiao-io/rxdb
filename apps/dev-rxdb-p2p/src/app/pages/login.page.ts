import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';

/** 邮箱登录与注册。 */
@Component({
  selector: 'app-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="grid min-h-dvh place-items-center px-5 py-12">
      <div class="grid w-full max-w-4xl items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div>
          <div class="text-primary mb-8 flex items-center gap-3 font-semibold">
            <span
              class="bg-primary text-primary-content grid h-10 w-10 place-items-center rounded-xl"
              aria-hidden="true"
            >
              <svg fill="none" height="24" stroke="currentColor" stroke-width="1.7" viewBox="0 0 24 24" width="24">
                <path d="M5 8h14m-4-4 4 4-4 4M19 16H5m4-4-4 4 4 4" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </span>
            局域网文件共享
          </div>
          <h1 class="text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
            文件，直接到达<br /><span class="text-primary">另一台设备。</span>
          </h1>
          <p class="mt-5 max-w-sm text-sm leading-7 opacity-65">
            电脑、手机在同一局域网内，登录并打开此页，就能直接互传文件。
          </p>
          <ol class="mt-7 flex flex-col gap-4 text-sm">
            <li class="flex items-center gap-3">
              <span class="bg-base-300 grid h-7 w-7 place-items-center rounded-full text-xs">1</span
              >两台设备连接同一网络
            </li>
            <li class="flex items-center gap-3">
              <span class="bg-base-300 grid h-7 w-7 place-items-center rounded-full text-xs">2</span
              >分别登录，选择要共享的文件
            </li>
            <li class="flex items-center gap-3">
              <span class="bg-base-300 grid h-7 w-7 place-items-center rounded-full text-xs">3</span
              >在另一台设备点击下载
            </li>
          </ol>
        </div>
        <form class="card border-base-300 bg-base-100 w-full border shadow-sm" (submit)="submit($event)">
          <div class="card-body gap-5 p-6 sm:p-8">
            <div>
              <h2 class="text-xl font-semibold">登录，开始共享</h2>
              <p class="mt-2 text-sm opacity-60">首次使用？填写邮箱和密码后注册新账号。</p>
            </div>
            <label class="flex flex-col gap-2 text-sm font-medium">
              邮箱
              <input
                class="input w-full font-normal"
                #emailInput
                [disabled]="busy()"
                [value]="email()"
                (input)="email.set(emailInput.value)"
                autocomplete="username"
                data-testid="login-email"
                name="email"
                placeholder="you@example.com"
                required
                type="email"
              />
            </label>
            <label class="flex flex-col gap-2 text-sm font-medium">
              密码
              <input
                class="input w-full font-normal"
                #passwordInput
                [disabled]="busy()"
                [value]="password()"
                (input)="password.set(passwordInput.value)"
                aria-describedby="password-hint"
                autocomplete="current-password"
                data-testid="login-password"
                minlength="6"
                name="password"
                required
                type="password"
              />
              <span class="text-xs font-normal opacity-55" id="password-hint">至少 6 个字符</span>
            </label>
            @if (error(); as message) {
              <div class="alert alert-error text-sm" data-testid="login-error" role="alert">{{ message }}</div>
            }
            <div class="flex flex-col gap-3">
              <button
                class="btn btn-primary w-full"
                [disabled]="busy()"
                data-testid="login-sign-in"
                name="action"
                type="submit"
                value="signIn"
              >
                @if (busy()) {
                  <span class="loading loading-spinner loading-sm"></span>
                }
                {{ busy() ? '正在处理…' : '登录' }}
              </button>
              <button
                class="btn btn-outline w-full"
                [disabled]="busy()"
                data-testid="login-sign-up"
                name="action"
                type="submit"
                value="signUp"
              >
                注册新账号
              </button>
            </div>
            <p class="text-xs leading-5 opacity-55">
              共享文件对本应用所有已登录用户可见，请只共享适合公开给他们的内容。
            </p>
          </div>
        </form>
      </div>
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

  async submit(event: Event): Promise<void> {
    event.preventDefault();
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.reportValidity() || this.busy()) return;
    const submitter = event instanceof SubmitEvent ? event.submitter : null;
    const action = submitter instanceof HTMLButtonElement && submitter.value === 'signUp' ? 'signUp' : 'signIn';
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
