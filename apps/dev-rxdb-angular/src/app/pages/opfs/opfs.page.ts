/**
 * OPFS 文件管理页面
 */

import { checkOPFSAvailable, OpfsRouteSync } from '@aiao/utils';
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
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  LucideAlertTriangle as AlertTriangle,
  LucideChevronRight as ChevronRight,
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
import { OpfsFileGridComponent } from './components/opfs-file-grid.component';
import { OpfsFileListComponent } from './components/opfs-file-list.component';
import { OpfsFilePreviewComponent } from './components/opfs-file-preview.component';
import { OpfsService } from './services/opfs.service';
import { formatFileSize, OPFSFileEntry } from './utils/opfs-utils';
import { ResettableTimer } from './utils/resettable-timer';

type ViewMode = 'list' | 'grid';

interface DeleteConfirm {
  show: boolean;
  target: DeleteTarget | null;
  resolve?: (value: boolean) => void;
}

type DeleteTarget = { type: 'single'; entry: OPFSFileEntry } | { type: 'batch'; count: number };

interface RenameDialog {
  show: boolean;
  entry: OPFSFileEntry | null;
  newName: string;
}

interface OverwriteConfirm {
  show: boolean;
  file: File | null;
  existingEntry: OPFSFileEntry | null;
  resolve?: (value: boolean) => void;
}

interface ContextMenu {
  show: boolean;
  x: number;
  y: number;
  entry: OPFSFileEntry | null;
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
  selector: 'app-opfs-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    LucideDynamicIcon,
    OpfsFileListComponent,
    OpfsFileGridComponent,
    OpfsFilePreviewComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './opfs.page.html'
})
export default class OpfsPage implements OnInit, OnDestroy {
  private mouseMoveListener?: (e: MouseEvent) => void;
  private mouseUpListener?: () => void;
  private inputAbortController?: AbortController;
  private readonly toastTimer = new ResettableTimer();
  private readonly routeSync = new OpfsRouteSync();
  private readonly destroyRef = inject(DestroyRef);
  readonly opfsService = inject(OpfsService);
  readonly router = inject(Router);
  readonly route = inject(ActivatedRoute);

  // Service signals
  readonly entries = this.opfsService.entries;
  readonly currentPath = this.opfsService.currentPath;
  readonly loading = this.opfsService.loading;
  readonly error = this.opfsService.error;

  // Local state
  readonly viewMode = signal<ViewMode>(this.getStoredViewMode());
  readonly previewEntry = signal<OPFSFileEntry | null>(null);
  readonly newFolderName = signal<string>('');
  readonly showNewFolder = signal<boolean>(false);
  readonly isDragging = signal<boolean>(false);
  readonly overwriteConfirm = signal<OverwriteConfirm>({ show: false, file: null, existingEntry: null });
  readonly contextMenu = signal<ContextMenu>({ show: false, x: 0, y: 0, entry: null });
  readonly renameDialog = signal<RenameDialog>({ show: false, entry: null, newName: '' });
  readonly deleteConfirm = signal<DeleteConfirm>({ show: false, target: null });
  readonly toast = signal<Toast>({ show: false, message: '', type: 'info' });

  readonly selectedPaths = signal<Set<string>>(new Set());
  readonly lastSelectedPath = signal<string | null>(null);
  readonly opfsAvailable = signal<boolean>(false);
  readonly selectionBox = signal<SelectionBox | null>(null);

  // 将路由参数转换为 signal
  readonly routePath = toSignal(
    this.route.paramMap.pipe(map(params => this.normalizeRoutePath(params.get('opfsPath')))),
    { initialValue: '/' }
  );

  // ViewChild for grid container
  readonly gridContainerRef = viewChild<ElementRef<HTMLDivElement>>('gridContainer');

  // Math for template
  readonly Math = Math;

  // Icons
  readonly Home = Home;
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

  fileInputRef?: HTMLInputElement;
  folderInputRef?: HTMLInputElement;

