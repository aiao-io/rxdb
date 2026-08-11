/**
 * OPFS 文件网格组件
 *
 * 功能：
 * - macOS Finder 风格的卡片网格布局
 * - 自动加载图片缩略图（批量并发限制）
 * - 响应式列数（3-12列）
 * - Hover 显示操作按钮
 * - 支持单击选择、双击打开、右键菜单
 */

import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, output, signal } from '@angular/core';
import {
  LucideDownload as Download,
  LucideEye as Eye,
  LucideFileArchive as FileArchive,
  LucideFileCode as FileCode,
  LucideFileHeadphone as FileHeadphone,
  LucideFileImage as FileImage,
  LucideFilePlay as FilePlay,
  LucideFileText as FileText,
  LucideFolder as Folder,
  LucideFolderOpen as FolderOpen,
  LucideDynamicIcon,
  LucideTrash2 as Trash2
} from '@lucide/angular';
import { OpfsService } from '../services/opfs.service';
import {
  OPFSFileEntry,
  canPreviewFile,
  formatFileSize,
  getFileIcon,
  getFileIconColor,
  isImageFile
} from '../utils/opfs-utils';

@Component({
  selector: 'app-opfs-file-grid',
  standalone: true,
  imports: [CommonModule, LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="grid grid-cols-3 gap-3 p-3 select-none sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 2xl:grid-cols-12"
    >
      @for (entry of entries(); track entry.path) {
        <div
          class="group hover:bg-base-300 relative flex cursor-pointer flex-col items-center gap-1.5 rounded-lg p-1.5 transition-all"
          [attr.data-entry-path]="entry.path"
          [class.bg-primary/20]="selectedPaths().has(entry.path)"
          [class.ring-2]="selectedPaths().has(entry.path)"
          [class.ring-primary]="selectedPaths().has(entry.path)"
          (click)="handleEntryClick(entry, $event)"
          (contextmenu)="handleContextMenu($event, entry)"
          (dblclick)="handleDoubleClick(entry)"
          (keydown.enter)="handleDoubleClick(entry)"
          role="button"
          tabindex="0"
        >
          <!-- 图标/缩略图区域 -->
          <div class="flex h-16 w-full items-center justify-center">
            @if (entry.kind === 'file' && isImageFile(entry) && thumbnailUrls().has(entry.path)) {
              <img
                class="h-full w-full rounded object-cover"
                [alt]="entry.name"
                [src]="thumbnailUrls().get(entry.path)"
              />
            } @else {
              <svg [class]="getFileIconColor(entry)" [lucideIcon]="getFileIcon(entry)" size="24"></svg>
            }
          </div>

          <!-- 文件名区域 -->
          <div class="w-full text-center">
            <h2 class="line-clamp-2 text-xs font-medium" [title]="entry.name">
              {{ entry.name }}
            </h2>
            @if (entry.kind === 'file') {
              <p class="text-base-content/60 text-[10px]">{{ formatFileSize(entry.size || 0) }}</p>
            }
          </div>

          <!-- 操作按钮 - 右上角 -->
          <div class="absolute top-1 right-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            @if (entry.kind === 'file' && canPreviewFile(entry)) {
              <button
                class="btn btn-circle btn-ghost btn-xs bg-base-100/80 backdrop-blur"
                (click)="preview.emit(entry); $event.stopPropagation()"
                title="预览"
              >
                <svg [lucideIcon]="Eye" size="12"></svg>
              </button>
            }
            @if (entry.kind === 'file') {
              <button
                class="btn btn-circle btn-ghost btn-xs bg-base-100/80 backdrop-blur"
                (click)="download.emit(entry); $event.stopPropagation()"
                title="下载"
              >
                <svg [lucideIcon]="Download" size="12"></svg>
              </button>
            }
            <button
              class="btn btn-circle btn-ghost btn-xs bg-base-100/80 text-error backdrop-blur"
              (click)="delete.emit(entry); $event.stopPropagation()"
              title="删除"
            >
              <svg [lucideIcon]="Trash2" size="12"></svg>
            </button>
          </div>
        </div>
      }
    </div>
  `,
  styles: []
})
export class OpfsFileGridComponent {
  private opfsService = inject(OpfsService);
  private destroyRef = inject(DestroyRef);
  private loadingThumbnails = false;
  private lastEntriesHash = '';
  private clickTimeout: number | null = null;
  private thumbnailLoadTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  // Signal inputs
  entries = input.required<OPFSFileEntry[]>();
  currentPath = input.required<string>();
  selectedPaths = input<Set<string>>(new Set());

  // Signal outputs
  navigate = output<OPFSFileEntry>();
  download = output<OPFSFileEntry>();
  delete = output<OPFSFileEntry>();
  preview = output<OPFSFileEntry>();
  contextMenu = output<{ event: MouseEvent; entry: OPFSFileEntry }>();
  entryClick = output<{ entry: OPFSFileEntry; event: MouseEvent }>();

  thumbnailUrls = signal<Map<string, string>>(new Map());

  // Icons
  readonly Folder = Folder;
  readonly FolderOpen = FolderOpen;
  readonly File = File;
  readonly FileImage = FileImage;
  readonly FileVideo = FilePlay;
  readonly FileAudio = FileHeadphone;
  readonly FileArchive = FileArchive;
  readonly FileCode = FileCode;
  readonly FileText = FileText;
  readonly Download = Download;
  readonly Trash2 = Trash2;
  readonly Eye = Eye;
  getFileIcon = getFileIcon;
  getFileIconColor = getFileIconColor;
  isImageFile = isImageFile;
  formatFileSize = formatFileSize;
  canPreviewFile = canPreviewFile;

  constructor() {
    // 智能加载缩略图：仅在 entries 真正变化时触发
    effect(() => {
      const entries = this.entries();
      if (!entries || entries.length === 0) {
        this.thumbnailUrls.set(new Map());
        return;
      }

      // 使用哈希值检测实际变化，避免不必要的重新加载
      const entriesHash = entries.map(e => e.path).join('|');
      if (entriesHash === this.lastEntriesHash) return;
      this.lastEntriesHash = entriesHash;

      // 异步加载避免阻塞 UI 渲染
      if (!this.loadingThumbnails) {
        this.thumbnailLoadTimer = setTimeout(() => {
          this.thumbnailLoadTimer = null;
          if (!this.destroyed) void this.loadThumbnails();
        }, 0);
      }
    });

    // 组件销毁时清理所有 blob URL
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      if (this.thumbnailLoadTimer) {
        clearTimeout(this.thumbnailLoadTimer);
        this.thumbnailLoadTimer = null;
      }

      // 清理点击延迟
      if (this.clickTimeout) {
        clearTimeout(this.clickTimeout);
        this.clickTimeout = null;
      }

      // 清理缩略图 URL
      const urls = this.thumbnailUrls();
      for (const url of urls.values()) {
        URL.revokeObjectURL(url);
      }
      this.thumbnailUrls.set(new Map());
    });
  }

  /**
   * 批量加载图片缩略图
   *
   * 策略：
   * - 清理旧 Blob URL 防止内存泄漏
   * - 并发限制 5 个，避免阻塞浏览器
   * - 失败时静默跳过（降级显示图标）
   */
  async loadThumbnails(): Promise<void> {
    if (this.destroyed || this.loadingThumbnails) return;
    this.loadingThumbnails = true;

    try {
      this.clearThumbnailUrls();

      const imageEntries = this.entries().filter(e => this.isImageFile(e));
      const urls = new Map<string, string>();

      // 分批加载，每批 5 个图片
      const CONCURRENT_LIMIT = 5;
      for (let i = 0; i < imageEntries.length; i += CONCURRENT_LIMIT) {
        const batch = imageEntries.slice(i, i + CONCURRENT_LIMIT);
        await Promise.all(
          batch.map(async entry => {
            try {
              const preview = await this.opfsService.previewFile(entry);
              if (preview?.data instanceof Blob) {
                const url = URL.createObjectURL(preview.data);
                if (this.destroyed) URL.revokeObjectURL(url);
                else urls.set(entry.path, url);
              }
            } catch {
              // 静默失败，显示默认图标
            }
          })
        );
        if (this.destroyed) {
          this.revokeUrls(urls);
          return;
        }
      }

      if (!this.destroyed) this.thumbnailUrls.set(urls);
    } finally {
      this.loadingThumbnails = false;
    }
  }

  /**
   * 单击处理：250ms 延迟，避免和双击冲突
   */
  handleEntryClick(entry: OPFSFileEntry, event: MouseEvent): void {
    if (this.clickTimeout) clearTimeout(this.clickTimeout);

    this.clickTimeout = window.setTimeout(() => {
      this.entryClick.emit({ entry, event });
      this.clickTimeout = null;
    }, 250);
  }

  handleContextMenu(event: MouseEvent, entry: OPFSFileEntry): void {
    event.preventDefault();
    this.contextMenu.emit({ event, entry });
  }

  /**
   * 双击处理：取消单击延迟，直接执行操作
   * - 文件夹：导航进入
   * - 文件：打开预览
   */
  handleDoubleClick(entry: OPFSFileEntry): void {
    if (this.clickTimeout) {
      clearTimeout(this.clickTimeout);
      this.clickTimeout = null;
    }

    if (entry.kind === 'directory') {
      this.navigate.emit(entry);
    } else {
      this.preview.emit(entry);
    }
  }

  private clearThumbnailUrls(): void {
    this.revokeUrls(this.thumbnailUrls());
    this.thumbnailUrls.set(new Map());
  }

  private revokeUrls(urls: Map<string, string>): void {
    for (const url of urls.values()) URL.revokeObjectURL(url);
  }
}
