import { Component, ElementRef, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';

import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { FsNode } from '../../services/file-system';
import { PopoverService } from '../../services/popover';
import { Toast } from '../../services/toast';
import { Icon } from '../../shared/icon';
import { TrafficLights } from '../../shared/traffic-lights';

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

const RICH_FONT = '14px/1.65 -apple-system,Inter,sans-serif';

const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, char => ESCAPES[char]);

const fileName = (file: string | FsNode | undefined): string =>
  (typeof file === 'string' ? file : file?.name) || 'Untitled.txt';

/** 转义后把裸网址变成可点的链接，和 TextEdit 一样。 */
export function autolink(text: string): string {
  return escapeHtml(text).replace(
    /https?:\/\/[^\s<]+[^\s<.,)]/g,
    url => `<a href="${url}" data-openext="${url}">${url}</a>`
  );
}

/** 文本编辑：标题栏显示文件名，正文是可编辑的纯文本，网址自动成链接。 */
@Component({
  selector: 'app-textedit',
  imports: [Icon, TrafficLights],
  host: { style: 'display: contents', '(click)': 'openLink($event)' },
  template: `
    <div class="tb plain" data-drag>
      <div class="title">{{ name }}</div>
      <div class="tbz"><app-traffic-lights /></div>
      <div class="grow"></div>
      <div class="tbz">
        <button class="tbtn" #format (click)="openFormat(format)" data-nodrag data-tefmt title="Format">
          <svg appIcon="g-title"></svg>
        </button>
      </div>
    </div>
    <div class="te">
      <div
        class="te-doc selectable"
        #doc
        [style.font]="rich() ? richFont : null"
        contenteditable="true"
        spellcheck="false"
      ></div>
    </div>
  `
})
export class TextEditApp {
  private readonly win = inject(DesktopWindow);
  private readonly popover = inject(PopoverService);
  private readonly toast = inject(Toast);
  private readonly doc = viewChild.required<ElementRef<HTMLElement>>('doc');

  protected readonly name = fileName(this.win.options.file);
  protected readonly richFont = RICH_FONT;
  protected readonly rich = signal(false);

  constructor() {
    const menus = inject(DesktopMenus);
    this.win.setMenus(computed(() => menus.standard('textedit')));
    /* 原版查的 FILE_TEXT 表从未存在过（一打开就报错），按空表处理：每个文件都是空文档。 */
    afterNextRender(() => {
      this.doc().nativeElement.innerHTML = autolink(`${this.name}\n\n(this file is empty)`);
    });
  }

  /** 正文里的网址是注入的 HTML，只能在窗口上做事件委托；这是桌面唯一交给真实浏览器的出口。 */
  protected openLink(event: MouseEvent): void {
    const link = (event.target as Element).closest<HTMLElement>('[data-openext]');
    if (!link) return;
    event.preventDefault();
    window.open(link.dataset['openext'], '_blank', 'noopener');
  }

  protected openFormat(anchor: HTMLElement): void {
    const rich = this.rich();
    this.popover.menuUnder(anchor, [
      { id: 'p', label: 'Plain Text', checked: !rich, run: () => this.rich.set(false) },
      { id: 'r', label: 'Rich Text', checked: rich, run: () => this.rich.set(true) },
      '-',
      { id: 'b', label: 'Bold', key: '⌘B', run: () => this.apply('bold') },
      { id: 'i', label: 'Italic', key: '⌘I', run: () => this.apply('italic') },
      '-',
      { id: 'w', label: 'Word Count', run: () => this.toast.show(`${this.wordCount()} words`) }
    ]);
  }

  private apply(command: string): void {
    this.doc().nativeElement.focus();
    document.execCommand(command);
  }

  private wordCount(): number {
    return (this.doc().nativeElement.textContent ?? '').trim().split(/\s+/).filter(Boolean).length;
  }
}
