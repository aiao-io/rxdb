import { DOCUMENT } from '@angular/common';
import { DestroyRef, InjectionToken, Service, inject, signal } from '@angular/core';

import { browserClipboard } from './browser-clipboard';
import { PrintableContent, printDocument } from './print-document';
import { Toast } from './toast';

/** 浏览器操作端口，便于验证拒绝、延迟与窗口销毁。 */
export interface ContentBrowser {
  copyText(text: string): Promise<void>;
  print(content: PrintableContent, signal: AbortSignal): Promise<void>;
}

/** 当前页面的真实剪贴板与打印能力。 */
export const CONTENT_BROWSER = new InjectionToken<ContentBrowser>('CONTENT_BROWSER', {
  factory: () => {
    const document = inject(DOCUMENT);
    return {
      copyText: text => browserClipboard().writeText(text),
      print: (content, signal) => printDocument(content, signal, document)
    };
  }
});

/** 每个应用窗口独立维护进行中状态与可见错误。 */
@Service({ autoProvided: false })
export class ContentActions {
  private readonly browser = inject(CONTENT_BROWSER);
  private readonly toast = inject(Toast);
  private readonly controller = new AbortController();
  private readonly working = signal(false);
  private readonly problem = signal('');

  readonly busy = this.working.asReadonly();
  readonly error = this.problem.asReadonly();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.controller.abort());
  }

  copy(text: string): Promise<void> {
    return this.perform('Copy', () => this.browser.copyText(text), 'shell.toast.copied');
  }

  print(content: PrintableContent): Promise<void> {
    return this.perform('Print', () => this.browser.print(content, this.controller.signal));
  }

  private async perform(name: string, action: () => Promise<void>, success?: string): Promise<void> {
    if (this.working() || this.controller.signal.aborted) return;
    this.working.set(true);
    this.problem.set('');
    try {
      await action();
      if (success && !this.controller.signal.aborted) this.toast.show(success);
    } catch (error) {
      if (!this.controller.signal.aborted) {
        const message = `${name} failed: ${error instanceof Error ? error.message : String(error)}`;
        this.problem.set(message);
        this.toast.show(message);
      }
    } finally {
      this.working.set(false);
    }
  }
}
