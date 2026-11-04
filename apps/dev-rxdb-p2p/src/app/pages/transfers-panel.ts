import { formatFileSize } from '@aiao/utils';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { P2PWorkspace } from '../p2p/p2p-workspace.service';
import { SERVER_SOURCE, type TransferView } from '../p2p/transfer-progress';

/** 来源配色：按来源在本次下载里的顺序取色，服务器回退固定灰色。 */
const SOURCE_COLORS = ['bg-primary', 'bg-secondary', 'bg-accent', 'bg-info', 'bg-warning'] as const;

const STATE_LABELS: Readonly<Record<TransferView['state'], string>> = {
  running: '传输中',
  done: '完成，SHA-256 与清单一致',
  failed: '失败',
  cancelled: '已取消'
};

/** 下载：进度、块图（每格一块，按来源着色）、来源与结果。 */
@Component({
  selector: 'app-transfers-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card bg-base-100 shadow-sm" data-testid="transfers-panel">
      <div class="card-body gap-3 p-4">
        <h2 class="card-title text-base">传输</h2>
        @for (transfer of workspace.transfers(); track transfer.id) {
          <article class="bg-base-200 rounded-box flex flex-col gap-2 p-3" data-testid="transfer" [attr.data-state]="transfer.state">
            <div class="flex flex-wrap items-center gap-2">
              <span class="flex-1 truncate font-medium">{{ transfer.fileName }}</span>
              <span class="badge badge-sm" [class]="stateClass(transfer)" data-testid="transfer-state">{{ stateLabel(transfer) }}</span>
              <span class="badge badge-sm badge-outline">{{ transfer.route === 'p2p' ? 'P2P 直传' : '服务器回退' }}</span>
              @if (transfer.state === 'running') {
                <button class="btn btn-ghost btn-xs" type="button" data-testid="transfer-cancel" (click)="workspace.cancel(transfer.id)">取消</button>
              }
            </div>
            <progress class="progress progress-primary w-full" [value]="transfer.bytes" [max]="transfer.size"></progress>
            <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-70">
              <span>{{ size(transfer.bytes) }} / {{ size(transfer.size) }}</span>
              <span>{{ throughput(transfer) }}</span>
              @if (transfer.rejected) {
                <span class="text-error" data-testid="transfer-rejected">{{ transfer.rejected }} 个坏块被丢弃并换源重拉</span>
              }
            </div>
            <div class="flex flex-wrap gap-[2px]" aria-label="块图">
              @for (source of transfer.chunks; track $index) {
                <span class="h-2 w-2 rounded-[1px]" [class]="colorOf(transfer, source)" [title]="source ?? '等待中'"></span>
              }
            </div>
            <div class="flex flex-wrap gap-2 text-xs">
              @for (source of transfer.sources; track source) {
                <span class="flex items-center gap-1"><span class="h-2 w-2 rounded-[1px]" [class]="colorOf(transfer, source)"></span>{{ source }}</span>
              }
              <span class="flex items-center gap-1"><span class="bg-neutral h-2 w-2 rounded-[1px]"></span>服务器</span>
            </div>
            @if (transfer.error) {
              <div class="text-error text-xs" data-testid="transfer-error">{{ transfer.error }}</div>
            }
          </article>
        } @empty {
          <p class="text-sm opacity-60">还没有下载。</p>
        }
      </div>
    </section>
  `
})
export class TransfersPanel {
  readonly workspace = inject(P2PWorkspace);

  size(bytes: number): string {
    return formatFileSize(bytes);
  }

  stateLabel(transfer: TransferView): string {
    return STATE_LABELS[transfer.state];
  }

  stateClass(transfer: TransferView): string {
    if (transfer.state === 'done') return 'badge-success';
    if (transfer.state === 'failed') return 'badge-error';
    return 'badge-ghost';
  }

  throughput(transfer: TransferView): string {
    const seconds = ((transfer.finishedAt ?? Date.now()) - transfer.startedAt) / 1000;
    return seconds > 0 ? `${formatFileSize(transfer.bytes / seconds)}/s · ${seconds.toFixed(1)} s` : '';
  }

  colorOf(transfer: TransferView, source: string | null): string {
    if (source === null) return 'bg-base-300';
    if (source === SERVER_SOURCE) return 'bg-neutral';
    return SOURCE_COLORS[transfer.sources.indexOf(source) % SOURCE_COLORS.length] ?? 'bg-primary';
  }
}
