import { formatFileSize } from '@aiao/utils';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MAX_UPLOAD_BYTES } from '../../../shared/limits';
import { P2PWorkspace, type SharedFileView } from '../p2p/p2p-workspace.service';

const TEST_SIZES_MIB = [1, 16, 64] as const;

/** 共享文件：本机共享、持有者、下载 / 保存 / 撤回。 */
@Component({
  selector: 'app-files-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card bg-base-100 shadow-sm" data-testid="files-panel">
      <div class="card-body gap-3 p-4">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="card-title flex-1 text-base">共享文件</h2>
          <label class="label cursor-pointer gap-2 text-sm">
            <input type="checkbox" class="checkbox checkbox-sm" data-testid="upload-toggle" [checked]="upload()" (change)="upload.set(!upload())" />
            同时传到服务器（回退用，≤ {{ maxUpload }}）
          </label>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <input type="file" class="file-input file-input-sm" data-testid="share-input" [disabled]="busy()" (change)="shareSelected($event)" />
          <span class="text-sm opacity-60">或生成测试文件</span>
          @for (size of testSizes; track size) {
            <button class="btn btn-sm" type="button" [attr.data-testid]="'generate-' + size" [disabled]="busy()" (click)="generate(size)">
              {{ size }} MiB
            </button>
          }
          @if (busy()) {
            <span class="loading loading-spinner loading-sm"></span>
          }
        </div>
        @if (error(); as message) {
          <div role="alert" class="alert alert-error text-sm">{{ message }}</div>
        }
        <div class="overflow-x-auto">
          <table class="table table-sm">
            <thead>
              <tr><th>文件</th><th>大小</th><th>持有者</th><th></th></tr>
            </thead>
            <tbody>
              @for (file of workspace.files(); track file.contentHash) {
                <tr data-testid="file-row" [attr.data-file]="file.manifest.fileName" [attr.data-hash]="file.contentHash">
                  <td>
                    <div class="font-medium">{{ file.manifest.fileName }}</div>
                    <div class="font-mono text-xs opacity-50" [title]="file.contentHash">
                      {{ file.contentHash.slice(0, 12) }}… · {{ file.manifest.chunkHashes.length }} 块
                    </div>
                  </td>
                  <td class="whitespace-nowrap">{{ size(file.manifest.size) }}</td>
                  <td>
                    <div class="flex flex-wrap gap-1">
                      @for (holder of file.holderViews; track holder.holderId) {
                        <span class="badge badge-sm gap-1" [class]="holder.mine ? 'badge-primary' : 'badge-ghost'">
                          <span class="status status-xs" [class]="holder.mine || holder.online.length ? 'status-success' : 'status-neutral'"></span>
                          {{ holder.mine ? '本设备' : holder.label }}
                        </span>
                      }
                      @if (file.serverCopy) {
                        <span class="badge badge-sm badge-outline">服务器副本</span>
                      }
                    </div>
                  </td>
                  <td class="whitespace-nowrap text-right">
                    @if (file.heldHere) {
                      <button class="btn btn-ghost btn-xs" type="button" (click)="save(file)">保存</button>
                      <button class="btn btn-ghost btn-xs" type="button" data-testid="file-revoke" (click)="revoke(file)">撤回</button>
                    } @else {
                      <button
                        class="btn btn-primary btn-xs"
                        type="button"
                        data-testid="file-download"
                        [disabled]="!file.onlineSources && !file.serverCopy"
                        [title]="file.onlineSources || file.serverCopy ? '' : '没有在线的持有者，也没有服务器副本'"
                        (click)="download(file)"
                      >
                        {{ downloadLabel(file) }}
                      </button>
                    }
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="4" class="opacity-60">还没有共享文件。选一个本地文件，或生成一个测试文件。</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </section>
  `
})
export class FilesPanel {
  readonly workspace = inject(P2PWorkspace);
  readonly testSizes = TEST_SIZES_MIB;
  readonly maxUpload = formatFileSize(MAX_UPLOAD_BYTES);
  readonly upload = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  size(bytes: number): string {
    return formatFileSize(bytes);
  }

  downloadLabel(file: SharedFileView): string {
    if (file.onlineSources) return `下载（${file.onlineSources} 个来源）`;
    return file.serverCopy ? '从服务器下载' : '持有者离线';
  }

  shareSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    return file ? this.#run(() => this.workspace.share(file, this.upload() && file.size <= MAX_UPLOAD_BYTES)) : Promise.resolve();
  }

  generate(sizeMiB: number): Promise<void> {
    return this.#run(() => this.workspace.generateTestFile(sizeMiB, this.upload()));
  }

  download(file: SharedFileView): Promise<void> {
    return this.#run(() => this.workspace.download(file.contentHash), false);
  }

  save(file: SharedFileView): Promise<void> {
    return this.#run(() => this.workspace.saveToDisk(file.contentHash, file.manifest.fileName), false);
  }

  revoke(file: SharedFileView): Promise<void> {
    return this.#run(() => this.workspace.revoke(file.contentHash));
  }

  async #run(action: () => Promise<void>, blocking = true): Promise<void> {
    this.error.set(null);
    this.busy.update(busy => busy || blocking);
    try {
      await action();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      if (blocking) this.busy.set(false);
    }
  }
}
