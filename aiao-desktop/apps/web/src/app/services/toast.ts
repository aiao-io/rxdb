import { I18N } from '@aiao/rxdb-i18n-angular';
import { Service, inject, signal } from '@angular/core';

/** 没有真实去处的操作用一条短提示代替，2.1 秒后自动消失。 */
@Service({ autoProvided: false })
export class Toast {
  /* 有 i18n 运行时就把消息当目录 key 翻译（未登记的字符串原样显示）；没有 provider 时保持原行为。 */
  private readonly i18n = inject(I18N, { optional: true }) ?? undefined;
  private readonly messageState = signal('');
  private readonly visibleState = signal(false);
  private timer: ReturnType<typeof setTimeout> | undefined;

  readonly message = this.messageState.asReadonly();
  readonly visible = this.visibleState.asReadonly();

  show(key: string, params: Record<string, unknown> = {}): void {
    this.messageState.set(this.i18n ? this.i18n.t(key, params) : key);
    this.visibleState.set(true);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.visibleState.set(false), 2100);
  }
}
