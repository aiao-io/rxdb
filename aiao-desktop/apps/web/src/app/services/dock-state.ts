import { Service } from '@angular/core';

/** Dock 图标在屏幕上的中心与尺寸，最小化动画以它为终点。 */
export interface DockRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Dock 组件交出的操作面：弹跳与定位都依赖它自己的 DOM。 */
export interface DockView {
  bounce(appId: string): void;
  stopBounce(appId: string): void;
  rectFor(appId: string): DockRect;
  /** 把键盘焦点交给应用的 Dock 图标；图标不在（未固定的应用退出后）时交给相邻的图标。 */
  focusApp(appId: string): void;
}

/** 页面级的 Dock 协调者：转交给 Dock 组件的弹跳与定位（废纸篓满不满看 `FileSystem.trashFull`）。 */
@Service({ autoProvided: false })
export class DockState {
  private view: DockView | null = null;

  attach(view: DockView): void {
    this.view = view;
  }

  bounce(appId: string): void {
    this.dock().bounce(appId);
  }

  stopBounce(appId: string): void {
    this.dock().stopBounce(appId);
  }

  rectFor(appId: string): DockRect {
    return this.dock().rectFor(appId);
  }

  /** 键盘焦点交给应用的 Dock 图标：窗口全部关闭或最小化之后，焦点有处可去，按 Enter 就能再打开。 */
  focusApp(appId: string): void {
    this.dock().focusApp(appId);
  }

  private dock(): DockView {
    if (!this.view) throw new Error('Dock view is not attached');
    return this.view;
  }
}
