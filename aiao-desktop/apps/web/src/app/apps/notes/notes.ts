import {
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  signal,
  untracked,
  viewChild
} from '@angular/core';

import { DesktopData } from '../../data/desktop-data';
import { ALL_ROWS, liveQuery } from '../../data/live-query';
import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { PopoverService } from '../../services/popover';
import { Icon } from '../../shared/icon';
import { TrafficLights } from '../../shared/traffic-lights';
import { CHECK_ICON } from './notes-data';
import {
  ALL_NOTES,
  NOTES_FOLDER,
  TRASH_FOLDER,
  folderCount,
  inFolder,
  newNoteBody,
  noteSnippet,
  noteTitle,
  noteWhen,
  visibleNotes
} from './notes-model';
import { Note } from './notes.entities';

/** 侧栏的文件夹；右侧的数量由库里的笔记现数。 */
const FOLDERS = [
  { name: ALL_NOTES, icon: 'g-icloud-o' },
  { name: NOTES_FOLDER, icon: 'g-folder-g' },
  { name: TRASH_FOLDER, icon: 'g-tag' }
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

/**
 * 备忘录：文件夹、搜索、置顶优先的列表和可编辑的富文本文档。笔记存在桌面库里，所有窗口共用；
 * 编辑区只是当前这条笔记的编辑缓冲，输入停顿后（以及切换、关闭窗口时）写回库。
 */
@Component({
  selector: 'app-notes',
  imports: [Icon, TrafficLights],
  host: { style: 'display: contents' },
  templateUrl: './notes.html'
})
export class NotesApp {
  private readonly win = inject(DesktopWindow);
  private readonly popover = inject(PopoverService);
  private readonly data = inject(DesktopData);
  private readonly doc = viewChild.required<ElementRef<HTMLElement>>('doc');
  private readonly notes = liveQuery(
    () => Note.findAll({ where: ALL_ROWS, orderBy: [{ field: 'date', sort: 'desc' }] }),
    []
  );
  private readonly current = computed(() => this.notes().find(note => note.id === this.selected()));
  private readonly list = computed(() => visibleNotes(this.notes(), this.folder(), this.query()));
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** 编辑区里现在装的是哪条笔记。 */
  private loaded: string | null = null;
  /** 编辑区里最近一次与库一致的内容；和它一样就不必写库。 */
  private clean = '';
  /** 刚新建、等活查询带回来后再选中并聚焦的笔记。 */
  private fresh: string | null = null;

  protected readonly folders = computed(() =>
    FOLDERS.map(folder => ({ ...folder, count: folderCount(this.notes(), folder.name) }))
  );
  protected readonly textFormats = TEXT_FORMATS;
  protected readonly folder = signal<string>(NOTES_FOLDER);
  protected readonly query = signal('');
  protected readonly selected = signal<string | null>(null);
  protected readonly sidebar = signal(true);
  protected readonly active = signal<readonly string[]>([], { equal: sameList });
  protected readonly rows = computed(() => {
    const now = new Date();
    return this.list().map(note => ({
      id: note.id,
      title: `${note.pinned ? '📌 ' : ''}${note.title || 'New Note'}`,
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
    /* 库里的笔记到达（首次加载、别的窗口增删、自己写入后回读）时，把编辑区对齐到选中项。 */
    afterRenderEffect(() => {
      this.list();
      untracked(() => this.show());
    });
    this.win.beforeClose.subscribe(() => this.save());
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected pickFolder(name: string): void {
    this.save();
    this.folder.set(name);
    this.show(true);
  }

  protected pick(id: string): void {
    this.save();
    this.selected.set(id);
    this.show(true);
  }

  /** 右键只选中并弹出菜单；“Pin Note” 与 “Duplicate” 和原版一样没有实现。 */
  protected menu(event: MouseEvent, id: string): void {
    this.save();
    this.selected.set(id);
    this.show(true);
    this.popover.contextMenu(event, [
      { id: 'p', label: 'Pin Note' },
      { id: 'd', label: 'Duplicate' },
      '-',
      { id: 'x', label: 'Delete', run: () => this.remove() }
    ]);
  }

  protected search(event: Event): void {
    this.save();
    this.query.set((event.target as HTMLInputElement).value);
    this.show(true);
  }

  /** 隐藏侧栏后，红绿灯搬到搜索栏最前面。 */
  protected toggleSidebar(): void {
    this.sidebar.update(visible => !visible);
  }

  /** 新建一条笔记写进库；等活查询把它带回来之后，选中它并把光标放进标题（见 `show`）。 */
  protected async create(): Promise<void> {
    this.save();
    this.query.set('');
    const date = new Date();
    const folder = this.folder();
    const note = this.data.instantiate(Note, {
      folder: folder === TRASH_FOLDER || folder === ALL_NOTES ? NOTES_FOLDER : folder,
      title: 'New Note',
      date,
      body: newNoteBody(date),
      pinned: false
    });
    this.fresh = note.id;
    try {
      await (await this.data.repository(Note)).create(note);
    } catch (error) {
      this.fresh = null;
      throw error;
    }
  }

  /** 笔记先移进 Recently Deleted；已经在里面的真正删除。选中项由列表刷新后的 `show` 接上。 */
  protected async remove(): Promise<void> {
    const note = this.current();
    if (!note) return;
    /* 要删的笔记不再保存编辑区里的内容（防抖定时器可能还没到点）。 */
    clearTimeout(this.timer);
    this.clean = this.doc().nativeElement.innerHTML;
    const repository = await this.data.repository(Note);
    if (note.folder === TRASH_FOLDER) await repository.remove(note);
    else await repository.update(note, { folder: TRASH_FOLDER });
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
    this.saveSoon();
  }

  /**
   * 把编辑区对齐到选中的笔记：选中项失效时回到第一条，再把它的正文放进编辑区。
   * 已经在编辑区里的笔记不重放，免得自动保存、别的窗口引起的刷新打断输入。
   * 刚新建的笔记等活查询把它带回来之后才选中并把光标放进标题。
   *
   * `reselect` 是用户刚点了文件夹、笔记或搜索：选中项必须还在列表里。数据刷新引起的对齐（默认）只要求它还在当前文件夹——
   * 边改边存时标题或正文不再匹配搜索词，编辑区不能突然换成别的笔记。
   *
   * 构造器里的 `afterRenderEffect` 也走这里，所以这里只能写 `selected`，不能写列表依赖的信号（笔记、文件夹、搜索词）：
   * 渲染后的副作用改了自己依赖的信号，Angular 会把它销毁。
   */
  private show(reselect = false): void {
    const created = this.fresh !== null && this.notes().some(note => note.id === this.fresh) ? this.fresh : null;
    if (created !== null) {
      this.fresh = null;
      this.selected.set(created);
    }
    const list = this.list();
    const kept = this.current();
    const stays =
      kept !== undefined && (reselect ? list.some(note => note.id === kept.id) : inFolder(kept, this.folder()));
    if (!stays) this.selected.set(list[0]?.id ?? null);
    const note = this.current();
    const id = note?.id ?? null;
    if (id === this.loaded) return;
    this.loaded = id;
    const doc = this.doc().nativeElement;
    doc.innerHTML = note?.body ?? '';
    this.clean = doc.innerHTML;
    if (created !== null && id === created) this.focusTitle();
  }

  /** 编辑区里的内容有改动就写回库：正文，以及从首个标题取出的标题。 */
  private save(): void {
    clearTimeout(this.timer);
    const note = this.notes().find(item => item.id === this.loaded);
    if (!note) return;
    const doc = this.doc().nativeElement;
    const body = doc.innerHTML;
    if (body === this.clean) return;
    this.clean = body;
    void this.persist(note, { body, title: noteTitle(doc) || note.title });
  }

  private async persist(note: Note, patch: Partial<Note>): Promise<void> {
    try {
      await (await this.data.repository(Note)).update(note, patch);
    } catch (error) {
      /* 没写成：作废“已与库一致”的记号，下一次保存会重试；错误照常抛出。 */
      if (this.clean === patch.body) this.clean = '';
      throw error;
    }
  }

  /** 光标放到标题末尾，新建的笔记可以直接改名。 */
  private focusTitle(): void {
    const doc = this.doc().nativeElement;
    doc.focus();
    const heading = doc.querySelector('h1');
    if (!heading) return;
    const range = document.createRange();
    range.selectNodeContents(heading);
    range.collapse(false);
    this.moveCaret(range);
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
