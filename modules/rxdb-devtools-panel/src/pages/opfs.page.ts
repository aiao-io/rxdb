import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import {
  LucideDynamicIcon,
  LucideRefreshCw as RefreshCw,
  LucideTriangleAlert as TriangleAlert,
  LucideUpload as Upload
} from '@lucide/angular';
import { ConnectionGuardComponent } from '../components/connection-guard.component';
import { OpfsBreadcrumbComponent } from '../components/opfs/opfs-breadcrumb.component';
import { OpfsContextMenuComponent, type OpfsContextMenuState } from '../components/opfs/opfs-context-menu.component';
import { OpfsDialogsComponent } from '../components/opfs/opfs-dialogs.component';
import { OpfsFileGridComponent } from '../components/opfs/opfs-file-grid.component';
import { OpfsFileTableComponent } from '../components/opfs/opfs-file-table.component';
import { OpfsToolbarComponent } from '../components/opfs/opfs-toolbar.component';
import { DevToolsEndpointService } from '../services/devtools-endpoint.service';
import { OpfsService } from '../services/opfs.service';
import { DEVTOOLS_HOST_ACCESS } from '../transport';
import type { OPFSFile } from '../types/devtools.types';
import { createPathSegments, summarizeFiles } from './opfs-page.utils';

@Component({
  selector: 'app-opfs-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ConnectionGuardComponent,
    LucideDynamicIcon,
    OpfsBreadcrumbComponent,
    OpfsContextMenuComponent,
    OpfsDialogsComponent,
    OpfsFileGridComponent,
    OpfsFileTableComponent,
    OpfsToolbarComponent
  ],
  template: `
    <app-connection-guard>
      <div class="flex h-full flex-col">
        @if (errorKind() === 'content-script-unavailable') {
          <div
            class="bg-warning/10 border-warning/20 text-warning-content flex items-center gap-2 border-b px-3 py-2 text-xs"
          >
            <svg [lucideIcon]="TriangleAlert" aria-hidden="true" size="14"></svg>
            <span class="font-semibold">需要刷新页面:</span>
            <span>{{ error() }}</span>
            <button class="btn btn-xs btn-warning ml-auto gap-1" (click)="reloadInspectedPage()">
              <svg [lucideIcon]="RefreshCw" aria-hidden="true" size="13"></svg>
              刷新页面
            </button>
          </div>
        }

        <app-opfs-toolbar
          [loading]="loading()"
          [viewMode]="viewMode()"
          (createFolderRequested)="showNewFolderDialog.set(true)"
          (navigateRoot)="navigateTo('/')"
          (refreshRequested)="refresh()"
          (uploadRequested)="uploadFiles($event)"
          (viewModeChange)="setViewMode($event)"
        />

        <div class="flex items-center gap-2">
          <app-opfs-breadcrumb class="flex-1" [segments]="pathSegments()" (navigate)="navigateTo($event)" />
          @if (filesRuntime(); as runtime) {
            <span class="badge badge-ghost badge-xs mr-2 font-mono" title="文件来源所在的运行时">{{ runtime }}</span>
          }
        </div>

        @if (error() && errorKind() !== 'content-script-unavailable') {
          <div class="alert alert-error m-2">
            <span>{{ error() }}</span>
            <button class="btn btn-sm btn-ghost" (click)="refresh()">重试</button>
          </div>
        }

        <div
          class="relative flex-1 overflow-auto"
          (dragenter)="onDragEnter($event)"
          (dragleave)="onDragLeave($event)"
          (dragover)="onDragOver($event)"
          (drop)="onDrop($event)"
        >
          @if (loading()) {
            <div class="flex h-full items-center justify-center">
              <span class="loading loading-spinner loading-lg"></span>
            </div>
          } @else if (files().length === 0 && !error()) {
            <div class="flex h-full items-center justify-center text-sm opacity-50">此目录为空</div>
          } @else if (viewMode() === 'list') {
            <app-opfs-file-table
              [files]="files()"
              (contextMenuRequested)="onContextMenu($event.event, $event.file)"
              (deleteRequested)="deleteFile($event)"
              (downloadRequested)="download($event)"
              (navigate)="navigateTo($event)"
            />
          } @else {
            <app-opfs-file-grid
              [files]="files()"
              (activateRequested)="activateGridItem($event)"
              (contextMenuRequested)="onContextMenu($event.event, $event.file)"
              (downloadRequested)="download($event)"
              (navigate)="navigateTo($event)"
            />
          }

          @if (isDragging()) {
            <div
              class="bg-primary/10 border-primary pointer-events-none absolute inset-0 z-50 flex items-center justify-center border-2 border-dashed"
            >
              <div class="bg-base-100 flex flex-col items-center gap-2 rounded-lg p-8 shadow-lg">
                <svg class="text-primary" [lucideIcon]="Upload" aria-hidden="true" size="40"></svg>
                <span class="font-semibold">拖放文件到此处上传</span>
              </div>
            </div>
          }
        </div>

        <div class="text-base-content/60 border-base-300 flex items-center gap-4 border-t px-3 py-1 text-xs">
          <span
            >{{ files().length }} 项 ({{ fileCounts().directories }} 个文件夹, {{ fileCounts().files }} 个文件)</span
          >
        </div>
      </div>

      <app-opfs-dialogs
        [deleteFile]="deleteConfirmFile()"
        [newFolderName]="newFolderName()"
        [showNewFolder]="showNewFolderDialog()"
        (closeDelete)="deleteConfirmFile.set(null)"
        (closeNewFolder)="showNewFolderDialog.set(false)"
        (confirmDelete)="confirmDelete()"
        (createFolder)="createFolder()"
        (newFolderNameChange)="newFolderName.set($event)"
      />

      <app-opfs-context-menu
        [state]="contextMenuState()"
        (closed)="closeContextMenu()"
        (deleteRequested)="contextMenuDelete()"
        (downloadRequested)="contextMenuDownload()"
        (openRequested)="contextMenuOpen()"
      />
    </app-connection-guard>
  `
})
export class OpfsPage implements OnInit {
  private readonly opfsService = inject(OpfsService);
  private readonly hostAccess = inject(DEVTOOLS_HOST_ACCESS);
  private readonly endpoint = inject(DevToolsEndpointService);

