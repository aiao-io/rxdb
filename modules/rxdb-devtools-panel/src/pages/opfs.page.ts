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

        <app-opfs-breadcrumb [segments]="pathSegments()" (navigate)="navigateTo($event)" />

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
