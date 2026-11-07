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

@Component({
  selector: 'app-devices-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card bg-base-100 shadow-sm" data-testid="devices-panel">
      <div class="card-body gap-3 p-4">
        <div class="flex items-center justify-between gap-2">
          <h2 class="card-title text-base">附近的设备</h2>
          <span class="badge badge-ghost badge-sm">{{ workspace.reachable().length }} 台</span>
        </div>
        <p class="text-base-content/60 text-sm">下载时会自动连接，也可以先连接设备。</p>
        @if (workspace.signalingState() === 'rejected') {
          <div class="alert alert-warning text-sm" data-testid="signaling-rejected" role="status">
            信令拒绝了本机凭据（登录已失效、账号被封禁，或本设备被管理员移出）：已连接的设备仍可传文件；刷新页面或重新登录后再试，仍被拒绝请联系管理员。
          </div>
        } @else if (workspace.signalingState() !== 'online') {
          <div class="alert alert-warning text-sm" role="status">
            信令不可达：已连接的设备仍可传文件，发现新设备和重新连接需要等服务恢复。
          </div>
        }
        <ul class="flex flex-col gap-2">
          @for (peer of workspace.reachable(); track peer.key) {
            <li
              class="bg-base-200 rounded-box flex items-center gap-3 p-3"
              [attr.data-peer]="peer.deviceName"
              data-testid="peer-row"
            >
              <span class="status status-success" aria-hidden="true"></span>
              <div class="min-w-0 flex-1">
                <div class="font-medium break-words">{{ peer.deviceName }}</div>
                <div class="text-base-content/60 text-xs break-all">{{ peer.userName }}</div>
              </div>
              @if (linkOf(peer)?.state === 'ready') {
                <div class="flex shrink-0 flex-col items-end gap-1">
                  <span class="badge badge-success badge-sm">已连接</span>
                  <button class="btn btn-ghost btn-xs" (click)="disconnect(peer)" type="button">断开</button>
                </div>
              } @else {
                <button
                  class="btn btn-sm shrink-0"
                  [disabled]="
                    pending().has(peer.key) ||
                    linkOf(peer)?.state === 'connecting' ||
                    workspace.signalingState() !== 'online'
                  "
                  (click)="connect(peer)"
                  data-testid="peer-connect"
                  type="button"
                >
                  @if (pending().has(peer.key) || linkOf(peer)?.state === 'connecting') {
                    <span class="loading loading-spinner loading-xs" aria-hidden="true"></span>连接中
                  } @else {
                    {{ linkOf(peer)?.state === 'closed' ? '重新连接' : '连接' }}
                  }
                </button>
              }
            </li>
          } @empty {
            <li class="rounded-box border-base-300 border border-dashed p-4 text-sm">
              <p class="font-medium">让另一台设备也加入</p>
              <ol class="text-base-content/60 mt-2 list-inside list-decimal space-y-1">
                <li>连接同一局域网。</li>
                <li>在另一台设备打开本页并登录。</li>
                <li>保持页面打开，设备会自动出现在这里。</li>
              </ol>
              <p class="text-base-content/60 mt-3 text-xs">只有一台电脑？用另一个浏览器或无痕窗口登录也可以。</p>
            </li>
          }
        </ul>
        @if (error(); as message) {
          <div class="alert alert-error text-sm" role="alert">{{ message }}</div>
        }
        <details class="border-base-200 border-t pt-3" data-testid="connection-details">
          <summary class="text-base-content/60 cursor-pointer text-sm">
            连接详情（{{ workspace.links().length }}）
          </summary>
          <ul class="mt-3 flex flex-col gap-2 text-xs" data-testid="session-list">
            @for (link of workspace.links(); track link.connectionId) {
              <li class="flex flex-wrap items-center gap-2" [attr.data-state]="link.state" data-testid="session-row">
                <span class="font-medium">{{ link.peer.deviceName }}</span>
                <span class="opacity-60">{{ link.role === 'initiator' ? '发起' : '响应' }}</span>
                <span class="badge badge-xs" [class]="link.state === 'ready' ? 'badge-success' : 'badge-ghost'">{{
                  stateLabel(link)
                }}</span>
                @for (protocol of link.protocols; track protocol) {
                  <span class="badge badge-xs badge-outline">{{ protocol }}</span>
                }
                <span class="opacity-60">↑{{ link.totals.sent }} ↓{{ link.totals.received }} 帧</span>
              </li>
            } @empty {
              <li class="text-base-content/60">还没有连接记录。下载时会自动连接。</li>
            }
          </ul>
        </details>
      </div>
    </section>
  `
})
export class DevicesPanel {
  readonly #latestLinks = computed(() => {
    const byPeer = new Map<string, LinkView>();
    const priority = { closed: 0, connecting: 1, ready: 2 };
    for (const link of this.workspace.links()) {
      const existing = byPeer.get(link.peer.key);
      if (!existing || priority[link.state] > priority[existing.state]) byPeer.set(link.peer.key, link);
    }
    return byPeer;
  });
  readonly workspace = inject(P2PWorkspace);
  readonly error = signal<string | null>(null);
  readonly pending = signal<ReadonlySet<string>>(new Set());

  linkOf(peer: SignalingPeer): LinkView | undefined {
    return this.#latestLinks().get(peer.key);
  }

  stateLabel(link: LinkView): string {
    if (link.state === 'ready') return '已连接';
    if (link.state === 'connecting') return '连接中';
    return CLOSE_LABELS[link.closeCode ?? 'closed'] ?? (link.closeCode as string);
  }

  async connect(peer: SignalingPeer): Promise<void> {
    if (this.pending().has(peer.key)) return;
    this.error.set(null);
    this.pending.update(current => new Set([...current, peer.key]));
    try {
      await this.workspace.connect(peer.key);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.pending.update(current => new Set([...current].filter(key => key !== peer.key)));
    }
  }

  disconnect(peer: SignalingPeer): void {
    this.error.set(null);
    try {
      const link = this.linkOf(peer);
      if (link) this.workspace.disconnect(link.connectionId);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    }
  }
}
