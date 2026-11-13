import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  afterRenderEffect,
  computed,
  effect,
  inject,
  signal,
  viewChild
} from '@angular/core';

import { diskPathOf } from '../../disk/disk-path';
import { ApplicationCatalog } from '../../services/application-catalog';
import { DesktopMenus, FinderCommands, FinderView } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { DockDragController } from '../../services/dock-drag';
import { FileOpener } from '../../services/file-opener';
import { FileSystem, FsNode, HOME_PATH, PLACES, describeDiskError } from '../../services/file-system';
import { isKeyboardClick } from '../../services/focus-order';
import { MenuEntry } from '../../services/menu';
import { PopoverService, RETURNS_FOCUS } from '../../services/popover';
import { Toast } from '../../services/toast';
import { finderDate } from '../../shared/format';
import { Icon } from '../../shared/icon';
import { isMenuKey } from '../../shared/menu-list';
import { PhotoArt } from '../../shared/photo-art';
import { TrafficLights } from '../../shared/traffic-lights';
import { ItemRect, gridTarget, isGoUp, itemLabel, linearTarget } from './finder-keys';
import {
  FinderSort,
  SIDEBAR,
  TAG_PLACES,
  VIRTUAL_PLACES,
  columnChain,
  folderContents,
  nameSeed,
  shotKind
} from './finder-model';

/** 每一栏 206.5px；末端是文件时右侧再留 250px 预览。 */
const COLUMN_WIDTH = 206.5;
const PREVIEW_WIDTH = 250;

/**
 * Finder：图标、列表、分栏、画廊四种视图，侧栏、路径栏、搜索、排序与历史。
 *
 * 无障碍与键盘（ADESK-US-108）：窗口标题跟着目录名走（读屏念出「Documents，对话框」）；内容区是 `listbox`，
 * 条目是 `option`（名称加种类），整个内容区只占一个 Tab 位置（roving tabindex：选中项，没有就是第一项，`data-autofocus`
 * 标出它，窗口还原焦点时用）。焦点在条目上：方向键移动选择（图标视图按几何找上下左右、分栏视图左右进出栏），
 * Enter 打开，Backspace 或 ⌘↑ 回上一级，Menu 键 / Shift+F10 弹出右键菜单。侧栏、工具栏、路径栏都是原生按钮。
 */
@Component({
  selector: 'app-finder',
  imports: [Icon, PhotoArt, TrafficLights],
  host: { style: 'display: contents' },
  templateUrl: './finder.html'
})
export class FinderApp implements FinderCommands {
  private readonly win = inject(DesktopWindow);
  private readonly fs = inject(FileSystem);
  private readonly opener = inject(FileOpener);
  private readonly catalog = inject(ApplicationCatalog);
  private readonly dockDrag = inject(DockDragController);
  private readonly injector = inject(Injector);
  private readonly popover = inject(PopoverService);
  private readonly toast = inject(Toast);
  private readonly body = viewChild.required<ElementRef<HTMLElement>>('body');
  private readonly history = signal<{ readonly entries: readonly (readonly string[])[]; readonly index: number }>({
    entries: [],
    index: 0
  });
  private readonly bodyWidth = signal(0);
  /** 导航之前键盘焦点在内容区里：导航之后条目重新渲染，焦点要交还给新的 Tab 停靠点。 */
  private refocus = false;

  protected readonly sidebarGroups = SIDEBAR;
  protected readonly path = signal<readonly string[]>([]);
  protected readonly view = signal<FinderView>('icon');
  protected readonly sidebar = signal(true);
  protected readonly pathbar = signal(true);
  protected readonly selected = signal<string | null>(null);
  protected readonly query = signal('');
  protected readonly columnSelection = signal<readonly string[]>([]);
  protected readonly sort = signal<FinderSort>('name');
  protected readonly finderDate = finderDate;
  protected readonly seed = nameSeed;
  protected readonly shotKind = shotKind;

