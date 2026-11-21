import { DOCUMENT } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  ViewEncapsulation,
  afterNextRender,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
  viewChild
} from '@angular/core';

import type { DiskPath } from '../disk/disk-path';
import { ActiveFilePanel, FilePanels } from '../services/file-panels';
import { FileSystem, isLocked } from '../services/file-system';
import { FocusTrap } from '../shared/focus-trap';
import { Icon } from '../shared/icon';
import {
  NavigationKey,
  PanelEntry,
  fileNameProblem,
  moveActive,
  nearestFolder,
  panelEntries,
  pathLabel,
  saveConflict,
  startFolder
} from './file-panel-model';

let serial = 0;

/** `browse`：选位置与文件名；`replace`：目标已存在，等用户确认覆盖。 */
type Phase = 'browse' | 'replace';

/**
 * 桌面自己的打开 / 保存面板（ADESK-US-206 阶段 D，`filesystem` 能力）：模态，盖在窗口层上，读的是虚拟磁盘。
 * 应用只能请求，选哪个文件、存到哪里、是否覆盖都由用户在这里决定——应用不能跳过确认，也拿不到面板之外的任何文件。
 *
 * **键盘等效操作**（只用 Tab、方向键、Enter 与 Esc 就能完成选择、确认与取消）：焦点困在面板里（Tab 在面板内循环，沿用桌面浮层的 {@link FocusTrap}：
 * 关闭时焦点还给打开它之前的元素）；
 * 文件列表是一个 `listbox`（一个 Tab 停靠点，条目用 `aria-activedescendant` 指出当前项，所以条目本身不是 Tab 停靠点），
 * 上下方向键与 Home / End 选条目，Enter 进入文件夹或确认文件，右方向键进入文件夹，左方向键与 Backspace 回到上一级；
 * 保存时名字输入框里 Enter 就是保存；目标已存在时出现覆盖确认，默认焦点在「Cancel」；
 * Esc 取消（覆盖确认里的 Esc 先退回保存面板）。关闭后把焦点还给发起它的窗口（远程应用交回它的文档）。
 *
 * 超过大小上限的文件禁用选择并写明原因；`accept` 只做显示过滤。
 */
@Component({
  selector: 'app-file-panel',
  imports: [Icon, FocusTrap],
  templateUrl: './file-panel.html',
  styleUrl: './file-panel.scss',
  encapsulation: ViewEncapsulation.None,
  host: { style: 'display: contents', '(keydown)': 'keydown($event)' }
})
export class FilePanel {
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly disk = inject(FileSystem);
  private readonly panels = inject(FilePanels);
  private readonly list = viewChild.required<ElementRef<HTMLElement>>('list');
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');
  private readonly cancelButton = viewChild<ElementRef<HTMLButtonElement>>('cancelButton');
  /** 用户选的文件夹；还没选过就是起始文件夹。 */
  private readonly chosen = signal<DiskPath | null>(null);

  protected readonly uid = `fp${++serial}`;
  protected readonly request = computed(() => this.panel().request);
  protected readonly isSave = computed(() => this.request().mode === 'save');
  protected readonly heading = computed(() => (this.isSave() ? 'Save' : 'Open'));
  protected readonly label = computed(() => `${this.heading()} — ${this.request().app.name}`);
  protected readonly subtitle = computed(
    () => `“${this.request().app.name}” wants to ${this.isSave() ? 'save' : 'open'} a file.`
  );
  /** 面板此刻所在的文件夹；它被别处删除、改名时退到最近的还在的上级。 */
  protected readonly dir = computed(() => {
    const nodeAt = (path: DiskPath) => this.disk.nodeAt(path);
    return nearestFolder(this.chosen() ?? startFolder(nodeAt), nodeAt);
  });
  protected readonly where = computed(() => pathLabel(this.dir()));
  protected readonly folder = computed(() => this.disk.nodeAt(this.dir()));
  protected readonly entries = computed(() => {
    const { mode, accept, maxBytes } = this.request();
    return panelEntries(this.folder(), { mode, accept, maxBytes });
  });
  protected readonly activeName = signal<string | null>(null);
  protected readonly activeIndex = computed(() => this.entries().findIndex(entry => entry.name === this.activeName()));
  protected readonly active = computed(() => this.entries()[this.activeIndex()] ?? null);
  protected readonly activeId = computed(() => (this.activeIndex() < 0 ? null : this.rowId(this.activeIndex())));
  protected readonly name = linkedSignal(() => this.request().suggestedName);
  protected readonly phase = signal<Phase>('browse');
  protected readonly conflict = computed(() => saveConflict(this.folder(), this.name()));
  /** 保存时挡住「Save」的原因（给用户看的一句话）；可以保存为 `null`。 */
  protected readonly problem = computed(() => (this.isSave() ? this.saveProblem() : null));
  protected readonly canConfirm = computed(() => {
    if (this.isSave()) return this.problem() === null;
    const entry = this.active();
    return entry !== null && (entry.folder || !entry.disabled);
  });
  protected readonly confirmLabel = computed(() => {
    if (!this.isSave()) return 'Open';
    return this.phase() === 'replace' ? 'Replace' : 'Save';
  });

  /** 屏幕上的这个面板。 */
  readonly panel = input.required<ActiveFilePanel>();

  constructor() {
    afterNextRender(() => this.focusFirst());
    inject(DestroyRef).onDestroy(() => {
      const { restoreFocus } = this.panel().request;
      /*
       * 焦点陷阱会把焦点还给面板打开前的元素；远程应用的窗口里那个元素是 iframe 外壳，焦点要进到应用的文档里，
       * 所以等面板的节点离开文档之后再交给发起请求的窗口。队列里还有下一个面板时，焦点归它。
       */
      setTimeout(() => {
        if (!this.panels.current()) restoreFocus?.();
      });
    });
  }

