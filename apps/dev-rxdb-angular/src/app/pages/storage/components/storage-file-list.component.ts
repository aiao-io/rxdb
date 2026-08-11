import { formatFileSize, STORAGE_TESTID } from '@aiao/utils';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, output } from '@angular/core';
import { LucideDownload as Download, LucideEye as Eye, LucideFolderOpen as FolderOpen, LucideDynamicIcon, LucideTrash2 as Trash2 } from '@lucide/angular';
import { canPreviewFile, getFileIcon, getFileIconColor, StorageBrowserItem } from '../utils/storage-utils';

@Component({
  selector: 'app-storage-file-list',
  standalone: true,
  imports: [CommonModule, LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <table class="table-zebra table select-none" [attr.data-testid]="TESTID.FILE_LIST">
      <thead>
        <tr>
          <th>Name</th>
          <th class="w-32">Size</th>
          <th class="w-40">Modified</th>
          <th class="w-24">Actions</th>
        </tr>
      </thead>
      <tbody>
        @for (entry of entries(); track entry.path) {
          <tr
            class="cursor-pointer"
            [attr.data-entry-path]="entry.path"
            [attr.data-testid]="entry.kind === 'file' ? TESTID.FILE_ROW : null"
            [class.bg-primary/10]="selectedPaths().has(entry.path)"
            [class.hover:bg-base-200]="!selectedPaths().has(entry.path)"
            (click)="handleEntryClick(entry, $event)"
            (contextmenu)="handleContextMenu($event, entry)"
            (dblclick)="handleDoubleClick(entry)"
          >
            <td class="font-medium" [attr.data-testid]="entry.kind === 'file' ? TESTID.FILE_NAME : null">
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
            <td
              class="text-base-content/60 text-sm"
              [attr.data-testid]="entry.kind === 'file' ? TESTID.FILE_SIZE : null"
            >
              {{ entry.kind === 'file' ? formatFileSize(entry.size || 0) : '-' }}
            </td>
            <td class="text-base-content/60 text-sm">{{ formatDate(entry.lastModified) }}</td>
            <td>
              <div class="flex items-center gap-1">
                @if (entry.kind === 'directory') {
                  <button
                    class="btn btn-ghost btn-xs"
                    (click)="navigate.emit(entry); $event.stopPropagation()"
                    title="Open"
                  >
                    <svg [lucideIcon]="FolderOpen" size="14"></svg>
                  </button>
                  <button
                    class="btn btn-ghost btn-xs"
                    (click)="download.emit(entry); $event.stopPropagation()"
                    title="Download ZIP"
                  >
                    <svg [lucideIcon]="Download" size="14"></svg>
                  </button>
                } @else {
                  @if (canPreviewFile(entry)) {
                    <button
                      class="btn btn-ghost btn-xs"
                      [attr.data-testid]="TESTID.PREVIEW_BTN"
                      (click)="preview.emit(entry); $event.stopPropagation()"
                      title="Preview"
                    >
                      <svg [lucideIcon]="Eye" size="14"></svg>
                    </button>
                  }
                  <button
                    class="btn btn-ghost btn-xs"
                    [attr.data-testid]="TESTID.DOWNLOAD_BTN"
                    (click)="download.emit(entry); $event.stopPropagation()"
                    title="Download"
                  >
                    <svg [lucideIcon]="Download" size="14"></svg>
                  </button>
                }
                <button
                  class="btn btn-ghost btn-xs text-error"
                  [attr.data-testid]="entry.kind === 'file' ? TESTID.DELETE_BTN : null"
                  (click)="delete.emit(entry); $event.stopPropagation()"
                  title="Delete"
                >
                  <svg [lucideIcon]="Trash2" size="14"></svg>
                </button>
              </div>
            </td>
          </tr>
        }
      </tbody>
    </table>
  `
})
export class StorageFileListComponent {
  private destroyRef = inject(DestroyRef);
  private clickTimeout: number | null = null;

  readonly TESTID = STORAGE_TESTID;

  entries = input.required<StorageBrowserItem[]>();
  currentPath = input.required<string>();
  selectedPaths = input<Set<string>>(new Set());

  navigate = output<StorageBrowserItem>();
  download = output<StorageBrowserItem>();
  delete = output<StorageBrowserItem>();
  preview = output<StorageBrowserItem>();
  contextMenu = output<{ event: MouseEvent; entry: StorageBrowserItem }>();
  entryClick = output<{ entry: StorageBrowserItem; event: MouseEvent }>();

  readonly FolderOpen = FolderOpen;
  readonly Download = Download;
  readonly Trash2 = Trash2;
  readonly Eye = Eye;
  getFileIcon = getFileIcon;
  getFileIconColor = getFileIconColor;
  formatFileSize = formatFileSize;
  canPreviewFile = canPreviewFile;

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.clickTimeout) {
        clearTimeout(this.clickTimeout);
      }
    });
  }

  formatDate(timestamp?: number): string {
    if (!timestamp) return '-';

    return new Date(timestamp).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  handleEntryClick(entry: StorageBrowserItem, event: MouseEvent): void {
    if (this.clickTimeout) {
      clearTimeout(this.clickTimeout);
    }

    this.clickTimeout = window.setTimeout(() => {
      this.entryClick.emit({ entry, event });
      this.clickTimeout = null;
    }, 250);
  }

  handleDoubleClick(entry: StorageBrowserItem): void {
    if (this.clickTimeout) {
      clearTimeout(this.clickTimeout);
      this.clickTimeout = null;
    }

    if (entry.kind === 'directory') {
      this.navigate.emit(entry);
      return;
    }

    this.preview.emit(entry);
  }

  handleContextMenu(event: MouseEvent, entry: StorageBrowserItem): void {
    event.preventDefault();
    this.contextMenu.emit({ event, entry });
  }
}