  // 格式化文件大小
  formatFileSize = formatFileSize;

  // 统计信息
  get dirCount(): number {
    return this.entries().filter(e => e.kind === 'directory').length;
  }

  get fileCount(): number {
    return this.entries().filter(e => e.kind === 'file').length;
  }

  // 路径导航片段
  get pathSegments() {
    const path = this.currentPath();
    if (!path || path === '/') return [];
    return path
      .split('/')
      .filter(Boolean)
      .map((segment, index, arr) => ({
        name: segment,
        path: '/' + arr.slice(0, index + 1).join('/') + '/'
      }));
  }

  constructor() {
    void checkOPFSAvailable().then(available => {
      if (!this.destroyRef.destroyed) this.opfsAvailable.set(available);
    });

    effect(() => {
      const available = this.opfsAvailable();
      const path = this.routePath();
      void this.routeSync
        .sync(available, path, () => untracked(() => this.currentPath()), {
          init: initialPath => this.opfsService.init(initialPath),
          navigateTo: routePath => this.opfsService.navigateTo(routePath)
        })
        .catch(() => undefined);
    });

    // 监听 viewMode 变化并保存到 localStorage
    effect(() => {
      const mode = this.viewMode();
      localStorage.setItem('opfs-view-mode', mode);
    });
  }

  /**
   * 辅助方法：处理 newFolderName 输入
   */
  onNewFolderNameInput(event: Event): void {
    this.newFolderName.set((event.target as HTMLInputElement).value);
  }

  /**
   * 辅助方法：处理 rename 输入
   */
  onRenameInput(event: Event): void {
    this.renameDialog.set({
      show: this.renameDialog().show,
      entry: this.renameDialog().entry,
      newName: (event.target as HTMLInputElement).value
    });
  }

  ngOnInit(): void {
    this.inputAbortController = new AbortController();
    const listenerOptions = { signal: this.inputAbortController.signal };

    this.fileInputRef = document.createElement('input');
    this.fileInputRef.type = 'file';
    this.fileInputRef.multiple = true;
    // e2e 直接 setInputFiles 到这个隐藏 input 上（真实的系统文件选择框驱动不了）。
    // testid 与 react / vue 两端保持同名，三份 opfs.spec.ts 才能共用同一套选择器。
    this.fileInputRef.dataset['testid'] = 'opfs-file-input';
    this.fileInputRef.style.display = 'none';
    document.body.appendChild(this.fileInputRef);
    this.fileInputRef.addEventListener('change', this.handleFileInputChange, listenerOptions);

    this.folderInputRef = document.createElement('input');
    this.folderInputRef.type = 'file';
    this.folderInputRef.setAttribute('webkitdirectory', '');
    this.folderInputRef.setAttribute('directory', '');
    this.folderInputRef.style.display = 'none';
    document.body.appendChild(this.folderInputRef);
    this.folderInputRef.addEventListener('change', this.handleFolderInputChange, listenerOptions);
  }

  ngOnDestroy(): void {
    if (this.mouseMoveListener) {
      window.removeEventListener('mousemove', this.mouseMoveListener);
    }
    if (this.mouseUpListener) {
      window.removeEventListener('mouseup', this.mouseUpListener);
    }
    this.inputAbortController?.abort();
    this.fileInputRef?.remove();
    this.folderInputRef?.remove();
    this.fileInputRef = undefined;
    this.folderInputRef = undefined;
    this.toastTimer.clear();
  }

  // 框选逻辑
  // 鼠标按下 - 开始框选
  handleMouseDown(event: MouseEvent): void {
    // 只在网格视图且没有按修饰键时启用框选
    if (this.viewMode() !== 'grid' || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }

    // 如果点击的是按钮或链接，不启用框选
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

    // 添加全局鼠标事件监听器
    this.mouseMoveListener = (e: MouseEvent) => this.handleMouseMove(e);
    this.mouseUpListener = () => this.handleMouseUp();
    window.addEventListener('mousemove', this.mouseMoveListener);
    window.addEventListener('mouseup', this.mouseUpListener);
  }

