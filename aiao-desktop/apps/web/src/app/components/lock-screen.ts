import {
  Component,
  ElementRef,
  Injector,
  ViewEncapsulation,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild
} from '@angular/core';

import { Clock } from '../services/clock';
import { Session } from '../services/session';
import { SystemState } from '../services/system-state';
import { WallpaperService } from '../services/wallpaper';
import { WindowManager } from '../services/window-manager';
import { AVATAR } from '../shared/avatar';
import { DAYS, MONS, time12Plain } from '../shared/format';

type LockPhase = 'hidden' | 'shown' | 'opening' | 'out';

/**
 * 登录界面：开机后与「锁定屏幕」时出现，点击或回车进入桌面。
 * 无障碍（ADESK-US-108）：整屏是 `role="dialog"`，里面一个只给读屏与键盘用的「Log in as …」按钮；
 * 出现时焦点落在这个按钮上，登录后焦点回到前台窗口（下面的桌面层此时才解除 `inert`）。
 */
@Component({
  selector: 'app-lock-screen',
  templateUrl: './lock-screen.html',
  styleUrl: './lock-screen.scss',
  encapsulation: ViewEncapsulation.None,
  host: {
    '[style.display]': '"contents"',
    '(document:keydown)': 'key($event)'
  }
})
export class LockScreen {
  private readonly clock = inject(Clock);
  private readonly wallpaper = inject(WallpaperService);
  private readonly windows = inject(WindowManager);
  private readonly injector = inject(Injector);
  private readonly login = viewChild.required<ElementRef<HTMLButtonElement>>('login');
  private timers: ReturnType<typeof setTimeout>[] = [];
  protected readonly session = inject(Session);
  protected readonly system = inject(SystemState);

  protected readonly phase = signal<LockPhase>('hidden');
  protected readonly wall = signal('');
  protected readonly dataOn = signal<'1' | '0' | null>(null);
  protected readonly avatar = `url("${AVATAR}")`;
  protected readonly date = computed(() => {
    const d = this.clock.now();
    return `${DAYS[d.getDay()]}, ${MONS[d.getMonth()]} ${d.getDate()}`;
  });
  protected readonly time = computed(() => time12Plain(this.clock.now()).replace(/\s?[AP]M$/, ''));

  constructor() {
    effect(() => {
      const locked = this.session.locked();
      untracked(() => (locked ? this.show() : this.dismiss()));
    });
  }

  protected key(event: KeyboardEvent): void {
    if (!this.session.locked() || !['Enter', ' ', 'Escape'].includes(event.key)) return;
    event.preventDefault();
    this.session.unlock();
  }

  private show(): void {
    this.timers.forEach(clearTimeout);
    /* 沿用桌面此刻显示的图片，包括程序化渐变的兜底。 */
    this.wall.set(this.wallpaper.liveImage());
    this.dataOn.set('1');
    this.phase.set('shown');
    /* 要等 `hidden` 摘掉、画面渲染出来之后才聚焦得上。 */
    afterNextRender(() => this.login().nativeElement.focus(), { injector: this.injector });
  }

  /* 壁纸先回到清晰，面板再淡出，桌面就像一直在那儿。 */
  private dismiss(): void {
    if (this.phase() !== 'shown') return;
    this.dataOn.set('0');
    this.phase.set('opening');
    /* 桌面层解除 inert 的那次渲染之后，焦点回到前台窗口。 */
    afterNextRender(() => this.windows.focusFront(), { injector: this.injector });
    this.timers = [setTimeout(() => this.phase.set('out'), 120), setTimeout(() => this.phase.set('hidden'), 600)];
  }
}
