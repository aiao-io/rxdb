import { DOCUMENT } from '@angular/common';
import { DestroyRef, Service, computed, inject, signal } from '@angular/core';

import { DesktopAppId } from './desktop-apps';
import { DockLayoutStore } from './dock-layout';

/** 拖动从哪里来：Dock 里的固定图标（调整顺序）、Launchpad 的图标、Finder 里 Applications 的 `.app` 条目。 */
export type DockDragSource = 'dock' | 'launchpad' | 'finder';

/** 拖动中的状态，Dock 据此画跟手的图标与插入位置。 */
export interface DockDragState {
  readonly appId: DesktopAppId;
  readonly source: DockDragSource;
  /** 指针在视口里的位置。 */
  readonly x: number;
  readonly y: number;
  /** 松手后应用会落在的槽位；指针不在 Dock 上、或这次松手不会有效果（已固定的再拖入）时为 `null`。 */
  readonly slot: number | null;
  /** Dock 里的固定图标被拖出了 Dock，松手会取消固定（只对可移除项成立）。 */
  readonly removing: boolean;
}

/** Dock 交给控制器的几何：它自己的 DOM 只有它知道。 */
export interface DockDropTarget {
  /** 指针是否在 Dock 的接收范围内（比玻璃面板本身略大）。 */
  accepts(x: number, y: number): boolean;
  /** 指针 x 对应的插入槽位，不把正在拖动的应用算在内。 */
  slotAt(x: number, appId: DesktopAppId): number;
}

/** 位移不到这个距离不算拖动，免得吞掉普通的点击与双击。 */
const DRAG_THRESHOLD = 4;

interface DragSession {
  readonly appId: DesktopAppId;
  readonly source: DockDragSource;
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  /** 位移超过阈值后才算真正在拖。 */
  started: boolean;
  /** Esc 取消后，要等指针松开才结束会话（并吞掉松手引发的点击）。 */
  cancelled: boolean;
}

/**
 * Dock 拖放（ADESK-US-205 AC#13、#14）：指针捕获的内部协议，不用 HTML5 原生拖放（桌面全局拦了 `dragstart`）。
 * 起拖的元素在按下时调用 `begin*`，之后的移动、松手、取消都由控制器在文档上监听；
 * 松手只把应用 id 与目标槽位交给 {@link DockLayoutStore}，不把文件体或任何网址交给 Dock。
 *
 * 三个来源的结果一致：Launchpad 或 Finder 的图标拖进 Dock 就是固定到那个槽位（已固定的不重复），
 * Dock 里的固定图标在 Dock 内拖动就是调整顺序，拖出 Dock 就是取消固定（不可移除的项回到原位）。
 */
@Service({ autoProvided: false })
export class DockDragController {
  private readonly document = inject(DOCUMENT);
  private readonly layout = inject(DockLayoutStore);
  private readonly stateSignal = signal<DockDragState | null>(null);
  private target: DockDropTarget | null = null;
  private session: DragSession | null = null;

  /** 正在拖动时的状态；没有拖动（含还没过阈值）时为 `null`。 */
  readonly state = this.stateSignal.asReadonly();
  readonly active = computed(() => this.stateSignal() !== null);
  /** 当前的插入槽位；只在槽位变化时通知，指针移动不会触发 Dock 重排。 */
  readonly dropSlot = computed(() => this.stateSignal()?.slot ?? null);
  /** Dock 里被拖起的固定应用（它的格子在拖动中让出位置）。 */
  readonly lifted = computed(() => {
    const state = this.stateSignal();
    return state?.source === 'dock' ? state.appId : null;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.finish());
  }

  /** Dock 组件挂上时登记它的几何。 */
  attach(target: DockDropTarget): void {
    this.target = target;
  }

  beginFromDock(event: PointerEvent, appId: DesktopAppId): void {
    this.begin(event, appId, 'dock');
  }

  beginFromLaunchpad(event: PointerEvent, appId: DesktopAppId): void {
    this.begin(event, appId, 'launchpad');
  }

  /** Finder 里 Applications 的 `.app` 条目起拖；`appId` 来自 `ApplicationCatalog.appIdOf(node)`。 */
  beginFromFinder(event: PointerEvent, appId: DesktopAppId): void {
    this.begin(event, appId, 'finder');
  }