  // 导航到文件/目录
  handleNavigate(entry: OPFSFileEntry): void {
    if (entry.kind === 'directory') {
      void this.navigateTo(entry.path);
    }
  }

  navigateTo(path: string): Promise<boolean> {
    return this.router.navigateByUrl(this.buildUrlFromPath(path));
  }

  // 下载文件
  async handleDownload(entry: OPFSFileEntry): Promise<void> {
    if (entry.kind === 'file') {
      await this.opfsService.downloadFile(entry);
    }
  }

  // 删除文件或目录
  async handleDelete(entry: OPFSFileEntry): Promise<void> {
    const shouldDelete = await new Promise<boolean>(resolve => {
      this.deleteConfirm.set({ show: true, target: { type: 'single', entry }, resolve });
    });

    if (shouldDelete) {
      const result = await this.opfsService.deleteEntry(entry);
      if (!result) {
        this.showToast(`删除失败: ${entry.name}`, 'error');
      }
    }
  }

  // 处理删除确认
  handleDeleteResponse(confirm: boolean): void {
    const current = this.deleteConfirm();
    if (current.resolve) {
      current.resolve(confirm);
    }
    this.deleteConfirm.set({ show: false, target: null });
  }

  // 上传文件
  async handleUpload(files?: File[]): Promise<void> {
    const filesToUpload = files || this.fileInputRef?.files;
    if (!filesToUpload || filesToUpload.length === 0) return;

    const fileList = Array.from(filesToUpload);

    for (const file of fileList) {
      const existingFile = this.entries().find(e => e.kind === 'file' && e.name === file.name);

      if (existingFile) {
        const shouldOverwrite = await new Promise<boolean>(resolve => {
          this.overwriteConfirm.set({ show: true, file, existingEntry: existingFile, resolve });
        });

        if (!shouldOverwrite) continue;
      }

      await this.opfsService.uploadFile(file);
    }

    if (this.fileInputRef) {
      this.fileInputRef.value = '';
    }
  }

  // 上传文件夹
  async handleUploadFolder(files: File[]): Promise<void> {
    if (files.length === 0) return;

    this.showToast(`正在上传文件夹，共 ${files.length} 个文件...`, 'info');

    let successCount = 0;
    let failedCount = 0;

    for (const file of files) {
      // 使用 webkitRelativePath 获取文件在文件夹中的相对路径
      const relativePath = file.webkitRelativePath || file.name;
      const success = await this.opfsService.uploadFileWithPath(file, relativePath);

      if (success) {
        successCount++;
      } else {
        failedCount++;
      }
    }

    // 上传完成后刷新目录
    await this.opfsService.refresh();

    if (failedCount > 0) {
      this.showToast(`上传完成：${successCount} 成功，${failedCount} 失败`, 'error');
    } else {
      this.showToast(`成功上传 ${successCount} 个文件`, 'success');
    }
  }

  // 处理覆盖确认
  handleOverwriteResponse(confirm: boolean): void {
    const current = this.overwriteConfirm();
    if (current.resolve) {
      current.resolve(confirm);
    }
    this.overwriteConfirm.set({ show: false, file: null, existingEntry: null });
  }

  // 创建文件夹
  async handleCreateFolder(): Promise<void> {
    const name = this.newFolderName().trim();
    if (!name) return;

    const success = await this.opfsService.createDirectory(name);
    if (success) {
      this.showNewFolder.set(false);
      this.newFolderName.set('');
    }
  }

  // 重命名
  async handleRename(): Promise<void> {
    const dialog = this.renameDialog();
    if (!dialog.entry || !dialog.newName.trim()) return;

    const success = await this.opfsService.renameEntry(dialog.entry, dialog.newName.trim());
    if (success) {
      this.renameDialog.set({ show: false, entry: null, newName: '' });
    }
  }

