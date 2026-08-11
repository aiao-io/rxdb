import { RxDB } from '@aiao/rxdb';
import {
  joinDirectoryAndFileName,
  normalizeDirectoryPath,
  StorageBrowserEntry,
  StorageFileMeta
} from '@aiao/rxdb-plugin-storage';
import { checkOPFSAvailable, formatFileSize, STORAGE_LABELS, STORAGE_TESTID } from '@aiao/utils';
import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  signal,
  untracked,
  viewChild
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import {
  LucideAlertTriangle as AlertTriangle,
  LucideChevronRight as ChevronRight,
  LucideDatabase as Database,
  LucideDownload as Download,
  LucideEdit3 as Edit3,
  LucideEye as Eye,
  LucideFolder as Folder,
  LucideFolderOpen as FolderOpen,
  LucideFolderPlus as FolderPlus,
  LucideGrid3x3 as Grid3x3,
  LucideHome as Home,
  LucideList as List,
  LucideDynamicIcon,
  LucideRefreshCw as RefreshCw,
  LucideTrash2 as Trash2,
  LucideUpload as Upload,
  LucideX as X
} from '@lucide/angular';
import { zipSync, type Zippable } from 'fflate';
import { map } from 'rxjs';
import { traverseFileTree } from '../../shared/traverse-file-tree';
import { StorageFileGridComponent } from './components/storage-file-grid.component';
import { StorageFileListComponent } from './components/storage-file-list.component';
import { StorageFilePreviewComponent } from './components/storage-file-preview.component';
import { StorageBrowserItem } from './utils/storage-utils';

type ViewMode = 'list' | 'grid';

interface ConfirmDialog {
  show: boolean;
  message: string;
  resolve?: (value: boolean) => void;
}

interface DeleteConfirm {
  show: boolean;
  target: DeleteTarget | null;
  resolve?: (value: boolean) => void;
}

type DeleteTarget = { type: 'single'; entry: StorageBrowserItem } | { type: 'batch'; count: number };

interface RenameDialog {
  show: boolean;
  entry: StorageBrowserItem | null;
  newName: string;
}

interface OverwriteConfirm {
  show: boolean;
  file: File | null;
  existingEntry: StorageBrowserItem | null;
  resolve?: (value: boolean) => void;
}

interface ContextMenu {
  show: boolean;
  x: number;
  y: number;
  entry: StorageBrowserItem | null;
}

interface Toast {
  show: boolean;
  message: string;
  type: 'error' | 'success' | 'info';
}