  /**
   * 在拖动源元素的 `pointerdown` 里调用：用指针捕获接管后续事件，位移过了阈值才开始拖。
   * 不能固定的应用（没有 `.app` 身份）不从外部来源起拖。
   * 同一个指针不可能在没松开的情况下再次按下，所以它的新一次按下说明旧会话的松手没有送到（比如在窗口外松开），旧会话作废。
   */
  begin(event: PointerEvent, appId: DesktopAppId, source: DockDragSource): void {
    this.dropTarget();
    if (event.button !== 0 || !event.isPrimary) return;
    if (this.session && this.session.pointerId !== event.pointerId) return;
    this.finish();
    if (source !== 'dock' && !this.layout.pinnable(appId)) return;
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    this.session = {
      appId,
      source,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      started: false,
      cancelled: false
    };
    this.document.addEventListener('pointermove', this.onMove);
    this.document.addEventListener('pointerup', this.onUp);
    this.document.addEventListener('pointercancel', this.onCancel);
    this.document.addEventListener('keydown', this.onKey, true);
  }

  /** 放弃进行中的拖动，不提交。 */
  cancel(): void {
    this.finish();
  }

  private readonly onMove = (event: Event): void => {
    const session = this.session;
    const pointer = event as PointerEvent;
    if (!session || session.cancelled || pointer.pointerId !== session.pointerId) return;
    if (!session.started) {
      if (Math.hypot(pointer.clientX - session.startX, pointer.clientY - session.startY) < DRAG_THRESHOLD) return;
      session.started = true;
    }
    this.stateSignal.set(this.describe(session, pointer.clientX, pointer.clientY));
  };

  private readonly onUp = (event: Event): void => {
    const session = this.session;
    const pointer = event as PointerEvent;
    if (!session || pointer.pointerId !== session.pointerId) return;
    const drop =
      session.started && !session.cancelled ? this.describe(session, pointer.clientX, pointer.clientY) : null;
    this.finish();
    if (session.started) this.swallowClick();
    if (drop) this.commit(drop);
  };

  private readonly onCancel = (event: Event): void => {
    if ((event as PointerEvent).pointerId === this.session?.pointerId) this.finish();
  };

  private readonly onKey = (event: Event): void => {
    const session = this.session;
    if ((event as KeyboardEvent).key !== 'Escape' || !session?.started || session.cancelled) return;
    event.stopPropagation();
    event.preventDefault();
    session.cancelled = true;
    this.stateSignal.set(null);
  };

  private describe(session: DragSession, x: number, y: number): DockDragState {
    const { appId, source } = session;
    const target = this.dropTarget();
    const over = target.accepts(x, y);
    const reorder = source === 'dock';
    const accepted = over && (reorder || !this.layout.pinned(appId));
    return {
      appId,
      source,
      x,
      y,
      slot: accepted ? target.slotAt(x, appId) : null,
      removing: reorder && !over && this.layout.canUnpin(appId)
    };
  }

  private commit({ appId, source, slot, removing }: DockDragState): void {
    if (slot !== null) {
      if (source === 'dock') this.layout.move(appId, slot);
      else this.layout.pin(appId, slot);
    } else if (removing) this.layout.unpin(appId);
  }

  private dropTarget(): DockDropTarget {
    if (!this.target) throw new Error('Dock drop target is not attached');
    return this.target;
  }

  /** 摘掉监听、清空状态；会话结束。 */
  private finish(): void {
    this.document.removeEventListener('pointermove', this.onMove);
    this.document.removeEventListener('pointerup', this.onUp);
    this.document.removeEventListener('pointercancel', this.onCancel);
    this.document.removeEventListener('keydown', this.onKey, true);
    this.session = null;
    this.stateSignal.set(null);
  }

  /**
   * 拖动结束后，松手会在捕获元素上引发一次点击（Launchpad 的图标会因此启动应用）：吞掉它。
   * 指针在窗口外松手时没有点击，下一轮任务摘掉监听，免得吞掉用户之后的点击。
   */
  private swallowClick(): void {
    const swallow = (event: Event): void => {
      event.stopPropagation();
      event.preventDefault();
    };
    this.document.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => this.document.removeEventListener('click', swallow, { capture: true }), 0);
  }
}
