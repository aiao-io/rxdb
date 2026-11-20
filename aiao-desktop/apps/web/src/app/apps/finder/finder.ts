import { LiveAnnouncer } from '@angular/cdk/a11y';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragEnd,
  CdkDragEnter,
  CdkDragExit,
  CdkDragMove,
  CdkDragPlaceholder,
  CdkDragPreview,
  CdkDropList,
  CdkDropListGroup
} from '@angular/cdk/drag-drop';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { NgTemplateOutlet } from '@angular/common';
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

import { EmptyTrashDialog } from '../../components/empty-trash-dialog';
import { isPackageName } from '../../disk/disk-kinds';
import {
  DESKTOP,
  DiskPath,
  HOME,
  TRASH,
  VOLUME_NAME,
  diskPathOf,
  displayDiskPath,
  isWithin,
  parentOf,
  samePath
} from '../../disk/disk-path';
import { ApplicationCatalog } from '../../services/application-catalog';
import { DesktopMenus, FinderCommands, FinderView } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { DockDragController } from '../../services/dock-drag';
import { FileImport } from '../../services/file-import';
import { FileOpener } from '../../services/file-opener';
import { FileSystem, FsNode, HOME_PATH, PLACES, describeDiskError } from '../../services/file-system';
import { isKeyboardClick } from '../../services/focus-order';
import { MenuEntry } from '../../services/menu';
import { PopoverService, RETURNS_FOCUS } from '../../services/popover';
import { Toast } from '../../services/toast';
import { FileDrop } from '../../shared/file-drop';
import { FileThumbnail } from '../../shared/file-thumbnail';
import { clamp, finderDate } from '../../shared/format';
import { Icon } from '../../shared/icon';
import { isMenuKey } from '../../shared/menu-list';
import { TrafficLights } from '../../shared/traffic-lights';
import { USER_PROFILE } from '../../shared/user-profile';
import { MailComposer } from '../mail/mail-composer';
import { FileOperationDialog, FileOperationRequest } from './file-operation-dialog';
import { FinderClipboard } from './finder-clipboard';
import { ItemRect, gridTarget, isGoUp, isMoveToTrash, itemLabel, linearTarget } from './finder-keys';
import {
  FAVOURITES_GROUP,
  FinderSidebarGroup,
  FinderSort,
  TAG_PLACES,
  VIRTUAL_PLACES,
  columnChain,
  folderContents
} from './finder-model';
import { FinderSidebarOrder } from './finder-sidebar-order';