  /**
   * `files` provider 自报的运行时（`browser` / `electron` / `tauri`），未协商出来时为 `null`。
   *
   * @remarks
   * **只用于显示**。这是 `DEVTOOLS_PROVIDER_RUNTIMES` 的合同（「provider 运行时；只用于显示，
   * 不得参与行为判定」）在 UI 侧的落点：页面把它原样印出来，任何分支——能做哪些操作、限额多大、
   * 走哪条路径——都只看 `kind` / `operations` / `limits`，不看它。
   *
   * 取自协商状态里的 descriptor，不是另猜一个：宿主是谁只有 connector 知道，
   * 面板按 adapter 名或 URL 反推的话，浏览器预览与真实桌面窗口会恰好报反
   * （US-905 AC#6 踩过这个坑）。
   */
  readonly filesRuntime = computed(() => {
    // 读一下状态信号**只为建立依赖**：descriptors 挂在端点实例上（`endpoint.descriptors`），
    // 不是信号；而它填上的时刻正是协商状态推进的时刻，所以拿状态当变更信号是准的。
    //
    // 别写成 `this.endpoint.state()?.descriptors`——`DevToolsEndpointService.state` 存的是
    // **协商状态**（`endpoint.state`），不是一个带 descriptors 的对象。那样写会在每次变更检测
    // 里对着 undefined 调 `.find` 而抛 TypeError，表征是整个 Files 页只剩外壳、
    // 而 DevTools 控制台一条错误都不打。踩过一次，记在这里。
    this.endpoint.state();
    const descriptors = this.endpoint.resolve()?.descriptors ?? [];
    return descriptors.find(descriptor => descriptor.domain === 'files')?.runtime ?? null;
  });

  readonly currentPath = this.opfsService.currentPath;
  readonly files = this.opfsService.files;
  readonly loading = this.opfsService.loading;
  readonly error = this.opfsService.error;
  /** P1-5：分支判定用结构化 kind，不再匹配错误文案。 */
  readonly errorKind = this.opfsService.errorKind;
  readonly viewMode = this.opfsService.viewMode;

  readonly isDragging = signal(false);
  readonly showNewFolderDialog = signal(false);
  readonly newFolderName = signal('');
  readonly deleteConfirmFile = signal<OPFSFile | null>(null);
  readonly contextMenuState = signal<OpfsContextMenuState>({ show: false, x: 0, y: 0, file: null });
  readonly pathSegments = computed(() => createPathSegments(this.currentPath()));
  readonly fileCounts = computed(() => summarizeFiles(this.files()));

  protected readonly RefreshCw = RefreshCw;
  protected readonly TriangleAlert = TriangleAlert;
  protected readonly Upload = Upload;

  ngOnInit(): void {
    void this.refresh();
  }

  refresh(): Promise<void> {
    return this.opfsService.refresh();
  }

  navigateTo(path: string): void {
    this.opfsService.navigateTo(path);
  }

  setViewMode(mode: 'list' | 'grid'): void {
    if (this.viewMode() !== mode) this.opfsService.toggleViewMode();
  }

  download(file: OPFSFile): void {
    void this.opfsService.download(file);
  }

  activateGridItem(file: OPFSFile): void {
    if (file.type === 'directory') {
      this.navigateTo(file.path);
      return;
    }
    this.download(file);
  }

  deleteFile(file: OPFSFile): void {
    this.deleteConfirmFile.set(file);
  }

  confirmDelete(): void {
    const file = this.deleteConfirmFile();
    if (!file) return;
    void this.opfsService.delete(file);
    this.deleteConfirmFile.set(null);
  }

  reloadInspectedPage(): void {
    this.hostAccess.reloadInspectedPage();
  }

  onDragEnter(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget === event.target) this.isDragging.set(false);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length > 0) void this.uploadFiles(files);
  }

  async uploadFiles(files: File[]): Promise<void> {
    for (const file of files) await this.opfsService.upload(file);
  }

  createFolder(): void {
    const name = this.newFolderName().trim();
    if (!name) return;
    void this.opfsService.createDirectory(name);
    this.newFolderName.set('');
    this.showNewFolderDialog.set(false);
  }

  onContextMenu(event: MouseEvent, file: OPFSFile): void {
    event.preventDefault();
    this.contextMenuState.set({ show: true, x: event.clientX, y: event.clientY, file });
  }

  closeContextMenu(): void {
    this.contextMenuState.set({ show: false, x: 0, y: 0, file: null });
  }

  contextMenuOpen(): void {
    const file = this.contextMenuState().file;
    if (file?.type === 'directory') this.navigateTo(file.path);
    this.closeContextMenu();
  }

  contextMenuDownload(): void {
    const file = this.contextMenuState().file;
    if (file?.type === 'file') this.download(file);
    this.closeContextMenu();
  }

  contextMenuDelete(): void {
    const file = this.contextMenuState().file;
    if (file) this.deleteFile(file);
    this.closeContextMenu();
  }
}
