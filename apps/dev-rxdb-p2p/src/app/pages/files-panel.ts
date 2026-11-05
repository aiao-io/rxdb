import { formatFileSize } from '@aiao/utils';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MAX_UPLOAD_BYTES } from '../../../shared/limits';
import { P2PWorkspace, type SharedFileView } from '../p2p/p2p-workspace.service';

const TEST_SIZES_MIB = [1, 16, 64] as const;
type FileScope = 'all' | 'available' | 'local';

/** 选择文件共享，或从其他设备下载文件。 */
@Component({
  selector: 'app-files-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card bg-base-100 border-base-300 border shadow-sm" data-testid="files-panel">
      <div class="card-body gap-6 p-5 sm:p-6">
        <div class="bg-primary/5 border-primary/20 rounded-box border border-dashed p-5 sm:p-6">
          <div class="mb-4 flex items-start gap-3">
            <span
              class="bg-primary/10 text-primary grid h-11 w-11 shrink-0 place-items-center rounded-xl"
              aria-hidden="true"
            >
              <svg fill="none" height="24" stroke="currentColor" stroke-width="1.6" viewBox="0 0 24 24" width="24">
                <path
                  d="M12 16V4m-4 4 4-4 4 4M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </span>
            <div>
              <h2 class="text-lg font-semibold">把文件发到另一台设备</h2>
              <p class="mt-1 text-sm opacity-65">选择文件后，其他已登录设备就能看到并下载。共享期间请保持本页打开。</p>
            </div>
          </div>
          <input
            class="file-input file-input-primary w-full max-w-sm"
            [disabled]="busy()"
            (change)="shareSelected($event)"
            aria-label="选择文件并共享"
            data-testid="share-input"
            type="file"
          />
          @if (busy()) {
            <span class="mt-3 flex items-center gap-2 text-sm" role="status">
              <span class="loading loading-spinner loading-sm"></span>正在处理，请稍候…
            </span>
          }
          <p class="mt-3 text-xs opacity-60">共享文件对本应用所有已登录用户可见。</p>
        </div>

        <details class="border-base-300 rounded-box border px-4 py-3" data-testid="share-options">
          <summary class="cursor-pointer text-sm font-medium">共享选项与示例文件</summary>
          <div class="mt-4 flex flex-col gap-4">
            <label class="flex cursor-pointer items-start gap-3">
              <input
                class="checkbox checkbox-primary checkbox-sm mt-0.5"
                [checked]="upload()"
                [disabled]="busy()"
                (change)="upload.set(!upload())"
                data-testid="upload-toggle"
                type="checkbox"
              />
              <span class="text-sm">
                <span class="font-medium">同时保留服务器副本</span>
                <span class="mt-1 block text-xs opacity-60">本机离线后仍可下载；每个文件不超过 {{ maxUpload }}。</span>
              </span>
            </label>
            <div class="flex flex-wrap items-center gap-2">
              <span class="mr-1 text-xs opacity-60">没有文件可试？</span>
              @for (size of testSizes; track size) {
                <button
                  class="btn btn-sm btn-soft"
                  [attr.data-testid]="'generate-' + size"
                  [disabled]="busy()"
                  (click)="generate(size)"
                  type="button"
                >
                  {{ size }} MiB 示例
                </button>
              }
            </div>
          </div>
        </details>

        @if (error(); as message) {
          <div class="alert alert-error text-sm" role="alert">{{ message }}</div>
        }
        @if (notice(); as message) {
          <div class="alert alert-success text-sm" role="status">{{ message }}</div>
        }
        @if (pendingRemoval(); as file) {
          <section class="border-warning/40 bg-warning/10 rounded-box border p-4" aria-label="移除本机副本确认">
            <h3 class="font-semibold">移除「{{ file.manifest.fileName }}」？</h3>
            <p class="mt-1 text-sm opacity-75">
              将停止本机共享，并删除浏览器中保存的这份文件。其他设备和服务器上的副本仍会保留；已保存到下载目录的文件不受影响。
            </p>
            <div class="mt-3 flex gap-2">
              <button
                class="btn btn-sm btn-error"
                [disabled]="busy()"
                (click)="confirmRemoval()"
                data-testid="file-revoke-confirm"
                type="button"
              >
                确认移除
              </button>
              <button class="btn btn-sm btn-ghost" [disabled]="busy()" (click)="pendingRemoval.set(null)" type="button">
                保留文件
              </button>
            </div>
          </section>
        }

        <div>
          <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <h2 class="text-base font-semibold">共享文件</h2>
              <span class="badge badge-ghost badge-sm">{{ workspace.files().length }}</span>
            </div>
            <label class="input input-sm w-full sm:max-w-56">
              <svg
                aria-hidden="true"
                fill="none"
                height="16"
                stroke="currentColor"
                stroke-width="1.8"
                viewBox="0 0 24 24"
                width="16"
              >
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="m16 16 4 4" stroke-linecap="round" />
              </svg>
              <input
                #search
                [value]="query()"
                (input)="query.set(search.value)"
                aria-label="搜索文件名"
                placeholder="搜索文件名"
                type="search"
              />
            </label>
          </div>
          <div class="mb-3 flex flex-wrap gap-1" aria-label="筛选共享文件" role="group">
            <button
              class="btn btn-sm"
              [attr.aria-pressed]="scope() === 'all'"
              [class.btn-ghost]="scope() !== 'all'"
              [class.btn-primary]="scope() === 'all'"
              (click)="scope.set('all')"
              type="button"
            >
              全部
            </button>
            <button
              class="btn btn-sm"
              [attr.aria-pressed]="scope() === 'available'"
              [class.btn-ghost]="scope() !== 'available'"
              [class.btn-primary]="scope() === 'available'"
              (click)="scope.set('available')"
              type="button"
            >
              可下载
            </button>
            <button
              class="btn btn-sm"
              [attr.aria-pressed]="scope() === 'local'"
              [class.btn-ghost]="scope() !== 'local'"
              [class.btn-primary]="scope() === 'local'"
              (click)="scope.set('local')"
              type="button"
            >
              本机已有
            </button>
          </div>
          <div class="overflow-x-auto">
            <table class="shared-files-table table" aria-label="共享文件">
              <thead>
                <tr>
                  <th>文件</th>
                  <th>可用副本</th>
                  <th class="text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                @for (file of visibleFiles(); track file.contentHash) {
                  <tr
                    [attr.data-file]="file.manifest.fileName"
                    [attr.data-hash]="file.contentHash"
                    [attr.data-source]="file.manifest.sourceUrl"
                    data-testid="file-row"
                  >
                    <td class="max-w-72 min-w-40">
                      <div class="font-medium break-all">{{ file.manifest.fileName }}</div>
                      <div class="mt-1 text-xs opacity-55">
                        {{ size(file.manifest.size) }} ·
                        {{ file.heldHere ? '本机已保存，可继续共享' : availability(file) }}
                      </div>
                    </td>
                    <td>
                      <div class="flex min-w-28 flex-wrap gap-1.5">
                        @for (holder of file.holderViews; track holder.holderId) {
                          <span
                            class="badge badge-sm h-auto min-h-5 max-w-full gap-1 py-1 leading-snug"
                            [class]="holder.mine ? 'badge-primary badge-outline' : 'badge-ghost'"
                          >
                            <span
                              class="status status-xs"
                              [class]="holder.mine || holder.online.length ? 'status-success' : 'status-neutral'"
                            ></span>
                            {{ holder.mine ? '本设备' : holder.label
                            }}{{ !holder.mine && !holder.online.length ? ' · 离线' : '' }}
                          </span>
                        }
                        @if (file.serverCopy) {
                          <span class="badge badge-sm badge-outline">服务器副本</span>
                        }
                      </div>
                    </td>
                    <td>
                      <div class="file-actions flex flex-wrap justify-end gap-1.5">
                        @if (file.heldHere) {
                          <button class="btn btn-primary btn-sm" [disabled]="busy()" (click)="save(file)" type="button">
                            保存到下载目录
                          </button>
                          <button
                            class="btn btn-ghost btn-sm"
                            [disabled]="busy()"
                            (click)="revoke(file)"
                            data-testid="file-revoke"
                            type="button"
                          >
                            移除本机副本
                          </button>
                        } @else {
                          <button
                            class="btn btn-primary btn-sm"
                            [disabled]="
                              workspace.downloadingHashes().has(file.contentHash) ||
                              (!file.onlineSources && !file.serverCopy)
                            "
                            [title]="availability(file)"
                            (click)="download(file)"
                            data-testid="file-download"
                            type="button"
                          >
                            {{ downloadLabel(file) }}
                          </button>
                        }
                      </div>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td class="py-10 text-center" colspan="3">
                      <p class="font-medium">
                        {{ workspace.files().length ? '没有符合条件的文件' : '还没有共享文件' }}
                      </p>
                      <p class="mt-2 text-sm opacity-60">
                        {{
                          workspace.files().length ?
                            '换个文件名搜索，或切换到“全部”。'
                          : '从上方选择一个文件，或让另一台设备先共享文件。'
                        }}
                      </p>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <p class="mt-3 text-xs leading-relaxed opacity-55">
            下载完成后，点“保存到下载目录”取出文件。浏览器中的副本会继续提供给其他设备。
          </p>
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
  readonly notice = signal<string | null>(null);
  readonly pendingRemoval = signal<SharedFileView | null>(null);
  readonly query = signal('');
  readonly scope = signal<FileScope>('all');
  readonly visibleFiles = computed(() => {
    const query = this.query().trim().toLocaleLowerCase();
    return this.workspace.files().filter(file => {
      const matchesName = file.manifest.fileName.toLocaleLowerCase().includes(query);
      if (this.scope() === 'local') return matchesName && file.heldHere;
      if (this.scope() === 'available')
        return matchesName && !file.heldHere && Boolean(file.onlineSources || file.serverCopy);
      return matchesName;
    });
  });

  size(bytes: number): string {
    return formatFileSize(bytes);
  }

  availability(file: SharedFileView): string {
    if (file.onlineSources) return `${file.onlineSources} 个在线来源，下载时自动连接`;
    return file.serverCopy ? '设备离线也可从服务器下载' : '持有设备离线，请让对方打开共享页面';
  }

  downloadLabel(file: SharedFileView): string {
    if (this.workspace.downloadingHashes().has(file.contentHash)) return '下载中…';
    if (file.onlineSources) return '下载到本机';
    return file.serverCopy ? '从服务器下载' : '持有者离线';
  }

  shareSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.busy()) return Promise.resolve();
    if (this.upload() && file.size > MAX_UPLOAD_BYTES) {
      this.notice.set(null);
      this.error.set(`该文件超过服务器副本上限 ${this.maxUpload}。请关闭“同时保留服务器副本”后重新选择文件。`);
      return Promise.resolve();
    }
    return this.#run(
      () => this.workspace.share(file, this.upload()),
      `已共享「${file.name}」。保持本页打开，其他在线设备即可下载。`
    );
  }

  generate(sizeMiB: number): Promise<void> {
    return this.#run(
      () => this.workspace.generateTestFile(sizeMiB, this.upload()),
      '示例文件已共享，可在另一台设备下载。'
    );
  }

  download(file: SharedFileView): Promise<void> {
    if (this.workspace.downloadingHashes().has(file.contentHash)) return Promise.resolve();
    return this.#run(() => this.workspace.download(file.contentHash), null, false);
  }

  save(file: SharedFileView): Promise<void> {
    return this.#run(
      () => this.workspace.saveToDisk(file.contentHash, file.manifest.fileName),
      '已请求保存文件，请到浏览器下载目录查看。',
      false
    );
  }

  revoke(file: SharedFileView): void {
    this.pendingRemoval.set(file);
  }

  async confirmRemoval(): Promise<void> {
    const file = this.pendingRemoval();
    if (!file || this.busy()) return;
    await this.#run(async () => {
      await this.workspace.revoke(file.contentHash);
      this.pendingRemoval.set(null);
    }, '本机副本已移除。其他设备和服务器上的副本仍会保留。');
  }

  async #run(action: () => Promise<void>, notice: string | null, blocking = true): Promise<void> {
    if (blocking && this.busy()) return;
    this.error.set(null);
    this.notice.set(null);
    if (blocking) this.busy.set(true);
    try {
      await action();
      this.notice.set(notice);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      if (blocking) this.busy.set(false);
    }
  }
}
