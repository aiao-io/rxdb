import {
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild
} from '@angular/core';

import { DesktopData } from '../../data/desktop-data';
import { ALL_ROWS, liveQuery } from '../../data/live-query';
import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { PopoverService, RETURNS_FOCUS } from '../../services/popover';
import { Icon } from '../../shared/icon';
import { TrafficLights } from '../../shared/traffic-lights';
import { CHECK_ICON } from './notes-data';
import { NoteDocument, NoteSaveError, NoteSnapshot, NoteWrite, noteFailureMessage, sameNoteContent } from './note-document';
import { NoteFolderEditor } from './note-folder-editor';
import {
  ALL_NOTES,
  NOTES_FOLDER,
  TRASH_FOLDER,
  folderCount,
  inFolder,
  newNoteBody,
  noteFolderNameError,
  noteSnippet,
  noteTitle,
  noteWhen,
  visibleNotes
} from './notes-model';
import { Note, NoteFolder } from './notes.entities';

/** 侧栏的文件夹；右侧的数量由库里的笔记现数。 */
const FOLDERS = [
  { name: ALL_NOTES, icon: 'g-folder-g' },
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
  private readonly popover = inject(PopoverService);
  private readonly data = inject(DesktopData);
  private readonly frame = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly doc = viewChild.required<ElementRef<HTMLElement>>('doc');
  private readonly notes = liveQuery(
    () => Note.findAll({ where: ALL_ROWS, orderBy: [{ field: 'date', sort: 'desc' }] }),
    [],
    Note
  );
  private readonly noteFolders = liveQuery(
    () => NoteFolder.findAll({ where: ALL_ROWS, orderBy: [{ field: 'name', sort: 'asc' }] }),
    [],
    NoteFolder
  );
  private readonly list = computed(() => visibleNotes(this.notes(), this.folder(), this.query()));
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** 编辑区里现在装的是哪条笔记。 */
  private loaded: string | null = null;
  private operation: Promise<boolean> | null = null;
  private copyId: Note['id'] | null = null;
  /** 刚新建、等活查询带回来后再选中并聚焦的笔记。 */
  private fresh: string | null = null;

  protected readonly current = computed(() => this.notes().find(note => note.id === this.selected()));
  protected readonly win = inject(DesktopWindow);
  protected readonly editor = new NoteDocument(change => this.persist(change));
  protected readonly busy = signal(false);
  protected readonly actionError = signal('');
  protected readonly failure = computed(() => this.actionError() || this.editor.error());
  protected readonly folders = computed(() => [
    ...FOLDERS.map(folder => ({ ...folder, count: folderCount(this.notes(), folder.name) })),
    ...this.noteFolders().map(folder => ({ name: folder.name, icon: 'g-folder-g', count: folderCount(this.notes(), folder.name) }))
  ]);
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
              { id: 's', label: 'Save Note', key: '⌘S', run: () => this.retry() },
              { id: 'copy', label: 'Save a Copy', run: () => this.saveCopy() },
              { id: 'p', label: this.current()?.pinned ? 'Unpin Note' : 'Pin Note', run: () => this.togglePin(), disabled: !this.current() },
              { id: 'f', label: 'New Folder', key: '⇧⌘N', run: () => this.newFolder() },
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
      this.busy();
      this.editor.saving();
      untracked(() => this.show());
    });
    this.win.confirmClose = async () => {
      if (this.operation && !(await this.operation)) return false;
      return this.save();
    };
    effect(() => this.win.hasUnsavedChanges.set(this.editor.dirty() || this.editor.saving() || this.busy()));
    const beforeUnload = (event: BeforeUnloadEvent): void => {
      if (!this.editor.dirty() && !this.editor.saving() && !this.busy()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.timer);
      window.removeEventListener('beforeunload', beforeUnload);
      this.win.confirmClose = null;
      this.win.hasUnsavedChanges.set(false);
      this.editor.dispose();
    });
  }

  protected pickFolder(name: string): Promise<boolean> {
    return this.operate(() => {
      this.folder.set(name);
      this.show(true);
    });
  }

  protected pick(id: string): Promise<boolean> {
    return this.operate(() => {
      this.selected.set(id);
      this.show(true);
    });
  }

  protected async menu(event: MouseEvent, id: string): Promise<void> {
    event.preventDefault();
    if (!(await this.pick(id))) return;
    this.popover.contextMenu(event, [
      { id: 'p', label: this.current()?.pinned ? 'Unpin Note' : 'Pin Note', run: () => this.togglePin() },
      { id: 'd', label: 'Duplicate', run: () => this.saveCopy() },
      '-',
      { id: 'x', label: 'Delete', run: () => this.remove() }
    ]);
  }

  protected search(event: Event): void {
    const input = event.target as HTMLInputElement;
    const query = input.value;
    void this.operate(() => {
      this.query.set(query);
      this.show(true);
    }).then(() => { input.value = this.query(); });
  }

  protected toggleSidebar(): void {
    this.sidebar.update(visible => !visible);
  }

  protected newFolder(): void {
    const bounds = (this.frame.nativeElement.closest('.win') ?? this.frame.nativeElement).getBoundingClientRect();
    this.popover.openComponent(
      NoteFolderEditor,
      {
        x: Math.min(bounds.left + 18, innerWidth - 338),
        y: Math.min(bounds.top + 56, innerHeight - 190),
        origin: 'top left',
        focus: true,
        onClose: reason => {
          if (RETURNS_FOCUS.has(reason)) this.frame.nativeElement.focus();
        }
      },
      { submit: (name: string) => this.createFolder(name) }
    );
  }

  protected createFolder(name: string): Promise<string> {
    const trimmed = name.trim();
    const problem = noteFolderNameError(trimmed, this.noteFolders().map(folder => folder.name));
    if (problem) return Promise.resolve(problem);
    return this.operate(async () => {
      const folder = this.data.instantiate(NoteFolder, { name: trimmed });
      await this.data.transaction(async executor => {
        const repository = executor.getRepository(NoteFolder);
        const existing = await repository.find({ where: ALL_ROWS });
        if (existing.some(item => item.name.toLowerCase() === trimmed.toLowerCase()))
          throw new Error('A folder with that name already exists.');
        await repository.create(folder);
      });
      this.folder.set(trimmed);
      this.query.set('');
    }).then(ok => ok ? '' : this.actionError() || 'The folder could not be created.');
  }

  protected create(): Promise<boolean> {
    return this.operate(async () => {
      const date = new Date();
      const folder = this.folder();
      const note = this.data.instantiate(Note, {
        folder: folder === TRASH_FOLDER || folder === ALL_NOTES ? NOTES_FOLDER : folder,
        title: 'New Note', date, body: newNoteBody(date), pinned: false
      });
      await (await this.data.repository(Note)).create(note);
      this.fresh = note.id;
      this.folder.set(note.folder);
      this.query.set('');
    });
  }

  protected remove(): Promise<boolean> {
    return this.operate(async () => {
      const value = this.editor.value();
      if (!value) return;
      await this.data.transaction(async executor => {
        const repository = executor.getRepository(Note);
        const [note] = await repository.find({ where: this.whereId(value.id), limit: 1 });
        if (!note) throw new NoteSaveError('missing');
        if (!sameNoteContent(note, value)) throw new NoteSaveError('conflict');
        if (note.folder === TRASH_FOLDER) await repository.remove(note);
        else await repository.update(note, { folder: TRASH_FOLDER });
      });
      this.editor.discard(null);
      this.loaded = null;
      this.selected.set(null);
    });
  }

  protected retry(): Promise<boolean> {
    return this.operate(() => undefined);
  }

  protected togglePin(): Promise<boolean> {
    return this.operate(async () => {
      const value = this.editor.value();
      if (!value) return;
      await this.data.transaction(async executor => {
        const repository = executor.getRepository(Note);
        const [note] = await repository.find({ where: this.whereId(value.id), limit: 1 });
        if (!note) throw new NoteSaveError('missing');
        if (!sameNoteContent(note, value)) throw new NoteSaveError('conflict');
        await repository.update(note, { pinned: !note.pinned });
      });
    });
  }

  protected discardChanges(): Promise<boolean> {
    return this.operate(async () => {
      const id = this.editor.value()?.id;
      const repository = await this.data.repository(Note);
      const notes = id ? await repository.find({ where: this.whereId(id), limit: 1 }) : [];
      this.editor.discard(notes[0] ?? null);
      this.loaded = notes[0]?.id ?? null;
      this.selected.set(this.loaded);
      this.doc().nativeElement.innerHTML = notes[0]?.body ?? '';
    }, false);
  }

  protected saveCopy(): Promise<boolean> {
    return this.operate(async () => {
      const value = this.editor.value();
      if (!value) return;
      this.copyId ??= crypto.randomUUID();
      const copy = this.data.instantiate(Note, {
        ...value, id: this.copyId, date: new Date(), folder: NOTES_FOLDER, pinned: false
      });
      await this.data.transaction(async executor => {
        const repository = executor.getRepository(Note);
        const [existing] = await repository.find({ where: this.whereId(copy.id), limit: 1 });
        if (existing && !sameNoteContent(existing, copy)) throw new NoteSaveError('conflict');
        if (!existing) await repository.create(copy);
      });
      this.copyId = null;
      this.editor.discard(copy);
      this.loaded = copy.id;
      this.fresh = copy.id;
      this.selected.set(copy.id);
      this.folder.set(NOTES_FOLDER);
      this.query.set('');
    }, false);
  }

  protected format(command: string): void {
    if (this.busy() || this.win.closePending() || !this.editor.value()) return;
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
    if (this.busy() || this.win.closePending() || !this.editor.value()) return;
    this.doc().nativeElement.focus();
    const tick = `<div class="todo"><i>${CHECK_ICON}</i><span>&nbsp;</span></div>`;
    document.execCommand('insertHTML', false, tick);
    this.saveSoon();
  }

  protected table(): void {
    if (this.busy() || this.win.closePending() || !this.editor.value()) return;
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
    this.capture();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.save(); }, 420);
  }

  protected docKey(event: KeyboardEvent): void {
    if (!(event.metaKey || event.ctrlKey)) return;
    if (event.key.toLowerCase() === 's') {
      event.preventDefault();
      void this.retry();
      return;
    }
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
   * 渲染后的对齐不改变文件夹与搜索词；草稿或在途写入始终保留当前编辑器。
   */
  private show(reselect = false): void {
    if (this.editor.dirty() || this.editor.saving()) return;
    if (this.busy() && !reselect) return;
    if (this.fresh && !this.notes().some(note => note.id === this.fresh)) return;
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
    if (!this.editor.open(note ?? null)) return;
    this.loaded = id;
    const doc = this.doc().nativeElement;
    doc.innerHTML = note?.body ?? '';
    if (created !== null && id === created) this.focusTitle();
  }

  private capture(): void {
    const value = this.editor.value();
    if (!value || value.id !== this.loaded) return;
    const doc = this.doc().nativeElement;
    const body = doc.innerHTML;
    const title = noteTitle(doc) || value.title;
    if (body !== value.body || title !== value.title) this.editor.edit({ body, title });
  }

  private save(): Promise<boolean> {
    clearTimeout(this.timer);
    this.capture();
    return this.editor.save();
  }

  private operate(action: () => void | Promise<void>, saveCurrent = true): Promise<boolean> {
    if (this.operation || this.win.closePending()) return Promise.resolve(false);
    clearTimeout(this.timer);
    this.capture();
    this.actionError.set('');
    this.busy.set(true);
    this.operation = this.perform(action, saveCurrent).finally(() => {
      this.busy.set(false);
      this.operation = null;
    });
    return this.operation;
  }

  private async perform(action: () => void | Promise<void>, saveCurrent: boolean): Promise<boolean> {
    try {
      if (saveCurrent && !(await this.save())) return false;
      if (!saveCurrent && this.editor.saving()) await this.editor.save();
      await action();
      return true;
    } catch (error) {
      this.actionError.set(noteFailureMessage(error));
      return false;
    }
  }

  private async persist({ base, value }: NoteWrite): Promise<void> {
    await this.data.transaction(async executor => {
      const repository = executor.getRepository(Note);
      const [note] = await repository.find({ where: this.whereId(value.id), limit: 1 });
      if (!note) throw new NoteSaveError('missing');
      if (sameNoteContent(note, value)) return;
      if (!sameNoteContent(note, base)) throw new NoteSaveError('conflict');
      await repository.update(note, { body: value.body, title: value.title });
    });
  }

  private whereId(id: NoteSnapshot['id']) {
    return { combinator: 'and' as const, rules: [{ field: 'id' as const, operator: '=' as const, value: id }] };
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