  protected readonly items = computed(() => folderContents(this.fs, this.path(), this.query(), this.sort()));
  /** 在 Applications 里：同名的非包条目占着位置，让某些预装应用没有包时，说清楚它们仍可从别处打开（D-17）。 */
  protected readonly applicationsNote = computed(() => {
    const path = this.path();
    return path.length === 2 && path[1] === 'Applications' && !this.query() ? this.catalog.conflictNote() : null;
  });
  protected readonly title = computed(() => (this.query() ? `Searching “${this.query()}”` : this.path().at(-1)));
  protected readonly canGoBack = computed(() => this.history().index > 0);
  protected readonly canGoForward = computed(() => this.history().index < this.history().entries.length - 1);
  protected readonly emptyText = computed(() => {
    const disk = this.fs.state();
    if (disk === 'mounting') return 'Mounting Macintosh HD…';
    if (disk === 'failed') return `Macintosh HD is unavailable: ${this.fs.error()}`;
    if (this.query()) return 'No results';
    return this.path()[0] === 'AirDrop' ? 'No one nearby' : 'Empty folder';
  });
  protected readonly gallerySelection = computed(() => {
    const items = this.items();
    return items.find(item => item.name === this.selected()) ?? items[0];
  });
  protected readonly columns = computed(() => columnChain(this.fs, this.path(), this.items(), this.columnSelection()));
  /** 内容区的 Tab 停靠点：选中的条目，没有就是第一项（roving tabindex：整个内容区只占一个 Tab 位置）。 */
  protected readonly tabStop = computed(() => {
    const items = this.items();
    const selected = this.selected();
    return items.some(item => item.name === selected) ? selected : (items[0]?.name ?? null);
  });
  protected readonly label = itemLabel;
  /** 只渲染放得下的最深几栏：真机会横向滚动，但总停在栏边界上，效果一样。 */
  protected readonly firstColumn = computed(() => {
    const { chain } = this.columns();
    const leafFile = chain.at(-1)?.file ?? false;
    const available = (this.bodyWidth() || 620) - (leafFile ? PREVIEW_WIDTH : 0);
    const keep = Math.max(1, Math.floor(available / COLUMN_WIDTH));
    return Math.max(0, chain.filter(column => !column.file).length - keep);
  });
  protected readonly previewFile = computed(() => {
    const leaf = this.columns().chain.at(-1);
    return leaf?.file ? leaf.node : null;
  });
  /** 分栏视图里选择链也算进路径栏，否则会跳过点进去的每一级。 */
  protected readonly pathSegments = computed(() =>
    this.view() === 'column' ? [...this.path(), ...this.columns().selection] : this.path()
  );
  protected readonly pathTail = computed(() => (this.view() === 'column' ? null : this.selected()));
  /** 分栏视图的 Tab 停靠点：最深一栏里选中的条目；还没选就是最左边那栏的第一项。 */
  protected readonly columnStop = computed(() => {
    const { chain, selection } = this.columns();
    if (selection.length) return { ci: selection.length - 1, name: selection.at(-1) };
    const first = this.firstColumn();
    return { ci: first, name: chain[first]?.items?.[0]?.name };
  });