interface SelectionBox {
  active: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

@Component({
  selector: 'app-storage-page',
  imports: [
    CommonModule,
    LucideDynamicIcon,
    StorageFileListComponent,
    StorageFileGridComponent,
    StorageFilePreviewComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './storage.page.html'
})
export default class StoragePage implements OnInit, OnDestroy {
  private initialized = false;
  private clickAbortController?: AbortController;
  private mouseMoveListener?: (event: MouseEvent) => void;
  private mouseUpListener?: () => void;
  private toastTimer?: ReturnType<typeof setTimeout>;
  private readonly viewModeStorageKey = 'storage-view-mode';
  private readonly destroyRef = inject(DestroyRef);

  readonly rxdb = inject(RxDB);
  readonly router = inject(Router);
  readonly route = inject(ActivatedRoute);

  readonly allFiles = signal<StorageFileMeta[]>([]);
  readonly entries = signal<StorageBrowserItem[]>([]);
  readonly currentPath = signal('/');
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly viewMode = signal<ViewMode>(this.getStoredViewMode());
  readonly previewEntry = signal<StorageBrowserItem | null>(null);
  readonly newFolderName = signal('');
  readonly showNewFolder = signal(false);
  readonly isDragging = signal(false);
  readonly overwriteConfirm = signal<OverwriteConfirm>({ show: false, file: null, existingEntry: null });
  readonly contextMenu = signal<ContextMenu>({ show: false, x: 0, y: 0, entry: null });
  readonly renameDialog = signal<RenameDialog>({ show: false, entry: null, newName: '' });
  readonly deleteConfirm = signal<DeleteConfirm>({ show: false, target: null });
  readonly confirmDialog = signal<ConfirmDialog>({ show: false, message: '' });
  readonly toast = signal<Toast>({ show: false, message: '', type: 'info' });
  readonly selectedPaths = signal<Set<string>>(new Set());
  readonly lastSelectedPath = signal<string | null>(null);
  readonly opfsAvailable = signal(false);
  readonly selectionBox = signal<SelectionBox | null>(null);

  readonly routePath = toSignal(
    this.route.paramMap.pipe(map(params => this.normalizeRoutePath(params.get('storagePath')))),
    { initialValue: '/' }
  );

  readonly gridContainerRef = viewChild<ElementRef<HTMLDivElement>>('gridContainer');
  readonly Math = Math;

  readonly TESTID = STORAGE_TESTID;
  readonly LABELS = STORAGE_LABELS;
  readonly formatFileSize = formatFileSize;

  readonly Database = Database;
  readonly RefreshCw = RefreshCw;
  readonly List = List;
  readonly Grid3x3 = Grid3x3;
  readonly Upload = Upload;
  readonly FolderPlus = FolderPlus;
  readonly Download = Download;
  readonly Trash2 = Trash2;
  readonly ChevronRight = ChevronRight;
  readonly AlertTriangle = AlertTriangle;
  readonly Edit3 = Edit3;
  readonly Eye = Eye;
  readonly X = X;
  readonly Folder = Folder;
  readonly FolderOpen = FolderOpen;
  readonly Home = Home;

  fileInputRef?: HTMLInputElement;
  folderInputRef?: HTMLInputElement;

  get dirCount(): number {
    return this.entries().filter(entry => entry.kind === 'directory').length;
  }

  get fileCount(): number {
    return this.entries().filter(entry => entry.kind === 'file').length;
  }

  get pathSegments() {
    const path = this.currentPath();
    if (!path || path === '/') return [];

    return path
      .split('/')
      .filter(Boolean)
      .map((segment, index, allSegments) => ({
        name: segment,
        path: '/' + allSegments.slice(0, index + 1).join('/')
      }));
  }

  constructor() {
    void checkOPFSAvailable().then(available => {
      if (!this.destroyRef.destroyed) this.opfsAvailable.set(available);
    });

    effect(() => {
      if (!this.opfsAvailable() || this.initialized) return;

      this.currentPath.set(this.routePath());
      this.initialized = true;
      void this.refreshCurrentDirectory();
    });

    effect(() => {
      const routePath = this.routePath();
      if (!this.initialized || routePath === untracked(() => this.currentPath())) {
        return;
      }

      this.currentPath.set(routePath);
      this.clearSelection();
      this.closeContextMenu();
      this.previewEntry.set(null);
      void this.refreshCurrentDirectory();
    });

    effect(() => {
      localStorage.setItem(this.viewModeStorageKey, this.viewMode());
    });
  }

  ngOnInit(): void {
    this.clickAbortController = new AbortController();
    window.addEventListener('click', () => this.closeContextMenu(), { signal: this.clickAbortController.signal });

    this.fileInputRef = document.createElement('input');
    this.fileInputRef.type = 'file';
    this.fileInputRef.multiple = true;
    this.fileInputRef.style.display = 'none';
    this.fileInputRef.dataset['testid'] = this.TESTID.FILE_INPUT;
    document.body.appendChild(this.fileInputRef);
    this.fileInputRef.addEventListener('change', () => {
      if (this.fileInputRef?.files) {
        void this.handleUpload(Array.from(this.fileInputRef.files));
        this.fileInputRef.value = '';
      }
    });

    this.folderInputRef = document.createElement('input');
    this.folderInputRef.type = 'file';
    this.folderInputRef.setAttribute('webkitdirectory', '');
    this.folderInputRef.setAttribute('directory', '');
    this.folderInputRef.style.display = 'none';
    this.folderInputRef.dataset['testid'] = this.TESTID.FOLDER_INPUT;
    document.body.appendChild(this.folderInputRef);
    this.folderInputRef.addEventListener('change', () => {
      if (this.folderInputRef?.files) {
        void this.handleUploadFolder(Array.from(this.folderInputRef.files));
        this.folderInputRef.value = '';
      }
    });
  }

  ngOnDestroy(): void {
    this.clickAbortController?.abort();

    if (this.mouseMoveListener) {
      window.removeEventListener('mousemove', this.mouseMoveListener);
    }

    if (this.mouseUpListener) {
      window.removeEventListener('mouseup', this.mouseUpListener);
    }

    this.fileInputRef?.remove();
    this.folderInputRef?.remove();

    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
  }

  onNewFolderNameInput(event: Event): void {
    this.newFolderName.set((event.target as HTMLInputElement).value);
  }

  onRenameInput(event: Event): void {
    this.renameDialog.set({
      show: this.renameDialog().show,
      entry: this.renameDialog().entry,
      newName: (event.target as HTMLInputElement).value
    });
  }

  handleMouseDown(event: MouseEvent): void {
    if (this.viewMode() !== 'grid' || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest('button') || target.closest('a') || target.closest('[role="button"]')) {
      return;
    }

    const container = this.gridContainerRef()?.nativeElement;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const startX = event.clientX - rect.left;
    const startY = event.clientY - rect.top;

    this.selectionBox.set({
      active: true,
      startX,
      startY,
      currentX: startX,
      currentY: startY
    });

    this.mouseMoveListener = currentEvent => this.handleMouseMove(currentEvent);
    this.mouseUpListener = () => this.handleMouseUp();
    window.addEventListener('mousemove', this.mouseMoveListener);
    window.addEventListener('mouseup', this.mouseUpListener);
  }

  async navigateTo(path: string): Promise<void> {
    await this.router.navigateByUrl(this.buildUrlFromPath(normalizeDirectoryPath(path)));
  }

  handleNavigate(entry: StorageBrowserItem): void {
    if (entry.kind === 'directory') {
      void this.navigateTo(entry.path);
    }
  }

  async handleDownload(entry: StorageBrowserItem): Promise<void> {
    if (entry.kind === 'directory') {
      this.showToast(`Preparing ${entry.name}...`, 'info');

      try {
        const fileCount = await this.downloadEntriesAsZip([entry], `${entry.name}.zip`);
        this.showToast(
          fileCount === 0 ?
            `Downloaded empty folder ${entry.name}`
          : `Downloaded ${fileCount} files from ${entry.name}`,
          'success'
        );
      } catch (err) {
        this.showToast(err instanceof Error ? err.message : String(err), 'error');
      }

      return;
    }

    if (!entry.meta) {
      return;
    }

    try {
      await this.rxdb.storage.download(entry.meta.id);
    } catch (err) {
      this.showToast(err instanceof Error ? err.message : String(err), 'error');
    }
  }

  async handleDelete(entry: StorageBrowserItem): Promise<void> {
    const shouldDelete = await new Promise<boolean>(resolve => {
      this.deleteConfirm.set({ show: true, target: { type: 'single', entry }, resolve });
    });

    if (!shouldDelete) {
      return;
    }

    const result = await this.deleteEntry(entry);
    if (!result) {
      this.showToast(`Delete failed: ${entry.name}`, 'error');
    }
  }

  handleDeleteResponse(confirm: boolean): void {
    const current = this.deleteConfirm();
    current.resolve?.(confirm);
    this.deleteConfirm.set({ show: false, target: null });
  }

  async handleUpload(files?: File[]): Promise<void> {
    const filesToUpload = files || this.fileInputRef?.files;
    if (!filesToUpload || filesToUpload.length === 0) {
      return;
    }

    const fileList = Array.from(filesToUpload);
    let successCount = 0;

    for (const file of fileList) {
      const existingFile = this.findExistingFileEntry(file.name, this.currentPath());
      let overwrite = false;

      if (existingFile) {
        const shouldOverwrite = await new Promise<boolean>(resolve => {
          this.overwriteConfirm.set({ show: true, file, existingEntry: existingFile, resolve });
        });

        if (!shouldOverwrite) {
          continue;
        }

        overwrite = true;
      }

      try {
        await this.rxdb.storage.upload(file, { path: this.currentPath(), overwrite });
        successCount++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.showToast(message.includes('already exists') ? STORAGE_LABELS.FILE_EXISTS : message, 'error');
        return;
      }
    }

    if (successCount > 0) {
      this.showToast(successCount === 1 ? STORAGE_LABELS.UPLOAD_SUCCESS : `Uploaded ${successCount} files`, 'success');
      await this.refreshCurrentDirectory();
    }
  }

  async handleUploadFolder(files: File[]): Promise<void> {
    if (files.length === 0) return;

    this.showToast(`Uploading folder with ${files.length} files...`, 'info');

    let successCount = 0;
    let failedCount = 0;

    for (const file of files) {
      const relativePath = file.webkitRelativePath || file.name;
      const targetDirectory = this.getUploadDirectory(relativePath);
      const existingFile = this.findExistingFileEntry(file.name, targetDirectory);
      let overwrite = false;

      if (existingFile) {
        const shouldOverwrite = await new Promise<boolean>(resolve => {
          this.overwriteConfirm.set({ show: true, file, existingEntry: existingFile, resolve });
        });

        if (!shouldOverwrite) {
          continue;
        }

        overwrite = true;
      }

      try {
        await this.rxdb.storage.upload(file, { path: targetDirectory, overwrite });
        successCount++;
      } catch {
        failedCount++;
      }
    }

    await this.refreshCurrentDirectory();

    if (failedCount > 0) {
      this.showToast(`Upload finished: ${successCount} succeeded, ${failedCount} failed`, 'error');
    } else {
      this.showToast(`Uploaded ${successCount} files`, 'success');
    }
  }

  handleOverwriteResponse(confirm: boolean): void {
    const current = this.overwriteConfirm();
    current.resolve?.(confirm);
    this.overwriteConfirm.set({ show: false, file: null, existingEntry: null });
  }

  async handleCreateFolder(): Promise<void> {
    const name = this.newFolderName().trim();
    if (!name) return;

    try {
      await this.rxdb.storage.createDirectory(name, { path: this.currentPath() });
      this.showNewFolder.set(false);
      this.newFolderName.set('');
      this.showToast('Folder created successfully', 'success');
      await this.refreshCurrentDirectory();
    } catch (err) {
      this.showToast(err instanceof Error ? err.message : String(err), 'error');
    }
  }

  async handleRename(): Promise<void> {
    const dialog = this.renameDialog();
    if (!dialog.entry || !dialog.newName.trim()) return;

    try {
      if (dialog.entry.kind === 'file' && dialog.entry.meta) {
        await this.rxdb.storage.rename(dialog.entry.meta.id, dialog.newName.trim());
      } else {
        await this.rxdb.storage.renameDirectory(dialog.entry.path, dialog.newName.trim());
      }

      this.renameDialog.set({ show: false, entry: null, newName: '' });
      this.showToast('Rename successful', 'success');
      await this.refreshCurrentDirectory();
    } catch (err) {
      this.showToast(err instanceof Error ? err.message : String(err), 'error');
    }
  }

  async handleBatchDelete(): Promise<void> {
    const selected = this.selectedPaths();
    if (selected.size === 0) return;

    const entries = this.entries().filter(entry => selected.has(entry.path));
    const shouldDelete = await new Promise<boolean>(resolve => {
      this.deleteConfirm.set({
        show: true,
        target: { type: 'batch', count: selected.size },
        resolve
      });
    });

    if (!shouldDelete) {
      return;
    }

    let failedCount = 0;
    for (const entry of entries) {
      const result = await this.deleteEntry(entry);
      if (!result) {
        failedCount++;
      }
    }

    if (failedCount > 0) {
      this.showToast(`${failedCount} items failed to delete`, 'error');
    } else {
      this.showToast(`Deleted ${entries.length} items`, 'success');
    }

    this.clearSelection();
  }

  async handleBatchDownload(): Promise<void> {
    const selectedEntries = this.entries().filter(entry => this.selectedPaths().has(entry.path));

    if (selectedEntries.length === 0) {
      this.showToast('No files selected', 'error');
      return;
    }

    if (selectedEntries.length === 1) {
      await this.handleDownload(selectedEntries[0]);
      return;
    }

    this.showToast(`Preparing ${selectedEntries.length} items...`, 'info');

    try {
      const fileCount = await this.downloadEntriesAsZip(selectedEntries, this.getBatchArchiveName());
      this.showToast(
        fileCount === 0 ?
          `Downloaded ${selectedEntries.length} empty folders`
        : `Downloaded ${selectedEntries.length} items (${fileCount} files)`,
        'success'
      );
    } catch (err) {
      this.showToast(err instanceof Error ? err.message : String(err), 'error');
    }
  }

  handleEntryClick(entry: StorageBrowserItem, event: MouseEvent): void {
    if (event.ctrlKey || event.metaKey) {
      const selected = new Set(this.selectedPaths());
      if (selected.has(entry.path)) {
        selected.delete(entry.path);
      } else {
        selected.add(entry.path);
      }
      this.selectedPaths.set(selected);
      this.lastSelectedPath.set(entry.path);
    } else if (event.shiftKey && this.lastSelectedPath()) {
      const entries = this.entries();
      const startIndex = entries.findIndex(item => item.path === this.lastSelectedPath());
      const endIndex = entries.findIndex(item => item.path === entry.path);

      if (startIndex !== -1 && endIndex !== -1) {
        const [start, end] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
        const selected = new Set(this.selectedPaths());
        for (let index = start; index <= end; index++) {
          selected.add(entries[index].path);
        }
        this.selectedPaths.set(selected);
      }
    } else {
      this.selectedPaths.set(new Set([entry.path]));
      this.lastSelectedPath.set(entry.path);
    }
  }

  handleContextMenu(event: MouseEvent, entry: StorageBrowserItem): void {
    event.preventDefault();
    this.contextMenu.set({
      show: true,
      x: event.clientX,
      y: event.clientY,
      entry
    });
  }

  closeContextMenu(): void {
    this.contextMenu.set({ show: false, x: 0, y: 0, entry: null });
  }

  async handleContextMenuAction(action: 'view' | 'download' | 'rename' | 'delete'): Promise<void> {
    const menu = this.contextMenu();
    this.closeContextMenu();

    if (!menu.entry) {
      return;
    }

    switch (action) {
      case 'view':
        if (menu.entry.kind === 'file') {
          this.previewEntry.set(menu.entry);
        } else {
          await this.navigateTo(menu.entry.path);
        }
        break;
      case 'download':
        await this.handleDownload(menu.entry);
        break;
      case 'rename':
        this.renameDialog.set({ show: true, entry: menu.entry, newName: menu.entry.name });
        break;
      case 'delete':
        await this.handleDelete(menu.entry);
        break;
    }
  }

  clearSelection(): void {
    this.selectedPaths.set(new Set());
    this.lastSelectedPath.set(null);
  }

  showToast(message: string, type: 'error' | 'success' | 'info' = 'info'): void {
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }

    this.toast.set({ show: true, message, type });
    this.toastTimer = setTimeout(() => {
      this.toast.set({ show: false, message: '', type: 'info' });
    }, 3000);
  }

  closeToast(): void {
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
      this.toastTimer = undefined;
    }

    this.toast.set({ show: false, message: '', type: 'info' });
  }