  protected rowId(index: number): string {
    return `${this.uid}-row-${index}`;
  }

  /** 点选或方向键选中一行；保存面板里选中文件，名字跟着变成它（要覆盖它）。 */
  protected select(entry: PanelEntry): void {
    this.activeName.set(entry.name);
    if (this.isSave() && !entry.folder && !entry.disabled) this.rename(entry.name);
  }

  /** 双击或 Enter：文件夹进入，文件确认。 */
  protected activate(entry: PanelEntry): void {
    this.select(entry);
    if (entry.folder) this.enter(entry);
    else if (!entry.disabled) this.confirm();
  }

  protected rename(value: string): void {
    this.name.set(value);
    this.phase.set('browse');
  }

  protected up(): void {
    const dir = this.dir();
    if (dir.length === 0) return;
    this.chosen.set(dir.slice(0, -1));
    this.activeName.set(dir.at(-1) ?? null);
    this.phase.set('browse');
  }

  /** 「Open」/「Save」/「Replace」：打开选定的文件（选的是文件夹就进入）；保存时目标已存在先请用户确认覆盖。 */
  protected confirm(): void {
    if (!this.canConfirm()) return;
    const panel = this.panel();
    if (!this.isSave()) {
      const entry = this.active();
      if (entry?.folder) this.enter(entry);
      else if (entry) panel.submit({ kind: 'open', path: [...this.dir(), entry.name] });
      return;
    }
    const replace = this.conflict().kind === 'file';
    if (replace && this.phase() === 'browse') {
      this.phase.set('replace');
      /* 默认按钮是「Cancel」：连按两次 Enter 不会替用户覆盖文件。 */
      afterNextRender(() => this.cancelButton()?.nativeElement.focus(), { injector: this.injector });
      return;
    }
    panel.submit({ kind: 'save', dir: this.dir(), name: this.name(), replace });
  }

  /** 「Cancel」与 Esc：覆盖确认里先退回保存面板，否则取消整个面板。 */
  protected dismiss(): void {
    if (this.phase() === 'replace') {
      this.phase.set('browse');
      afterNextRender(() => this.field()?.nativeElement.focus(), { injector: this.injector });
      return;
    }
    this.panel().cancel();
  }

  /** 面板内的键盘：Esc 取消（Tab 的循环归焦点陷阱）；别的按键不再往桌面的全局快捷键传（带 ⌘ / Ctrl 的除外，关窗口之类的快捷键照常）。 */
  protected keydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.dismiss();
      return;
    }
    if (!event.metaKey && !event.ctrlKey) event.stopPropagation();
  }

  /** 点选一行（事件委托：条目本身不处理事件，列表是唯一的 Tab 停靠点）。 */
  protected pick(event: MouseEvent): void {
    const entry = this.entryAt(event);
    if (entry) this.select(entry);
  }

  /** 双击一行：文件夹进入，文件确认。 */
  protected pickAndOpen(event: MouseEvent): void {
    const entry = this.entryAt(event);
    if (entry) this.activate(entry);
  }

  /** 文件列表的键盘：方向键与 Home / End 选条目，Enter 进入或确认，左右方向键与 Backspace 进出文件夹。 */
  protected listKey(event: KeyboardEvent): void {
    const entry = this.active();
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
      case 'Home':
      case 'End':
        event.preventDefault();
        this.move(event.key);
        break;
      case 'Enter':
        event.preventDefault();
        if (entry) this.activate(entry);
        break;
      case 'ArrowRight':
        if (entry?.folder) {
          event.preventDefault();
          this.enter(entry);
        }
        break;
      case 'ArrowLeft':
      case 'Backspace':
        event.preventDefault();
        this.up();
        break;
    }
  }

  private enter(entry: PanelEntry): void {
    this.chosen.set([...this.dir(), entry.name]);
    this.activeName.set(null);
    this.phase.set('browse');
  }

  private move(key: NavigationKey): void {
    const entries = this.entries();
    const index = moveActive(entries.length, this.activeIndex(), key);
    const entry = entries[index];
    if (!entry) return;
    this.select(entry);
    this.document.getElementById(this.rowId(index))?.scrollIntoView({ block: 'nearest' });
  }

  private saveProblem(): string | null {
    const name = this.name();
    if (isLocked(this.dir())) return 'You don’t have permission to save in this location.';
    const invalid = fileNameProblem(name, this.request().nameLength);
    if (invalid) return invalid;
    const { kind } = this.conflict();
    if (kind === 'folder') return `A folder named “${name}” already exists in this location.`;
    if (kind === 'package') return `“${name}” is an application and can’t be replaced.`;
    return null;
  }

  /** 打开面板先把焦点放在文件列表上，保存面板放在名字输入框里（选中不含扩展名的部分）。 */
  private focusFirst(): void {
    const field = this.field()?.nativeElement;
    if (!field) {
      this.list().nativeElement.focus();
      return;
    }
    field.focus();
    const dot = field.value.lastIndexOf('.');
    field.setSelectionRange(0, dot > 0 ? dot : field.value.length);
  }

  private entryAt(event: Event): PanelEntry | undefined {
    const row = (event.target as Element).closest<HTMLElement>('[data-fp-entry]');
    return this.entries().find(entry => entry.name === row?.dataset['name']);
  }
}
