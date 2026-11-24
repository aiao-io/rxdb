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
          远端同步已连接，仅适用于本地演示。Todo 走未分区的日志同步：日志对所有登录身份（包括匿名用户）可见，
          <code>createdBy</code> 和 <code>updatedBy</code> 只是客户端生成的标识，不能证明用户身份。
          商品目录按身份分区同步：访客只读得到公开区，账号按所在租户读取。演示账号的口令写在前端，成员关系可以自助加入、退出；
          生产环境请关闭匿名登录，由服务端维护成员关系与 RLS。
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
