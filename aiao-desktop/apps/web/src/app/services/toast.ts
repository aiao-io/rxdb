import { Service, signal } from '@angular/core';

/** 没有真实去处的操作用一条短提示代替，2.1 秒后自动消失。 */
@Service({ autoProvided: false })
export class Toast {
  private readonly messageState = signal('');
  private readonly visibleState = signal(false);
  private timer: ReturnType<typeof setTimeout> | undefined;

  readonly message = this.messageState.asReadonly();
  readonly visible = this.visibleState.asReadonly();

  show(message: string): void {
    this.messageState.set(message);
    this.visibleState.set(true);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.visibleState.set(false), 2100);
  }
}
