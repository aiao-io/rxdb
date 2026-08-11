/**
 * OPFS 文件预览组件
 *
 * 功能：
 * - 支持多种文件类型：图片、音频、视频、代码、文本
 * - 代码文件使用 CodeMirror 语法高亮
 * - 自动检测未知文件的类型（UTF-8 文本检测）
 * - 自动管理 Blob URL 生命周期，防止内存泄漏
 *
 * 技术要点：
 * - 使用 effect 响应式加载文件
 * - 路径变化检测防止重复加载
 * - 加载过程中切换文件时，正确清理资源
 */

import { CodeEditor } from '@aiao/code-editor-angular';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, output, signal } from '@angular/core';
import { LucideDynamicIcon, LucideX as X } from '@lucide/angular';
import { OpfsService } from '../services/opfs.service';
import { resolveOpfsStringPreviewType } from '../utils/opfs-preview-type';
import { getCodeLanguage, getFileType, isTextFile, OPFSFileEntry } from '../utils/opfs-utils';

@Component({
  selector: 'app-opfs-file-preview',
  standalone: true,
  imports: [CommonModule, LucideDynamicIcon, CodeEditor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (entry()) {
      <div
        class="modal modal-open"
        (click)="$event.target === $event.currentTarget && handleClose()"
        (keydown.escape)="handleClose()"
        aria-modal="true"
        role="dialog"
        tabindex="-1"
      >
        <div class="modal-box flex h-[80vh] max-w-4xl flex-col">
          <div class="mb-4 flex items-center justify-between">
            <h3 class="text-lg font-bold">{{ entry()!.name }}</h3>
            <button class="btn btn-sm btn-circle btn-ghost" (click)="handleClose()" type="button">
              <svg [lucideIcon]="XIcon" size="16"></svg>
            </button>
          </div>

          <div class="flex flex-1 flex-col overflow-auto">
            @if (loading()) {
              <div class="flex h-full items-center justify-center">
                <span class="loading loading-spinner loading-lg"></span>
              </div>
            } @else {
              @if (fileType() === 'image' && content()) {
                <div class="overflow-auto p-4">
                  <img class="w-full" [alt]="entry()!.name" [src]="content()!" />
                </div>
              } @else if (fileType() === 'audio' && content()) {
                <div class="flex items-center justify-center p-4">
                  <audio class="w-full max-w-xl" [src]="content()!" controls>您的浏览器不支持音频播放</audio>
                </div>
              } @else if (fileType() === 'video' && content()) {
                <div class="flex h-full items-center justify-center p-4">
                  <video class="max-h-full max-w-full" [src]="content()!" controls>您的浏览器不支持视频播放</video>
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
                <div class="text-base-content/40 py-8 text-center">无法预览此文件</div>
              }
            }
          </div>
          <div class="modal-action">
            <button class="btn btn-sm" (click)="handleClose()" type="button">关闭</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: []
})
export class OpfsFilePreviewComponent {
  private opfsService = inject(OpfsService);
  private destroyRef = inject(DestroyRef);
  private loadingEntryPath: string | null = null;
  private currentEntryPath: string | null = null;

  // Signal inputs
  entry = input<OPFSFileEntry | null>(null);

  // Signal outputs
  closed = output<void>();

  readonly XIcon = X;

  loading = signal<boolean>(false);
  content = signal<string | null>(null);
  textContent = signal<string>('');
  fileType = signal<'image' | 'audio' | 'video' | 'code' | 'text' | 'unknown'>('unknown');
  codeLanguage = signal<string>('javascript');

  constructor() {
    effect(() => {
      const currentEntry = this.entry();
      const entryPath = currentEntry?.path || null;

      // 如果 entry 没有变化，跳过
      if (entryPath === this.currentEntryPath) {
        return;
      }

      this.currentEntryPath = entryPath;

      if (!currentEntry || currentEntry.kind === 'directory') {
        // 清理旧的 blob URL
        const oldContent = this.content();
        if (oldContent && oldContent.startsWith('blob:')) {
          URL.revokeObjectURL(oldContent);
        }
        this.content.set(null);
        this.loading.set(false);
        this.loadingEntryPath = null;
        return;
      }

      // 如果正在加载同一个文件，跳过
      if (this.loadingEntryPath === entryPath) {
        return;
      }

      // 异步加载文件内容
      this.loadFileContent(currentEntry);
    });

    // 组件销毁时清理 blob URL
    this.destroyRef.onDestroy(() => {
      const content = this.content();
      if (content && content.startsWith('blob:')) {
        URL.revokeObjectURL(content);
      }
    });
  }

  handleClose(): void {
    // 关闭时清理 blob URL
    const content = this.content();
    if (content && content.startsWith('blob:')) {
      URL.revokeObjectURL(content);
    }
    this.content.set(null);
    this.loading.set(false);
    this.closed.emit();
  }

  private async loadFileContent(entry: OPFSFileEntry): Promise<void> {
    const entryPath = entry.path;

    // 如果正在加载同一个文件，跳过
    if (this.loadingEntryPath === entryPath) {
      return;
    }

    this.loadingEntryPath = entryPath;
    this.loading.set(true);

    // 清理旧的 blob URL
    const oldContent = this.content();
    if (oldContent && oldContent.startsWith('blob:')) {
      URL.revokeObjectURL(oldContent);
    }
    this.content.set(null);
    this.textContent.set('');
    this.fileType.set('unknown');

    try {
      const preview = await this.opfsService.previewFile(entry);

      // 检查 entry 是否还是当前要加载的（可能在加载过程中被改变了）
      if (this.currentEntryPath !== entryPath) {
        // entry 已经变化，清理刚创建的 blob URL
        if (preview && preview.data instanceof Blob) {
          const url = URL.createObjectURL(preview.data);
          URL.revokeObjectURL(url);
        }
        return;
      }

      if (preview) {
        let type = getFileType(entry);

        if (preview.data instanceof Blob) {
          // 对于 unknown 类型，尝试检测是否为文本文件
          if (type === 'unknown') {
            const file = new File([preview.data], entry.name);
            const isText = await isTextFile(file);
            if (isText) {
              type = 'text';
            }
          }

          this.fileType.set(type);

          // 对于代码和文本文件，需要读取文本内容
          if (type === 'code' || type === 'text') {
            const text = await preview.data.text();
            this.textContent.set(text);
            if (type === 'code') {
              const lang = getCodeLanguage(entry.name);
              this.codeLanguage.set(lang);
            }
          } else if (type === 'image' || type === 'audio' || type === 'video') {
            const url = URL.createObjectURL(preview.data);
            this.content.set(url);
          } else {
            // unknown 且非文本，无法预览
            console.warn('Unknown file type, cannot preview');
            this.content.set(null);
          }
        } else if (typeof preview.data === 'string') {
          type = resolveOpfsStringPreviewType(type, preview.type);
          this.fileType.set(type);
          // 字符串内容直接使用
          if (type === 'code' || type === 'text') {
            this.textContent.set(preview.data);
            if (type === 'code') {
              const lang = getCodeLanguage(entry.name);
              this.codeLanguage.set(lang);
            }
          } else {
            this.content.set(preview.data);
          }
        } else {
          this.content.set(null);
        }
      } else {
        this.content.set(null);
        this.textContent.set('');
      }
    } catch {
      this.content.set(null);
      this.textContent.set('');
    } finally {
      // 只有在还是当前文件时才设置 loading 为 false
      if (this.loadingEntryPath === entryPath) {
        this.loading.set(false);
        this.loadingEntryPath = null;
      }
    }
  }
}
