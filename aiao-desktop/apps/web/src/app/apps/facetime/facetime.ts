import { Component, computed, effect, inject, signal, untracked } from '@angular/core';

import { DesktopData } from '../../data/desktop-data';
import { ALL_ROWS, liveQuery } from '../../data/live-query';
import { Clock } from '../../services/clock';
import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { PopoverService } from '../../services/popover';
import { Toast } from '../../services/toast';
import { mmss } from '../../shared/format';
import { Icon } from '../../shared/icon';
import { TrafficLights } from '../../shared/traffic-lights';
import { lengthLabel, whenLabel } from './facetime-log';
import { FaceTimeCall } from './facetime.entities';
import { NewFaceTime } from './new-facetime';

/** 通话列表里的一行：库里的记录，加上界面用的时长与时间文字。 */
interface Call {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly length: string;
  readonly when: string;
}

const initialsOf = (name: string): string =>
  name
    .split(' ')
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

/**
 * FaceTime：通话记录、通话中的计时与静音/摄像头开关，「New FaceTime」弹出面板里选人拨号。
 * 通话记录存在本地库里，所有 FaceTime 窗口共用，刷新后仍在。
 */
@Component({
  selector: 'app-facetime',
  imports: [Icon, TrafficLights],
  host: { style: 'display: contents' },
  templateUrl: './facetime.html'
})
export class FaceTimeApp {
  private readonly popover = inject(PopoverService);
  private readonly toast = inject(Toast);
  private readonly clock = inject(Clock);
  private readonly data = inject(DesktopData);
  private readonly rows = liveQuery(
    () => FaceTimeCall.findAll({ where: ALL_ROWS, orderBy: [{ field: 'startedAt', sort: 'desc' }] }),
    [],
    FaceTimeCall
  );
  /** 每次拨出加一，让通话中再拨号也能重置计时器。 */
  private readonly session = signal(0);
  /** 点选的那条记录的 id；还没点过时显示列表里的第一条。 */
  private readonly pickedId = signal<string | null>(null);
  /** 刚拨出、已经落库但还没出现在通话记录里的那条的 id：出现之后才选中它并开始通话，界面不会空一下。 */
  private readonly dialing = signal<string | null>(null);

  /** 新的在前；时间文字随桌面时钟更新（`Just now` 过一分钟就变成钟点）。 */
  protected readonly calls = computed((): readonly Call[] => {
    const now = this.clock.now();
    return this.rows().map(row => ({
      id: row.id,
      name: row.name,
      kind: row.kind,
      length: lengthLabel(row.kind, row.duration),
      when: whenLabel(row.startedAt, now)
    }));
  });
  protected readonly selected = computed(() => {
    const id = this.pickedId();
    return id === null ? 0 : this.calls().findIndex(call => call.id === id);
  });
  protected readonly live = signal(false);
  protected readonly seconds = signal(0);
  protected readonly muted = signal(false);
  protected readonly camera = signal(false);
  /** 选中的那条；列表还没读到，或刚拨出的通话还没出现在列表里时为 `undefined`。 */
  protected readonly current = computed((): Call | undefined => {
    const index = this.selected();
    return index < 0 ? undefined : this.calls()[index];
  });
  protected readonly initials = computed(() => initialsOf(this.current()?.name ?? ''));
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
    effect(() => {
      const id = this.dialing();
      if (id === null || !this.rows().some(row => row.id === id)) return;
      untracked(() => {
        this.dialing.set(null);
        this.pickedId.set(id);
        this.start();
      });
    });
  }

  /** 点另一条记录会悄悄结束当前通话，不记入通话记录。 */
  protected select(index: number): void {
    this.pickedId.set(this.calls()[index].id);
    this.live.set(false);
  }

  protected start(): void {
    this.live.set(true);
    this.seconds.set(0);
    this.session.update(session => session + 1);
  }

  protected end(): void {
    this.live.set(false);
    const seconds = this.seconds();
    void this.record(seconds);
    this.toast.show(`Call ended · ${mmss(seconds)}`);
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
      { dial: (name: string) => void this.dial(name) }
    );
  }

  /** 通话结束：选中的那条记成一次打出的、通了这么久的通话。 */
  private async record(seconds: number): Promise<void> {
    const id = this.current()?.id;
    const call = this.rows().find(row => row.id === id);
    if (!call) throw new Error('通话结束时没有选中的通话记录');
    const startedAt = new Date(Date.now() - seconds * 1000);
    await (await this.data.repository(FaceTimeCall)).update(call, { kind: 'Outgoing', duration: seconds, startedAt });
  }

  private async dial(name: string): Promise<void> {
    if (!name) {
      this.toast.show('Enter a name to call');
      return;
    }
    this.popover.close();
    const call = this.data.instantiate(FaceTimeCall, { name, kind: 'Outgoing', duration: 0, startedAt: new Date() });
    const saved = await (await this.data.repository(FaceTimeCall)).create(call);
    this.dialing.set(saved.id);
  }
}
