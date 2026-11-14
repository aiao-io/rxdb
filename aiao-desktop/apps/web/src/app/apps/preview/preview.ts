import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';

import { extensionOf, fileKind } from '../../disk/disk-kinds';
import { PdfDocument, readPdfText } from '../../disk/formats/pdf';
import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { FileSystem, FsNode, describeDiskError } from '../../services/file-system';
import { PopoverService } from '../../services/popover';
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

  protected readonly name = fileName(this.win.options.file);
  protected readonly view = signal<PreviewView>({ kind: 'loading' });
  protected readonly finding = signal(false);

  constructor() {
    const menus = inject(DesktopMenus);
    this.win.setMenus(computed(() => menus.standard('preview')));
    void this.load();
  }

  protected openShare(anchor: HTMLElement): void {
    this.popover.menuUnder(anchor, [
      { id: 'm', label: 'Mail', icon: 'g-compose', run: () => this.mail.compose(this.name) },
      { id: 'g', label: 'Messages', icon: 'g-facetime', run: () => this.wm.open('messages') },
      '-',
      { id: 'c', label: 'Copy', run: () => this.toast.show('Copied to clipboard') },
      { id: 'p', label: 'Print…', run: () => this.toast.show('Sent to printer') }
    ]);
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
