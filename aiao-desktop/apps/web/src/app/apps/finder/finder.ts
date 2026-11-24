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
import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import { NgTemplateOutlet } from '@angular/common';
import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  ErrorHandler,
  Injector,
  WritableSignal,
  afterNextRender,
  afterRenderEffect,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
  viewChildren
} from '@angular/core';

import { EmptyTrashDialog } from '../../components/empty-trash-dialog';
import { showInfoPanel } from '../../components/overlays/info-panel';
import { showQuickLook } from '../../components/overlays/quick-look';
import { Preferences } from '../../data/preferences';
import { isAliasNode } from '../../disk/alias';
import { formatSize, isPackageName } from '../../disk/disk-kinds';
import {
  DESKTOP,
  DiskPath,
  HOME,
  TRASH,
  VOLUME_NAME,
  diskPathOf,
  displayDiskPath,
  finderPathOf,
  isWithin,
  parentOf,
  samePath
} from '../../disk/disk-path';
import { DiskError } from '../../disk/disk-store';
import type { TagColor } from '../../disk/tags';
import { ApplicationCatalog } from '../../services/application-catalog';
import { DesktopMenus, FinderCommands, FinderView } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { DockDragController } from '../../services/dock-drag';
import { DockState } from '../../services/dock-state';
import { FileImport } from '../../services/file-import';
import { FileOpener } from '../../services/file-opener';
import { FileSystem, FsNode, HOME_PATH, PLACES, describeDiskError } from '../../services/file-system';
import { FinderPreferences } from '../../services/finder-preferences';
import { isKeyboardClick, isMenuKey, typeaheadIndex } from '../../services/focus-order';
import { MenuEntry } from '../../services/menu';
import { PopoverService, RETURNS_FOCUS } from '../../services/popover';
import { Toast } from '../../services/toast';
import { WindowManager } from '../../services/window-manager';
import { FileDrop } from '../../shared/file-drop';
import { FileThumbnail } from '../../shared/file-thumbnail';
import { FocusTrap } from '../../shared/focus-trap';
import { clamp, finderDate } from '../../shared/format';
import { Icon } from '../../shared/icon';
import { TrafficLights } from '../../shared/traffic-lights';
import { USER_PROFILE } from '../../shared/user-profile';
import { MailComposer } from '../mail/mail-composer';
import { FileOperationDialog } from './file-operation-dialog';
import { FinderClipboard } from './finder-clipboard';
import { setFinderDrag } from './finder-drag-registry';
import {
  ItemRect,
  gridTarget,
  isDeleteImmediately,
  isGoUp,
  isMoveToTrash,
  itemLabel,
  linearTarget,
  parseGoToFolder,
  shiftRange,
  stemRange
} from './finder-keys';
import { compressLabel, finderSortCommands, finderViewItems, openWithCommands, tagCommands } from './finder-menus';
import {
  DEFAULT_VIEW_SETTINGS,
  FAVOURITES_GROUP,
  FINDER_TAG_COLORS,
  FinderSidebarGroup,
  FinderSort,
  FinderSortDirection,
  FinderViewSettings,
  GRID_SPACING_MAX,
  GRID_SPACING_MIN,
  ICON_SIZE_MAX,
  ICON_SIZE_MIN,
  TAG_PLACES,
  TEXT_SIZE_MAX,
  TEXT_SIZE_MIN,
  VIRTUAL_PLACES,
  columnChain,
  defaultSortDirection,
  folderContents,
  isFinderViewSettings,
  viewSettingsKey,
  type FileOperationRequest
} from './finder-model';
import { FinderSidebarOrder } from './finder-sidebar-order';

/** 每一栏 206.5px；末端是文件时右侧再留 250px 预览。 */
const COLUMN_WIDTH = 206.5;
const COLUMN_MIN_WIDTH = 164;
const COLUMN_MAX_WIDTH = 420;
const COLUMN_KEY_STEP = 16;
const PREVIEW_WIDTH = 250;
const SIDEBAR_INITIAL_WIDTH = 200;
const TRASH_SIDEBAR_WIDTH = 162;
const SIDEBAR_MIN_WIDTH = 132;
const SIDEBAR_SNAP_DISTANCE = 24;
const SIDEBAR_KEY_STEP = 16;
const MIN_CONTENT_WIDTH = 400;
/** 列表表头一列的最小 / 最大宽度与方向键步长。 */
const LIST_COL_MIN_WIDTH = 60;
const LIST_COL_MAX_WIDTH = 480;
const LIST_COL_KEY_STEP = 16;
/** 视图设置写偏好库的去抖毫秒数：滑块拖动只落最后一次。 */
const VIEW_SETTINGS_SAVE_DELAY = 250;

/** 全局「显示所有文件扩展名」开关（与显示隐藏文件同一偏好域）。默认显示，保持现状。 */
const SHOW_ALL_EXTENSIONS_KEY = 'com.apple.finder.AppleShowAllExtensions';
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

/** 列表表头可拖宽的三列（Name 占剩余宽度）。 */
type ListColumn = 'date' | 'size' | 'kind';

/** 正在就地改名的条目：路径固定，编辑框里的文字随输入更新。 */
interface RenameState {
  readonly path: DiskPath;
  readonly value: string;
}

/** 改名输入框浮在条目原名标签的位置上（内容区坐标）。 */
interface RenameBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly fontSize: number;
  readonly align: string;
}

/** 重名冲突对话框挂起的改名：Replace / Keep Both 都按这条记录执行。 */
interface RenameConflict {
  readonly path: DiskPath;
  readonly name: string;
}

