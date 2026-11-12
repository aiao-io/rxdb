import { Service, signal } from '@angular/core';

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
}

/** 页面级的 Dock 协调者：废纸篓状态，以及转交给 Dock 组件的弹跳与定位。 */
@Service({ autoProvided: false })
export class DockState {
  private view: DockView | null = null;
  readonly trashFull = signal(false);

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

  private dock(): DockView {
    if (!this.view) throw new Error('Dock view is not attached');
    return this.view;
  }
}
