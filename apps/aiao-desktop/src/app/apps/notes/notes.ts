import { Component, DestroyRef, ElementRef, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';

import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { PopoverService } from '../../services/popover';
import { Icon } from '../../shared/icon';
import { TrafficLights } from '../../shared/traffic-lights';
import { CHECK_ICON, NOTE_SEED, Note } from './notes-data';
import { newNoteBody, noteSnippet, noteTitle, noteWhen } from './notes-model';

/** 侧栏的文件夹；右侧的数量是写死的，和原版一致，不随增删笔记变化。 */
const FOLDERS = [
  { name: 'All iCloud', icon: 'g-icloud-o', count: 5 },
  { name: 'Notes', icon: 'g-folder-g', count: 5 },
  { name: 'Recently Deleted', icon: 'g-tag', count: 1 }
] as const;

const TEXT_FORMATS = [
  { command: 'bold', title: 'Bold', icon: 'g-bold' },
  { command: 'italic', title: 'Italic', icon: 'g-italic' },
  { command: 'underline', title: 'Underline', icon: 'g-underline' },
  { command: 'strikeThrough', title: 'Strikethrough', icon: 'g-strike' }
] as const;

/** 光标所在位置会让工具栏按钮亮起的命令。 */
const STATE_COMMANDS: readonly string[] = [...TEXT_FORMATS.map(format => format.command), 'insertUnorderedList'];

const SHORTCUTS: Readonly<Record<string, string>> = { b: 'bold', i: 'italic', u: 'underline' };

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((item, i) => item === b[i]);

const commandState = (command: string): boolean => {
  try {
    return document.queryCommandState(command);
  } catch {
    return false;
  }
};

/** 备忘录：文件夹、搜索、置顶优先的列表和可编辑的富文本文档；每个窗口各持一份笔记。 */
@Component({
  selector: 'app-notes',
  imports: [Icon, TrafficLights],
  host: { style: 'display: contents' },
  templateUrl: './notes.html'
})
export class NotesApp {
  private readonly win = inject(DesktopWindow);
  private readonly popover = inject(PopoverService);
  private readonly doc = viewChild.required<ElementRef<HTMLElement>>('doc');
  private readonly notes = signal<readonly Note[]>(NOTE_SEED);
  private readonly current = computed(() => this.notes().find(note => note.id === this.selected()));
  private readonly list = computed(() => {
    const folder = this.folder();
    const query = this.query().toLowerCase();
    return this.notes()
      .filter(note => (folder === 'All iCloud' ? note.folder !== 'Recently Deleted' : note.folder === folder))
      .filter(note => !query || `${note.title} ${note.body}`.toLowerCase().includes(query))
      .sort((a, b) => Number(!!b.pin) - Number(!!a.pin) || b.date.getTime() - a.date.getTime());
  });
  private timer: ReturnType<typeof setTimeout> | undefined;

  protected readonly folders = FOLDERS;
  protected readonly textFormats = TEXT_FORMATS;
  protected readonly folder = signal('Notes');
  protected readonly query = signal('');
  protected readonly selected = signal<number | null>(1);
  protected readonly sidebar = signal(true);
  protected readonly active = signal<readonly string[]>([], { equal: sameList });
  protected readonly rows = computed(() => {
    const now = new Date();
    return this.list().map(note => ({
      id: note.id,
      title: `${note.pin ? '📌 ' : ''}${note.title || 'New Note'}`,
      when: noteWhen(note.date, now),
      snippet: noteSnippet(note.body)
    }));
  });

  constructor() {
    const menus = inject(DesktopMenus);
    this.win.setMenus(
      computed(() =>
        menus.standard(
          'notes',
          {
            File: [
              { id: 'n', label: 'New Note', key: '⌘N', run: () => this.create() },
              { id: 'f', label: 'New Folder', key: '⇧⌘N' },
              '-',
              { id: 'd', label: 'Delete Note', run: () => this.remove() }
            ],
            Format: [
              { id: 'b', label: 'Bold', key: '⌘B', run: () => this.format('bold') },
              { id: 'i', label: 'Italic', key: '⌘I', run: () => this.format('italic') },
              { id: 'u', label: 'Underline', key: '⌘U', run: () => this.format('underline') },
              '-',
              { id: 'c', label: 'Checklist', key: '⇧⌘L', run: () => this.checklist() },
              { id: 't', label: 'Table', run: () => this.table() }
            ]
          },
          ['File', 'Edit', 'Format', 'View', 'Window', 'Help']
        )
      )
    );
    afterNextRender(() => this.show());
    this.win.beforeClose.subscribe(() => this.save());
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected pickFolder(name: string): void {
    this.folder.set(name);
    this.show();
  }

  protected pick(id: number): void {
    this.save();
    this.selected.set(id);
    this.show();
  }

  /** 右键只选中并弹出菜单；“Pin Note” 与 “Duplicate” 和原版一样没有实现。 */
  protected menu(event: MouseEvent, id: number): void {
    this.selected.set(id);
    this.show();
    this.popover.contextMenu(event, [
      { id: 'p', label: 'Pin Note' },
      { id: 'd', label: 'Duplicate' },
      '-',
      { id: 'x', label: 'Delete', run: () => this.remove() }
    ]);
  }

  protected search(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.show();
  }

  /** 隐藏侧栏后，红绿灯搬到搜索栏最前面。 */
  protected toggleSidebar(): void {
    this.sidebar.update(visible => !visible);
  }

  protected create(): void {
    this.save();
    const id = Math.max(0, ...this.notes().map(note => note.id)) + 1;
    const date = new Date();
    const folder = this.folder();
    this.notes.update(list => [
      {
        id,
        folder: folder === 'Recently Deleted' || folder === 'All iCloud' ? 'Notes' : folder,
        title: 'New Note',
        date,
        body: newNoteBody(date)
      },
      ...list
    ]);
    this.selected.set(id);
    this.query.set('');
    this.show();
    const doc = this.doc().nativeElement;
    doc.focus();
    const heading = doc.querySelector('h1');
    if (!heading) return;
    const range = document.createRange();
    range.selectNodeContents(heading);
    range.collapse(false);
    this.moveCaret(range);
  }

  protected remove(): void {
    const note = this.current();
    if (!note) return;
    if (note.folder === 'Recently Deleted') this.notes.update(list => list.filter(item => item !== note));
    else this.notes.update(list => list.map(item => (item === note ? { ...item, folder: 'Recently Deleted' } : item)));
    this.show();
  }

  protected format(command: string): void {
    const doc = this.doc().nativeElement;
    doc.focus();
    /* execCommand 需要一个落在文本节点里的 range：光标停在最后一个块之后时
       没有地方挂输入样式，命令会悄悄失效，所以先把光标挪到最后一段文字的末尾。 */
    const selection = getSelection();
    if (!selection?.rangeCount || !doc.contains(selection.anchorNode)) this.moveCaret(this.endRange(doc));
    document.execCommand(command, false, undefined);
    this.syncFormats();
    this.saveSoon();
  }

  protected checklist(): void {
    this.doc().nativeElement.focus();
    const tick = `<div class="todo"><i>${CHECK_ICON}</i><span>&nbsp;</span></div>`;
    document.execCommand('insertHTML', false, tick);
    this.saveSoon();
  }

  protected table(): void {
    this.doc().nativeElement.focus();
    const row = '<tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>';
    const table = `<table><tr><th>&nbsp;</th><th>&nbsp;</th><th>&nbsp;</th></tr>${row}${row}</table><p>&nbsp;</p>`;
    document.execCommand('insertHTML', false, table);
    this.saveSoon();
  }

  /** 工具栏按钮跟随光标亮起：什么都没选就按粗体，也能看出接下来输入的是粗体。 */
  protected syncFormats(): void {
    this.active.set(STATE_COMMANDS.filter(commandState));
  }

  /** 聚焦时光标已经落在某处，若那里是标题，粗体在点击之前就该亮着。 */
  protected focused(): void {
    setTimeout(() => this.syncFormats(), 0);
  }

  protected saveSoon(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.save(), 420);
  }

  protected docKey(event: KeyboardEvent): void {
    if (!(event.metaKey || event.ctrlKey)) return;
    const command = SHORTCUTS[event.key.toLowerCase()];
    if (!command) return;
    event.preventDefault();
    this.format(command);
  }

  /** 待办的圆圈在注入的 HTML 里，只能在编辑区上做事件委托。 */
  protected docClick(event: MouseEvent): void {
    const tick = (event.target as Element).closest('.todo i');
    if (!tick) return;
    event.preventDefault();
    tick.closest('.todo')?.classList.toggle('done');
  }

  /** 选中项不在当前列表里时回到第一条，再把选中笔记的正文放进编辑区。 */
  private show(): void {
    const list = this.list();
    if (!list.some(note => note.id === this.selected())) this.selected.set(list[0]?.id ?? null);
    this.doc().nativeElement.innerHTML = this.current()?.body ?? '';
  }

  private save(): void {
    const note = this.current();
    if (!note) return;
    const doc = this.doc().nativeElement;
    const title = noteTitle(doc);
    this.notes.update(list =>
      list.map(item => (item === note ? { ...item, body: doc.innerHTML, title: title || item.title } : item))
    );
  }

  private endRange(doc: HTMLElement): Range {
    const walker = document.createTreeWalker(doc, NodeFilter.SHOW_TEXT);
    let last: Text | null = null;
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (node.nodeValue?.trim()) last = node;
    }
    const range = document.createRange();
    if (last) range.setStart(last, last.nodeValue?.length ?? 0);
    else range.selectNodeContents(doc);
    range.collapse(true);
    return range;
  }

  private moveCaret(range: Range): void {
    const selection = getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }
}
