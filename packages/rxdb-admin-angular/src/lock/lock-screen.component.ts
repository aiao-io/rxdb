import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild
} from '@angular/core';
import { injectAdminShell, injectAdminStore, injectAdminText } from '../context';
import { AdminModalDirective } from '../use-dialog';

/**
 * 锁屏的时钟：按所选时区与语言格式化，每秒刷新。
 */
@Component({
  selector: 'rxdb-admin-lock-clock',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<p class="admin-lock-clock" [textContent]="text()"></p>`
})
export class AdminLockClockComponent {
  readonly #shell = injectAdminShell();
  readonly #now = signal(new Date());

  protected readonly text = computed(() => this.#shell.formatDate(this.#now(), { timeStyle: 'medium' }));

  constructor() {
    const destroyRef = inject(DestroyRef);
    // 与 React 的 useEffect 一致：首次渲染之后才启动计时器（服务端渲染不会留下计时器）
    afterNextRender(() => {
      const timer = setInterval(() => this.#now.set(new Date()), 1000);
      destroyRef.onDestroy(() => clearInterval(timer));
    });
  }
}

/**
 * 锁屏表单：未设置密码时先要求设置，已设置则输入密码解锁；忘记密码可二次确认后重置（数据不受影响）。
 */
@Component({
  selector: 'rxdb-admin-lock-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AdminLockClockComponent],
  host: { style: 'display: contents' },
  templateUrl: './lock-form.component.html'
})
export class AdminLockFormComponent {
  readonly #shell = injectAdminShell();

  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');

  protected readonly t = injectAdminText();
  protected readonly password = signal('');
  protected readonly error = signal<'wrong' | 'unavailable' | null>(null);
  protected readonly confirmingReset = signal(false);

  constructor() {
    afterNextRender(() => this.field()?.nativeElement.focus());
  }

  /** 是否已设置锁屏密码；每次渲染读取，设置 / 重置密码后下一次渲染随之更新。 */
  protected hasPassword(): boolean {
    return this.#shell.lock.hasPassword();
  }

  protected onInput(event: Event): void {
    this.password.set((event.target as HTMLInputElement).value);
    this.error.set(null);
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void this.#submit();
  }

  protected reset(): void {
    this.#shell.lock.resetPassword();
  }

  async #submit(): Promise<void> {
    const lock = this.#shell.lock;
    const password = this.password();
    try {
      if (lock.hasPassword()) {
        if (!(await lock.unlockWith(password))) this.error.set('wrong');
      } else if (password !== '') {
        await lock.setPassword(password);
      }
    } catch {
      this.error.set('unavailable');
    }
  }
}

/**
 * 锁屏：模态 `<dialog>` 遮住界面，Esc 不能关闭；未设置密码时先要求设置，忘记密码可重置（数据不受影响）。
 * 未锁定时 `<dialog>` 保持关闭。
 */
@Component({
  selector: 'rxdb-admin-lock-screen',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AdminLockFormComponent, AdminModalDirective],
  host: { style: 'display: contents' },
  template: `
    <dialog
      class="admin-lock"
      [attr.aria-label]="t('lock.title')"
      [rxdbAdminModal]="locked()"
      (cancel)="$event.preventDefault()"
      data-testid="admin-lock"
    >
      @if (locked()) {
        <rxdb-admin-lock-form />
      }
    </dialog>
  `
})
export class AdminLockScreenComponent {
  protected readonly t = injectAdminText();
  protected readonly locked = injectAdminStore(injectAdminShell().lock.locked);
}