  // 批量删除
  async handleBatchDelete(): Promise<void> {
    const selected = this.selectedPaths();
    if (selected.size === 0) return;

    const entries = this.entries().filter(e => selected.has(e.path));
    const shouldDelete = await new Promise<boolean>(resolve => {
      this.deleteConfirm.set({
        show: true,
        target: { type: 'batch', count: selected.size },
        resolve
      });
    });

    if (shouldDelete) {
      let failedCount = 0;
      for (const entry of entries) {
        const result = await this.opfsService.deleteEntry(entry);
        if (!result) failedCount++;
      }
      if (failedCount > 0) {
        this.showToast(`${failedCount} 个项目删除失败`, 'error');
      } else {
        this.showToast(`成功删除 ${entries.length} 个项目`, 'success');
      }
      this.clearSelection();
    }
  }

  // 批量下载
  async handleBatchDownload(): Promise<void> {
    const selected = this.selectedPaths();
    if (selected.size === 0) return;

    const entries = this.entries().filter(e => selected.has(e.path) && e.kind === 'file');
    if (entries.length === 0) {
      this.showToast('没有选中文件', 'error');
      return;
    }

    this.showToast(`正在下载 ${entries.length} 个文件...`, 'info');
    const result = await this.opfsService.downloadFilesAsZip(entries);
    if (!result.success) {
      if (result.error) {
        this.showToast(result.error, 'error');
      }
      return;
    }

    this.showToast(`成功下载 ${entries.length} 个文件`, 'success');
    this.clearSelection();
  }

  // 条目点击处理
  handleEntryClick(entry: OPFSFileEntry, event: MouseEvent): void {
    if (event.ctrlKey || event.metaKey) {
      // Ctrl/Cmd + 点击：切换选中状态
      const selected = new Set(this.selectedPaths());
      if (selected.has(entry.path)) {
        selected.delete(entry.path);
      } else {
        selected.add(entry.path);
      }
      this.selectedPaths.set(selected);
      this.lastSelectedPath.set(entry.path);
    } else if (event.shiftKey && this.lastSelectedPath()) {
      // Shift + 点击：范围选择
      const entries = this.entries();
      const startIndex = entries.findIndex(e => e.path === this.lastSelectedPath());
      const endIndex = entries.findIndex(e => e.path === entry.path);
      if (startIndex !== -1 && endIndex !== -1) {
        const [start, end] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
        const newSet = new Set(this.selectedPaths());
        for (let i = start; i <= end; i++) {
          newSet.add(entries[i].path);
        }
        this.selectedPaths.set(newSet);
      }
    } else {
      // 普通点击：清除其他选择
      this.selectedPaths.set(new Set([entry.path]));
      this.lastSelectedPath.set(entry.path);
    }
  }

  // 右键菜单
  handleContextMenu(event: MouseEvent, entry: OPFSFileEntry): void {
    event.preventDefault();
    this.contextMenu.set({
      show: true,
      x: event.clientX,
      y: event.clientY,
      entry
    });
  }

  // 关闭右键菜单
  closeContextMenu(): void {
    this.contextMenu.set({ show: false, x: 0, y: 0, entry: null });
  }

  // 右键菜单操作
  async handleContextMenuAction(action: 'view' | 'rename' | 'delete'): Promise<void> {
    const menu = this.contextMenu();
    this.closeContextMenu();

    if (!menu.entry) return;

    switch (action) {
      case 'view':
        if (menu.entry.kind === 'file') {
          this.previewEntry.set(menu.entry);
        } else {
          this.handleNavigate(menu.entry);
        }
        break;
      case 'rename':
        this.renameDialog.set({ show: true, entry: menu.entry, newName: menu.entry.name });
        break;
      case 'delete':
        await this.handleDelete(menu.entry);
        break;
    }
  }

  // 清除选择
  clearSelection(): void {
    this.selectedPaths.set(new Set());
    this.lastSelectedPath.set(null);
  }

