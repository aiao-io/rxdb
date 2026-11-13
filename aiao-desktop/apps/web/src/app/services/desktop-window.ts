import { Signal, WritableSignal, signal } from '@angular/core';
import { Subject } from 'rxjs';

import { DesktopAppDefinition, DesktopAppId, DesktopOpenOptions } from './desktop-apps';
import { MenuSection } from './menu';

export interface WindowBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** 窗口框架组件交给窗口管理器的操作面：几何与动画都留在组件里。 */
export interface WindowFrameHandle {
  minimize(): void;
  restore(): void;
  toggleZoom(): void;
  keepOnScreen(): void;
}

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

  readonly menus = this.menusState.asReadonly();

  frame: WindowFrameHandle | null = null;
  /** 最小化与还原动画进行中。 */
  busy = false;

  constructor(
    readonly id: string,
    readonly app: DesktopAppDefinition,
    readonly options: DesktopOpenOptions,
    readonly initialBox: WindowBox
  ) {
    this.appId = app.id;
    this.title = signal(app.name);
    this.minWidth = app.minW ?? 380;
    this.minHeight = app.minH ?? 240;
  }

  /** 应用登记自己的菜单栏；传入 computed 时菜单会随应用状态刷新。 */
  setMenus(menus: Signal<readonly MenuSection[]>): void {
    this.menusState.set(menus);
  }
}
