import { formatFileSize } from '@aiao/utils';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { P2PWorkspace, type SharedFileView } from '../p2p/p2p-workspace.service';
import { DevicesPanel } from './devices-panel';
import { InspectorPanel } from './inspector-panel';
import { TransfersPanel } from './transfers-panel';

/** 管理本设备文件、连接与传输，不扩大当前用户权限。 */
@Component({
  selector: 'app-manage-page',
  imports: [DevicesPanel, TransfersPanel, InspectorPanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-7">
      <p class="text-primary mb-2 text-xs font-semibold tracking-widest">设备与存储</p>
      <h1 class="text-3xl font-semibold tracking-tight">本机管理</h1>
      <p class="text-base-content/60 mt-3 text-sm">管理这台设备保存的文件、当前连接和下载记录。</p>
    </div>
    <section class="card bg-base-100 mb-6" aria-label="本机概况">
      <div class="card-body gap-5 p-6">
        <div>
          <h2 class="font-semibold">{{ workspace.device()?.name }}</h2>
          <p class="text-base-content/60 mt-1 text-sm break-all">{{ auth.session()?.user?.email }}</p>
        </div>
        <dl class="border-base-200 grid grid-cols-3 gap-4 border-t pt-5">
          <div>
            <dt class="text-base-content/55 text-xs">本机共享</dt>
            <dd class="mt-2 text-2xl font-semibold">
              {{ localFiles().length }} <span class="text-base-content/55 text-xs font-normal">个文件</span>
            </dd>
            <dd class="text-base-content/55 mt-1 text-xs">{{ size(localBytes()) }}</dd>
          </div>
          <div>
            <dt class="text-base-content/55 text-xs">已连接设备</dt>
            <dd class="mt-2 text-2xl font-semibold">{{ readyLinks().length }}</dd>
          </div>
          <div>
            <dt class="text-base-content/55 text-xs">正在下载</dt>
            <dd class="mt-2 text-2xl font-semibold">{{ activeTransfers() }}</dd>
          </div>
        </dl>
      </div>
    </section>
    @if (error(); as message) {
      <div class="alert alert-error mb-5" role="alert">{{ message }}</div>
    }
    @if (notice(); as message) {
      <div class="alert alert-success mb-5" role="status">{{ message }}</div>
    }
    <section class="card bg-base-100 mb-6" data-testid="managed-files">
      <div class="card-body p-6">
        <h2 class="card-title text-base">本机文件</h2>
        <p class="text-base-content/60 mb-3 text-sm">
          移除会停止本机共享并释放本机空间，其他设备和服务器上的副本仍保留。
        </p>
        @for (file of localFiles(); track file.contentHash) {
          <div class="border-base-200 flex flex-wrap items-center gap-3 border-t py-4" data-testid="managed-file-row">
            <div class="min-w-0 flex-1">
              <div class="text-sm font-medium break-all">{{ file.manifest.fileName }}</div>
              <div class="text-base-content/55 mt-1 text-xs">{{ size(file.manifest.size) }}</div>
            </div>
            <button class="btn btn-ghost btn-sm" [disabled]="busy()" (click)="save(file)" type="button">
              保存到下载目录
            </button>
            <button
              class="btn btn-ghost btn-sm text-error"
              [disabled]="busy()"
              (click)="pendingRemoval.set(file)"
              data-testid="manage-remove"
              type="button"
            >
              移除本机副本
            </button>
          </div>
        } @empty {
          <p class="text-base-content/55 py-6 text-center text-sm">
            这台设备还没有共享文件。共享或下载文件后，会在这里显示。
          </p>
        }
        @if (pendingRemoval(); as file) {
          <section
            class="border-warning bg-warning/10 mt-3 rounded-xl border p-4"
            aria-label="确认移除本机副本"
            data-testid="manage-removal-confirm"
          >
            <h3 class="font-medium break-all">移除“{{ file.manifest.fileName }}”？</h3>
            <p class="mt-2 text-sm">
              将删除本浏览器保存的文件并停止本机共享；其他设备、服务器副本及已保存到下载目录的文件不受影响。
            </p>
            <div class="mt-4 flex gap-2">
              <button class="btn btn-error btn-sm" [disabled]="busy()" (click)="confirmRemoval()" type="button">
                确认移除</button
              ><button
                class="btn btn-ghost btn-sm"
                [disabled]="busy()"
                (click)="pendingRemoval.set(null)"
                type="button"
              >
                取消
              </button>
            </div>
          </section>
        }
      </div>
    </section>
    <div class="mb-6 grid items-start gap-6 lg:grid-cols-2">
      <div class="min-w-0">
        <div class="mb-3 flex items-center justify-between gap-3">
          <h2 class="font-semibold">连接管理</h2>
          <button
            class="btn btn-outline btn-sm"
            [disabled]="!readyLinks().length"
            (click)="disconnectAll()"
            title="结束本机当前连接；之后下载时会自动重新连接"
            type="button"
          >
            断开全部连接
          </button>
        </div>
        <app-devices-panel />
        <p class="text-base-content/55 mt-3 text-xs">断开可能中断正在进行的传输；之后下载时会自动重新连接。</p>
      </div>
      <app-transfers-panel />
    </div>
    <details class="card bg-base-100" data-testid="advanced-diagnostics">
      <summary class="cursor-pointer p-6 text-sm font-semibold">高级诊断与演示</summary>
      <div class="px-2 pb-2 sm:px-4 sm:pb-4">
        <p class="text-base-content/60 px-4 pb-4 text-sm">
          用于排查连接或演示异常。开启故障模拟会影响其他设备从本机下载。
        </p>
        <app-inspector-panel />
      </div>
    </details>
  `
})
export default class ManagePage {
  readonly workspace = inject(P2PWorkspace);
  readonly auth = inject(AuthService);
  readonly localFiles = computed(() => this.workspace.files().filter(file => file.heldHere));
  readonly localBytes = computed(() => this.localFiles().reduce((total, file) => total + file.manifest.size, 0));
  readonly readyLinks = computed(() => this.workspace.links().filter(link => link.state === 'ready'));
  readonly activeTransfers = computed(
    () => this.workspace.transfers().filter(transfer => transfer.state === 'running').length
  );
  readonly pendingRemoval = signal<SharedFileView | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);

  size(bytes: number): string {
    return formatFileSize(bytes);
  }
  disconnectAll(): void {
    for (const link of this.readyLinks()) this.workspace.disconnect(link.connectionId);
  }

  async confirmRemoval(): Promise<void> {
    const file = this.pendingRemoval();
    if (!file || this.busy()) return;
    await this.#run(async () => {
      await this.workspace.revoke(file.contentHash);
      this.pendingRemoval.set(null);
      this.notice.set(`已移除“${file.manifest.fileName}”的本机副本`);
    });
  }

  save(file: SharedFileView): Promise<void> {
    return this.#run(() => this.workspace.saveToDisk(file.contentHash, file.manifest.fileName));
  }

  async #run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await action();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.busy.set(false);
    }
  }
}
