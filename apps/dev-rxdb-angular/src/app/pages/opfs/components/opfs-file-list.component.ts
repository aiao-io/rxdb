import { formatFileDate, formatFileSize } from '@modules/demo-i18n/files';
import { I18nPipe } from '../../../pipes/i18n.pipe';
/**
 * OPFS 文件列表组件
 *
 * 功能：
 * - 表格布局，紧凑显示文件信息
 * - 图标和名称整合在同一列
 * - 显示文件大小、修改时间
 * - 支持单击选择、双击打开、右键菜单
 */

import { useI18nOptional } from '@aiao/rxdb-i18n-angular';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, output } from '@angular/core';
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
  LucidePen as Pen,
  LucideTrash2 as Trash2
} from '@lucide/angular';
import { OPFSFileEntry, canPreviewFile, getFileIcon, getFileIconColor } from '../utils/opfs-utils';

@Component({
  selector: 'app-opfs-file-list',
  standalone: true,
  imports: [I18nPipe, CommonModule, LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <table class="table-zebra table select-none">
      <thead>
        <tr>
          <th>{{ 'file.name' | i18n }}</th>
          <th class="w-32">{{ 'file.size' | i18n }}</th>
          <th class="hidden w-40 md:table-cell">{{ 'file.modified' | i18n }}</th>
          <th class="w-24">{{ 'file.actions' | i18n }}</th>
        </tr>
      </thead>
      <tbody>
        @for (entry of entries(); track entry.path) {
          <tr
            class="cursor-pointer"
            [attr.data-entry-path]="entry.path"
            [class.bg-primary/10]="selectedPaths().has(entry.path)"
            [class.hover:bg-base-200]="!selectedPaths().has(entry.path)"
            (click)="handleEntryClick(entry, $event)"
            (contextmenu)="handleContextMenu($event, entry)"
            (dblclick)="handleDoubleClick(entry)"
          >
            <td class="font-medium">
              @if (entry.kind === 'directory') {
                <button
                  class="flex items-center gap-1.5 hover:underline"
                  (click)="navigate.emit(entry); $event.stopPropagation()"
                >
                  <svg [class]="getFileIconColor(entry)" [lucideIcon]="getFileIcon(entry)" size="16"></svg>
                  {{ entry.name }}
                </button>
              } @else {
                <div class="flex items-center gap-1.5">
                  <svg [class]="getFileIconColor(entry)" [lucideIcon]="getFileIcon(entry)" size="16"></svg>
                  <span>{{ entry.name }}</span>
                </div>
              }
            </td>
            <td class="text-base-content/60 text-sm">
              {{ entry.kind === 'file' ? formatFileSize(entry.size || 0) : '-' }}
            </td>
            <td class="text-base-content/60 hidden text-sm md:table-cell">
              {{ formatDate(entry.lastModified) }}
            </td>
            <td>
              <div class="flex items-center gap-1">
                @if (entry.kind === 'file') {
                  @if (canPreviewFile(entry)) {
                    <button
                      class="btn btn-ghost btn-xs"
                      [attr.title]="'file.preview' | i18n"
                      (click)="preview.emit(entry); $event.stopPropagation()"
                    >
                      <svg [lucideIcon]="Eye" size="14"></svg>
                    </button>
                  }
                  <button
                    class="btn btn-ghost btn-xs"
                    [attr.title]="'file.download' | i18n"
                    (click)="download.emit(entry); $event.stopPropagation()"
                  >
                    <svg [lucideIcon]="Download" size="14"></svg>
                  </button>
                }
                <button
                  class="btn btn-ghost btn-xs"
                  [attr.title]="'file.rename' | i18n"
                  (click)="rename.emit(entry); $event.stopPropagation()"
                  data-testid="opfs-rename-btn"
                >
                  <svg [lucideIcon]="Pen" size="14"></svg>
                </button>
                <button
                  class="btn btn-ghost btn-xs text-error"
                  [attr.title]="'file.delete' | i18n"
                  (click)="delete.emit(entry); $event.stopPropagation()"
                >
                  <svg [lucideIcon]="Trash2" size="14"></svg>
                </button>
              </div>
            </td>
          </tr>
        }
      </tbody>
    </table>
  `,
  styles: []
})
export class OpfsFileListComponent {
  readonly #i18n = useI18nOptional();
  private destroyRef = inject(DestroyRef);
  private clickTimeout: number | null = null;

  // Signal inputs
  entries = input.required<OPFSFileEntry[]>();
  currentPath = input.required<string>();
  selectedPaths = input<Set<string>>(new Set());

  // Signal outputs
  navigate = output<OPFSFileEntry>();
  download = output<OPFSFileEntry>();
  delete = output<OPFSFileEntry>();
  preview = output<OPFSFileEntry>();
  rename = output<OPFSFileEntry>();
  contextMenu = output<{ event: MouseEvent; entry: OPFSFileEntry }>();
  entryClick = output<{ entry: OPFSFileEntry; event: MouseEvent }>();

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
  readonly Pen = Pen;

  // Helper functions
  getFileIcon = getFileIcon;
  getFileIconColor = getFileIconColor;
  canPreviewFile = canPreviewFile;

  constructor() {
    // 组件销毁时清理点击延迟
    this.destroyRef.onDestroy(() => {
      if (this.clickTimeout) {
        clearTimeout(this.clickTimeout);
        this.clickTimeout = null;
      }
    });
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

  handleContextMenu(event: MouseEvent, entry: OPFSFileEntry): void {
    event.preventDefault();
    this.contextMenu.emit({ event, entry });
  }

  formatFileSize(bytes: number): string {
    return formatFileSize(bytes, this.#i18n?.locale() ?? 'zh-Hans');
  }

  formatDate(timestamp?: number): string {
    return formatFileDate(timestamp, this.#i18n?.locale() ?? 'zh-Hans');
  }
}
