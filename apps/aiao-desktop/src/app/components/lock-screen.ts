import { Component, ViewEncapsulation, computed, effect, inject, signal, untracked } from '@angular/core';

import { Clock } from '../services/clock';
import { Session } from '../services/session';
import { SystemState } from '../services/system-state';
import { WallpaperService } from '../services/wallpaper';
import { AVATAR } from '../shared/avatar';
import { DAYS, MONS, time12Plain } from '../shared/format';

type LockPhase = 'hidden' | 'shown' | 'opening' | 'out';

/** 登录界面：开机后与「锁定屏幕」时出现，点击或回车进入桌面。 */
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
  }

  /* 壁纸先回到清晰，面板再淡出，桌面就像一直在那儿。 */
  private dismiss(): void {
    if (this.phase() !== 'shown') return;
    this.dataOn.set('0');
    this.phase.set('opening');
    this.timers = [setTimeout(() => this.phase.set('out'), 120), setTimeout(() => this.phase.set('hidden'), 600)];
  }
}