  constructor() {
    const menus = inject(DesktopMenus);
    const start = this.win.options.path ?? HOME_PATH;
    this.path.set(start);
    this.history.set({ entries: [start], index: 0 });
    this.selected.set(this.win.options.select ?? null);
    if (start.length === 1 && start[0] === 'Trash') this.view.set('list');
    this.win.setMenus(computed(() => menus.finder(this)));
    /* 窗口停在哪个目录，刷新后就恢复到哪个目录（窗口布局，ADESK-US-104）；选中项、视图属于内部状态，不记。 */
    effect(() => this.win.restoreOptions.set({ path: this.path() }));
    /* 窗口标题就是当前目录（搜索时是搜索词）：读屏念出的窗口名与 Dock 菜单里的窗口列表都跟着它走。 */
    effect(() => this.win.title.set(this.title() ?? this.win.app.name));
    afterRenderEffect(() => {
      this.items();
      this.columns();
      if (!this.refocus) return;
      this.refocus = false;
      this.focusTabStop();
    });

    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const observer = new ResizeObserver(() => this.bodyWidth.set(this.body().nativeElement.clientWidth));
      observer.observe(this.body().nativeElement);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  goto(place: string): void {
    if (VIRTUAL_PLACES.includes(place)) {
      this.nav([place]);
      return;
    }
    if (TAG_PLACES.some(tag => place.startsWith(tag))) {
      this.toast.show(`No files tagged ${place}`);
      return;
    }
    this.nav(PLACES[place] ?? HOME_PATH);
  }

  setView(view: FinderView): void {
    this.view.set(view);
  }

  toggleSidebar(): void {
    this.sidebar.update(on => !on);
  }

  togglePathBar(): void {
    this.pathbar.update(on => !on);
  }

  newFolder(): void {
    const dir = diskPathOf(this.path());
    if (!dir || this.query()) {
      this.toast.show('New folders can only be made on Macintosh HD');
      return;
    }
    this.fs.newFolder(dir).then(
      name => this.selected.set(name),
      (error: unknown) => this.toast.show(describeDiskError(error))
    );
  }

  openSelected(): void {
    const name = this.selected();
    if (name) this.enter(name);
  }

  trashSelected(): void {
    const node = this.items().find(item => item.name === this.selected());
    if (!node?.path) return;
    this.selected.set(null);
    this.fs.moveToTrash(node.path).catch((error: unknown) => this.toast.show(describeDiskError(error)));
  }

  protected placeOn(place: string): boolean {
    const path = this.path();
    return place === path.at(-1) || (PLACES[place] ?? []).join('/') === path.join('/');
  }

  protected back(): void {
    this.step(-1);
  }

  protected forward(): void {
    this.step(1);
  }

  protected search(value: string): void {
    this.query.set(value);
  }

  protected select(name: string): void {
    this.selected.set(name);
  }

  /** 内容区条目上的按键：方向键移动选择、Enter 打开、Backspace 或 ⌘↑ 上一级、Menu 键弹出菜单；`column` 是分栏视图里条目所在的栏。 */
  protected itemKey(event: KeyboardEvent, name: string, column = -1): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.activate(name, column);
    } else if (isGoUp(event)) {
      event.preventDefault();
      this.goUp();
    } else if (isMenuKey(event)) {
      event.preventDefault();
      this.itemMenuByKey(event.currentTarget as HTMLElement, name);
    } else if (this.view() === 'column') this.moveInColumns(event, name, column);
    else this.moveInView(event, name);
  }

  /** 回到上一级目录，并选中刚才所在的文件夹。 */
  protected goUp(): void {
    const path = this.path();
    if (path.length < 2) return;
    this.nav(path.slice(0, -1));
    this.selected.set(path.at(-1) ?? null);
  }

  /** Applications 里系统拥有的 `.app` 包可以拖进 Dock；别的条目（含用户复制出来的包）不能。只把应用 id 交给 Dock。 */
  protected dragApp(event: PointerEvent, node: FsNode): void {
    const appId = this.catalog.appIdOf(node);
    if (appId) this.dockDrag.beginFromFinder(event, appId);
  }

  protected enter(name: string): void {
    const node = this.items().find(item => item.name === name);
    if (node) this.openNode(node);
  }

  protected pickColumn(index: number, name: string): void {
    this.columnSelection.update(selection => [...selection.slice(0, index), name]);
    this.selected.set(name);
  }

  protected openColumnFile(node: FsNode): void {
    if (node.kind === 'file') this.enter(node.name);
  }

  protected jump(index: number | null): void {
    this.nav(index === null ? [] : this.path().slice(0, index + 1));
  }

  protected sortMenu(anchor: HTMLElement, event: MouseEvent): void {
    const sort = this.sort();
    const pick = (next: FinderSort) => () => this.sort.set(next);
    this.popover.menuUnder(
      anchor,
      [
        { head: 'Sort By' },
        { id: 'n', label: 'Name', checked: sort !== 'date' && sort !== 'size', run: pick('name') },
        { id: 'd', label: 'Date Modified', checked: sort === 'date', run: pick('date') },
        { id: 's', label: 'Size', checked: sort === 'size', run: pick('size') },
        { id: 'k', label: 'Kind', checked: sort === 'kind', run: pick('kind') }
      ],
      { keyboard: isKeyboardClick(event), label: 'Sort By' }
    );
  }

  protected moreMenu(anchor: HTMLElement, event: MouseEvent): void {
    const rect = anchor.getBoundingClientRect();
    const keyboard = isKeyboardClick(event);
    this.popover.openMenu(
      [
        {
          id: 'sb',
          label: this.sidebar() ? 'Hide Sidebar' : 'Show Sidebar',
          key: '⌥⌘S',
          run: () => this.toggleSidebar()
        },
        {
          id: 'pb',
          label: this.pathbar() ? 'Hide Path Bar' : 'Show Path Bar',
          key: '⌥⌘P',
          run: () => this.togglePathBar()
        },
        '-',
        { id: 'nf', label: 'New Folder', key: '⇧⌘N', run: () => this.newFolder() }
      ],
      {
        x: rect.right,
        y: rect.bottom + 4,
        right: true,
        origin: 'top right',
        label: 'More',
        ...(keyboard ?
          {
            focus: true,
            onClose: reason => {
              if (RETURNS_FOCUS.has(reason)) anchor.focus();
            }
          }
        : {})
      }
    );
  }

  protected share(): void {
    this.toast.show('Nothing to share — it is all local.');
  }

  protected itemMenu(event: MouseEvent, name: string): void {
    this.selected.set(name);
    this.popover.contextMenu(event, this.itemMenuItems(name), name);
  }

  protected bodyMenu(event: MouseEvent): void {
    if ((event.target as Element).closest('.fitem,.r,.ci')) return;
    this.popover.contextMenu(event, [
      { id: 'nf', label: 'New Folder', run: () => this.newFolder() },
      { id: 'gi', label: 'Get Info' },
      '-',
      { id: 'v', label: 'View', key: '▸' },
      { id: 's', label: 'Sort By', key: '▸' }
    ]);
  }

  private itemMenuItems(name: string): MenuEntry[] {
    return [
      { id: 'o', label: 'Open', run: () => this.enter(name) },
      { id: 'w', label: 'Open With', key: '▸' },
      '-',
      { id: 'i', label: 'Get Info', key: '⌘I', run: () => this.info(name) },
      { id: 'r', label: 'Rename' },
      { id: 'd', label: 'Duplicate', key: '⌘D' },
      '-',
      { id: 't', label: 'Move to Trash', key: '⌘⌫', run: () => this.trashSelected() },
      '-',
      { id: 'q', label: 'Quick Look', key: '␣', run: () => this.info(name) }
    ];
  }

  /** 键盘弹出的右键菜单：贴着条目，焦点交给第一项，关闭后焦点回到条目（条目没了就回到 Tab 停靠点）。 */
  private itemMenuByKey(anchor: HTMLElement, name: string): void {
    this.selected.set(name);
    const rect = anchor.getBoundingClientRect();
    this.popover.openMenu(this.itemMenuItems(name), {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      origin: 'top left',
      focus: true,
      label: name,
      onClose: reason => {
        if (!RETURNS_FOCUS.has(reason)) return;
        if (anchor.isConnected) anchor.focus();
        else this.refocus = true;
      }
    });
  }

  private activate(name: string, column: number): void {
    if (column < 0) {
      this.enter(name);
      return;
    }
    const node = this.columns().chain[column]?.items?.find(item => item.name === name);
    if (node) this.openNode(node);
  }

  /** 打开一个条目：文件交给打开器，文件夹进入它。搜索结果与「最近使用」不在当前路径下，按绝对路径进入。 */
  private openNode(node: FsNode): void {
    if (node.kind === 'file') {
      this.opener.open(node);
      return;
    }
    this.nav(this.fs.findPath(node) ?? [...this.path(), node.name]);
  }

  /** 图标、列表、画廊视图里方向键移动选择。 */
  private moveInView(event: KeyboardEvent, name: string): void {
    const items = this.items();
    const at = items.findIndex(item => item.name === name);
    const view = this.view();
    const target =
      view === 'icon' ?
        gridTarget(event.key, at, this.iconRects())
      : linearTarget(event.key, at, items.length, view === 'gallery' ? 'horizontal' : 'vertical');
    if (target === null) return;
    event.preventDefault();
    this.select(items[target].name);
    this.option(`[data-name="${CSS.escape(items[target].name)}"]`)?.focus();
  }

  /** 分栏视图：上下在栏内移动，向右进到下一栏的第一项，向左回到上一栏选中的那一项。 */
  private moveInColumns(event: KeyboardEvent, name: string, ci: number): void {
    const { chain, selection } = this.columns();
    if (event.key === 'ArrowRight') {
      const next = chain[ci + 1];
      const first = next && !next.file ? next.items?.[0] : undefined;
      if (!first) return;
      event.preventDefault();
      this.focusColumnItem(ci + 1, first.name);
      return;
    }
    if (event.key === 'ArrowLeft') {
      const parent = selection[ci - 1];
      if (ci <= this.firstColumn() || parent === undefined) return;
      event.preventDefault();
      this.columnSelection.update(current => current.slice(0, ci));
      this.focusColumnItem(ci - 1, parent);
      return;
    }
    const items = chain[ci]?.items ?? [];
    const target = linearTarget(
      event.key,
      items.findIndex(item => item.name === name),
      items.length,
      'vertical'
    );
    if (target === null) return;
    event.preventDefault();
    this.focusColumnItem(ci, items[target].name);
  }

  /** 选中并聚焦分栏里的一项；那一栏还没渲染出来（刚选中上一栏的文件夹）就等渲染完再聚焦。 */
  private focusColumnItem(ci: number, name: string): void {
    this.pickColumn(ci, name);
    const selector = `[data-ci="${ci}"][data-name="${CSS.escape(name)}"]`;
    const node = this.option(selector);
    if (node) node.focus();
    else afterNextRender(() => this.option(selector)?.focus(), { injector: this.injector });
  }

  private iconRects(): ItemRect[] {
    return [...this.body().nativeElement.querySelectorAll('.fitem')].map(node => node.getBoundingClientRect());
  }

  private option(selector: string): HTMLElement | null {
    return this.body().nativeElement.querySelector<HTMLElement>(`[role="option"]${selector}`);
  }

  private focusTabStop(): void {
    this.body().nativeElement.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }

  /** 导航之前记下键盘焦点是不是在内容区里：导航会让条目重新渲染，焦点随旧节点丢掉。 */
  private keepFocus(): void {
    const body = this.body().nativeElement;
    this.refocus = body.contains(body.ownerDocument.activeElement);
  }

  private info(name: string): void {
    const node = this.items().find(item => item.name === name);
    if (node) this.toast.show(`${node.name} — ${node.k}${node.size ? `, ${node.size}` : ''}`);
  }

  private nav(path: readonly string[]): void {
    this.keepFocus();
    this.query.set('');
    this.path.set(path);
    this.selected.set(null);
    this.columnSelection.set([]);
    this.history.update(({ entries, index }) => {
      const next = [...entries.slice(0, index + 1), path];
      return { entries: next, index: next.length - 1 };
    });
  }

  private step(delta: number): void {
    const { entries, index } = this.history();
    const target = index + delta;
    if (target < 0 || target >= entries.length) return;
    this.keepFocus();
    this.history.set({ entries, index: target });
    this.path.set(entries[target]);
    this.selected.set(null);
    this.columnSelection.set([]);
  }
}