  // 显示 Toast
  showToast(message: string, type: 'error' | 'success' | 'info' = 'info'): void {
    this.toast.set({ show: true, message, type });
    this.toastTimer.schedule(() => {
      this.toast.set({ show: false, message: '', type: 'info' });
    }, 3000);
  }

  // 关闭 Toast
  closeToast(): void {
    this.toastTimer.clear();
    this.toast.set({ show: false, message: '', type: 'info' });
  }

  // 清除错误
  clearError(): void {
    this.opfsService.refresh();
  }

  // 刷新
  async refresh(): Promise<void> {
    await this.opfsService.refresh();
  }

  // 处理拖放
  async handleDrop(event: DragEvent): Promise<void> {
    if (!event.dataTransfer) return;

    const items = event.dataTransfer.items;
    if (items) {
      // 使用 DataTransferItem API 处理文件和文件夹
      const entries: File[] = [];
      const promises: Promise<void>[] = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry?.();
          if (entry) {
            promises.push(traverseFileTree(entry, '', entries));
          }
        }
      }

      await Promise.all(promises);

      if (entries.length > 0) {
        // 检测是否有文件在子目录中（说明拖入了文件夹）
        const hasFolder = entries.some(f => f.webkitRelativePath.includes('/'));

        if (hasFolder) {
          await this.handleUploadFolder(entries);
        } else {
          await this.handleUpload(entries);
        }
      }
    } else if (event.dataTransfer.files) {
      // 降级方案：只支持文件
      await this.handleUpload(Array.from(event.dataTransfer.files));
    }
  }

  private readonly handleFileInputChange = (): void => {
    if (!this.fileInputRef?.files) {
      return;
    }
    void this.handleUpload(Array.from(this.fileInputRef.files));
    this.fileInputRef.value = '';
  };

  private readonly handleFolderInputChange = (): void => {
    if (!this.folderInputRef?.files) {
      return;
    }
    void this.handleUploadFolder(Array.from(this.folderInputRef.files));
    this.folderInputRef.value = '';
  };

  private normalizeRoutePath(path: string | null): string {
    if (!path || path === '/') return '/';
    const withLeading = path.startsWith('/') ? path : `/${path}`;
    return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
  }
  private getStoredViewMode(): ViewMode {
    const stored = localStorage.getItem('opfs-view-mode');
    return stored === 'grid' || stored === 'list' ? stored : 'list';
  }

  private buildUrlFromPath(path: string): string {
    const segments = path.split('/').filter(Boolean);
    if (segments.length === 0) return '/opfs';
    const pathStr = segments.map(s => encodeURIComponent(s)).join('/');
    return `/opfs/${pathStr}`;
  }

  // 鼠标移动 - 更新框选区域
  private handleMouseMove(event: MouseEvent): void {
    const box = this.selectionBox();
    if (!box?.active) return;

    const container = this.gridContainerRef()?.nativeElement;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const currentX = event.clientX - rect.left;
    const currentY = event.clientY - rect.top;

    this.selectionBox.set({
      ...box,
      currentX,
      currentY
    });

    // 计算选择框范围并选中相交的项目
    const boxLeft = Math.min(box.startX, currentX) + rect.left;
    const boxTop = Math.min(box.startY, currentY) + rect.top;
    const boxRight = Math.max(box.startX, currentX) + rect.left;
    const boxBottom = Math.max(box.startY, currentY) + rect.top;

    const selected = new Set<string>();
    const items = container.querySelectorAll('[data-entry-path]');

    items.forEach(item => {
      const itemRect = item.getBoundingClientRect();
      // 判断是否相交
      const intersects = !(
        itemRect.right < boxLeft ||
        itemRect.left > boxRight ||
        itemRect.bottom < boxTop ||
        itemRect.top > boxBottom
      );

      if (intersects) {
        const path = item.getAttribute('data-entry-path');
        if (path) selected.add(path);
      }
    });

    this.selectedPaths.set(selected);
  }

  // 鼠标释放 - 结束框选
  private handleMouseUp(): void {
    this.selectionBox.set(null);

    // 移除事件监听器
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
