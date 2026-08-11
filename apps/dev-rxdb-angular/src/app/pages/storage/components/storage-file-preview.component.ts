import { CodeEditor } from '@aiao/code-editor-angular';
import { RxDB } from '@aiao/rxdb';
import { STORAGE_TESTID } from '@aiao/utils';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, output, signal } from '@angular/core';
import { LucideDynamicIcon, LucideX as X } from '@lucide/angular';
import { StorageBrowserItem, getCodeLanguage, getFileType, isTextBlob } from '../utils/storage-utils';

const TEXT_PREVIEW_LIMIT_BYTES = 5 * 1024 * 1024;

@Component({
  selector: 'app-storage-file-preview',
  standalone: true,
  imports: [CommonModule, LucideDynamicIcon, CodeEditor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (entry()) {
      <div
        class="modal modal-open"
        [attr.data-testid]="TESTID.PREVIEW_MODAL"
        (click)="$event.target === $event.currentTarget && handleClose()"
        (keydown.escape)="handleClose()"
        aria-modal="true"
        role="dialog"
        tabindex="-1"
      >
        <div class="modal-box flex h-[80vh] max-w-4xl flex-col">
          <div class="mb-4 flex items-center justify-between">
            <h3 class="text-lg font-bold">{{ entry()!.name }}</h3>
            <button
              class="btn btn-sm btn-circle btn-ghost"
              [attr.data-testid]="TESTID.PREVIEW_CLOSE"
              (click)="handleClose()"
              type="button"
            >
              <svg [lucideIcon]="XIcon" size="16"></svg>
            </button>
          </div>

          <div class="flex flex-1 flex-col overflow-auto">
            @if (loading()) {
              <div class="flex h-full items-center justify-center">
                <span class="loading loading-spinner loading-lg"></span>
              </div>
            } @else if (loadError()) {
              <div class="text-base-content/40 py-8 text-center">{{ loadError() }}</div>
            } @else {
              @if (fileType() === 'image' && content()) {
                <div class="overflow-auto p-4">
                  <img class="w-full" [alt]="entry()!.name" [src]="content()!" />
                </div>
              } @else if (fileType() === 'audio' && content()) {
                <div class="flex items-center justify-center p-4">
                  <audio class="w-full max-w-xl" [src]="content()!" controls>Audio preview is not supported</audio>
                </div>
              } @else if (fileType() === 'video' && content()) {
                <div class="flex h-full items-center justify-center p-4">
                  <video class="max-h-full max-w-full" [src]="content()!" controls>
                    Video preview is not supported
                  </video>
                </div>
              } @else if (fileType() === 'code' && textContent()) {
                <div class="h-full overflow-auto">
                  <ao-code-editor
                    class="h-full"
                    [language]="codeLanguage()"
                    [lineWrapping]="false"
                    [readonly]="true"
                    [theme]="'dark'"
                    [value]="textContent()"
                  />
                </div>
              } @else if (fileType() === 'text' && textContent()) {
                <pre class="bg-base-200 overflow-auto rounded p-4 text-xs">{{ textContent() }}</pre>
              } @else {
                <div class="text-base-content/40 py-8 text-center">Unable to preview this file</div>
              }
            }
          </div>

          <div class="modal-action">
            <button class="btn btn-sm" (click)="handleClose()" type="button">Close</button>
          </div>
        </div>
      </div>
    }
  `
})
export class StorageFilePreviewComponent {
  private rxdb = inject(RxDB);
  private destroyRef = inject(DestroyRef);
  private loadingEntryPath: string | null = null;
  private currentEntryPath: string | null = null;

  readonly TESTID = STORAGE_TESTID;
  readonly XIcon = X;

  entry = input<StorageBrowserItem | null>(null);
  closed = output<void>();

  loading = signal(false);
  loadError = signal('');
  content = signal<string | null>(null);
  textContent = signal('');
  fileType = signal<'image' | 'audio' | 'video' | 'code' | 'text' | 'unknown'>('unknown');
  codeLanguage = signal('javascript');

  constructor() {
    effect(() => {
      const currentEntry = this.entry();
      const entryPath = currentEntry?.path || null;

      if (entryPath === this.currentEntryPath) {
        return;
      }

      this.currentEntryPath = entryPath;

      if (!currentEntry || currentEntry.kind === 'directory' || !currentEntry.meta) {
        this.resetPreviewState();
        this.loadingEntryPath = null;
        return;
      }

      if (this.loadingEntryPath === entryPath) {
        return;
      }

      void this.loadFileContent(currentEntry);
    });

    this.destroyRef.onDestroy(() => {
      this.cleanupContentUrl();
    });
  }

  handleClose(): void {
    this.resetPreviewState();
    this.closed.emit();
  }

  private async loadFileContent(entry: StorageBrowserItem): Promise<void> {
    if (!entry.meta) {
      return;
    }

    const entryPath = entry.path;
    this.loadingEntryPath = entryPath;
    this.loading.set(true);
    this.loadError.set('');
    this.cleanupContentUrl();
    this.textContent.set('');
    this.fileType.set('unknown');

    try {
      const blob = await this.rxdb.storage.read(entry.meta.id);

      if (this.currentEntryPath !== entryPath) {
        return;
      }

      let type = getFileType(entry);
      if (type === 'unknown' && (await isTextBlob(blob))) {
        type = 'text';
      }

      this.fileType.set(type);

      if (type === 'code' || type === 'text') {
        if (blob.size > TEXT_PREVIEW_LIMIT_BYTES) {
          throw new Error('Text preview exceeds limit of 5 MB');
        }

        this.textContent.set(await blob.text());
        if (type === 'code') {
          this.codeLanguage.set(getCodeLanguage(entry.name));
        }
      } else if (type === 'image' || type === 'audio' || type === 'video') {
        this.content.set(URL.createObjectURL(blob));
      }
    } catch (error) {
      this.loadError.set(error instanceof Error ? error.message : String(error));
    } finally {
      if (this.loadingEntryPath === entryPath) {
        this.loading.set(false);
        this.loadingEntryPath = null;
      }
    }
  }

  private cleanupContentUrl(): void {
    const content = this.content();
    if (content && content.startsWith('blob:')) {
      URL.revokeObjectURL(content);
    }
    this.content.set(null);
  }

  private resetPreviewState(): void {
    this.cleanupContentUrl();
    this.loading.set(false);
    this.loadError.set('');
    this.textContent.set('');
    this.fileType.set('unknown');
  }
}
