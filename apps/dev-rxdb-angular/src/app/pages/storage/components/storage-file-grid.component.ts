import { RxDB } from '@aiao/rxdb';
import { formatFileSize, STORAGE_TESTID } from '@aiao/utils';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, output, signal } from '@angular/core';
import {
  LucideDownload as Download,
  LucideEye as Eye,
  LucideFolderOpen as FolderOpen,
  LucideDynamicIcon,
  LucideTrash2 as Trash2
} from '@lucide/angular';
import { canPreviewFile, getFileIcon, getFileIconColor, isImageFile, StorageBrowserItem } from '../utils/storage-utils';

@Component({
  selector: 'app-storage-file-grid',
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

          <div class="w-full text-center">
            <h2
              class="line-clamp-2 text-xs font-medium"
              [attr.data-testid]="entry.kind === 'file' ? TESTID.FILE_NAME : null"
              [title]="entry.name"
            >
              {{ entry.name }}
            </h2>
            @if (entry.kind === 'file') {
              <p class="text-base-content/60 text-[10px]" [attr.data-testid]="TESTID.FILE_SIZE">
                {{ formatFileSize(entry.size || 0) }}
              </p>
            }
          </div>

          <div class="absolute top-1 right-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            @if (entry.kind === 'directory') {
              <button
                class="btn btn-circle btn-ghost btn-xs bg-base-100/80 backdrop-blur"
                (click)="navigate.emit(entry); $event.stopPropagation()"
                title="Open"
              >
                <svg [lucideIcon]="FolderOpen" size="12"></svg>
              </button>
              <button
                class="btn btn-circle btn-ghost btn-xs bg-base-100/80 backdrop-blur"
                (click)="download.emit(entry); $event.stopPropagation()"
                title="Download ZIP"
              >
                <svg [lucideIcon]="Download" size="12"></svg>
              </button>
            } @else {
              @if (canPreviewFile(entry)) {
                <button
                  class="btn btn-circle btn-ghost btn-xs bg-base-100/80 backdrop-blur"
                  [attr.data-testid]="TESTID.PREVIEW_BTN"
                  (click)="preview.emit(entry); $event.stopPropagation()"
                  title="Preview"
                >
                  <svg [lucideIcon]="Eye" size="12"></svg>
                </button>
              }
              <button
                class="btn btn-circle btn-ghost btn-xs bg-base-100/80 backdrop-blur"
                [attr.data-testid]="TESTID.DOWNLOAD_BTN"
                (click)="download.emit(entry); $event.stopPropagation()"
                title="Download"
              >
                <svg [lucideIcon]="Download" size="12"></svg>
              </button>
            }
            <button
              class="btn btn-circle btn-ghost btn-xs bg-base-100/80 text-error backdrop-blur"
              [attr.data-testid]="entry.kind === 'file' ? TESTID.DELETE_BTN : null"
              (click)="delete.emit(entry); $event.stopPropagation()"
              title="Delete"
            >
              <svg [lucideIcon]="Trash2" size="12"></svg>
            </button>
          </div>
        </div>
      }
    </div>
  `
})
export class StorageFileGridComponent {
  private rxdb = inject(RxDB);
  private destroyRef = inject(DestroyRef);
  private loadingThumbnails = false;
  private lastEntriesHash = '';
  private clickTimeout: number | null = null;
  private thumbnailLoadTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

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

  thumbnailUrls = signal<Map<string, string>>(new Map());

  readonly FolderOpen = FolderOpen;
  readonly Download = Download;
  readonly Trash2 = Trash2;
  readonly Eye = Eye;
  getFileIcon = getFileIcon;
  getFileIconColor = getFileIconColor;
  isImageFile = isImageFile;
  formatFileSize = formatFileSize;
  canPreviewFile = canPreviewFile;

  constructor() {
    effect(() => {
      const entries = this.entries();
      if (entries.length === 0) {
        this.clearThumbnailUrls();
        return;
      }

      const entriesHash = entries.map(entry => entry.path).join('|');
      if (entriesHash === this.lastEntriesHash) {
        return;
      }

      this.lastEntriesHash = entriesHash;
      if (!this.loadingThumbnails) {
        this.thumbnailLoadTimer = setTimeout(() => {
          this.thumbnailLoadTimer = null;
          if (!this.destroyed) void this.loadThumbnails();
        }, 0);
      }
    });

    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      if (this.thumbnailLoadTimer) {
        clearTimeout(this.thumbnailLoadTimer);
        this.thumbnailLoadTimer = null;
      }

      if (this.clickTimeout) {
        clearTimeout(this.clickTimeout);
      }

      this.clearThumbnailUrls();
    });
  }

  async loadThumbnails(): Promise<void> {
    if (this.destroyed || this.loadingThumbnails) {
      return;
    }

    this.loadingThumbnails = true;

    try {
      this.clearThumbnailUrls();

      const imageEntries = this.entries().filter(
        entry => entry.kind === 'file' && entry.meta && this.isImageFile(entry)
      );
      const urls = new Map<string, string>();

      const concurrentLimit = 5;
      for (let index = 0; index < imageEntries.length; index += concurrentLimit) {
        const batch = imageEntries.slice(index, index + concurrentLimit);
        await Promise.all(
          batch.map(async entry => {
            if (!entry.meta) {
              return;
            }

            try {
              const url = await this.rxdb.storage.createObjectUrl(entry.meta.id);
              if (!this.destroyed) urls.set(entry.path, url);
              else this.rxdb.storage.revokeObjectUrl(url);
            } catch {
              return;
            }
          })
        );
        if (this.destroyed) {
          for (const url of urls.values()) this.rxdb.storage.revokeObjectUrl(url);
          return;
        }
      }

      if (!this.destroyed) this.thumbnailUrls.set(urls);
    } finally {
      this.loadingThumbnails = false;
    }
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

  handleContextMenu(event: MouseEvent, entry: StorageBrowserItem): void {
    event.preventDefault();
    this.contextMenu.emit({ event, entry });
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

  private clearThumbnailUrls(): void {
    const urls = this.thumbnailUrls();
    for (const url of urls.values()) {
      this.rxdb.storage.revokeObjectUrl(url);
    }
    this.thumbnailUrls.set(new Map());
  }
}
