import {
  Component,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild
} from '@angular/core';

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

/**
 * 文本编辑：打开磁盘上的文件、显示真实内容（网址自动成链接），⌘S 把纯文本写回去。
 *
 * 磁盘由同一个来源的多个标签页共享（ADESK-US-105）：窗口里没有未保存的编辑时，文件在别处（别的标签页、终端）被改了，
 * 窗口跟着更新；有未保存的编辑就不动它，保存时后提交的内容生效，不合并也不提示冲突。保存已打开的文件只覆盖已存在的文件：
 * 目标已被删除、移进废纸篓、改名或抹掉，保存失败并说明原因，编辑内容留在窗口里，不在原路径悄悄新建。
 */
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

  /** 磁盘上这个文件的版本（大小与修改时间）；文件不在目录树里（或没有路径）时为 `null`。 */
  private readonly version = computed(() => {
    const node = this.path ? this.fs.nodeAt(this.path) : null;
    return node ? `${node.bytes ?? 0}:${node.date?.getTime() ?? 0}` : null;
  });
  /** 窗口里的内容最近一次与磁盘对上时，磁盘上文件的版本。 */
  private known: string | null = null;
  /** 跟随磁盘更新的次数，用来丢掉被更新的一次取代了的读取。 */
  private following = 0;

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
    /* 文件在别处被改了：窗口里没有未保存的编辑就重读。 */
    effect(() => {
      const version = this.version();
      untracked(() => void this.follow(version));
    });
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
    const version = this.version();
    try {
      this.doc().nativeElement.innerHTML = autolink(await this.fs.readText(this.path));
      this.known = version;
    } catch (error) {
      this.toast.show(`“${this.name}” could not be opened. ${describeDiskError(error)}`);
    }
  }

  /**
   * 磁盘上的版本变了（别的标签页、终端或本窗口自己保存的）：窗口里没有未保存的编辑就按磁盘重读，内容没变就什么也不动。
   * 有未保存的编辑时不动它——保存时后提交的生效。读取期间用户开始编辑，或更新的一次读取已经开始，这次读到的就作废。
   */
  private async follow(version: string | null): Promise<void> {
    if (!this.path || version === null || this.known === null || version === this.known || this.edited()) return;
    const round = ++this.following;
    try {
      const html = autolink(await this.fs.readText(this.path));
      if (round !== this.following || this.edited()) return;
      const doc = this.doc().nativeElement;
      if (doc.innerHTML !== html) doc.innerHTML = html;
      this.known = version;
    } catch (error) {
      this.toast.show(`“${this.name}” could not be reloaded. ${describeDiskError(error)}`);
    }
  }

  /** ⌘S：只覆盖已存在的文件。失败（目标已被别处删除、改名、抹掉）时提示原因，编辑内容与「已编辑」状态原样保留。 */
  private async save(): Promise<void> {
    if (!this.path) {
      this.toast.show(`“${this.name}” is not on Macintosh HD`);
      return;
    }
    try {
      await this.fs.saveText(this.path, this.doc().nativeElement.innerText);
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
