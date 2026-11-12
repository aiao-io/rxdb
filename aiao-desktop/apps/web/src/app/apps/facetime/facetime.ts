import { Component, computed, effect, inject, signal } from '@angular/core';

import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { PopoverService } from '../../services/popover';
import { Toast } from '../../services/toast';
import { mmss } from '../../shared/format';
import { Icon } from '../../shared/icon';
import { TrafficLights } from '../../shared/traffic-lights';
import { NewFaceTime } from './new-facetime';

interface Call {
  readonly name: string;
  readonly kind: string;
  readonly length: string;
  readonly when: string;
}

const CALLS: readonly Call[] = [
  { name: 'Anna Haro', kind: 'Outgoing', length: '24:12', when: 'Today 3:40 PM' },
  { name: 'Design Crew', kind: 'Missed', length: '', when: 'Today 11:02 AM' },
  { name: 'John Appleseed', kind: 'Incoming', length: '8:31', when: 'Yesterday' },
  { name: 'Mom', kind: 'Outgoing', length: '41:07', when: 'Saturday' }
];

const initialsOf = (name: string): string =>
  name
    .split(' ')
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

/** FaceTime：通话记录、通话中的计时与静音/摄像头开关，「New FaceTime」弹出面板里选人拨号。 */
@Component({
  selector: 'app-facetime',
  imports: [Icon, TrafficLights],
  host: { style: 'display: contents' },
  templateUrl: './facetime.html'
})
export class FaceTimeApp {
  private readonly popover = inject(PopoverService);
  private readonly toast = inject(Toast);
  /** 每次拨出加一，让通话中再拨号也能重置计时器。 */
  private readonly session = signal(0);

  protected readonly calls = signal<readonly Call[]>(CALLS);
  protected readonly selected = signal(0);
  protected readonly live = signal(false);
  protected readonly seconds = signal(0);
  protected readonly muted = signal(false);
  protected readonly camera = signal(false);
  protected readonly current = computed(() => this.calls()[this.selected()]);
  protected readonly initials = computed(() => initialsOf(this.current().name));
  protected readonly elapsed = computed(() => mmss(this.seconds()));

  constructor() {
    const menus = inject(DesktopMenus);
    inject(DesktopWindow).setMenus(computed(() => menus.standard('facetime')));
    /* 计时器只在通话中存在；挂在 effect 上，窗口关闭后再拨号也不会漏掉清理。 */
    effect(onCleanup => {
      this.session();
      if (!this.live()) return;
      const timer = setInterval(() => this.seconds.update(seconds => seconds + 1), 1000);
      onCleanup(() => clearInterval(timer));
    });
  }

  /** 点另一条记录会悄悄结束当前通话，不记入通话记录。 */
  protected select(index: number): void {
    this.selected.set(index);
    this.live.set(false);
  }

  protected start(): void {
    this.live.set(true);
    this.seconds.set(0);
    this.session.update(session => session + 1);
  }

  protected end(): void {
    this.live.set(false);
    const length = mmss(this.seconds());
    const selected = this.selected();
    this.calls.update(list =>
      list.map((call, i) => (i === selected ? { name: call.name, kind: 'Outgoing', length, when: 'Just now' } : call))
    );
    this.toast.show(`Call ended · ${length}`);
  }

  protected toggleMute(): void {
    this.muted.update(muted => !muted);
    this.toast.show(this.muted() ? 'Microphone off' : 'Microphone on');
  }

  protected toggleCamera(): void {
    this.camera.update(camera => !camera);
  }

  protected openNew(anchor: HTMLElement): void {
    const rect = anchor.getBoundingClientRect();
    this.popover.openComponent(
      NewFaceTime,
      { x: rect.left, y: rect.bottom + 6, origin: 'top left' },
      { dial: (name: string) => this.dial(name) }
    );
  }

  private dial(name: string): void {
    if (!name) {
      this.toast.show('Enter a name to call');
      return;
    }
    this.popover.close();
    this.calls.update(list => [{ name, kind: 'Outgoing', length: '', when: 'Just now' }, ...list]);
    this.selected.set(0);
    this.start();
  }
}
