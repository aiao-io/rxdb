import { Signal, Type, WritableSignal, signal } from '@angular/core';
import { Subject } from 'rxjs';

import { DesktopAppDefinition, DesktopAppId, DesktopOpenOptions, RestoreOptions } from './desktop-apps';
import { MenuSection } from './menu';

export interface WindowBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** 登记表没写最小尺寸时窗口的最小宽、高。 */
export const DEFAULT_MIN_WIDTH = 380;
export const DEFAULT_MIN_HEIGHT = 240;

/** 内容相同就视为没变：几何、开窗参数这类每次都新建对象的值，用它免得没变化也通知依赖者。 */
const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** 窗口框架组件交给窗口管理器的操作面：几何与动画都留在组件里。 */
export interface WindowFrameHandle {
  minimize(): void;
  restore(): void;
  toggleZoom(): void;
  keepOnScreen(): void;
}

/**
 * 应用实例的生命周期（D-18）：`registered → loading → ready → closing → closed`，装载失败走 `failed`。
 * 最小化、前台 / 后台、缩放是窗口的呈现状态，与它正交，由窗口管理器管。
 */
export type AppInstanceState = 'registered' | 'loading' | 'ready' | 'closing' | 'closed' | 'failed';

/**
 * 一个已打开的窗口。窗口框架把它注入给应用组件，应用用它改标题、登记菜单、
 * 监听缩放与关闭。
 */
export class DesktopWindow {
  private readonly menusState = signal<Signal<readonly MenuSection[]> | null>(null);
  readonly appId: DesktopAppId;
  readonly title: WritableSignal<string>;
  readonly zIndex = signal(0);
  readonly opening = signal(true);
  readonly closing = signal(false);
  readonly minimized = signal(false);
  /** 窗口完全收进 Dock（最小化动画结束）时为 true，还原动画开始前变回 false。 */
  readonly hidden = signal(false);
  readonly zoomed = signal(false);
  /** 用户拖动缩放把手松手后触发。 */
  readonly afterResize = new Subject<void>();
  /** 关闭动画开始前触发，应用在这里释放资源。 */
  readonly beforeClose = new Subject<void>();
  readonly minWidth: number;
  readonly minHeight: number;
  /**
   * 窗口当前的几何（缩放前的盒子：窗口缩放到全屏时它仍是还原后的位置与大小）。窗口框架在拖动、缩放、还原与视口修正
   * 结束时写入，逐帧的拖动位置只在 DOM 里；窗口布局（ADESK-US-104）据此记录，内容没变不通知。
   */
  readonly box: WritableSignal<WindowBox>;
  /**
   * 应用想让刷新后恢复的开窗参数（{@link RestoreOptions}）。`null` 表示应用没有上报过，按开窗参数记；
   * 参数会随用户操作变化的应用主动更新它，例如 Finder 换目录。内容没变不通知。
   */
  readonly restoreOptions = signal<RestoreOptions | null>(null, { equal: sameJson });
  /** 应用实例的生命周期状态，由应用运行时推进。 */
  readonly state = signal<AppInstanceState>('registered');
  /** 装载失败的原因；没有失败时为 `null`。 */
  readonly failure = signal<string | null>(null);
  /** 已装载的应用组件；`ready` 之前为 `null`。 */
  readonly content = signal<Type<unknown> | null>(null);
  /** 实例序号：每次（重新）启动加一；迟到的装载结果按它丢弃，不会让旧实例影响新实例。 */
  attempt = 0;

  readonly menus = this.menusState.asReadonly();

  frame: WindowFrameHandle | null = null;
  /** 最小化与还原动画进行中。 */
  busy = false;

  /** 当前实例的标识：窗口 id 加实例序号。重试创建的是新实例，旧实例的迟到消息按它丢弃。 */
  get instanceId(): string {
    return `${this.id}#${this.attempt}`;
  }

  constructor(
    readonly id: string,
    readonly app: DesktopAppDefinition,
    readonly options: DesktopOpenOptions,
    readonly initialBox: WindowBox
  ) {
    this.appId = app.id;
    this.title = signal(app.name);
    this.minWidth = app.minW ?? DEFAULT_MIN_WIDTH;
    this.minHeight = app.minH ?? DEFAULT_MIN_HEIGHT;
    this.box = signal(initialBox, { equal: sameJson });
  }

  /** 应用登记自己的菜单栏；传入 computed 时菜单会随应用状态刷新，传 `null` 撤销登记（菜单栏回到标准菜单）。 */
  setMenus(menus: Signal<readonly MenuSection[]> | null): void {
    this.menusState.set(menus);
  }
}
