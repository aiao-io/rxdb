import { CdkConnectedOverlay, CdkOverlayOrigin, type ConnectedPosition } from '@angular/cdk/overlay';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { LucideCloudExclamationPoint as CloudExclamationPoint, LucideDynamicIcon } from '@lucide/angular';
import { RemoteSyncState } from './remote-sync-state';

/** 提示框挂在图标下方：图标靠顶栏右侧，优先与它右对齐，放不下再左对齐 */
const PANEL_POSITIONS: ConnectedPosition[] = [
  { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 8 },
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 8 }
];

/**
 * 远端同步连上时，顶栏上的提示图标；点开是安全提示。
 *
 * @remarks
 * 顶栏每个页面都有：提示收成一个图标，不在页面顶部占一整行。提示框插在图标后面（inline popover），
 * 读屏按文档顺序读完图标就是提示内容；再点图标、点别处或按 Esc 收起。
 */
@Component({
  selector: 'app-remote-security-notice',
  imports: [CdkConnectedOverlay, CdkOverlayOrigin, LucideDynamicIcon],
  template: `
    @if (remoteSync.$connected()) {
      <button
        class="btn btn-warning btn-sm btn-circle"
        #trigger="cdkOverlayOrigin"
        [attr.aria-controls]="$open() ? 'remote-security-notice' : null"
        [attr.aria-expanded]="$open()"
        (click)="toggle()"
        aria-haspopup="dialog"
        aria-label="远端同步已连接，查看安全提示"
        cdkOverlayOrigin
        data-testid="remote-security-toggle"
        title="远端同步已连接，仅适用于本地演示"
        type="button"
      >
        <svg [lucideIcon]="CloudExclamationPoint" aria-hidden="true" size="18"></svg>
      </button>
      <ng-template
        [cdkConnectedOverlayOpen]="$open()"
        [cdkConnectedOverlayOrigin]="trigger"
        [cdkConnectedOverlayPositions]="positions"
        [cdkConnectedOverlayPush]="true"
        [cdkConnectedOverlayViewportMargin]="8"
        (detach)="close()"
        (overlayOutsideClick)="close()"
        cdkConnectedOverlay
        cdkConnectedOverlayUsePopover="inline"
      >
        <div
          class="bg-base-100 text-base-content border-base-300 rounded-box w-[min(26rem,calc(100vw-2rem))] border p-4 text-sm shadow-xl"
          id="remote-security-notice"
          aria-labelledby="remote-security-title"
          data-testid="remote-security-notice"
          role="dialog"
        >
          <h2 class="font-semibold" id="remote-security-title">远端同步已连接</h2>
          <p class="text-base-content/70 mt-1">
            仅适用于本地演示：同步日志对所有登录身份可见，本地栈的 todos 表没开 RLS。
          </p>
          <ul class="mt-3 flex list-disc flex-col gap-1 ps-5">
            <li>
              Todo 走未分区的日志同步：日志对所有登录身份（包括匿名用户）可见，<code>createdBy</code> 和
              <code>updatedBy</code> 只是客户端生成的标识，不能证明用户身份。
            </li>
            <li>本地栈与适配器测试共用，todos 表没开 RLS，拿到 anon key 就能直接读写。</li>
            <li>商品目录按身份分区同步：访客只读得到公开区，账号按所在租户读取。</li>
            <li>
              演示账号的口令写在前端，成员关系可以自助加入、退出；生产环境请关闭匿名登录，由服务端维护成员关系与 RLS。
            </li>
          </ul>
        </div>
      </ng-template>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RemoteSecurityNotice {
  readonly #open = signal(false);
  readonly remoteSync = inject(RemoteSyncState);
  readonly positions = PANEL_POSITIONS;
  readonly CloudExclamationPoint = CloudExclamationPoint;

  /** 提示框展开着 */
  readonly $open = this.#open.asReadonly();

  toggle(): void {
    this.#open.update(open => !open);
  }

  close(): void {
    this.#open.set(false);
  }
}
