import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { SignalingPeer } from '../../../shared/signaling-protocol';
import { P2PWorkspace } from '../p2p/p2p-workspace.service';
import type { LinkView } from '../p2p/peer-links';

const CLOSE_LABELS: Readonly<Record<string, string>> = {
  closed: '本端关闭',
  peer_closed: '对端关闭',
  peer_lost: '对端失联（心跳超时）',
  unauthorized: '认证失败',
  incompatible: '协议版本不兼容',
  protocol_violation: '对端违反协议',
  duplicate: '重复连接，已去重',
  transport_failed: '通道断开'
};

/** 在线设备与会话。 */
@Component({
  selector: 'app-devices-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card bg-base-100 shadow-sm" data-testid="devices-panel">
      <div class="card-body gap-3 p-4">
        <h2 class="card-title text-base">在线设备</h2>
        @if (workspace.signalingState() !== 'online') {
          <div role="status" class="alert alert-warning text-sm">
            信令{{ workspace.signalingState() === 'rejected' ? '拒绝了本机凭据' : '不可达' }}：已建立的会话照常工作，新连接要等信令恢复。
          </div>
        }
        <ul class="flex flex-col gap-2">
          @for (peer of workspace.peers(); track peer.key) {
            <li class="bg-base-200 flex items-center gap-3 rounded-box p-3" data-testid="peer-row" [attr.data-peer]="peer.deviceName">
              <span class="status status-success"></span>
              <div class="min-w-0 flex-1">
                <div class="truncate font-medium">{{ peer.deviceName }}</div>
                <div class="truncate text-xs opacity-60">{{ peer.userName }}</div>
              </div>
              @if (linkOf(peer); as link) {
                <span class="badge badge-sm" [class]="link.state === 'ready' ? 'badge-success' : 'badge-ghost'">
                  {{ stateLabel(link) }}
                </span>
                @if (link.state === 'ready') {
                  <button class="btn btn-ghost btn-xs" type="button" (click)="workspace.disconnect(link.connectionId)">断开</button>
                }
              } @else {
                <button class="btn btn-xs" type="button" data-testid="peer-connect" (click)="connect(peer)">连接</button>
              }
            </li>
          } @empty {
            <li class="text-sm opacity-60">还没有别的设备在线。换一个浏览器（或无痕窗口）用同一账号登录试试。</li>
          }
        </ul>
        @if (error(); as message) {
          <div role="alert" class="alert alert-error text-sm">{{ message }}</div>
        }
        <h3 class="mt-2 text-sm font-semibold">会话</h3>
        <ul class="flex flex-col gap-1 text-xs" data-testid="session-list">
          @for (link of workspace.links(); track link.connectionId) {
            <li class="flex flex-wrap items-center gap-2" data-testid="session-row" [attr.data-state]="link.state">
              <span class="font-medium">{{ link.peer.deviceName }}</span>
              <span class="opacity-60">{{ link.role === 'initiator' ? '发起' : '响应' }}</span>
              <span class="badge badge-xs" [class]="link.state === 'ready' ? 'badge-success' : 'badge-ghost'">{{ stateLabel(link) }}</span>
              @for (protocol of link.protocols; track protocol) {
                <span class="badge badge-xs badge-outline">{{ protocol }}</span>
              }
              <span class="opacity-60">↑{{ link.totals.sent }} ↓{{ link.totals.received }} 帧</span>
            </li>
          } @empty {
            <li class="opacity-60">还没有会话。下载别人持有的文件时会自动连接。</li>
          }
        </ul>
      </div>
    </section>
  `
})
export class DevicesPanel {
  /** 每台设备最相关的一条连接：有就绪的取就绪的，否则取最新的。 */
  readonly #latestLinks = computed(() => {
    const byPeer = new Map<string, LinkView>();
    for (const link of this.workspace.links()) if (!byPeer.has(link.peer.key) || link.state === 'ready') byPeer.set(link.peer.key, link);
    return byPeer;
  });
  readonly workspace = inject(P2PWorkspace);
  readonly error = signal<string | null>(null);

  linkOf(peer: SignalingPeer): LinkView | undefined {
    const link = this.#latestLinks().get(peer.key);
    return link?.state === 'closed' ? undefined : link;
  }

  stateLabel(link: LinkView): string {
    if (link.state === 'ready') return '已就绪';
    if (link.state === 'connecting') return '连接中';
    return CLOSE_LABELS[link.closeCode ?? 'closed'] ?? (link.closeCode as string);
  }

  async connect(peer: SignalingPeer): Promise<void> {
    this.error.set(null);
    try {
      await this.workspace.connect(peer.key);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    }
  }
}
