import { RxDB } from '@aiao/rxdb';
import { normalizeDirectoryPath } from '@aiao/rxdb-plugin-storage';
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
import { map } from 'rxjs';
import { traverseFileTree } from '../../shared/traverse-file-tree';
import { StorageFileGridComponent } from './components/storage-file-grid.component';
import { StorageFileListComponent } from './components/storage-file-list.component';
import { StorageFilePreviewComponent } from './components/storage-file-preview.component';
import { StoragePageBrowser } from './storage-page.browser';
import {
  buildUrlFromPath,
  getBatchArchiveName,
  getStoredViewMode,
  normalizeRoutePath,
  pathSegmentsFrom,
  VIEW_MODE_STORAGE_KEY,
  type ViewMode
} from './storage-page.helpers';
import { nextSelectedPaths } from './storage-page.selection';
import { StoragePageTransfer } from './storage-page.transfer';
import { StorageBrowserItem } from './utils/storage-utils';

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
  private readonly destroyRef = inject(DestroyRef);
  private readonly browser: StoragePageBrowser;
  private readonly transfer: StoragePageTransfer;

  readonly rxdb = inject(RxDB);
  readonly router = inject(Router);
  readonly route = inject(ActivatedRoute);

  readonly currentPath = signal('/');
  readonly selectedPaths = signal<Set<string>>(new Set());
  readonly lastSelectedPath = signal<string | null>(null);
  readonly allFiles: StoragePageBrowser['allFiles'];
  readonly entries: StoragePageBrowser['entries'];
  readonly loading: StoragePageBrowser['loading'];
  readonly error: StoragePageBrowser['error'];
  readonly viewMode = signal<ViewMode>(getStoredViewMode());
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
  readonly opfsAvailable = signal(false);
  readonly selectionBox = signal<SelectionBox | null>(null);

  readonly routePath = toSignal(
    this.route.paramMap.pipe(map(params => normalizeRoutePath(params.get('storagePath')))),
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
    return pathSegmentsFrom(this.currentPath());
  }

  constructor() {
    this.browser = new StoragePageBrowser(this.rxdb.storage, {
      currentPath: this.currentPath,
      lastSelectedPath: this.lastSelectedPath,
      selectedPaths: this.selectedPaths,
      showToast: (message, type) => this.showToast(message, type)
    });
    this.allFiles = this.browser.allFiles;
    this.entries = this.browser.entries;
    this.loading = this.browser.loading;
    this.error = this.browser.error;
    this.transfer = new StoragePageTransfer(this.rxdb.storage, {
      currentPath: () => this.currentPath(),
      fileInputFiles: () => this.fileInputRef?.files,
      findExistingFileEntry: (fileName, directoryPath) => this.browser.findExistingFileEntry(fileName, directoryPath),
      refresh: () => this.browser.refreshCurrentDirectory(),
      resolveOverwrite: (file, existing) =>
        new Promise(resolve => {
          this.overwriteConfirm.set({ show: true, file, existingEntry: existing, resolve });
        }),
      showToast: (message, type) => this.showToast(message, type)
    });

    void checkOPFSAvailable().then(available => {
      if (!this.destroyRef.destroyed) this.opfsAvailable.set(available);
    });

    effect(() => {
      if (!this.opfsAvailable() || this.initialized) return;

      this.currentPath.set(this.routePath());
      this.initialized = true;
      void this.browser.refreshCurrentDirectory();
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
      void this.browser.refreshCurrentDirectory();
    });

    effect(() => {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, this.viewMode());
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
    await this.router.navigateByUrl(buildUrlFromPath(normalizeDirectoryPath(path)));
  }

  handleNavigate(entry: StorageBrowserItem): void {
    if (entry.kind === 'directory') {
      void this.navigateTo(entry.path);
    }
  }

  async handleDownload(entry: StorageBrowserItem): Promise<void> {
    await this.transfer.handleDownload(entry);
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
    await this.transfer.handleUpload(files);
  }

  async handleUploadFolder(files: File[]): Promise<void> {
    await this.transfer.handleUploadFolder(files);
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
      await this.browser.refreshCurrentDirectory();
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
      await this.browser.refreshCurrentDirectory();
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
    await this.transfer.handleBatchDownload(selectedEntries, getBatchArchiveName(this.currentPath()));
  }

  handleEntryClick(entry: StorageBrowserItem, event: MouseEvent): void {
    const next = nextSelectedPaths(entry, {
      entries: this.entries(),
      lastSelectedPath: this.lastSelectedPath(),
      metaKey: event.ctrlKey || event.metaKey,
      selectedPaths: this.selectedPaths(),
      shiftKey: event.shiftKey
    });
    this.selectedPaths.set(next.selectedPaths);
    this.lastSelectedPath.set(next.lastSelectedPath);
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
    await this.browser.refreshCurrentDirectory();
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
      await this.browser.refreshCurrentDirectory();
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

  private async deleteEntry(entry: StorageBrowserItem): Promise<boolean> {
    return this.browser.deleteEntry(entry);
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
}