/** 每一栏 206.5px；末端是文件时右侧再留 250px 预览。 */
const COLUMN_WIDTH = 206.5;
const COLUMN_MIN_WIDTH = 164;
const COLUMN_MAX_WIDTH = 420;
const COLUMN_KEY_STEP = 16;
const PREVIEW_WIDTH = 250;
const SIDEBAR_INITIAL_WIDTH = 200;
const SIDEBAR_MIN_WIDTH = 132;
const SIDEBAR_SNAP_DISTANCE = 24;
const SIDEBAR_KEY_STEP = 16;
const MIN_CONTENT_WIDTH = 400;

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
  imports: [
    Icon,
    FileThumbnail,
    TrafficLights,
    FileOperationDialog,
    EmptyTrashDialog,
    FileDrop,
    CdkDropList,
    CdkDropListGroup,
    CdkDrag,
    CdkDragPlaceholder,
    CdkDragPreview,
    ScrollingModule,
    NgTemplateOutlet
  ],
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
  private readonly fileImport = inject(FileImport);
  private readonly sidebarOrder = inject(FinderSidebarOrder);
  private readonly clipboard = inject(FinderClipboard);
  private readonly mail = inject(MailComposer);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly layout = viewChild.required<ElementRef<HTMLElement>>('layout');
  private readonly sidebar = viewChild.required<ElementRef<HTMLElement>>('sidebar');
  private readonly sidebarSplitter = viewChild.required<ElementRef<HTMLElement>>('sidebarSplitter');
  private readonly body = viewChild.required<ElementRef<HTMLElement>>('body');
  private readonly marqueeBox = viewChild.required<ElementRef<HTMLElement>>('marquee');
  private readonly importInput = viewChild.required<ElementRef<HTMLInputElement>>('importInput');
  private readonly history = signal<{ readonly entries: readonly (readonly string[])[]; readonly index: number }>({
    entries: [],
    index: 0
  });
  private readonly bodyWidth = signal(0);
  private readonly layoutWidth = signal(this.win.initialBox.width);
  private readonly sidebarSize = signal(SIDEBAR_INITIAL_WIDTH);
  private readonly sidebarPreview = signal<number | null>(null);
  private sidebarRestoreWidth = SIDEBAR_INITIAL_WIDTH;
  private sidebarDrag: { pointerId: number; x: number; width: number } | null = null;
  private columnDrag: { pointerId: number; x: number; width: number } | null = null;
  private springFolderTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly displayPath = computed(() => {
    const path = this.path();
    return path[0] === VOLUME_NAME ? [VOLUME_NAME, ...displayDiskPath(path.slice(1))] : path;
  });
  /** 导航之前键盘焦点在内容区里：导航之后条目重新渲染，焦点要交还给新的 Tab 停靠点。 */
  private refocus = false;

  protected readonly fileOperation = signal<FileOperationRequest | null>(null);

  protected readonly favouritesGroup = FAVOURITES_GROUP;
  protected readonly sidebarGroups = this.sidebarOrder.groups;
  protected readonly sidebarPlaceRemoving = signal(false);
  protected readonly columnPreview = signal<number | null>(null);
  protected readonly path = signal<readonly string[]>([]);
  protected readonly view = signal<FinderView>('icon');
  protected readonly sidebarId = `${this.win.id}-sidebar`;
  protected readonly sidebarMaxWidth = computed(() =>
    Math.max(SIDEBAR_MIN_WIDTH, this.layoutWidth() - MIN_CONTENT_WIDTH)
  );
  protected readonly sidebarWidth = computed(() =>
    Math.min(this.sidebarPreview() ?? this.sidebarSize(), this.sidebarMaxWidth())
  );
  protected readonly pathbar = signal(true);
  protected readonly columnSize = signal(COLUMN_WIDTH);
  protected readonly springFolder = signal<DiskPath | null>(null);
  protected readonly selected = signal<string | null>(null);
  protected readonly selectedNames = signal<readonly string[]>([]);
  protected readonly selectedColumnNames = signal<readonly string[]>([]);
  protected readonly selectedColumnIndex = signal<number | null>(null);
  protected readonly query = signal('');
  protected readonly importDirectory = computed(() => (this.query() ? null : diskPathOf(this.path())));
  protected readonly columnSelection = signal<readonly string[]>([]);
  protected readonly sort = signal<FinderSort>('name');
  protected readonly finderDate = finderDate;

  protected readonly items = computed(() => folderContents(this.fs, this.path(), this.query(), this.sort()));
  protected readonly selectedItems = computed(() => {
    if (this.view() === 'column') {
      const index = this.selectedColumnIndex();
      const columnItems = index === null ? [] : (this.columns().chain[index]?.items ?? []);
      const names = new Set(this.selectedColumnNames());
      return columnItems.filter(item => names.has(item.name) && item.path);
    }
    const names = new Set(this.selectedNames());
    return this.items().filter(item => names.has(item.name) && item.path);
  });
  protected readonly isTrash = computed(() => this.path().length === 1 && this.path()[0] === 'Trash');
  protected readonly trashFull = this.fs.trashFull;
  protected readonly trashCount = computed(() =>
    this.isTrash() ? (this.fs.get(this.path())?.children ?? []).length : 0
  );
  protected readonly emptyTrashPrompt = signal(false);
  /** 在 Applications 里：同名的非包条目占着位置，让某些预装应用没有包时，说清楚它们仍可从别处打开（D-17）。 */
  protected readonly applicationsNote = computed(() => {
    const path = this.path();
    return path.length === 2 && path[1] === 'Applications' && !this.query() ? this.catalog.conflictNote() : null;
  });
  protected readonly title = computed(() => (this.query() ? `Searching “${this.query()}”` : this.displayPath().at(-1)));
  protected readonly canGoBack = computed(() => this.history().index > 0);
  protected readonly canGoForward = computed(() => this.history().index < this.history().entries.length - 1);
  protected readonly emptyText = computed(() => {
    const disk = this.fs.state();
    if (disk === 'mounting') return 'Mounting Macintosh HD…';
    if (disk === 'failed') return `Macintosh HD is unavailable: ${this.fs.error()}`;
    if (this.query()) return 'No results';
    if (this.isTrash()) return 'Trash is empty';
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
  /** 只渲染放得下的最深几栏：真机会横向滚动，但总停在栏边界上，效果一样。 */
  protected readonly firstColumn = computed(() => {
    const { chain } = this.columns();
    const leafFile = chain.at(-1)?.file ?? false;
    const available = (this.bodyWidth() || 620) - (leafFile ? PREVIEW_WIDTH : 0);
    const keep = Math.max(1, Math.floor(available / this.columnWidth()));
    return Math.max(0, chain.filter(column => !column.file).length - keep);
  });
  protected readonly columnWidth = computed(() => this.columnPreview() ?? this.columnSize());
  protected readonly lastColumn = computed(() => {
    const chain = this.columns().chain;
    let last = this.firstColumn();
    for (let index = this.firstColumn(); index < chain.length; index++) {
      if (!chain[index].file) last = index;
    }
    return last;
  });

  protected readonly previewFile = computed(() => {
    const leaf = this.columns().chain.at(-1);
    return leaf?.file ? leaf.node : null;
  });
  /** 分栏视图里选择链也算进路径栏，否则会跳过点进去的每一级。 */
  protected readonly pathSegments = computed(() => {
    const path = this.displayPath();
    if (this.view() !== 'column') return path;
    return [
      ...path,
      ...this.columns()
        .chain.slice(1)
        .map(column => this.displayName(column.node))
    ];
  });
  protected readonly pathTail = computed(() => {
    if (this.view() === 'column') return null;
    const selected = this.selected();
    const item = this.items().find(item => item.name === selected);
    return item ? this.displayName(item) : selected;
  });
  /** 分栏视图的 Tab 停靠点：最深一栏里选中的条目；还没选就是最左边那栏的第一项。 */
  protected readonly columnStop = computed(() => {
    const { chain, selection } = this.columns();
    if (selection.length) return { ci: selection.length - 1, name: selection.at(-1) };
    const first = this.firstColumn();
    return { ci: first, name: chain[first]?.items?.[0]?.name };
  });

  readonly sidebarVisible = computed(() => this.sidebarWidth() > 0);

  constructor() {
    const menus = inject(DesktopMenus);
    const start = this.win.options.path ?? HOME_PATH;
    this.path.set(start);
    this.history.set({ entries: [start], index: 0 });
    const initialSelection = this.win.options.select ?? null;
    this.setSelection(initialSelection ? [initialSelection] : []);
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
    destroyRef.onDestroy(() => this.clearSpringFolder());
    afterNextRender(() => {
      const layout = this.layout().nativeElement;
      const body = this.body().nativeElement;
      const observer = new ResizeObserver(() => {
        this.layoutWidth.set(layout.clientWidth);
        this.bodyWidth.set(body.clientWidth);
      });
      observer.observe(layout);
      observer.observe(body);
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
    if (view === this.view()) return;
    if (view === 'column') {
      this.setColumnNames(0, []);
      this.columnSelection.set([]);
    } else if (this.view() === 'column') {
      this.setSelection(this.selectedColumnNames(), this.selected());
    }
    this.view.set(view);
  }

  toggleSidebar(): void {
    this.sidebarSize.update(width => (width === 0 ? this.sidebarRestoreWidth : 0));
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
      name => this.setSelection([name]),
      (error: unknown) => this.toast.show(describeDiskError(error))
    );
  }

  openSelected(): void {
    const node = this.selectedNode();
    if (node) this.openNode(node);
  }

  trashSelected(): void {
    if (this.isTrash()) return;
    const nodes = this.selectedNodes();
    if (!nodes.length) return;
    this.setSelection([]);
    void nodes
      .reduce(
        (task, node) => task.then(() => (node.path ? this.fs.moveToTrash(node.path) : undefined)),
        Promise.resolve()
      )
      .catch((error: unknown) => this.toast.show(describeDiskError(error)));
  }

  copySelected(): void {
    const entries = this.selectedEntries();
    if (entries.length) this.clipboard.set('copy', entries);
  }

  cutSelected(): void {
    const entries = this.selectedEntries();
    if (entries.length) this.clipboard.set('cut', entries);
  }

  paste(): void {
    const snapshot = this.clipboard.snapshot();
    const dir = this.importDirectory();
    if (!snapshot) {
      this.toast.show('Nothing to paste.');
      return;
    }
    if (!dir) {
      this.toast.show('Paste is only available in a local folder.');
      return;
    }
    void snapshot.entries
      .reduce(
        (task, entry) =>
          task.then(() =>
            snapshot.mode === 'copy' ? this.fs.copyTo(entry.path, dir) : this.fs.moveTo(entry.path, dir)
          ),
        Promise.resolve<DiskPath | undefined>(undefined)
      )
      .then(
        path => {
          if (snapshot.mode === 'cut') this.clipboard.clear();
          if (path) this.selectPath(path);
        },
        (error: unknown) => this.toast.show(describeDiskError(error))
      );
  }

  selectAll(): void {
    this.setSelection(this.items().map(item => item.name));
  }

  emptyTrash(): void {
    if (this.isTrash() && this.fs.trashFull()) this.emptyTrashPrompt.set(true);
  }

  protected finishEmptyTrash(confirmed: boolean): void {
    this.emptyTrashPrompt.set(false);
    if (!confirmed) return;
    this.fs.emptyTrash().then(
      () => {
        this.setSelection([]);
        this.toast.show('Trash emptied');
      },
      (error: unknown) => this.toast.show(describeDiskError(error))
    );
  }

  protected dropSidebarPlace(event: CdkDragDrop<FinderSidebarGroup, FinderSidebarGroup, string>): void {
    this.sidebarPlaceRemoving.set(false);
    if (event.event.type === 'touchcancel') return;
    const head = event.previousContainer.data.head;
    const { x, y } = event.dropPoint;
    if (head === FAVOURITES_GROUP && this.isOutsideSidebar(x, y)) {
      this.removeSidebarFavourite(event.item.data);
      return;
    }
    if (!event.isPointerOverContainer || event.currentIndex === event.previousIndex) return;
    this.sidebarOrder.move(head, event.item.data, event.currentIndex);
  }

  protected updateSidebarPlaceDrag(event: MouseEvent | TouchEvent, removable: boolean): void {
    const point = 'targetTouches' in event ? event.targetTouches[0] : event;
    this.sidebarPlaceRemoving.set(
      removable && point !== undefined && this.isOutsideSidebar(point.clientX, point.clientY)
    );
  }

  protected removeSidebarPlaceByKey(event: Event, name: string, removable: boolean): void {
    if (!removable) return;
    event.preventDefault();
    if ((event as KeyboardEvent).repeat || !this.removeSidebarFavourite(name)) return;

    const button = event.currentTarget as HTMLButtonElement;
    const next = button.nextElementSibling ?? button.previousElementSibling;
    const target = next instanceof HTMLElement ? next : this.sidebarSplitter().nativeElement;
    afterNextRender({ write: () => target.focus({ preventScroll: true }) }, { injector: this.injector });
  }

  protected moveSidebarPlace(event: Event, group: FinderSidebarGroup, name: string, index: number): void {
    if (group.items.length < 2) return;
    event.preventDefault();
    if (!this.sidebarOrder.move(group.head, name, index)) return;
    const button = event.currentTarget as HTMLButtonElement;
    afterNextRender({ write: () => button.focus({ preventScroll: true }) }, { injector: this.injector });
    void this.announcer.announce(`${name}, position ${index + 1} of ${group.items.length} in ${group.head}.`);
  }

  protected startSidebarDrag(event: PointerEvent): void {
    if (event.button !== 0 || this.sidebarDrag) return;
    const handle = event.currentTarget as HTMLElement;
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    handle.focus({ preventScroll: true });
    this.sidebarDrag = { pointerId: event.pointerId, x: event.clientX, width: this.sidebarWidth() };
  }

  protected moveSidebarDrag(event: PointerEvent): void {
    const drag = this.sidebarDrag;
    if (drag?.pointerId !== event.pointerId) return;
    const width = drag.width + event.clientX - drag.x;
    const snapPoint = drag.width === 0 ? SIDEBAR_SNAP_DISTANCE : SIDEBAR_MIN_WIDTH - SIDEBAR_SNAP_DISTANCE;
    this.sidebarPreview.set(width <= snapPoint ? 0 : clamp(width, SIDEBAR_MIN_WIDTH, this.sidebarMaxWidth()));
  }

  protected endSidebarDrag(event: PointerEvent): void {
    const drag = this.sidebarDrag;
    if (drag?.pointerId !== event.pointerId) return;
    const width = this.sidebarWidth();
    if (event.type === 'pointerup' && width !== drag.width) this.setSidebarWidth(width);
    this.sidebarDrag = null;
    this.sidebarPreview.set(null);
  }

  protected sidebarKey(event: KeyboardEvent): void {
    if (this.sidebarDrag) return;
    const width = this.sidebarWidth();
    switch (event.key) {
      case 'Enter':
        this.toggleSidebar();
        break;
      case 'Home':
        this.setSidebarWidth(0);
        break;
      case 'End':
        this.setSidebarWidth(this.sidebarMaxWidth());
        break;
      case 'ArrowLeft':
        this.setSidebarWidth(width <= SIDEBAR_MIN_WIDTH ? 0 : Math.max(SIDEBAR_MIN_WIDTH, width - SIDEBAR_KEY_STEP));
        break;
      case 'ArrowRight':
        this.setSidebarWidth(clamp(width + SIDEBAR_KEY_STEP, SIDEBAR_MIN_WIDTH, this.sidebarMaxWidth()));
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  protected startColumnDrag(event: PointerEvent): void {
    if (event.button !== 0 || this.columnDrag) return;
    const handle = event.currentTarget as HTMLElement;
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    handle.focus({ preventScroll: true });
    this.columnDrag = { pointerId: event.pointerId, x: event.clientX, width: this.columnWidth() };
  }

  protected moveColumnDrag(event: PointerEvent): void {
    const drag = this.columnDrag;
    if (drag?.pointerId !== event.pointerId) return;
    this.columnPreview.set(clamp(drag.width + event.clientX - drag.x, COLUMN_MIN_WIDTH, COLUMN_MAX_WIDTH));
  }

  protected endColumnDrag(event: PointerEvent): void {
    const drag = this.columnDrag;
    if (drag?.pointerId !== event.pointerId) return;
    if (event.type === 'pointerup') this.columnSize.set(this.columnWidth());
    this.columnDrag = null;
    this.columnPreview.set(null);
  }

  protected columnKey(event: KeyboardEvent): void {
    if (this.columnDrag) return;
    const width = this.columnWidth();
    const next =
      event.key === 'ArrowLeft' ? width - COLUMN_KEY_STEP
      : event.key === 'ArrowRight' ? width + COLUMN_KEY_STEP
      : null;
    if (next === null) return;
    event.preventDefault();
    this.columnSize.set(clamp(next, COLUMN_MIN_WIDTH, COLUMN_MAX_WIDTH));
  }

  protected placeOn(place: string): boolean {
    const path = this.path();
    return place === path.at(-1) || (PLACES[place] ?? []).join('/') === path.join('/');
  }

  protected placeDirectory(place: string): DiskPath | null {
    const path = PLACES[place];
    return path ? diskPathOf(path) : null;
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

  protected select(name: string, event?: MouseEvent): void {
    const current = this.selectedNames();
    const next = this.nextSelection(this.items(), current, name, event);
    this.setSelection(next, next.includes(name) ? name : next.at(-1) ?? null);
  }

  protected focusItem(name: string): void {
    if (this.selectedNames().length === 0) this.setSelection([name]);
    else this.selected.set(name);
  }

  /** 内容区条目上的按键：方向键移动选择、Enter 打开、Backspace 或 ⌘↑ 上一级、Menu 键弹出菜单；`column` 是分栏视图里条目所在的栏。 */
  protected itemKey(event: KeyboardEvent, name: string, column = -1): void {
    const node = (column < 0 ? this.items() : this.columns().chain[column]?.items)?.find(item => item.name === name);
    if (node?.path && isMoveToTrash(event) && !isWithin(node.path, TRASH)) {
      event.preventDefault();
      event.stopPropagation();
      this.trashNode(node);
      return;
    }
    if (node && event.key === 'F2') {
      event.preventDefault();
      this.requestFileOperation('rename', node);
      return;
    }
    if (node && (event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      event.stopPropagation();
      if (node.path && !isWithin(node.path, TRASH)) this.duplicate(node);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      this.activate(name, column);
    } else if (isGoUp(event)) {
      event.preventDefault();
      this.goUp();
    } else if (isMenuKey(event)) {
      event.preventDefault();
      if (node) this.itemMenuByKey(event.currentTarget as HTMLElement, node);
    } else if (this.view() === 'column') this.moveInColumns(event, name, column);
    else this.moveInView(event, name);
  }

  /** 回到上一级目录，并选中刚才所在的文件夹。 */
  protected goUp(): void {
    const path = this.path();
    if (path.length < 2) return;
    this.nav(path.slice(0, -1));
    const name = path.at(-1);
    if (name) this.selectPath([...path.slice(0, -1), name]);
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

  protected pickColumn(index: number, name: string, event?: MouseEvent): void {
    const items = this.columns().chain[index]?.items ?? [];
    const current = this.selectedColumnIndex() === index ? this.selectedColumnNames() : [];
    const next = this.nextSelection(items, current, name, event);
    this.setColumnNames(index, next, next.includes(name) ? name : next.at(-1) ?? null);
    this.commitColumnPath();
  }

  protected focusColumn(index: number, name: string): void {
    if (this.selectedColumnNames().length === 0) {
      this.pickColumn(index, name);
      return;
    }
    if (this.isColumnSelected(index, name)) this.selected.set(name);
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
          label: this.sidebarVisible() ? 'Hide Sidebar' : 'Show Sidebar',
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
        { id: 'nf', label: 'New Folder', key: '⇧⌘N', run: () => this.newFolder() },
        {
          id: 'import',
          label: 'Import Files…',
          disabled: !this.fileImport.accepts(this.importDirectory()),
          run: () => this.importInput().nativeElement.click()
        }
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
    const node = this.selectedNode();
    if (!node?.path) {
      this.toast.show('Select a local file or folder to share.');
      return;
    }
    this.mail.compose(
      `Share ${this.displayName(node)}`,
      '',
      `File: ${this.displayName(node)}\nKind: ${node.k || (node.kind === 'folder' ? 'Folder' : 'Document')}\nPath: /${node.path.join('/')}`
    );
  }

  protected itemMenu(event: MouseEvent, node: FsNode): void {
    const current = this.menuNode(event, node);
    if (!this.isSelected(current.name)) this.setSelection([current.name]);
    this.popover.contextMenu(event, this.itemMenuItems(current), current.name);
  }

  protected pressBody(event: PointerEvent): void {
    if (event.button !== 0) return;
    const target = event.target as Element;
    if (target.closest('[role="option"], button, input, .finder-column-divider, .hd, .fx-note, .fv-gal .stage')) return;
    const column = this.view() === 'column' ? target.closest<HTMLElement>('.fv-col .col') : null;
    if (column) {
      const index = Number(column.dataset['ci']);
      this.setColumnNames(index, []);
      this.marquee(event, column, index);
      return;
    }
    this.setSelection([]);
    this.marquee(event);
  }

  protected bodyMenu(event: MouseEvent): void {
    if ((event.target as Element).closest('[role="option"]')) return;
    if (this.isTrash()) {
      this.popover.contextMenu(event, [
        { id: 'empty', label: 'Empty Trash', disabled: !this.fs.trashFull(), run: () => this.emptyTrash() },
        '-',
        { id: 'nf', label: 'New Folder', disabled: true },
        { id: 'gi', label: 'Get Info' }
      ]);
      return;
    }
    this.popover.contextMenu(event, [
      { id: 'nf', label: 'New Folder', run: () => this.newFolder() },
      { id: 'gi', label: 'Get Info' },
      '-',
      { id: 'v', label: 'View', key: '▸' },
      { id: 's', label: 'Sort By', key: '▸' }
    ]);
  }

  protected finishFileOperation(path: DiskPath | null): void {
    if (path) this.selectPath(path);
    this.refocus = this.fileOperation()?.kind !== 'open-with';
    this.fileOperation.set(null);
  }

  protected async importSelection(input: HTMLInputElement): Promise<void> {
    const files = Array.from(input.files ?? []);
    input.value = '';
    const dir = this.importDirectory();
    if (dir === null) return;
    const latest = (await this.fileImport.importFiles(dir, files)).at(-1);
    const current = this.importDirectory();
    if (latest && current && samePath(dir, current)) this.selectPath(latest);
  }

  protected readonly trackNode = (_index: number, item: FsNode): string => item.name;

  protected isSelected(name: string): boolean {
    return this.selectedNames().includes(name);
  }

  protected isColumnSelected(index: number, name: string): boolean {
    return this.selectedColumnIndex() === index && this.selectedColumnNames().includes(name);
  }

  protected label(item: FsNode): string {
    return itemLabel({ ...item, name: this.displayName(item) });
  }

  protected displayName(item: FsNode): string {
    if (item.path && samePath(item.path, HOME)) return USER_PROFILE.name;
    return this.catalog.manifestAt(item.path)?.name ?? item.name;
  }

  protected displayIcon(item: FsNode): string {
    if (item.kind === 'folder' && this.isSpringFolder(item.path)) return 'g-folder-open';
    return this.catalog.manifestAt(item.path)?.icon ?? item.icon;
  }

  protected dragStarted(source: FsNode, column = -1): void {
    if (column >= 0) {
      if (!this.isColumnSelected(column, source.name)) this.pickColumn(column, source.name);
      return;
    }
    if (!this.isSelected(source.name)) this.setSelection([source.name]);
  }

  protected dragEnded(event: CdkDragEnd<FsNode>): void {
    this.clearSpringFolder();
    const source = event.source.data;
    const dir = this.desktopDropDirectory(event.dropPoint);
    if (!source?.path || !dir) return;
    const copy = this.copyModifier(event.event);
    void this.transferNodes(this.dragNodes(source), dir, copy).then(
      () => {
        if (!copy) this.setSelection([]);
      },
      (error: unknown) => this.toast.show(describeDiskError(error))
    );
  }

  protected dragMoved(event: CdkDragMove<FsNode>): void {
    const source = event.source.data;
    const target = this.dropDirectoryAt(event.pointerPosition.x, event.pointerPosition.y);
    this.updateSpringFolder(source, target);
  }

  protected folderDragEntered(event: CdkDragEnter<DiskPath | null>): void {
    this.updateSpringFolder(event.item.data as FsNode | null, event.container.data);
  }

  protected folderDragExited(event: CdkDragExit<DiskPath | null>): void {
    const target = event.container.data;
    if (target && this.isSpringFolder(target)) this.clearSpringFolder();
  }

  protected canFileDrag(node: FsNode): boolean {
    return Boolean(node.path) && !this.catalog.appIdOf(node);
  }

  protected dropFile(event: CdkDragDrop<DiskPath | null, DiskPath | null, FsNode>): void {
    this.clearSpringFolder();
    const source = event.item.data;
    const dir = this.dropDirectory(event) ?? event.container.data;
    if (!source?.path || !dir) return;
    const copy = this.copyModifier(event.event);
    void this.transferNodes(this.dragNodes(source), dir, copy).then(
      path => {
        const last = path.at(-1);
        if (last && samePath(parentOf(last), this.importDirectory() ?? [])) this.selectPath(last);
      },
      (error: unknown) => this.toast.show(describeDiskError(error))
    );
  }

  private updateSpringFolder(source: FsNode | null, target: DiskPath | null): void {
    if (!target || !source?.path || this.dragNodes(source).some(node => node.path && isWithin(target, node.path))) {
      this.clearSpringFolder();
      return;
    }
    const node = this.fs.nodeAt(target);
    if (node?.kind !== 'folder') {
      this.clearSpringFolder();
      return;
    }
    if (this.isSpringFolder(target)) return;
    this.clearSpringFolder();
    this.springFolder.set(target);
    this.springFolderTimer = setTimeout(() => {
      this.springFolderTimer = null;
      if (!this.isSpringFolder(target)) return;
      const current = this.fs.nodeAt(target);
      if (current?.kind === 'folder') this.openNode(current);
    }, 700);
  }

  private isSpringFolder(path: DiskPath | null | undefined): boolean {
    const target = this.springFolder();
    return Boolean(target && path && samePath(target, path));
  }

  private clearSpringFolder(): void {
    if (this.springFolderTimer !== null) {
      clearTimeout(this.springFolderTimer);
      this.springFolderTimer = null;
    }
    this.springFolder.set(null);
  }

  private dropDirectory(event: CdkDragDrop<DiskPath | null, DiskPath | null, FsNode>): DiskPath | null {
    return this.dropDirectoryAt(
      event.dropPoint.x,
      event.dropPoint.y,
      event.event.target instanceof Element ? event.event.target : null
    );
  }

  private dropDirectoryAt(x: number, y: number, eventTarget?: Element | null): DiskPath | null {
    const targets = [...document.elementsFromPoint(x, y), eventTarget];
    const encoded = targets
      .filter((target): target is Element => target instanceof Element)
      .map(target => target.closest<HTMLElement>('[data-drop-directory]')?.dataset['dropDirectory'])
      .find(Boolean);
    return encoded ? encoded.split('/') : null;
  }

  private desktopDropDirectory(point: { readonly x: number; readonly y: number }): DiskPath | null {
    const target = document.elementsFromPoint(point.x, point.y).find(element => element.closest('#desktop'));
    if (!(target instanceof Element)) return null;
    const desktop = target.closest('#desktop');
    if (!desktop || target.closest('.wgt')) return null;
    const icon = target.closest<HTMLElement>('.dicon[data-id]');
    if (!icon) return DESKTOP;
    const id = icon.dataset['id'];
    if (!id?.startsWith('file:')) return null;
    const node = this.fs.nodeAt([...DESKTOP, id.slice(5)]);
    return node?.kind === 'folder' && node.path ? node.path : null;
  }

  private dragNodes(source: FsNode): readonly FsNode[] {
    const selected = this.selectedItems();
    return selected.some(node => node.path && source.path && samePath(node.path, source.path)) ? selected : [source];
  }

  private async transferNodes(nodes: readonly FsNode[], dir: DiskPath, copy: boolean): Promise<readonly DiskPath[]> {
    const targets: DiskPath[] = [];
    for (const node of nodes) {
      if (!node.path) continue;
      targets.push(await (copy ? this.fs.copyTo(node.path, dir) : this.fs.moveTo(node.path, dir)));
    }
    return targets;
  }

  private copyModifier(event: MouseEvent | TouchEvent): boolean {
    return ('altKey' in event && event.altKey) || ('metaKey' in event && event.metaKey);
  }

  private selectedNodes(): FsNode[] {
    const current = this.selectedItems();
    if (current.length) return current;
    const node = this.selectedNode();
    return node ? [node] : [];
  }

  private selectedEntries(): { readonly path: DiskPath; readonly name: string }[] {
    const current = this.selectedItems();
    if (current.length) return current.flatMap(item => (item.path ? [{ path: item.path, name: item.name }] : []));
    const node = this.selectedNode();
    return node?.path ? [{ path: node.path, name: node.name }] : [];
  }

  private selectedNode(): FsNode | null {
    const selected = this.selected();
    if (!selected) return null;
    const current = this.selectedItems().find(item => item.name === selected);
    if (current) return current;
    const root = this.items().find(item => item.name === selected);
    if (root) return root;
    const { chain, selection } = this.columns();
    const index = selection.length - 1;
    return index >= 0 ? (chain[index]?.items?.find(item => item.name === selected) ?? null) : null;
  }

  private nextSelection(
    items: readonly FsNode[],
    current: readonly string[],
    name: string,
    event?: Pick<MouseEvent, 'ctrlKey' | 'metaKey' | 'shiftKey'>
  ): readonly string[] {
    if (event?.shiftKey && current.length) {
      const start = items.findIndex(item => item.name === current[0]);
      const end = items.findIndex(item => item.name === name);
      if (start >= 0 && end >= 0) {
        const [from, to] = start < end ? [start, end] : [end, start];
        return items.slice(from, to + 1).map(item => item.name);
      }
    }
    if (event?.metaKey || event?.ctrlKey) {
      return current.includes(name) ? current.filter(item => item !== name) : [...current, name];
    }
    return [name];
  }

  private setSelection(names: readonly string[], primary = names.at(-1) ?? null): void {
    this.selectedNames.set([...names]);
    this.selected.set(primary);
    this.clearColumnSelection();
  }

  private setColumnNames(index: number, names: readonly string[], primary = names.at(-1) ?? null): void {
    this.selectedColumnNames.set([...names]);
    this.selectedColumnIndex.set(index);
    this.selected.set(primary);
  }

  private commitColumnPath(): void {
    const index = this.selectedColumnIndex();
    if (index === null) return;
    const primary = this.selected();
    this.columnSelection.set(primary ? [...this.columnSelection().slice(0, index), primary] : this.columnSelection().slice(0, index));
  }

  private clearColumnSelection(): void {
    this.selectedColumnNames.set([]);
    this.selectedColumnIndex.set(null);
    this.columnSelection.set([]);
  }

  private marquee(event: PointerEvent, scope = this.body().nativeElement, column: number | null = null): void {
    const box = this.marqueeBox().nativeElement;
    const bodyRect = this.body().nativeElement.getBoundingClientRect();
    const sx = event.clientX;
    const sy = event.clientY;
    let live = false;
    const move = (current: PointerEvent): void => {
      if (!live && Math.hypot(current.clientX - sx, current.clientY - sy) < 4) return;
      live = true;
      const left = Math.min(sx, current.clientX);
      const top = Math.min(sy, current.clientY);
      const width = Math.abs(current.clientX - sx);
      const height = Math.abs(current.clientY - sy);
      Object.assign(box.style, {
        display: 'block',
        left: `${left - bodyRect.left}px`,
        top: `${top - bodyRect.top}px`,
        width: `${width}px`,
        height: `${height}px`
      });
      this.selectWithin(scope, left, top, left + width, top + height, column);
    };
    const end = (): void => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', end);
      removeEventListener('pointercancel', end);
      box.style.display = 'none';
      if (column !== null) this.commitColumnPath();
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', end);
    addEventListener('pointercancel', end);
  }

  private selectWithin(
    scope: HTMLElement,
    left: number,
    top: number,
    right: number,
    bottom: number,
    column: number | null
  ): void {
    const options = [...scope.querySelectorAll<HTMLElement>('[role="option"]')];
    const hit = options.filter(option => {
      const rect = option.getBoundingClientRect();
      return !(rect.right < left || rect.left > right || rect.bottom < top || rect.top > bottom);
    });
    const names = hit.map(option => option.dataset['name']).filter((name): name is string => Boolean(name));
    if (column === null) this.setSelection(names);
    else this.setColumnNames(column, names);
  }

  private setSidebarWidth(width: number): void {
    if (width > 0) this.sidebarRestoreWidth = width;
    this.sidebarSize.set(width);
  }

  private isOutsideSidebar(x: number, y: number): boolean {
    const { left, right, top, bottom } = this.sidebar().nativeElement.getBoundingClientRect();
    return x < left || x > right || y < top || y > bottom;
  }

  private removeSidebarFavourite(name: string): boolean {
    if (!this.sidebarOrder.removeFavourite(name)) return false;
    void this.announcer.announce(`${name} removed from Favourites.`);
    return true;
  }

  private menuNode(event: MouseEvent, fallback: FsNode): FsNode {
    const target = event.currentTarget as HTMLElement | null;
    const name = target?.dataset['name'];
    if (!name) return fallback;
    const column = target.dataset['ci'];
    const items =
      column === undefined ? this.items() : (this.columns().chain[Number(column)]?.items ?? []);
    return items.find(item => item.name === name) ?? fallback;
  }

  private itemMenuItems(node: FsNode): MenuEntry[] {
    const name = node.name;
    const inTrash = Boolean(node?.path && isWithin(node.path, TRASH));
    const restorable = Boolean(node?.path && samePath(parentOf(node.path), TRASH));
    return [
      { id: 'o', label: 'Open', run: () => this.openNode(node) },
      {
        id: 'w',
        label: 'Open With…',
        disabled: node?.kind !== 'file' || isPackageName(name),
        run: () => this.requestFileOperation('open-with', node)
      },
      '-',
      { id: 'i', label: 'Get Info', key: '⌘I', run: () => this.info(node) },
      { id: 'r', label: 'Rename…', run: () => this.requestFileOperation('rename', node) },
      { id: 'd', label: 'Duplicate', key: '⌘D', disabled: inTrash, run: () => this.duplicate(node) },
      {
        id: 'download',
        label: 'Download File',
        disabled: node?.kind !== 'file' || isPackageName(name),
        run: () => void this.download(node)
      },
      '-',
      ...(inTrash ?
        [
          { id: 'back', label: 'Put Back', disabled: !restorable, run: () => this.restore(node) },
          {
            id: 'restore',
            label: 'Restore to Folder…',
            disabled: !restorable,
            run: () => this.requestFileOperation('restore', node)
          }
        ]
      : [{ id: 't', label: 'Move to Trash', key: '⌘⌫', run: () => this.trashNode(node) }]),
      '-',
      { id: 'q', label: 'Quick Look', key: '␣', run: () => this.info(node) }
    ];
  }

  private selectPath(path: DiskPath): void {
    this.setSelection(path.at(-1) ? [path.at(-1)!] : []);
    const base = diskPathOf(this.path());
    if (this.view() === 'column' && base && isWithin(path, base)) {
      const selection = path.slice(base.length);
      this.columnSelection.set(selection);
      const index = selection.length - 1;
      if (index >= 0) this.setColumnNames(index, [selection[index]], selection[index]);
    }
  }

  private requestFileOperation(kind: FileOperationRequest['kind'], node: FsNode): void {
    if (node?.path) this.fileOperation.set({ kind, node });
  }

  private trashNode(node: FsNode): void {
    if (!node.path || isWithin(node.path, TRASH)) return;
    this.setSelection([]);
    this.fs.moveToTrash(node.path).catch((error: unknown) => this.toast.show(describeDiskError(error)));
  }

  private duplicate(node: FsNode): void {
    if (node?.path)
      this.fs.duplicate(node.path).then(
        path => this.selectPath(path),
        (error: unknown) => this.toast.show(describeDiskError(error))
      );
  }

  private restore(node: FsNode): void {
    if (node?.path)
      this.fs.restore(node.path).then(
        path => this.toast.show(`Restored to ${path.join('/')}`),
        (error: unknown) => this.toast.show(describeDiskError(error))
      );
  }

  private async download(node: FsNode): Promise<void> {
    if (!node?.path) return;
    try {
      const bytes = await this.fs.read(node.path);
      const url = URL.createObjectURL(new Blob([bytes.slice()], { type: 'application/octet-stream' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = node.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) {
      this.toast.show(describeDiskError(error));
    }
  }

  /** 键盘弹出的右键菜单：贴着条目，焦点交给第一项，关闭后焦点回到条目（条目没了就回到 Tab 停靠点）。 */
  private itemMenuByKey(anchor: HTMLElement, node: FsNode): void {
    this.setSelection([node.name]);
    const rect = anchor.getBoundingClientRect();
    this.popover.openMenu(this.itemMenuItems(node), {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      origin: 'top left',
      focus: true,
      label: node.name,
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
    else
      afterNextRender(
        () => requestAnimationFrame(() => this.option(selector)?.focus()),
        { injector: this.injector }
      );
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

  private info(node: FsNode): void {
    this.toast.show(`${node.name} — ${node.k}${node.size ? `, ${node.size}` : ''}`);
  }

  private nav(path: readonly string[]): void {
    this.clearSpringFolder();
    this.keepFocus();
    this.query.set('');
    this.path.set(path);
    this.setSelection([]);
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
    this.setSelection([]);
    this.columnSelection.set([]);
  }
}
