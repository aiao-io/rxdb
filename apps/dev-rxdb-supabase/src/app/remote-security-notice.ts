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
          远端同步已连接，但此 demo 未启用身份认证或行级安全策略（RLS）。
          <code>createdBy</code> 和 <code>updatedBy</code> 只是客户端生成的标识，不能证明用户身份；仅适用于本地演示。
          生产环境请启用 Supabase Auth 与 RLS。
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