/**
 * Finder：图标、列表、分栏、画廊四种视图，侧栏、路径栏、搜索、排序与历史。
 *
 * 无障碍与键盘（ADESK-US-108）：窗口标题跟着目录名走（读屏念出「Documents，对话框」）；内容区是 `listbox`，
 * 条目是 `option`（名称加种类），整个内容区只占一个 Tab 位置（roving tabindex：选中项，没有就是第一项，`data-autofocus`
 * 标出它，窗口还原焦点时用）。焦点在条目上：方向键移动选择（图标视图按几何找上下左右、分栏视图左右进出栏），
 * 条目上 Enter 就地改名（像 Finder 一样，⌘↓ 或 ⌘O 打开，双击也能打开），Backspace 或 ⌘↑ 回上一级，
 * Menu 键 / Shift+F10 弹出右键菜单；无修饰键的可打印字符按首字母跳选（type-select），空格是 Quick Look。
 * 侧栏、工具栏、路径栏都是原生按钮。
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
    FocusTrap,
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
  private readonly showHidden = inject(FinderPreferences).showHiddenFiles;
  private readonly opener = inject(FileOpener);
  private readonly catalog = inject(ApplicationCatalog);
  private readonly dockDrag = inject(DockDragController);
  private readonly dock = inject(DockState);
  private readonly windows = inject(WindowManager);
  private readonly injector = inject(Injector);
  private readonly popover = inject(PopoverService);
  private readonly toast = inject(Toast);
  private readonly fileImport = inject(FileImport);
  private readonly sidebarOrder = inject(FinderSidebarOrder);
  private readonly clipboard = inject(FinderClipboard);
  private readonly mail = inject(MailComposer);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly preferences = inject(Preferences);
  private readonly errors = inject(ErrorHandler);
  private readonly layout = viewChild.required<ElementRef<HTMLElement>>('layout');
  private readonly sidebar = viewChild.required<ElementRef<HTMLElement>>('sidebar');
  private readonly sidebarSplitter = viewChild.required<ElementRef<HTMLElement>>('sidebarSplitter');
  private readonly body = viewChild.required<ElementRef<HTMLElement>>('body');
  private readonly marqueeBox = viewChild.required<ElementRef<HTMLElement>>('marquee');
  private readonly importInput = viewChild.required<ElementRef<HTMLInputElement>>('importInput');
  private readonly queryInput = viewChild.required<ElementRef<HTMLInputElement>>('queryInput');
  private readonly listViewport = viewChild<CdkVirtualScrollViewport>('listViewport');
  private readonly columnViewports = viewChildren<CdkVirtualScrollViewport>('columnViewport');
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
  private headerDrag: { pointerId: number; x: number; width: number; column: ListColumn } | null = null;
  private springFolderTimer: ReturnType<typeof setTimeout> | null = null;
  private dropHandled = false;
  /** 视图设置写偏好库的去抖计时器。 */
  private settingsSaveTimer: ReturnType<typeof setTimeout> | null = null;
  /** 新建的条目要等磁盘树刷出来才在列表里；记住它，下一帧把它滚进视野。 */
  private pendingReveal: DiskPath | null = null;
  private renameFocusToken = 0;
  /** 最近一次右键/键盘菜单的位置与触发方式，简介面板贴着它开、按触发方式决定焦点去向。 */
  private menuPoint: { x: number; y: number } | null = null;
  private menuKeyboard = false;
  private readonly displayPath = computed(() => {
    const path = this.path();
    return path[0] === VOLUME_NAME ? [VOLUME_NAME, ...displayDiskPath(path.slice(1))] : path;
  });
  /** 导航之前键盘焦点在内容区里：导航之后条目重新渲染，焦点要交还给新的 Tab 停靠点。 */
  private refocus = false;

  protected readonly fileOperation = signal<FileOperationRequest | null>(null);
  protected readonly renaming = signal<RenameState | null>(null);
  protected readonly renameValue = computed(() => this.renaming()?.value ?? '');
  protected readonly renameBox = signal<RenameBox | null>(null);
  protected readonly renameConflict = signal<RenameConflict | null>(null);
  /** 「立即删除」确认框的目标条目。 */
  protected readonly deletePrompt = signal<FsNode | null>(null);

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
  protected readonly sortDirection = signal<FinderSortDirection>('asc');
  /** View Options 的外观：图标大小、网格间距、文字大小；写进内容区的 CSS 变量。 */
  protected readonly iconSize = signal(DEFAULT_VIEW_SETTINGS.iconSize);
  protected readonly gridSpacing = signal(DEFAULT_VIEW_SETTINGS.gridSpacing);
  protected readonly textSize = signal(DEFAULT_VIEW_SETTINGS.textSize);
  /** 全局「显示所有文件扩展名」；默认显示（保持现状），View Options 里可关。 */
  protected readonly showExtensions = computed(() => this.preferences.get(SHOW_ALL_EXTENSIONS_KEY, isBoolean) ?? true);
  /** 列表表头 Date / Size / Kind 三列的宽度（Name 占剩余）。 */
  protected readonly listWidths = signal<Readonly<Record<ListColumn, number>>>({ date: 184, size: 76, kind: 112 });
  /** 状态栏的剩余容量：`navigator.storage.estimate` 算出来，拿不到就只显示条数。 */
  protected readonly diskAvailable = signal<string | null>(null);
  protected readonly finderDate = finderDate;

  protected readonly items = computed(() =>
    folderContents(this.fs, this.path(), this.query(), this.sort(), this.showHidden(), this.sortDirection())
  );
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
  protected readonly columns = computed(() =>
    columnChain(this.fs, this.path(), this.items(), this.columnSelection(), this.showHidden())
  );
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
    return item ? this.displayName(item) : null;
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
    const initialSidebarWidth =
      start.length === 1 && start[0] === 'Trash' ? TRASH_SIDEBAR_WIDTH : SIDEBAR_INITIAL_WIDTH;
    this.sidebarSize.set(initialSidebarWidth);
    this.sidebarRestoreWidth = initialSidebarWidth;
    this.path.set(start);
    this.history.set({ entries: [start], index: 0 });
    const initialSelection = this.win.options.select ?? null;
    this.setSelection(initialSelection ? [initialSelection] : []);
    /* 视图、排序与 View Options 按目录存在偏好库里，打开窗口时恢复（ADESK-US-109）。 */
    this.applyViewSettings(this.viewSettingsFor(start));
    this.win.setMenus(computed(() => menus.finder(this)));
    /* 窗口停在哪个目录，刷新后就恢复到哪个目录（窗口布局，ADESK-US-104）；选中项属于内部状态，不记。 */
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
    afterRenderEffect(() => {
      this.items();
      this.columns();
      const renaming = this.renaming();
      const reveal = this.pendingReveal;
      if (reveal) this.revealPending(reveal);
      if (renaming && !this.renameBox()) this.updateRenameBox(this.renameAnchorForPath(renaming.path));
      this.focusRenameInput();
    });

    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => this.clearSpringFolder());
    destroyRef.onDestroy(() => {
      if (this.settingsSaveTimer !== null) clearTimeout(this.settingsSaveTimer);
    });
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
    /* 状态栏的「X available」：拿浏览器存储的剩余容量；不支持 estimate 的浏览器只显示条数。 */
    afterNextRender(() => {
      if (typeof navigator.storage?.estimate !== 'function') return;
      navigator.storage.estimate().then(
        ({ quota, usage }) => {
          if (quota === undefined || usage === undefined) return;
          this.diskAvailable.set(formatSize(Math.max(0, quota - usage)));
        },
        () => undefined
      );
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
    this.saveViewSettings();
  }

  /** 选择排序方式：换方式用它的默认方向，再选当前方式切换升/降；工具栏 Sort 菜单与列表表头共用。 */
  setSort(next: FinderSort): void {
    if (this.sort() === next) {
      this.sortDirection.update(direction => (direction === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sort.set(next);
      this.sortDirection.set(defaultSortDirection(next));
    }
    this.saveViewSettings();
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
      name => {
        this.setSelection([name]);
        /* 分栏视图里当前目录那一栏可能被更深的选择挤到左边看不见，名字就没法就地改。 */
        if (this.view() === 'column' && this.firstColumn() > 0) return;
        this.pendingReveal = [...dir, name];
        this.renaming.set({ path: [...dir, name], value: name });
      },
      (error: unknown) => this.toast.show(describeDiskError(error))
    );
  }

  openSelected(): void {
    const node = this.selectedNode();
    if (node) this.openNode(node);
  }

  getInfo(): void {
    const node = this.selectedNode() ?? this.fs.get(this.path());
    if (!node) {
      this.toast.show('Select an item to see its information.');
      return;
    }
    const { menuPoint } = this;
    this.menuPoint = null;
    this.menuKeyboard = false;
    /* 菜单栏的 Get Info 与 ⌘I 是键盘路径，面板要拿走焦点。 */
    showInfoPanel(this.popover, node, menuPoint ?? undefined, true);
  }

  trashSelected(): void {
    this.trashNodes(this.selectedNodes());
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
    if (this.view() === 'column') {
      /* 分栏视图：选中当前聚焦那一栏的全部（不清掉整个选择链）。 */
      const { chain } = this.columns();
      const index = this.selectedColumnIndex() ?? this.firstColumn();
      const names = chain[index]?.items?.map(item => item.name) ?? [];
      if (!names.length) return;
      this.setColumnNames(index, names);
      this.commitColumnPath();
      return;
    }
    this.setSelection(this.items().map(item => item.name));
  }

  emptyTrash(): void {
    if (this.isTrash() && this.fs.trashFull()) this.emptyTrashPrompt.set(true);
  }

  inTrash(): boolean {
    return this.isTrash();
  }

  /** ⌘F：聚焦工具栏的搜索框，输入即触发搜索。 */
  focusSearch(): void {
    const input = this.queryInput().nativeElement;
    input.focus();
    input.select();
  }

  /** ⇧⌘G：弹「前往文件夹」输入框，回车后按绝对路径进入；找不到就提示并重开。 */
  gotoFolder(): void {
    const rect = this.body().nativeElement.getBoundingClientRect();
    this.popover.openComponent(
      GoToFolderDialog,
      { x: rect.left + rect.width / 2 - 160, y: rect.top + 48 },
      {
        onSubmit: (path: DiskPath) => this.goToFolderPath(path),
        onCancel: () => this.popover.close()
      }
    );
  }

  /** ⌘J：View Options 面板，改动实时写回当前目录的视图设置。 */
  showViewOptions(): void {
    const rect = this.body().nativeElement.getBoundingClientRect();
    this.popover.openComponent(
      FinderViewOptions,
      { x: rect.right - 288, y: rect.top + 40, right: true, origin: 'top right' },
      {
        iconSize: this.iconSize,
        gridSpacing: this.gridSpacing,
        textSize: this.textSize,
        showExtensions: this.showExtensions,
        onToggleExtensions: () => this.toggleExtensions(),
        onChanged: () => this.saveViewSettings()
      }
    );
  }

  /** 扩展名开关：全局偏好，所有 Finder 窗口与视图共用。 */
  toggleExtensions(): void {
    void this.preferences
      .set(SHOW_ALL_EXTENSIONS_KEY, !this.showExtensions())
      .catch((error: unknown) => this.errors.handleError(error));
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

  /** 重名冲突对话框：Replace 覆盖、Keep Both 加序号、Cancel（null）回到编辑。 */
  protected finishRenameConflict(mode: 'replace' | 'keepBoth' | null, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    const conflict = this.renameConflict();
    this.renameConflict.set(null);
    if (!conflict || !mode) {
      /* 取消：继续改名——焦点与主名选区还给输入框。 */
      afterNextRender(
        {
          write: () => {
            const input = this.body().nativeElement.querySelector<HTMLInputElement>('[data-rename-input]');
            if (!input) return;
            const name = conflict?.name ?? '';
            const range: readonly [number, number] =
              this.showExtensions() ? stemRange(name, isPackageName(name)) : [0, name.length];
            input.setSelectionRange(range[0], range[1]);
            input.focus();
          }
        },
        { injector: this.injector }
      );
      return;
    }
    const { path, name } = conflict;
    this.renaming.set(null);
    this.renameBox.set(null);
    this.fs.renameWith(path, name, mode).then(
      renamed => {
        const current = diskPathOf(this.path());
        const oldName = path.at(-1) ?? '';
        const stillSelected = this.selectedNames().includes(oldName) || this.columnSelection().includes(oldName);
        if (stillSelected && current && isWithin(renamed, current)) {
          this.selectPath(renamed);
          this.focusRenamedItem(renamed);
        } else {
          this.refocus = stillSelected;
        }
      },
      (error: unknown) => {
        this.toast.show(describeDiskError(error));
        this.renaming.set({ path, value: name });
      }
    );
  }

  /** 「立即删除」确认框：Cancel / Delete。 */
  protected finishDeleteImmediately(confirmed: boolean, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    const node = this.deletePrompt();
    this.deletePrompt.set(null);
    if (confirmed && node) this.deleteImmediately(node);
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

  /** 列表表头点击：那一列排序；当前排序再点一次切换升 / 降（与工具栏 Sort 菜单共用 {@link setSort}）。 */
  protected headerSort(sort: FinderSort): void {
    this.setSort(sort);
  }

  /** 表头列宽分隔条：指针拖宽（实时写回，拖动中列表跟着变）。 */
  protected startHeaderDrag(event: PointerEvent, column: ListColumn): void {
    if (event.button !== 0 || this.headerDrag) return;
    const handle = event.currentTarget as HTMLElement;
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    handle.focus({ preventScroll: true });
    this.headerDrag = { pointerId: event.pointerId, x: event.clientX, width: this.listWidths()[column], column };
  }

  protected moveHeaderDrag(event: PointerEvent): void {
    const drag = this.headerDrag;
    if (drag?.pointerId !== event.pointerId) return;
    const width = clamp(drag.width + event.clientX - drag.x, LIST_COL_MIN_WIDTH, LIST_COL_MAX_WIDTH);
    this.listWidths.update(current => ({ ...current, [drag.column]: width }));
  }

  protected endHeaderDrag(event: PointerEvent): void {
    const drag = this.headerDrag;
    if (drag?.pointerId !== event.pointerId) return;
    this.headerDrag = null;
  }

  protected headerKey(event: KeyboardEvent, column: ListColumn): void {
    if (this.headerDrag) return;
    const width = this.listWidths()[column];
    const next =
      event.key === 'ArrowLeft' ? width - LIST_COL_KEY_STEP
      : event.key === 'ArrowRight' ? width + LIST_COL_KEY_STEP
      : event.key === 'Home' ? LIST_COL_MIN_WIDTH
      : event.key === 'End' ? LIST_COL_MAX_WIDTH
      : null;
    if (next === null) return;
    event.preventDefault();
    this.listWidths.update(current => ({ ...current, [column]: clamp(next, LIST_COL_MIN_WIDTH, LIST_COL_MAX_WIDTH) }));
  }

  /** 表头当前排序列的 `aria-sort`：别的列是 null。 */
  protected ariaSort(field: FinderSort): 'ascending' | 'descending' | null {
    if (this.sort() !== field) return null;
    return this.sortDirection() === 'asc' ? 'ascending' : 'descending';
  }

  /** 列表一列的当前宽度（模板写进 `--finder-c2/3/4` 变量）。 */
  protected listWidth(column: ListColumn): number {
    return this.listWidths()[column];
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
    const next = this.nextSelection(this.items(), current, name, this.selected(), event);
    this.setSelection(next, next.includes(name) ? name : (next.at(-1) ?? null));
  }

  protected focusItem(name: string): void {
    if (this.selectedNames().length === 0) this.setSelection([name]);
    else this.selected.set(name);
  }

  /** 内容区条目上的按键：方向键移动选择、条目上 Enter 就地改名、⌘↓ 或 ⌘O 打开、Backspace 或 ⌘↑ 上一级、Menu 键弹出菜单、空格 Quick Look、可打印字符首字母跳选；`column` 是分栏视图里条目所在的栏。 */
  protected itemKey(event: KeyboardEvent, name: string, column = -1): void {
    const node = (column < 0 ? this.items() : this.columns().chain[column]?.items)?.find(item => item.name === name);
    if (node && isMoveToTrash(event)) {
      /* ⌘⌫：整批移进废纸篓；废纸篓里不提供（拦下，别当 Backspace 回上一级）。 */
      event.preventDefault();
      event.stopPropagation();
      if (node.path && !isWithin(node.path, TRASH)) this.trashItem(node);
      return;
    }
    if (node && isDeleteImmediately(event)) {
      /* ⌥⌘⌫：跳过废纸篓直接删，先弹确认框。 */
      event.preventDefault();
      event.stopPropagation();
      if (node.path) this.deletePrompt.set(node);
      return;
    }
    if (node && event.key === 'F2') {
      event.preventDefault();
      this.startRename(node);
      return;
    }
    if (
      node &&
      !event.isComposing &&
      event.key === ' ' &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.shiftKey
    ) {
      event.preventDefault();
      event.stopPropagation();
      this.quickLook(node, column);
      return;
    }
    if (node && (event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      event.stopPropagation();
      if (node.path && !isWithin(node.path, TRASH)) this.duplicate(node);
      return;
    }
    if (node && (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey) {
      if (event.key === 'ArrowDown' || event.key.toLowerCase() === 'o') {
        event.preventDefault();
        this.activate(name, column);
        return;
      }
    }
    if (this.typeSelect(event, node, name, column)) {
      event.preventDefault();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      /* 与 Finder 一致：Enter 就地改名（文件也一样），打开走 ⌘↓ / ⌘O / 双击。 */
      if (node?.path) this.startRename(node);
      else this.activate(name, column);
    } else if (isGoUp(event)) {
      event.preventDefault();
      this.goUp();
    } else if (isMenuKey(event)) {
      event.preventDefault();
      if (node) this.itemMenuByKey(event.currentTarget as HTMLElement, node, column);
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
    const next = this.nextSelection(items, current, name, this.selected(), event);
    this.setColumnNames(index, next, next.includes(name) ? name : (next.at(-1) ?? null));
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

  /** 改名输入框失焦即提交（像 Finder），但不把焦点抢回来。 */
  protected blurRename(): void {
    this.commitRename(false);
  }

  protected isRenaming(node: FsNode): boolean {
    const renaming = this.renaming();
    return Boolean(node.path && renaming && samePath(node.path, renaming.path));
  }

  protected updateRename(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.renaming.update(current => (current ? { ...current, value } : null));
  }

  /** 就地改名输入框里的按键：Enter 提交、Esc 取消；其余按键留给输入框，不交给列表导航。 */
  protected renameKey(event: KeyboardEvent): void {
    if (event.isComposing) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      this.commitRename();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelRename();
    }
  }

  protected jump(index: number | null): void {
    this.nav(index === null ? [] : this.path().slice(0, index + 1));
  }

  protected sortMenu(anchor: HTMLElement, event: MouseEvent): void {
    this.popover.menuUnder(
      anchor,
      [{ head: 'Sort By' }, ...finderSortCommands(this.sort(), next => this.setSort(next))],
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
    const column = (event.currentTarget as HTMLElement | null)?.dataset['ci'];
    this.menuPoint = { x: event.clientX, y: event.clientY };
    this.menuKeyboard = false;
    /* 分栏视图要按栏选中，别用 setSelection 清掉选择链，否则菜单一开后面的栏就没了。 */
    if (column === undefined) {
      if (!this.isSelected(current.name)) this.setSelection([current.name]);
    } else if (!this.isColumnSelected(Number(column), current.name)) {
      this.pickColumn(Number(column), current.name);
    }
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
    if ((event.target as Element).closest('[role="option"], input')) return;
    this.menuPoint = { x: event.clientX, y: event.clientY };
    this.menuKeyboard = false;
    if (this.isTrash()) {
      this.popover.contextMenu(event, [
        { id: 'empty', label: 'Empty Trash', disabled: !this.fs.trashFull(), run: () => this.emptyTrash() },
        '-',
        { id: 'nf', label: 'New Folder', disabled: true },
        { id: 'gi', label: 'Get Info', run: () => this.showFolderInfo() }
      ]);
      return;
    }
    this.popover.contextMenu(event, [
      { id: 'nf', label: 'New Folder', run: () => this.newFolder() },
      { id: 'gi', label: 'Get Info', run: () => this.showFolderInfo() },
      '-',
      { id: 'v', label: 'View', submenu: finderViewItems(this.view(), next => this.setView(next)) },
      { id: 's', label: 'Sort By', submenu: finderSortCommands(this.sort(), next => this.setSort(next)) }
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
    /* 无障碍名用真名（应用用清单名）：扩展名隐藏时读屏仍能区分重名的 .md 与 .txt。 */
    const name = this.catalog.manifestAt(item.path)?.name ?? item.name;
    return itemLabel({ ...item, name });
  }

  protected displayName(item: FsNode): string {
    if (item.path && samePath(item.path, HOME)) return USER_PROFILE.name;
    const name = this.catalog.manifestAt(item.path)?.name ?? item.name;
    if (!this.showExtensions()) {
      const dot = name.lastIndexOf('.');
      if (dot > 0 && !isPackageName(name)) return name.slice(0, dot);
    }
    return name;
  }

  /** 别名条目：图标角上带箭头角标（FILEOPS 的 `isAliasNode`）。 */
  protected isAlias(item: FsNode): boolean {
    return Boolean(item.path && isAliasNode(item));
  }

  protected displayIcon(item: FsNode): string {
    if (item.kind === 'folder' && this.isSpringFolder(item.path)) return 'g-folder-open';
    return this.catalog.manifestAt(item.path)?.icon ?? item.icon;
  }

  protected dragStarted(source: FsNode, column = -1): void {
    this.dropHandled = false;
    if (column >= 0) {
      if (!this.isColumnSelected(column, source.name)) this.pickColumn(column, source.name);
    } else if (!this.isSelected(source.name)) {
      this.setSelection([source.name]);
    }
    /* 把这次拖拽的条目路径登记给 Dock（DOCKREG）：落到应用图标上时按它打开文件。 */
    setFinderDrag(this.dragNodes(source).flatMap(node => (node.path ? [node.path] : [])));
  }

  protected dragEnded(event: CdkDragEnd<FsNode>): void {
    setFinderDrag(null);
    this.clearSpringFolder();
    const source = event.source.data;
    const dropHandled = this.dropHandled;
    this.dropHandled = false;
    if (!source?.path || dropHandled) return;
    const { x, y } = event.dropPoint;
    const hit = document.elementsFromPoint(x, y).find(element => element.closest('.win'));
    const github = hit?.closest('.win[data-app="github"]')?.querySelector('[data-github-app]');
    if (github && source.kind === 'folder') {
      github.dispatchEvent(new CustomEvent('aiaoRepositoryDrop', { detail: source.path }));
      return;
    }
    if (this.dock.isTrashAt(x, y)) {
      this.trashNodes(this.dragNodes(source));
      return;
    }
    const eventTarget = event.event.target instanceof Element ? event.event.target : null;
    const dir = this.dropDirectoryAt(x, y, eventTarget) ?? this.desktopDropDirectory(event.dropPoint);
    if (!dir) return;
    if (samePath(dir, TRASH)) {
      this.trashNodes(this.dragNodes(source));
      return;
    }
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
    const { x, y } = event.pointerPosition;
    const targetWindow = this.finderWindowAt(x, y);
    if (targetWindow && targetWindow !== this.win) {
      this.clearSpringFolder();
      if (this.windows.focused() !== targetWindow) this.windows.focus(targetWindow.id, { dom: false });
      return;
    }
    const target = this.dropDirectoryAt(x, y);
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
    const dir = this.dropDirectory(event) ?? (event.isPointerOverContainer ? event.container.data : null);
    if (!source?.path || !dir) return;
    this.dropHandled = true;
    if (samePath(dir, TRASH)) {
      this.trashNodes(this.dragNodes(source));
      return;
    }
    const copy = this.copyModifier(event.event);
    void this.transferNodes(this.dragNodes(source), dir, copy).then(
      path => {
        const last = path.at(-1);
        if (last && samePath(parentOf(last), this.importDirectory() ?? [])) this.selectPath(last);
      },
      (error: unknown) => this.toast.show(describeDiskError(error))
    );
  }

  /** 无修饰键的可打印字符：按首字母跳到下一个以此开头的条目（type-select）；命中时返回 true。 */
  private typeSelect(event: KeyboardEvent, node: FsNode | undefined, name: string, column: number): boolean {
    if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey || event.key.length !== 1) return false;
    const items = column < 0 ? this.items() : (this.columns().chain[column]?.items ?? []);
    if (!items.length || !node) return false;
    const at = items.findIndex(item => item.name === name);
    const target = typeaheadIndex(
      items.map(item => this.displayName(item)),
      at,
      event.key
    );
    if (target === null) return false;
    const next = items[target];
    if (column < 0) {
      this.select(next.name);
      this.option(`[data-name="${CSS.escape(next.name)}"]`)?.focus();
    } else {
      this.focusColumnItem(column, next.name);
    }
    return true;
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

  private finderWindowAt(x: number, y: number): DesktopWindow | null {
    const id = document
      .elementsFromPoint(x, y)
      .map(element => element.closest<HTMLElement>('.win[data-app="finder"]')?.id)
      .find(Boolean);
    return id ? (this.windows.get(id) ?? null) : null;
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

  private trashNodes(nodes: readonly FsNode[]): void {
    if (this.isTrash() || !nodes.length) return;
    this.setSelection([]);
    void this.fs
      .moveToTrashBatch(nodes.flatMap(node => (node.path ? [node.path] : [])))
      .catch((error: unknown) => this.toast.show(describeDiskError(error)));
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

  /**
   * 一次点击之后的选择：Shift 连选以 `anchor`（上一次点击的条目）为起点，没有就退回当前选择的第一项；
   * ⌘/Ctrl 切换单项；普通点击只选它自己。
   */
  private nextSelection(
    items: readonly FsNode[],
    current: readonly string[],
    name: string,
    anchor: string | null,
    event?: Pick<MouseEvent, 'ctrlKey' | 'metaKey' | 'shiftKey'>
  ): readonly string[] {
    if (event?.shiftKey && current.length) {
      return shiftRange(
        items.map(item => item.name),
        current,
        name,
        anchor
      );
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
    this.columnSelection.set(
      primary ? [...this.columnSelection().slice(0, index), primary] : this.columnSelection().slice(0, index)
    );
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
    const items = column === undefined ? this.items() : (this.columns().chain[Number(column)]?.items ?? []);
    return items.find(item => item.name === name) ?? fallback;
  }

  private itemMenuItems(node: FsNode): MenuEntry[] {
    const name = node.name;
    const inTrash = Boolean(node?.path && isWithin(node.path, TRASH));
    const restorable = Boolean(node?.path && samePath(parentOf(node.path), TRASH));
    const tags = node.path ? this.fs.tagsOf(node) : [];
    return [
      { id: 'o', label: 'Open', run: () => this.openNode(node) },
      {
        id: 'w',
        label: 'Open With',
        disabled: node?.kind !== 'file' || isPackageName(name),
        submenu:
          node.kind === 'file' && !isPackageName(name) ?
            openWithCommands(
              this.opener.choices(node),
              appId => this.opener.openApp(appId, node),
              () => this.requestFileOperation('open-with', node)
            )
          : undefined
      },
      '-',
      {
        id: 'i',
        label: 'Get Info',
        key: '⌘I',
        run: () => {
          const { menuPoint, menuKeyboard } = this;
          this.menuPoint = null;
          this.menuKeyboard = false;
          showInfoPanel(this.popover, node, menuPoint ?? undefined, menuKeyboard);
        }
      },
      { id: 'r', label: 'Rename', disabled: !node?.path, run: () => this.startRename(node) },
      {
        id: 'compress',
        label: compressLabel(this.compressNames(node)),
        disabled: inTrash || !node.path,
        run: () => this.compress(node)
      },
      { id: 'd', label: 'Duplicate', key: '⌘D', disabled: inTrash, run: () => this.duplicate(node) },
      { id: 'alias', label: 'Make Alias', disabled: inTrash || !node.path, run: () => this.makeAlias(node) },
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
          },
          {
            id: 'delete',
            label: 'Delete Immediately',
            key: '⌥⌘⌫',
            disabled: !node.path,
            run: () => this.deletePrompt.set(node)
          }
        ]
      : [{ id: 't', label: 'Move to Trash', key: '⌘⌫', run: () => this.trashItem(node) }]),
      '-',
      {
        id: 'tags',
        label: 'Tags',
        disabled: !node.path,
        submenu: node.path ? tagCommands(FINDER_TAG_COLORS, tags, next => this.setNodeTags(node, next)) : undefined
      },
      { id: 'q', label: 'Quick Look', key: '␣', run: () => this.quickLook(node) }
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

  private startRename(node: FsNode): void {
    if (!node?.path) return;
    this.renameBox.set(null);
    this.renaming.set({ path: node.path, value: node.name });
    this.updateRenameBox(this.renameAnchorForPath(node.path));
  }

  /** 改名标签在哪个元素上：图标 / 列表 / 分栏在条目行里，画廊在下方说明里。 */
  private renameAnchorForPath(path: DiskPath): HTMLElement | null {
    const body = this.body().nativeElement;
    const name = CSS.escape(path.at(-1) ?? '');
    if (this.view() === 'column') {
      const parent = parentOf(path);
      const index = this.columns().chain.findIndex(column => column.node.path && samePath(column.node.path, parent));
      return body.querySelector<HTMLElement>(`.ci[data-ci="${index}"][data-name="${name}"] [data-rename-anchor]`);
    }
    return (
      body.querySelector<HTMLElement>(`[data-name="${name}"] [data-rename-anchor]`) ??
      (this.view() === 'gallery' ? body.querySelector<HTMLElement>('.fv-gal .cap [data-rename-anchor]') : null)
    );
  }

  private updateRenameBox(anchor: HTMLElement | null): void {
    if (!anchor) return;
    const body = this.body().nativeElement;
    const bodyRect = body.getBoundingClientRect();
    const rect = anchor.getBoundingClientRect();
    const style = getComputedStyle(anchor);
    this.renameBox.set({
      left: rect.left - bodyRect.left - 6,
      top: rect.top - bodyRect.top + body.scrollTop - 1,
      width: Math.min(Math.max(rect.width + 12, 72), 320),
      fontSize: parseFloat(style.fontSize) || 12.5,
      align: style.textAlign === 'center' ? 'center' : 'left'
    });
  }

  private commitRename(restore = true): void {
    const editing = this.renaming();
    if (!editing) return;
    this.renaming.set(null);
    this.renameBox.set(null);
    const name = editing.value.trim();
    const oldName = editing.path.at(-1) ?? '';
    if (!name || name === oldName) {
      if (restore) this.restoreItemFocus();
      return;
    }
    this.fs.rename(editing.path, name).then(
      path => {
        const current = diskPathOf(this.path());
        const stillSelected = this.selectedNames().includes(oldName) || this.columnSelection().includes(oldName);
        if (stillSelected && current && isWithin(path, current)) {
          this.selectPath(path);
          if (restore) this.focusRenamedItem(path);
        } else {
          this.refocus = restore && stillSelected;
        }
      },
      (error: unknown) => {
        /* 撞上同名：弹 Replace / Keep Both / Cancel（FILEOPS 的 `renameWithConflict` 执行选择）；编辑框保持打开。 */
        if (error instanceof DiskError && error.code === 'EEXIST') {
          this.renaming.set({ ...editing });
          this.renameConflict.set({ path: editing.path, name });
          return;
        }
        this.toast.show(describeDiskError(error));
        if (restore) this.renaming.set({ ...editing });
      }
    );
  }

  private cancelRename(): void {
    if (!this.renaming()) return;
    this.renaming.set(null);
    this.renameBox.set(null);
    this.focusTabStop();
  }

  private restoreItemFocus(): void {
    afterNextRender(
      {
        write: () => {
          if (!this.renaming()) this.focusTabStop();
        }
      },
      { injector: this.injector }
    );
  }

  /** 改名成功后逐帧等改过名的条目渲染出来再聚焦：活查询异步推送，条目还没进 DOM 时 `[data-autofocus]` 会指向列表第一项。 */
  private focusRenamedItem(path: DiskPath): void {
    const name = path.at(-1);
    if (!name) return;
    let left = 20;
    const attempt = (): void => {
      const target = this.option(`[data-name="${CSS.escape(name)}"]`);
      if (target) {
        target.focus();
        return;
      }
      if (left > 0) {
        left--;
        requestAnimationFrame(attempt);
      } else {
        this.focusTabStop();
      }
    };
    attempt();
  }

  /** 输入框要等条目渲染出来（虚拟列表还要先滚到它）才有得聚焦：连续几帧里找到就聚焦；选区只含主名（扩展名留在外面）。 */
  private focusRenameInput(): void {
    const renaming = this.renaming();
    if (!renaming) return;
    const token = ++this.renameFocusToken;
    const attempt = (left: number): void => {
      const current = this.renaming();
      if (!current || !samePath(current.path, renaming.path) || this.renameFocusToken !== token) return;
      if (!this.renameBox()) this.updateRenameBox(this.renameAnchorForPath(current.path));
      const body = this.body().nativeElement;
      const input = body.querySelector<HTMLInputElement>('[data-rename-input]');
      if (input) {
        if (input !== body.ownerDocument.activeElement) {
          input.focus();
          const name = current.path.at(-1) ?? '';
          const range: readonly [number, number] =
            this.showExtensions() ? stemRange(name, isPackageName(name)) : [0, name.length];
          input.setSelectionRange(range[0], range[1]);
          input.scrollLeft = 0;
        }
        return;
      }
      if (left > 0) requestAnimationFrame(() => attempt(left - 1));
    };
    attempt(20);
  }

  private revealPending(path: DiskPath): void {
    const name = path.at(-1);
    if (!name) {
      this.pendingReveal = null;
      return;
    }
    if (this.view() === 'column') {
      const index = (this.columns().chain[0]?.items ?? []).findIndex(item => item.name === name);
      const viewport = this.columnViewports()[0 - this.firstColumn()];
      if (!viewport || index < 0) return;
      this.pendingReveal = null;
      viewport.scrollToIndex(Math.max(0, index - 1));
      return;
    }
    const index = this.items().findIndex(item => item.name === name);
    if (index < 0) return;
    this.pendingReveal = null;
    if (this.view() === 'list') {
      this.listViewport()?.scrollToIndex(Math.max(0, index - 1));
      return;
    }
    this.option(`[data-name="${CSS.escape(name)}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  /** 移进废纸篓：点击项已在多选里就整批移，否则只移它自己（⌘⌫ 与右键菜单共用）。 */
  private trashItem(node: FsNode): void {
    const path = node.path;
    if (!path || isWithin(path, TRASH)) return;
    const selected = this.selectedItems();
    if (selected.some(item => item.path && samePath(item.path, path))) this.trashNodes(selected);
    else this.trashNodes([node]);
  }

  /** 立即删除：跳过废纸篓，经确认框后直接删掉（不进撤销栈）。 */
  private deleteImmediately(node: FsNode): void {
    const path = node.path;
    if (!path) return;
    void this.fs
      .run(store => store.remove(path))
      .then(() => {
        this.fs.notifyChanges([path]);
        this.setSelection([]);
      })
      .catch((error: unknown) => this.toast.show(describeDiskError(error)));
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
  private itemMenuByKey(anchor: HTMLElement, node: FsNode, column = -1): void {
    if (column < 0) this.setSelection([node.name]);
    else if (!this.isColumnSelected(column, node.name)) this.pickColumn(column, node.name);
    const rect = anchor.getBoundingClientRect();
    this.menuPoint = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    this.menuKeyboard = true;
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

  /** 打开一个条目：别名先解析目标（FILEOPS 的 `resolveAlias`），文件交给打开器，文件夹进入它。搜索结果与「最近使用」不在当前路径下，按绝对路径进入。 */
  private openNode(node: FsNode): void {
    if (node.kind === 'file' && node.path && isAliasNode(node)) {
      void this.fs.aliasTarget(node).then(
        target => {
          if (target) this.openNode(target);
          else this.toast.show('The original item can’t be found.');
        },
        () => this.toast.show('The original item can’t be found.')
      );
      return;
    }
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

  /** 选中并聚焦分栏里的一项；跨栏时等虚拟列表完成重渲染后再聚焦新节点。 */
  private focusColumnItem(ci: number, name: string): void {
    const currentColumn = (this.body().nativeElement.ownerDocument.activeElement as HTMLElement | null)?.dataset['ci'];
    this.pickColumn(ci, name);
    const selector = `[data-ci="${ci}"][data-name="${CSS.escape(name)}"]`;
    const focus = () => this.option(selector)?.focus();
    if (currentColumn === String(ci)) focus();
    else afterNextRender(() => requestAnimationFrame(focus), { injector: this.injector });
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

  /** Quick Look 浮层（QL 契约）：传兄弟条目给方向键切换；空格与右键菜单项共用。 */
  private quickLook(node: FsNode, column = -1): void {
    const siblings = column < 0 ? this.items() : (this.columns().chain[column]?.items ?? []);
    showQuickLook(this.popover, node, siblings);
  }

  /** Compress 菜单标签用的名字：多选时是所有选中项，否则只有点击项。 */
  private compressNames(node: FsNode): readonly string[] {
    const selected = this.selectedItems();
    return selected.some(item => item.path && node.path && samePath(item.path, node.path)) ?
        selected.map(item => item.name)
      : [node.name];
  }

  /** 压缩成 ZIP（FILEOPS 的 `compressToZip`）：多选时整批压一个包。 */
  private compress(node: FsNode): void {
    const selected = this.selectedItems();
    const nodes = selected.some(item => item.path && node.path && samePath(item.path, node.path)) ? selected : [node];
    const paths = nodes.flatMap(item => (item.path ? [item.path] : []));
    if (!paths.length) return;
    this.fs.compressToZip(paths, parentOf(paths[0])).then(
      zip => this.selectPath(zip),
      (error: unknown) => this.toast.show(describeDiskError(error))
    );
  }

  /** 创建别名（FILEOPS 的 `makeAlias`）：选中新生成的别名。 */
  private makeAlias(node: FsNode): void {
    if (!node.path) return;
    this.fs.makeAlias(node.path).then(
      path => this.selectPath(path),
      (error: unknown) => this.toast.show(describeDiskError(error))
    );
  }

  /** Tags 子菜单点选后写回整组颜色（FILEOPS 的 `setTags`）。 */
  private setNodeTags(node: FsNode, colors: readonly string[]): void {
    if (!node.path) return;
    void this.fs
      .setTags(node.path, colors as readonly TagColor[])
      .catch((error: unknown) => this.toast.show(describeDiskError(error)));
  }

  private showFolderInfo(): void {
    const node = this.fs.get(this.path());
    if (!node) return;
    const point = this.menuPoint;
    this.menuPoint = null;
    this.menuKeyboard = false;
    showInfoPanel(this.popover, node, point ?? undefined);
  }

  private nav(path: readonly string[]): void {
    this.clearSpringFolder();
    this.renaming.set(null);
    this.pendingReveal = null;
    this.keepFocus();
    this.query.set('');
    this.path.set(path);
    this.setSelection([]);
    this.columnSelection.set([]);
    /* 每个目录自己的视图、排序与 View Options（ADESK-US-109）。 */
    this.applyViewSettings(this.viewSettingsFor(path));
    this.history.update(({ entries, index }) => {
      const next = [...entries.slice(0, index + 1), path];
      return { entries: next, index: next.length - 1 };
    });
  }

  private step(delta: number): void {
    const { entries, index } = this.history();
    const target = index + delta;
    if (target < 0 || target >= entries.length) return;
    this.renaming.set(null);
    this.pendingReveal = null;
    this.keepFocus();
    this.history.set({ entries, index: target });
    this.path.set(entries[target]);
    this.setSelection([]);
    this.columnSelection.set([]);
    this.applyViewSettings(this.viewSettingsFor(entries[target]));
  }

  /** 「前往文件夹」确认后的路径：存在就进入，不存在提示并重新打开输入框。 */
  private goToFolderPath(path: DiskPath): void {
    this.popover.close();
    if (!this.fs.nodeAt(path)) {
      this.toast.show(`The folder can’t be found.`);
      this.gotoFolder();
      return;
    }
    this.nav(finderPathOf(path));
  }

  /** 目录的视图设置：偏好库里存的（补齐缺省字段），没有就是默认值。 */
  private viewSettingsFor(finderPath: readonly string[]): FinderViewSettings {
    const stored = this.preferences.get(viewSettingsKey(finderPath), isFinderViewSettings);
    return stored ? { ...DEFAULT_VIEW_SETTINGS, ...stored } : { ...DEFAULT_VIEW_SETTINGS };
  }

  /** 应用一份视图设置（导航、打开窗口时）：只改信号，不写偏好。 */
  private applyViewSettings(settings: FinderViewSettings): void {
    this.view.set(settings.view);
    this.sort.set(settings.sort);
    this.sortDirection.set(settings.direction);
    this.iconSize.set(clamp(settings.iconSize, ICON_SIZE_MIN, ICON_SIZE_MAX));
    this.gridSpacing.set(clamp(settings.gridSpacing, GRID_SPACING_MIN, GRID_SPACING_MAX));
    this.textSize.set(clamp(settings.textSize, TEXT_SIZE_MIN, TEXT_SIZE_MAX));
  }

  /** 把当前视图设置写进目录的偏好键；滑块拖动期间去抖，只落最后一次。 */
  private saveViewSettings(): void {
    const path = this.path();
    if (!diskPathOf(path)) return;
    const settings: FinderViewSettings = {
      view: this.view(),
      sort: this.sort(),
      direction: this.sortDirection(),
      iconSize: this.iconSize(),
      gridSpacing: this.gridSpacing(),
      textSize: this.textSize()
    };
    if (this.settingsSaveTimer !== null) clearTimeout(this.settingsSaveTimer);
    this.settingsSaveTimer = setTimeout(() => {
      void this.preferences
        .set(viewSettingsKey(path), settings)
        .catch((error: unknown) => this.errors.handleError(error));
    }, VIEW_SETTINGS_SAVE_DELAY);
  }
}

/**
 * 「前往文件夹」输入框（⇧⌘G 的弹出层）：`~`、`~/…` 与绝对 POSIX 路径，回车后把卷内路径交给 `onSubmit`；
 * 语法不对就地提示。Esc / 点外面由弹出层自己关（桌面层处理）。
 */
@Component({
  selector: 'app-finder-goto',
  host: { class: 'pop', role: 'dialog', 'aria-label': 'Go to Folder', style: 'width: 340px; padding: 12px' },
  template: `
    <form (submit)="submit($event)" style="display: grid; gap: 10px">
      <input
        #path
        (input)="error.set('')"
        aria-label="Go to folder"
        placeholder="/Users/you/Documents"
        spellcheck="false"
      />
      @if (error()) {
        <div role="alert" style="font-size: 12px; color: var(--red)">{{ error() }}</div>
      }
      <div style="display: flex; justify-content: flex-end; gap: 6px">
        <button class="mi" (click)="cancel()" tabindex="0" type="button">Cancel</button>
        <button class="mi" tabindex="0" type="submit">Go</button>
      </div>
    </form>
  `,
  styles: `
    input {
      box-sizing: border-box;
      width: 100%;
      padding: 6px 8px;
      color: inherit;
      background: var(--field);
      border: 1px solid var(--blue);
      border-radius: 5px;
      font: inherit;
      outline: none;
    }
  `
})
class GoToFolderDialog implements AfterViewInit {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  protected readonly error = signal('');
  readonly onSubmit = input.required<(path: DiskPath) => void>();
  readonly onCancel = input.required<() => void>();

  ngAfterViewInit(): void {
    this.host.querySelector<HTMLInputElement>('input')?.focus();
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const value = this.host.querySelector<HTMLInputElement>('input')?.value ?? '';
    const path = parseGoToFolder(value);
    if (!path) {
      this.error.set('Enter an absolute path, like /Users/you/Documents.');
      return;
    }
    this.onSubmit()(path);
  }

  protected cancel(): void {
    this.onCancel()();
  }
}

/**
 * View Options 面板（⌘J 的弹出层）：图标大小、网格间距、文字大小与「显示所有文件扩展名」。
 * 滑块写回调用方传进来的信号，每次改动通过 `onChanged` 通知它持久化；扩展名开关走 `onToggleExtensions`。
 */
@Component({
  selector: 'app-finder-view-options',
  host: { class: 'pop wide', role: 'dialog', 'aria-label': 'View Options', style: 'width: 264px; padding: 12px 14px' },
  template: `
    <div style="display: grid; gap: 12px">
      <label class="fvopt">
        <span>Icon size</span>
        <input
          #icon
          [value]="iconSize()()"
          (input)="setSize(iconSize(), icon.value)"
          aria-label="Icon size"
          max="128"
          min="16"
          step="1"
          type="range"
        />
      </label>
      <label class="fvopt">
        <span>Grid spacing</span>
        <input
          #spacing
          [value]="gridSpacing()()"
          (input)="setSize(gridSpacing(), spacing.value)"
          aria-label="Grid spacing"
          max="100"
          min="0"
          step="1"
          type="range"
        />
      </label>
      <label class="fvopt">
        <span>Text size</span>
        <input
          #text
          [value]="textSize()()"
          (input)="setSize(textSize(), text.value)"
          aria-label="Text size"
          max="16"
          min="10"
          step="1"
          type="range"
        />
      </label>
      <label class="fvopt chk">
        <input #ext [checked]="showExtensions()()" (change)="onToggleExtensions()()" type="checkbox" />
        <span>Show all filename extensions</span>
      </label>
    </div>
  `,
  styles: `
    .fvopt {
      display: grid;
      grid-template-columns: 92px 1fr;
      align-items: center;
      gap: 8px;
      font-size: 12.5px;
      color: var(--txt);
    }
    .fvopt input[type='range'] {
      width: 100%;
    }
    .fvopt.chk {
      grid-template-columns: auto 1fr;
      gap: 8px;
    }
    .fvopt.chk input {
      margin: 0;
    }
  `
})
class FinderViewOptions {
  readonly iconSize = input.required<WritableSignal<number>>();
  readonly gridSpacing = input.required<WritableSignal<number>>();
  readonly textSize = input.required<WritableSignal<number>>();
  readonly showExtensions = input.required<() => boolean>();
  readonly onToggleExtensions = input.required<() => void>();
  readonly onChanged = input.required<() => void>();

  protected setSize(target: WritableSignal<number>, raw: string): void {
    target.set(Number(raw));
    this.onChanged()();
  }
}
