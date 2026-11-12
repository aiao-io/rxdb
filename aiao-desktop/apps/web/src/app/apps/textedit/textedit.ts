import { Component, ElementRef, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';

import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { FileSystem, FsNode, describeDiskError } from '../../services/file-system';
import { PopoverService } from '../../services/popover';
import { Toast } from '../../services/toast';
import { WindowManager } from '../../services/window-manager';
import { Icon } from '../../shared/icon';
import { TrafficLights } from '../../shared/traffic-lights';
import { autolink } from './textedit-text';

const RICH_FONT = '14px/1.65 -apple-system,Inter,sans-serif';

const fileName = (file: string | FsNode | undefined): string =>
  (typeof file === 'string' ? file : file?.name) || 'Untitled.txt';

/** 文本编辑：打开磁盘上的文件、显示真实内容（网址自动成链接），⌘S 把纯文本写回去。 */
@Component({
  selector: 'app-textedit',
  imports: [Icon, TrafficLights],
  host: { style: 'display: contents', '(click)': 'openLink($event)' },
  template: `
    <div class="tb plain" data-drag>
      <div class="title" data-te-title>{{ title() }}</div>
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
        (input)="edited.set(true)"
        (keydown)="key($event)"
        contenteditable="true"
        data-te-doc
        spellcheck="false"
      ></div>
    </div>
  `
})
export class TextEditApp {
  private readonly win = inject(DesktopWindow);
  private readonly fs = inject(FileSystem);
  private readonly wm = inject(WindowManager);
  private readonly popover = inject(PopoverService);
  private readonly toast = inject(Toast);
  private readonly doc = viewChild.required<ElementRef<HTMLElement>>('doc');
  private readonly path = this.win.options.node?.path ?? null;

  protected readonly name = fileName(this.win.options.file);
  protected readonly richFont = RICH_FONT;
  protected readonly rich = signal(false);
  protected readonly edited = signal(false);
  protected readonly title = computed(() => (this.edited() ? `${this.name} — Edited` : this.name));

  constructor() {
    const menus = inject(DesktopMenus);
    this.win.setMenus(
      computed(() =>
        menus.standard('textedit', {
          File: [
            { id: 'n', label: 'New Window', key: '⌘N', run: () => this.wm.open('textedit', { force: true }) },
            { id: 'w', label: 'Close Window', key: '⌘W', run: () => this.wm.closeFront() },
            '-',
            { id: 's', label: 'Save', key: '⌘S', disabled: !this.path, run: () => void this.save() }
          ]
        })
      )
    );
    afterNextRender(() => void this.load());
  }

  /** 正文里的网址是注入的 HTML，只能在窗口上做事件委托；原版由文档级的 `data-openext` 处理器统一交给真实浏览器，这里只管本窗口。 */
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

  /** 正文里按 ⌘S 存盘，不让浏览器弹出「存储网页」。 */
  protected key(event: KeyboardEvent): void {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') return;
    event.preventDefault();
    void this.save();
  }

  private async load(): Promise<void> {
    if (!this.path) return;
    try {
      this.doc().nativeElement.innerHTML = autolink(await this.fs.readText(this.path));
    } catch (error) {
      this.toast.show(`“${this.name}” could not be opened. ${describeDiskError(error)}`);
    }
  }

  private async save(): Promise<void> {
    if (!this.path) {
      this.toast.show(`“${this.name}” is not on Macintosh HD`);
      return;
    }
    try {
      await this.fs.writeText(this.path, this.doc().nativeElement.innerText);
      this.edited.set(false);
    } catch (error) {
      this.toast.show(describeDiskError(error));
    }
  }

  private apply(command: string): void {
    this.doc().nativeElement.focus();
    document.execCommand(command);
  }

  private wordCount(): number {
    return (this.doc().nativeElement.textContent ?? '').trim().split(/\s+/).filter(Boolean).length;
  }
}
