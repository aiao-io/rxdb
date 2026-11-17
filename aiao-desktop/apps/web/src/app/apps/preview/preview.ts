import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';

import { extensionOf, fileKind } from '../../disk/disk-kinds';
import { PdfDocument, readPdfText } from '../../disk/formats/pdf';
import { ContentActions } from '../../services/content-actions';
import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { FileSystem, FsNode, describeDiskError } from '../../services/file-system';
import { PopoverService } from '../../services/popover';
import { PrintableContent, printableText } from '../../services/print-document';
import { Toast } from '../../services/toast';
import { WindowManager } from '../../services/window-manager';
import { Icon } from '../../shared/icon';
import { imageDataUrl } from '../../shared/image-url';
import { TrafficLights } from '../../shared/traffic-lights';
import { MailComposer } from '../mail/mail-composer';
import { markMatches } from './preview-find';

/** 预览窗口里显示什么：读取中、文本 PDF、图片、视频占位，或打不开的原因。 */
type PreviewView =
  | { readonly kind: 'loading' }
  | { readonly kind: 'sheet'; readonly doc: PdfDocument }
  | { readonly kind: 'image'; readonly url: string }
  | { readonly kind: 'video' }
  | { readonly kind: 'failed'; readonly reason: string };

const fileName = (file: string | FsNode | undefined): string =>
  (typeof file === 'string' ? file : file?.name) || 'Untitled';

const IMAGE_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  heic: 'image/heic'
};

/** 预览：按文件类型显示指南页、视频占位或图片，标题栏带分享菜单和会高亮匹配的查找框。 */
@Component({
  selector: 'app-preview',
  imports: [Icon, TrafficLights],
  providers: [ContentActions],
  host: { style: 'display: contents' },
  templateUrl: './preview.html'
})
export class PreviewApp {
  private readonly win = inject(DesktopWindow);
  private readonly fs = inject(FileSystem);
  private readonly popover = inject(PopoverService);
  private readonly toast = inject(Toast);
  private readonly wm = inject(WindowManager);
  private readonly mail = inject(MailComposer);
  private readonly body = viewChild.required<ElementRef<HTMLElement>>('body');
  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');

  protected readonly actions = inject(ContentActions);
  protected readonly content = computed<PrintableContent | null>(() => {
    const view = this.view();
    if (view.kind === 'image') return { title: this.name, paragraphs: [], image: { url: view.url, alt: this.name } };
    if (view.kind !== 'sheet') return null;
    return {
      title: view.doc.title,
      paragraphs: [
        ...(view.doc.subtitle ? [view.doc.subtitle] : []),
        ...view.doc.sections.flatMap(section => [section.title, section.text])
      ]
    };
  });

  protected readonly name = fileName(this.win.options.file);
  protected readonly view = signal<PreviewView>({ kind: 'loading' });
  protected readonly finding = signal(false);

  constructor() {
    const menus = inject(DesktopMenus);
    this.win.setMenus(computed(() => menus.standard('preview')));
    void this.load();
  }

  protected openShare(anchor: HTMLElement, event: MouseEvent): void {
    const content = this.content();
    const disabled = !content || this.actions.busy();
    this.popover.menuUnder(
      anchor,
      [
        { id: 'm', label: 'Mail Draft', icon: 'g-compose', disabled: !content, run: () => content && this.mail.compose(this.name, '', printableText(content)) },
        { id: 'g', label: 'Open Messages', icon: 'g-facetime', run: () => this.wm.open('messages') },
        '-',
        {
          id: 'c',
          label: this.view().kind === 'sheet' ? 'Copy Text' : 'Copy File Name',
          disabled,
          run: () => content && this.actions.copy(this.view().kind === 'sheet' ? printableText(content) : this.name)
        },
        { id: 'p', label: 'Print…', disabled, run: () => content && this.actions.print(content) }
      ],
      { keyboard: event.detail === 0, label: 'preview sharing' }
    );
  }

  /** 查找框展开时聚焦，收起时清空输入并去掉高亮。 */
  protected toggleFind(): void {
    const opening = !this.finding();
    this.finding.set(opening);
    const input = this.field().nativeElement;
    if (opening) {
      input.focus();
      return;
    }
    input.value = '';
    markMatches(this.body().nativeElement, '');
  }

  protected find(value: string): void {
    const text = value.trim();
    const count = markMatches(this.body().nativeElement, text.toLowerCase());
    if (text.length > 1) this.toast.show(count ? `${count} ${count === 1 ? 'match' : 'matches'}` : 'Not found');
  }

  /** 解码不了的图片（例如占位的 HEIC）改为说明打不开。 */
  protected imageFailed(): void {
    this.view.set({ kind: 'failed', reason: 'The image data could not be decoded.' });
  }

  /** 图片显示文件本身（由 storage 插件读出的字节），文本 PDF 读回标题与各节；读不了的说明原因。 */
  private async load(): Promise<void> {
    const extension = extensionOf(this.name);
    if (extension === 'mp4' || extension === 'mov') {
      this.view.set({ kind: 'video' });
      return;
    }
    const path = this.win.options.node?.path;
    if (!path) {
      this.view.set({ kind: 'failed', reason: 'The file is not on Macintosh HD.' });
      return;
    }
    try {
      this.view.set(this.describe(extension, await this.fs.read(path)));
    } catch (error) {
      this.view.set({ kind: 'failed', reason: describeDiskError(error) });
    }
  }

  private describe(extension: string, bytes: Uint8Array): PreviewView {
    if (extension === 'pdf') {
      const doc = readPdfText(bytes);
      return doc ? { kind: 'sheet', doc } : { kind: 'failed', reason: 'Preview can only show text PDFs.' };
    }
    const type = IMAGE_TYPES[extension];
    if (type) return { kind: 'image', url: imageDataUrl(bytes, type) };
    return { kind: 'failed', reason: `Preview can’t open ${fileKind(this.name).kind} files.` };
  }
}
