import { DestroyRef, Service, inject, signal } from '@angular/core';

/** 每秒跳一次的桌面时钟，菜单栏、小组件、锁屏和时钟应用共用。 */
@Service({ autoProvided: false })
export class Clock {
  private readonly nowState = signal(new Date());
  readonly now = this.nowState.asReadonly();

  constructor() {
    const timer = setInterval(() => this.nowState.set(new Date()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }
}
