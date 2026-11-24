import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LucideDynamicIcon, LucideTriangleAlert as TriangleAlert } from '@lucide/angular';
import { RemoteSyncState } from './remote-sync-state';

/**
 * 远端同步连上时的安全提示。
 *
 * @remarks
 * 摘要一行常驻、说清要点，细节折叠：每个页面顶部都有它，整段展开会把页面内容挤到首屏之外。
 */
@Component({
  selector: 'app-remote-security-notice',
  imports: [LucideDynamicIcon],
  template: `
    @if (remoteSync.$connected()) {
      <div class="alert alert-warning rounded-none py-2" data-testid="remote-security-notice" role="alert">
        <svg [lucideIcon]="TriangleAlert" aria-hidden="true" size="18"></svg>
        <details class="min-w-0 text-sm">
          <summary class="cursor-pointer select-none">
            远端同步已连接，仅适用于本地演示：同步日志对所有登录身份可见，本地栈的 todos 表没开 RLS
          </summary>
          <p class="mt-1">
            Todo 走未分区的日志同步：日志对所有登录身份（包括匿名用户）可见，
            <code>createdBy</code> 和 <code>updatedBy</code> 只是客户端生成的标识，不能证明用户身份。
            本地栈与适配器测试共用，todos 表没开 RLS，拿到 anon key 就能直接读写。
            商品目录按身份分区同步：访客只读得到公开区，账号按所在租户读取。演示账号的口令写在前端，成员关系可以自助加入、退出；
            生产环境请关闭匿名登录，由服务端维护成员关系与 RLS。
          </p>
        </details>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RemoteSecurityNotice {
  readonly remoteSync = inject(RemoteSyncState);
  readonly TriangleAlert = TriangleAlert;
}
