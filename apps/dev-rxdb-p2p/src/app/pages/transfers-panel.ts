import { formatFileSize } from '@aiao/utils';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { P2PWorkspace } from '../p2p/p2p-workspace.service';
import { SERVER_SOURCE, type TransferView } from '../p2p/transfer-progress';

const SOURCE_COLORS = ['bg-primary', 'bg-secondary', 'bg-accent', 'bg-info', 'bg-warning'] as const;
const STATE_LABELS: Readonly<Record<TransferView['state'], string>> = {
  running: '正在下载',
  done: '下载完成',
  failed: '下载失败',
  cancelled: '已取消'
};

@Component({
  selector: 'app-transfers-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card bg-base-100 shadow-sm" data-testid="transfers-panel">
      <div class="card-body gap-4 p-5">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="card-title text-base">下载记录</h2>
          @if (hasFinished()) {
            <button class="btn btn-ghost btn-sm" (click)="clearRecords()" data-testid="clear-transfers" type="button">
              清理已结束记录
            </button>
          }
        </div>
        @if (hasFinished()) {
          <p class="text-base-content/60 -mt-2 text-xs">清理记录不会删除文件，也不会中断正在进行的下载。</p>
        }
        @if (clearError(); as message) {
          <p class="text-error text-sm" role="alert">{{ message }}</p>
        }
        @for (transfer of workspace.transfers(); track transfer.id) {
          <article
            class="rounded-box border-base-200 border p-4"
            [attr.data-state]="transfer.state"
            data-testid="transfer"
          >
            <div class="flex flex-wrap items-start gap-2">
              <span class="min-w-0 flex-1 font-medium break-words">{{ transfer.fileName }}</span>
              <span class="badge badge-sm" [class]="stateClass(transfer)" data-testid="transfer-state">
                {{ stateLabel(transfer) }}
              </span>
              <span class="badge badge-sm badge-outline">
                {{ transfer.route === 'p2p' ? 'P2P 直传' : '服务器回退' }}
              </span>
            </div>
            <div class="mt-3 flex items-center justify-between gap-2 text-sm">
              <span class="text-base-content/60">{{ size(transfer.bytes) }} / {{ size(transfer.size) }}</span>
              <strong class="tabular-nums">{{ percentage(transfer) }}%</strong>
            </div>
            <progress
              class="progress progress-primary mt-1 w-full"
              [attr.aria-label]="transfer.fileName + ' 下载进度'"
              [max]="100"
              [value]="percentage(transfer)"
            ></progress>
            <div class="mt-2 flex flex-wrap items-center justify-between gap-3">
              @if (transfer.state === 'done') {
                <p class="text-base-content/60 text-sm">文件已接收，保存后即可在下载目录中打开。</p>
                <button
                  class="btn btn-primary btn-sm"
                  [disabled]="pending().has(transfer.id)"
                  (click)="save(transfer)"
                  data-testid="transfer-save"
                  type="button"
                >
                  保存到下载目录
                </button>
              } @else if (transfer.state === 'running') {
                <span class="text-base-content/60 text-sm">{{ throughput(transfer) }}</span>
                <button
                  class="btn btn-ghost btn-sm"
                  [disabled]="pending().has(transfer.id)"
                  (click)="cancel(transfer)"
                  data-testid="transfer-cancel"
                  type="button"
                >
                  取消下载
                </button>
              } @else {
                <p class="text-base-content/60 text-sm">
                  {{ transfer.state === 'cancelled' ? '需要时可以重新下载。' : '请检查来源设备是否在线，再重试。' }}
                </p>
                <button
                  class="btn btn-sm"
                  [disabled]="pending().has(transfer.id) || workspace.downloadingHashes().has(transfer.contentHash)"
                  (click)="retry(transfer)"
                  data-testid="transfer-retry"
                  type="button"
                >
                  {{
                    pending().has(transfer.id) || workspace.downloadingHashes().has(transfer.contentHash) ?
                      '正在重试'
                    : '重新下载'
                  }}
                </button>
              }
            </div>
            @if (errors().get(transfer.id); as message) {
              <p class="text-error mt-2 text-sm" role="alert">{{ message }}</p>
            }
            @if (saved().has(transfer.id)) {
              <p class="text-success mt-2 text-sm" role="status">已发起保存，请查看浏览器下载列表。</p>
            }
            @if (transfer.error) {
              <p class="text-error mt-2 text-sm" data-testid="transfer-error">{{ transfer.error }}</p>
            }
            @if (transfer.rejected) {
              <p class="text-warning mt-2 text-xs" data-testid="transfer-rejected">
                {{ transfer.rejected }} 个坏块被丢弃并换源重拉
              </p>
            }
            <details class="border-base-200 mt-3 border-t pt-2">
              <summary class="text-base-content/60 cursor-pointer text-xs">传输详情</summary>
              @if (transfer.state === 'done') {
                <p class="text-success mt-2 text-xs">校验通过：SHA-256 与清单一致。</p>
              }
              <p class="text-base-content/60 mt-2 text-xs">{{ throughput(transfer) }}</p>
              <div class="mt-2 flex flex-wrap gap-[2px]" aria-label="块图">
                @for (source of transfer.chunks; track $index) {
                  <span
                    class="h-2 w-2 rounded-[1px]"
                    [class]="colorOf(transfer, source)"
                    [title]="source ?? '等待中'"
                  ></span>
                }
              </div>
              <div class="mt-2 flex flex-wrap gap-2 text-xs">
                @for (source of transfer.sources; track source) {
                  <span class="flex items-center gap-1">
                    <span class="h-2 w-2 rounded-[1px]" [class]="colorOf(transfer, source)"></span>{{ source }}
                  </span>
                }
                <span class="flex items-center gap-1"
                  ><span class="bg-neutral h-2 w-2 rounded-[1px]"></span>服务器</span
                >
              </div>
            </details>
          </article>
        } @empty {
          <div class="rounded-box bg-base-200/50 text-base-content/60 p-5 text-sm">
            下载共享文件后，进度和结果会显示在这里。完成后点击「保存到下载目录」。
          </div>
        }
      </div>
    </section>
  `
})
export class TransfersPanel {
  readonly workspace = inject(P2PWorkspace);
  readonly pending = signal<ReadonlySet<string>>(new Set());
  readonly saved = signal<ReadonlySet<string>>(new Set());
  readonly errors = signal<ReadonlyMap<string, string>>(new Map());
  readonly clearError = signal<string | null>(null);
  readonly hasFinished = computed(() => this.workspace.transfers().some(transfer => transfer.state !== 'running'));

  size(bytes: number): string {
    return formatFileSize(bytes);
  }

  percentage(transfer: TransferView): number {
    if (transfer.state === 'done') return 100;
    return transfer.size > 0 ? Math.min(100, Math.round((transfer.bytes / transfer.size) * 100)) : 0;
  }

  stateLabel(transfer: TransferView): string {
    return STATE_LABELS[transfer.state];
  }

  stateClass(transfer: TransferView): string {
    if (transfer.state === 'done') return 'badge-success';
    if (transfer.state === 'failed') return 'badge-error';
    return 'badge-ghost';
  }

  save(transfer: TransferView): Promise<void> {
    return this.#run(transfer.id, async () => {
      await this.workspace.saveToDisk(transfer.contentHash, transfer.fileName);
      this.saved.update(current => new Set([...current, transfer.id]));
    });
  }

  retry(transfer: TransferView): Promise<void> {
    if (this.workspace.downloadingHashes().has(transfer.contentHash)) return Promise.resolve();
    return this.#run(transfer.id, () => this.workspace.download(transfer.contentHash));
  }

  cancel(transfer: TransferView): void {
    this.errors.update(current => new Map([...current].filter(([id]) => id !== transfer.id)));
    try {
      this.workspace.cancel(transfer.id);
    } catch (error) {
      this.#showError(transfer.id, error);
    }
  }

  clearRecords(): void {
    this.clearError.set(null);
    try {
      this.workspace.clearFinishedTransfers();
    } catch (error) {
      this.clearError.set(error instanceof Error ? error.message : String(error));
    }
  }

  throughput(transfer: TransferView): string {
    const seconds = ((transfer.finishedAt ?? Date.now()) - transfer.startedAt) / 1000;
    return seconds > 0 ? `${formatFileSize(transfer.bytes / seconds)}/s · ${seconds.toFixed(1)} 秒` : '';
  }

  colorOf(transfer: TransferView, source: string | null): string {
    if (source === null) return 'bg-base-300';
    if (source === SERVER_SOURCE) return 'bg-neutral';
    return SOURCE_COLORS[transfer.sources.indexOf(source) % SOURCE_COLORS.length] ?? 'bg-primary';
  }

  async #run(id: string, action: () => Promise<void>): Promise<void> {
    if (this.pending().has(id)) return;
    this.errors.update(current => new Map([...current].filter(([key]) => key !== id)));
    this.saved.update(current => new Set([...current].filter(key => key !== id)));
    this.pending.update(current => new Set([...current, id]));
    try {
      await action();
    } catch (error) {
      this.#showError(id, error);
    } finally {
      this.pending.update(current => new Set([...current].filter(key => key !== id)));
    }
  }

  #showError(id: string, error: unknown): void {
    this.errors.update(current => new Map(current).set(id, error instanceof Error ? error.message : String(error)));
  }
}