  async refresh(): Promise<void> {
    await this.refreshCurrentDirectory();
  }

  async handleDrop(event: DragEvent): Promise<void> {
    if (!event.dataTransfer) return;

    const items = event.dataTransfer.items;
    if (items) {
      const files: File[] = [];
      const promises: Promise<void>[] = [];

      for (let index = 0; index < items.length; index++) {
        const item = items[index];
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry?.();
          if (entry) {
            promises.push(traverseFileTree(entry, '', files));
          }
        }
      }

      await Promise.all(promises);

      if (files.length > 0) {
        const hasFolder = files.some(file => !!file.webkitRelativePath && file.webkitRelativePath.includes('/'));
        if (hasFolder) {
          await this.handleUploadFolder(files);
        } else {
          await this.handleUpload(files);
        }
      }

      return;
    }

    if (event.dataTransfer.files) {
      await this.handleUpload(Array.from(event.dataTransfer.files));
    }
  }

  async onClearAll(): Promise<void> {
    const confirmed = await this.confirm(STORAGE_LABELS.CONFIRM_CLEAR);
    if (!confirmed) {
      return;
    }

    try {
      await this.rxdb.storage.clear('/');
      this.clearSelection();
      this.previewEntry.set(null);
      this.showToast(STORAGE_LABELS.CLEAR_SUCCESS, 'success');
      await this.refreshCurrentDirectory();
    } catch (err) {
      this.showToast(err instanceof Error ? err.message : String(err), 'error');
    }
  }

  resolveConfirm(value: boolean): void {
    const dialog = this.confirmDialog();
    dialog.resolve?.(value);
    this.confirmDialog.set({ show: false, message: '' });
  }

  private confirm(message: string): Promise<boolean> {
    return new Promise(resolve => {
      this.confirmDialog.set({ show: true, message, resolve });
    });
  }

  private setAllFiles(metas: StorageFileMeta[]): void {
    const sorted = [...metas].sort((left, right) => left.opfsPath.localeCompare(right.opfsPath));
    this.allFiles.set(sorted);
  }

  private async deleteEntry(entry: StorageBrowserItem): Promise<boolean> {
    try {
      if (entry.kind === 'file' && entry.meta) {
        await this.rxdb.storage.delete(entry.meta.id);
      } else {
        await this.rxdb.storage.clear(entry.path);
      }

      await this.refreshCurrentDirectory();
      return true;
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  private normalizeRoutePath(path: string | null): string {
    if (!path || path === '/') {
      return '/';
    }

    const withLeadingSlash = path.startsWith('/') ? path : `/${path}`;
    return normalizeDirectoryPath(withLeadingSlash);
  }

  private getStoredViewMode(): ViewMode {
    const stored = localStorage.getItem(this.viewModeStorageKey);
    return stored === 'grid' || stored === 'list' ? stored : 'list';
  }

  private buildUrlFromPath(path: string): string {
    const segments = path.split('/').filter(Boolean);
    if (segments.length === 0) {
      return '/storage';
    }

    return `/storage/${segments.map(segment => encodeURIComponent(segment)).join('/')}`;
  }

  private handleMouseMove(event: MouseEvent): void {
    const box = this.selectionBox();
    if (!box?.active) {
      return;
    }

    const container = this.gridContainerRef()?.nativeElement;
    if (!container) {
      return;
    }

    const rect = container.getBoundingClientRect();
    const currentX = event.clientX - rect.left;
    const currentY = event.clientY - rect.top;

    this.selectionBox.set({
      ...box,
      currentX,
      currentY
    });

    const boxLeft = Math.min(box.startX, currentX) + rect.left;
    const boxTop = Math.min(box.startY, currentY) + rect.top;
    const boxRight = Math.max(box.startX, currentX) + rect.left;
    const boxBottom = Math.max(box.startY, currentY) + rect.top;

    const selected = new Set<string>();
    const items = container.querySelectorAll('[data-entry-path]');

    items.forEach(item => {
      const itemRect = item.getBoundingClientRect();
      const intersects = !(
        itemRect.right < boxLeft ||
        itemRect.left > boxRight ||
        itemRect.bottom < boxTop ||
        itemRect.top > boxBottom
      );
      if (intersects) {
        const path = item.getAttribute('data-entry-path');
        if (path) {
          selected.add(path);
        }
      }
    });

    this.selectedPaths.set(selected);
  }

  private handleMouseUp(): void {
    this.selectionBox.set(null);

    if (this.mouseMoveListener) {
      window.removeEventListener('mousemove', this.mouseMoveListener);
      this.mouseMoveListener = undefined;
    }

    if (this.mouseUpListener) {
      window.removeEventListener('mouseup', this.mouseUpListener);
      this.mouseUpListener = undefined;
    }
  }

  private async refreshCurrentDirectory(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      this.setAllFiles(await this.rxdb.storage.list());

      const entries = await this.rxdb.storage.listEntries({ path: this.currentPath() });
      const mappedEntries = entries
        .map(entry => this.mapEntry(entry))
        .sort((left, right) => {
          if (left.kind !== right.kind) {
            return left.kind === 'directory' ? -1 : 1;
          }

          return left.name.localeCompare(right.name);
        });
      this.entries.set(mappedEntries);
      this.syncSelectedPaths(mappedEntries);
    } catch (err) {
      this.entries.set([]);
      this.error.set(err instanceof Error ? err.message : String(err));
      this.showToast(this.error() || 'Unknown error', 'error');
    } finally {
      this.loading.set(false);
    }
  }

  private mapEntry(entry: StorageBrowserEntry): StorageBrowserItem {
    if (entry.kind === 'directory') {
      return {
        kind: 'directory',
        name: entry.name,
        path: entry.path
      };
    }

    return {
      kind: 'file',
      name: entry.meta.name,
      path: entry.path,
      meta: entry.meta,
      size: entry.meta.size,
      type: entry.meta.mimeType,
      lastModified: this.toTimestamp(entry.meta.updatedAt ?? entry.meta.createdAt)
    };
  }

  private toTimestamp(value: unknown): number | undefined {
    if (typeof value === 'number') {
      return value;
    }

    if (value instanceof Date) {
      return value.getTime();
    }

    if (typeof value === 'string') {
      const timestamp = new Date(value).getTime();
      return Number.isNaN(timestamp) ? undefined : timestamp;
    }

    return undefined;
  }

  private findExistingFileEntry(fileName: string, directoryPath: string): StorageBrowserItem | null {
    const targetOpfsPath = joinDirectoryAndFileName(directoryPath, fileName);
    const meta = this.allFiles().find(file => file.opfsPath === targetOpfsPath);

    if (!meta) {
      return null;
    }

    return this.mapEntry({
      kind: 'file',
      name: meta.name,
      path: `/${meta.opfsPath}`,
      meta
    });
  }

  private getUploadDirectory(relativePath: string): string {
    const segments = relativePath.replace(/\\/g, '/').split('/').filter(Boolean);
    if (segments.length <= 1) {
      return this.currentPath();
    }

    return normalizeDirectoryPath([this.currentPath(), ...segments.slice(0, -1)].join('/'));
  }

  private syncSelectedPaths(entries: StorageBrowserItem[]): void {
    const validPaths = new Set(entries.map(entry => entry.path));
    const nextSelected = new Set([...this.selectedPaths()].filter(path => validPaths.has(path)));

    if (nextSelected.size !== this.selectedPaths().size) {
      this.selectedPaths.set(nextSelected);
    }

    if (this.lastSelectedPath() && !validPaths.has(this.lastSelectedPath()!)) {
      this.lastSelectedPath.set(null);
    }
  }

  private async downloadEntriesAsZip(entries: StorageBrowserItem[], suggestedName: string): Promise<number> {
    const zipTree: Zippable = {};
    let fileCount = 0;

    for (const entry of entries) {
      fileCount += await this.addEntryToZip(zipTree, entry, [entry.name]);
    }

    const zipData = zipSync(zipTree, { level: 6 });
    const zipBuffer = new ArrayBuffer(zipData.byteLength);
    const zipBytes = new Uint8Array(zipBuffer);
    zipBytes.set(zipData);

    await this.downloadBlob(new Blob([zipBuffer], { type: 'application/zip' }), suggestedName);

    return fileCount;
  }

  private async addEntryToZip(
    zipTree: Zippable,
    entry: StorageBrowserItem,
    zipPathSegments: string[]
  ): Promise<number> {
    if (entry.kind === 'file') {
      if (!entry.meta) {
        return 0;
      }

      const blob = await this.rxdb.storage.read(entry.meta.id);
      const parentDirectory = this.ensureZipDirectory(zipTree, zipPathSegments.slice(0, -1));
      const fileName = zipPathSegments[zipPathSegments.length - 1];

      parentDirectory[fileName] = new Uint8Array(await blob.arrayBuffer());
      return 1;
    }

    this.ensureZipDirectory(zipTree, zipPathSegments);

    const childEntries = await this.rxdb.storage.listEntries({ path: entry.path });
    let fileCount = 0;

    for (const childEntry of childEntries) {
      fileCount += await this.addEntryToZip(zipTree, this.mapEntry(childEntry), [...zipPathSegments, childEntry.name]);
    }

    return fileCount;
  }

  private ensureZipDirectory(zipTree: Zippable, pathSegments: string[]): Zippable {
    let currentDirectory = zipTree;

    for (const segment of pathSegments) {
      const existingEntry = currentDirectory[segment];

      if (!this.isZipDirectory(existingEntry)) {
        currentDirectory[segment] = {};
      }

      currentDirectory = currentDirectory[segment] as Zippable;
    }

    return currentDirectory;
  }

  private isZipDirectory(entry: Zippable[keyof Zippable] | undefined): entry is Zippable {
    return !!entry && !Array.isArray(entry) && !(entry instanceof Uint8Array);
  }

  private async downloadBlob(blob: Blob, suggestedName: string): Promise<void> {
    const windowWithPicker = window as Window & {
      showSaveFilePicker?: (options: { suggestedName: string }) => Promise<FileSystemFileHandle>;
    };

    if (windowWithPicker.showSaveFilePicker) {
      try {
        const saveHandle = await windowWithPicker.showSaveFilePicker({ suggestedName });
        const writable = await saveHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        throw error;
      }
    }

    const url = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = suggestedName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  private getBatchArchiveName(): string {
    const folderName = this.currentPath().split('/').filter(Boolean).pop() || 'storage';
    return `${folderName}.zip`;
  }
}
