import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DemoSession } from './demo-session';

/**
 * 切换身份失败，或会话已经在别处换成了另一个身份。
 *
 * @remarks
 * 会话保存在浏览器里、所有标签页共用。别的标签页换了身份之后，本页还开着上一个身份的本地库：
 * 同步前的身份守卫会拦下所有远端读写并报身份不匹配（US-035），本地数据不动。重新加载就会打开新身份的库。
 */
@Component({
  selector: 'app-session-notice',
  template: `
    @if (session.$sessionMoved()) {
      <div class="alert alert-info rounded-none" data-testid="session-moved" role="alert">
        <span>
          浏览器里的会话已经换成另一个身份（可能是在别的标签页切换的）。本页还开着上一个身份的本地库，
          同步会被身份守卫拦下，本地数据不动。
        </span>
        <button class="btn btn-sm" (click)="session.reload()" type="button">重新加载</button>
      </div>
    }
    @if (session.$error(); as error) {
      <div class="alert alert-error rounded-none" role="alert">切换身份失败：{{ error }}</div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SessionNotice {
  readonly session = inject(DemoSession);
}
