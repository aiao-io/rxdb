import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LucideDynamicIcon, LucideTriangleAlert as TriangleAlert } from '@lucide/angular';
import { RemoteSyncState } from './remote-sync-state';

@Component({
  selector: 'app-remote-security-notice',
  imports: [LucideDynamicIcon],
  template: `
    @if (remoteSync.$connected()) {
      <div class="alert alert-warning rounded-none" role="alert">
        <svg [lucideIcon]="TriangleAlert" aria-hidden="true" size="18"></svg>
        <span>
          远端同步已连接，但此 demo 只用匿名登录取得会话，没有正式的身份认证，也没有按用户隔离的行级安全策略（RLS）：
          同步日志对所有登录者（包括匿名访客）可见。
          <code>createdBy</code> 和 <code>updatedBy</code> 只是客户端生成的标识，不能证明用户身份；仅适用于本地演示。
          生产环境请关闭匿名登录，启用正式的 Supabase Auth 与 RLS。
        </span>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RemoteSecurityNotice {
  readonly remoteSync = inject(RemoteSyncState);
  readonly TriangleAlert = TriangleAlert;
}
