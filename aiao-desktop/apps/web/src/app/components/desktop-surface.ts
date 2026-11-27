import { useI18n } from '@aiao/rxdb-i18n-angular';
import { DOCUMENT } from '@angular/common';
import {
  AnimationCallbackEvent,
  Component,
  DestroyRef,
  ElementRef,
  ViewEncapsulation,
  afterRenderEffect,
  computed,
  effect,
  inject,
  signal,
  viewChild
} from '@angular/core';

import { FileOperationDialog } from '../apps/finder/file-operation-dialog';
import { FinderClipboard } from '../apps/finder/finder-clipboard';
import { openWithCommands } from '../apps/finder/finder-menus';
import type { FileOperationRequest } from '../apps/finder/finder-model';
import { isPackageName } from '../disk/disk-kinds';
import { DESKTOP, DiskPath, finderPathOf, samePath } from '../disk/disk-path';
import {
  DesktopCell,
  DesktopItem,
  DesktopItems,
  DesktopSort,
  DesktopStack,
  DesktopViewOptions,
  desktopItemId,
  gridMetrics,
  rangeSelectIds
} from '../services/desktop-items';
import { DockState } from '../services/dock-state';
import { FileOpener } from '../services/file-opener';
import { FileSystem, describeDiskError } from '../services/file-system';
import { isMenuKey } from '../services/focus-order';
import { MenuEntry } from '../services/menu';
import { PopoverService } from '../services/popover';
import { Session } from '../services/session';
import { Toast } from '../services/toast';
import { WindowManager } from '../services/window-manager';
import { FileDrop } from '../shared/file-drop';
import { FileThumbnail } from '../shared/file-thumbnail';
import { clamp } from '../shared/format';
import { Icon } from '../shared/icon';
import { showInfoPanel } from './overlays/info-panel';
import { diskKindLabel, showQuickLook } from './overlays/quick-look';
import { CalendarWidget, StocksWidget, WeatherWidget } from './widgets/widgets';

/** 网格到屏幕右边缘与顶缘的留白；列宽行高由「Show View Options」换算（gridMetrics）。 */
const GRID = { padTop: 8, padRight: 12 } as const;

interface Point {
  readonly left: number;
  readonly top: number;
}

/**
 * 桌面：右上角起排的图标网格、拖动吸附、框选、右键菜单与左侧小组件。
 * 无障碍（ADESK-US-108）：每个图标是能 Tab 到的按钮（名称是文件名），空格 Quick Look，文件夹上 Enter 就地改名，
 * ⌘↓ 或 ⌘O 打开，Menu 键 / Shift+F10 弹出右键菜单；获得焦点就是选中它。桌面在 Tab 顺序里排在 Dock 之后。
 *
 * macOS 桌面行为：⌘A 全选（无前台窗口时）、Shift+点击按网格顺序连选、Shift+框选追加、多选拖到空白整组移动、
 * ⌘+拖入文件夹是移动（⌥ 才是复制）、Sort By / Clean Up / Use Stacks / Show View Options（⌘J）/ Duplicate（⌘D）/
 * Quick Look（空格）。
 */
@Component({
  selector: 'app-desktop-surface',
  imports: [Icon, FileThumbnail, CalendarWidget, WeatherWidget, StocksWidget, FileDrop, FileOperationDialog],
  templateUrl: './desktop-surface.html',
  styleUrl: './desktop-surface.scss',
  encapsulation: ViewEncapsulation.None,
  host: {
    '[style.display]': '"contents"',
    '(window:resize)': 'resize()',
    '(window:pointermove)': 'externalDragMove($event)',
    '(window:pointerup)': 'externalDragEnd()',
    '(window:pointercancel)': 'externalDragEnd()',
    '(document:keydown)': 'surfaceShortcut($event)'
  }
})
export class DesktopSurface {
  private readonly wm = inject(WindowManager);
  private readonly popover = inject(PopoverService);
  private readonly toast = inject(Toast);
  private readonly fs = inject(FileSystem);
  private readonly opener = inject(FileOpener);
  private readonly clipboard = inject(FinderClipboard);
  private readonly dock = inject(DockState);
  private readonly session = inject(Session);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private readonly root = this.document.documentElement;
  private readonly surface = viewChild.required<ElementRef<HTMLElement>>('surface');
  private readonly marqueeBox = viewChild.required<ElementRef<HTMLElement>>('marquee');
  private dockDragHover = false;
  private folderHoverTimer: ReturnType<typeof setTimeout> | null = null;
  /** 最近一次右键/键盘菜单的位置与触发方式，简介面板贴着它开、按触发方式决定焦点去向。 */
  private menuPoint: { x: number; y: number } | null = null;
  private menuKeyboard = false;
  /** Shift 连选的锚点：最近一次普通点选/全选重置。 */
  private selectionAnchor: string | null = null;

  protected readonly desktop = inject(DesktopItems);
  protected readonly i18n = useI18n();
  protected readonly desktopPath = DESKTOP;
  protected readonly fileOperation = signal<FileOperationRequest | null>(null);
  protected readonly viewport = signal<readonly [number, number]>([innerWidth, innerHeight]);
  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly renaming = signal<{ readonly id: string; readonly value: string } | null>(null);
  protected readonly renameValue = computed(() => this.renaming()?.value ?? '');
  protected readonly renameBox = signal<{ readonly left: number; readonly top: number; readonly width: number } | null>(
    null
  );
  protected readonly dragging = signal<{ readonly id: string; readonly at: Point } | null>(null);
  protected readonly settling = signal<string | null>(null);
  protected readonly movingToDirectory = signal<ReadonlySet<string>>(new Set());
  protected readonly folderHover = signal<string | null>(null);

  constructor() {
    this.destroyRef.onDestroy(() => this.clearDropTargets());
    effect(() => {
      const created = this.desktop.created();
      if (!created) return;
      this.selected.set(new Set([created]));
      this.renameBox.set(null);
      this.renaming.set({ id: created, value: created.slice('file:'.length) });
    });
    effect(() => {
      const visible = new Set(this.desktop.items().map(item => item.id));
      const moving = this.movingToDirectory();
      const stale = [...moving].filter(id => !visible.has(id));
      if (stale.length) this.clearMoving(stale);
    });
    /* 新建的文件夹要等磁盘树刷出来才有图标：图标一出现就把改名框摆到它的标签上并全选名字。 */
    afterRenderEffect(() => {
      this.desktop.items();
      const renaming = this.renaming();
      if (!renaming) return;
      if (!this.renameBox()) this.updateRenameBox(renaming.id);
      const input = this.surface().nativeElement.querySelector<HTMLInputElement>('[data-rename-input]');
      if (!input || input === this.document.activeElement) return;
      input.focus();
      input.select();
      input.scrollLeft = 0;
    });
    /* 视图选项写成 #desktop 上的 CSS 变量，图标块、画布与标签的尺寸跟着变。 */
    afterRenderEffect(() => {
      const grid = gridMetrics(this.desktop.viewOptions());
      const style = this.surface().nativeElement.style;
      style.setProperty('--di-tile', `${grid.tile}px`);
      style.setProperty('--di-art', `${grid.art}px`);
      style.setProperty('--di-font', `${grid.font}px`);
      style.setProperty('--di-line', `${grid.line}px`);
    });
  }

  protected resize(): void {
    this.viewport.set([innerWidth, innerHeight]);
  }

  protected externalDragMove(event: PointerEvent): void {
    if (!this.document.querySelector('.cdk-drag-dragging')) return;
    this.updateFolderHover(event.clientX, event.clientY, '');
  }

  protected externalDragEnd(): void {
    this.clearDropTargets();
  }

  protected position(item: DesktopItem): Point {
    const drag = this.dragging();
    if (drag?.id === item.id) return drag.at;
    const [width] = this.viewport();
    const grid = this.grid();
    return {
      left: width - GRID.padRight - (item.cell[0] + 1) * grid.w,
      top: this.menubarHeight() + GRID.padTop + item.cell[1] * grid.h
    };
  }

  /** 叠的格子换算成屏幕坐标（Use Stacks 时图标不画，叠替它们占网格）。 */
  protected stackPosition(stack: DesktopStack): Point {
    const [width] = this.viewport();
    const grid = this.grid();
    return {
      left: width - GRID.padRight - (stack.cell[0] + 1) * grid.w,
      top: this.menubarHeight() + GRID.padTop + stack.cell[1] * grid.h
    };
  }

  protected grab(event: PointerEvent, item: DesktopItem): void {
    if (event.button !== 0) return;
    const { ids: selected, toggleOnClick, collapseOnClick } = this.prepareDragSelection(event, item);
    const node = event.currentTarget as HTMLElement;
    const origin = this.position(item);
    const sx = event.clientX;
    const sy = event.clientY;
    let moved = false;
    node.setPointerCapture(event.pointerId);
    const move = (ev: PointerEvent): void => {
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      if (!moved && Math.hypot(dx, dy) < 3) return;
      if (!moved) this.settling.set(null);
      moved = true;
      this.updateFolderHover(ev.clientX, ev.clientY, item.id);
      this.dragging.set({
        id: item.id,
        at: { left: origin.left + dx, top: clamp(origin.top + dy, 22, innerHeight - 120) }
      });
    };
    const up = (release: PointerEvent): void => {
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      node.removeEventListener('pointercancel', cancel);
      const drop = this.dragging();
      const folderId = this.folderHover();
      const finderDirectory = this.finderDropDirectory(release.clientX, release.clientY);
      const trash = this.dock.trashDropActive();
      this.clearDropTargets();
      if (!moved || !drop) {
        if (toggleOnClick) {
          const next = new Set(this.selected());
          next.delete(item.id);
          this.selected.set(next);
        } else if (collapseOnClick) this.select(item.id);
        return;
      }
      if (trash) {
        this.dragging.set(null);
        this.trashItems(selected);
        return;
      }
      const folder = this.desktop.items().find(other => other.id === folderId);
      const directory = folder?.node?.kind === 'folder' && folder.node.path ? folder.node.path : finderDirectory;
      if (directory) {
        /* macOS：⌥ 是复制；⌘ 与无修饰符一样是移动（⌘+拖=强制移动）。 */
        const copy = release.altKey;
        const movingItems = copy ? [] : this.movableItems(selected);
        const movingIds = movingItems.map(item => item.id);
        if (movingIds.length) this.movingToDirectory.update(current => new Set([...current, ...movingIds]));
        this.dragging.set(null);
        void this.desktop.transferToDirectory(selected, directory, copy).then(
          targets => {
            if (!copy) this.select(null);

            const unchanged = movingItems
              .filter((item, index) => {
                const source = item.node?.path;
                const target = targets[index];
                return Boolean(source && target && samePath(source, target));
              })
              .map(item => item.id);
            this.clearMoving(unchanged);
          },
          (error: unknown) => {
            this.clearMoving(movingIds);
            this.toast.show(error instanceof Error ? error.message : String(error));
          }
        );
        return;
      }
      this.dragging.set(null);
      /* 落到空白：多选时按与抓取图标的相对偏移整组移动，只有抓取图标一个时保持原吸附行为。 */
      const movedItems = this.movableItems(selected);
      const grabbed = movedItems.find(entry => entry.id === item.id);
      if (grabbed && movedItems.length > 1) {
        const target = this.cellAt(drop.at);
        const delta: DesktopCell = [target[0] - grabbed.cell[0], target[1] - grabbed.cell[1]];
        this.desktop.moveMany(
          [item.id, ...movedItems.filter(entry => entry.id !== item.id).map(entry => entry.id)],
          delta
        );
      } else {
        this.desktop.move(item.id, this.freeCell(item, this.cellAt(drop.at)));
      }
      this.settle(item.id);
    };
    const cancel = (): void => {
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      node.removeEventListener('pointercancel', cancel);
      this.dragging.set(null);
      this.clearDropTargets();
    };
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', cancel);
  }

  protected iconMenu(event: MouseEvent, item: DesktopItem): void {
    if (!this.selected().has(item.id)) this.select(item.id);
    this.menuPoint = { x: event.clientX, y: event.clientY };
    this.menuKeyboard = false;
    this.popover.contextMenu(event, this.iconItems(item), item.name);
  }

  /** 聚焦在图标上按 Menu 键或 Shift+F10：弹出同一份菜单，焦点交给第一项，关闭后回到图标。 */
  protected iconKey(event: KeyboardEvent, item: DesktopItem): void {
    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && (event.key === 'Backspace' || event.key === 'Delete')) {
      event.preventDefault();
      if (!event.repeat) this.trash(item);
      return;
    }
    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey) {
      if (event.key === 'ArrowDown' || event.key.toLowerCase() === 'o') {
        event.preventDefault();
        item.open();
        return;
      }
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (item.node?.kind === 'folder') this.startRename(item);
      else item.open();
      return;
    }
    if (!isMenuKey(event)) return;
    event.preventDefault();
    const anchor = event.currentTarget as HTMLElement;
    const rect = anchor.getBoundingClientRect();
    this.menuPoint = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    this.menuKeyboard = true;
    this.popover.openMenu(this.iconItems(item), {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      origin: 'top left',
      focus: true,
      label: item.name,
      onClose: () => anchor.focus()
    });
  }

  /** 空格打开 Quick Look（`role="button"` 的约定）。 */
  protected quickLookByKey(event: Event, item: DesktopItem): void {
    event.preventDefault();
    this.quickLook(item);
  }

  /** 叠的点击与按键：弹出成员列表，成员可以打开。 */
  protected openStack(event: MouseEvent, stack: DesktopStack): void {
    this.stackMenu(stack, null, { left: event.clientX, top: event.clientY });
  }

  /** 空格打开叠的成员列表，焦点交给菜单。 */
  protected openStackByKey(event: Event, stack: DesktopStack): void {
    event.preventDefault();
    this.stackMenu(stack, event.currentTarget as HTMLElement);
  }

  /** 叠上的按键：Enter 或 Menu 键（Shift+F10）打开成员列表。 */
  protected stackKey(event: KeyboardEvent, stack: DesktopStack): void {
    if (event.key !== 'Enter' && !isMenuKey(event)) return;
    event.preventDefault();
    this.stackMenu(stack, event.currentTarget as HTMLElement);
  }

  protected stackLabel(stack: DesktopStack): string {
    const count = stack.ids.length;
    const kind = diskKindLabel(this.i18n.t, stack.kind);
    return this.i18n.t(count === 1 ? 'shell.desktop.stackSingular' : 'shell.desktop.stackPlural', { kind, count });
  }

  protected stackIcon(stack: DesktopStack): string {
    return this.desktop.items().find(item => item.id === stack.ids[0])?.icon ?? 'f-folder';
  }

  protected startRename(item: DesktopItem): void {
    if (!item.node?.path || !item.id.startsWith('file:')) return;
    this.select(item.id);
    this.renameBox.set(null);
    this.renaming.set({ id: item.id, value: item.node.name });
    this.updateRenameBox(item.id);
  }

  protected updateRename(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.renaming.update(current => (current ? { ...current, value } : null));
  }

  /** 改名输入框里的按键：Enter 提交、Esc 取消；其余按键留给输入框，不交给桌面。 */
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

  /** 改名输入框失焦即提交（像 Finder），但不把焦点抢回来。 */
  protected blurRename(): void {
    this.commitRename(false);
  }

  protected select(id: string | null): void {
    this.selected.set(new Set(id ? [id] : []));
    this.selectionAnchor = id;
  }

  /** ⌘A：选中桌面上的全部图标（含 Macintosh HD），并重置连选锚点。 */
  protected selectAll(): void {
    this.selectionAnchor = null;
    this.selected.set(new Set(this.desktop.items().map(item => item.id)));
  }

  protected focusItem(id: string): void {
    if (this.selected().size === 0) this.select(id);
  }

  /** 活查询确认是丢进废纸篓才退场；不再靠写盘 Promise 的时序清掉淡出样式。 */
  protected leaveIcon(event: AnimationCallbackEvent, item: DesktopItem): void {
    if (!this.desktop.isTrashed(item) || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      event.animationComplete();
      return;
    }
    const icon = event.target as HTMLElement;
    icon.inert = true;
    const animation = icon.animate(
      [
        { opacity: 1, scale: '1' },
        { opacity: 0, scale: '.4' }
      ],
      {
        duration: 220,
        easing: 'ease-in-out',
        fill: 'forwards'
      }
    );
    void animation.finished.then(event.animationComplete, event.animationComplete);
  }

  /** 空白处按下：取消选择并开始框选；Shift+按下保留现有选择，框到的做并集。 */
  protected pressSurface(event: PointerEvent): void {
    if ((event.target as Element).closest('.dicon, .wgt, input') || event.button !== 0) return;
    if (!event.shiftKey) this.select(null);
    this.marquee(event);
  }

  protected surfaceMenu(event: MouseEvent): void {
    if ((event.target as Element).closest('.dicon, .wgt, input')) return;
    this.menuPoint = { x: event.clientX, y: event.clientY };
    this.menuKeyboard = false;
    this.popover.contextMenu(event, [
      { id: 'nf', label: this.i18n.t('shell.menu.newFolder'), run: () => this.desktop.newFolder() },
      {
        id: 'ps',
        label: this.i18n.t('shell.desktop.pasteItem'),
        key: '⌘V',
        disabled: !this.clipboard.snapshot(),
        run: () => this.desktop.paste()
      },
      { id: 'gi', label: this.i18n.t('shell.menu.getInfo'), run: () => this.showDesktopInfo() },
      '-',
      {
        id: 'cw',
        label: this.i18n.t('shell.desktop.changeWallpaper'),
        run: () => this.wm.open('settings', { section: 'wallpaper' })
      },
      {
        id: 'ew',
        label: this.i18n.t('shell.desktop.editWidgets'),
        run: () => this.toast.show('shell.toast.widgetsOnDesktop')
      },
      '-',
      {
        id: 'st',
        label: this.i18n.t('shell.desktop.useStacks'),
        key: '⌃⌘0',
        checked: this.desktop.stacksEnabled(),
        run: () => this.desktop.toggleStacks()
      },
      { id: 'sb', label: this.i18n.t('shell.desktop.sortBy'), submenu: this.sortSubmenu() },
      { id: 'cu', label: this.i18n.t('shell.desktop.cleanUp'), run: () => this.desktop.cleanUp() },
      { id: 'cub', label: this.i18n.t('shell.desktop.cleanUpBy'), submenu: this.cleanUpSubmenu() },
      {
        id: 'vo',
        label: this.i18n.t('shell.menu.showViewOptions'),
        key: '⌘J',
        run: () => this.openViewOptions()
      }
    ]);
  }

  protected finishFileOperation(): void {
    this.fileOperation.set(null);
  }

  /**
   * 桌面没有前台窗口时兜底接住菜单里没有桌面行为的快捷键：⌘A 全选、⌘J 视图选项、
   * ⌘D 复制、⌃⌘0 叠放。有前台窗口时这些组合归窗口自己的菜单。
   */
  protected surfaceShortcut(event: KeyboardEvent): void {
    if (this.session.locked() || this.session.boot() || this.session.sleep() !== 'awake') return;
    if (event.target instanceof Element && event.target.closest('input, textarea, [contenteditable]')) return;
    if (!event.metaKey && !event.ctrlKey) return;
    if (event.altKey || event.shiftKey) return;
    if (this.wm.front()) return;
    const key = event.key.toLowerCase();
    if (key === 'a') {
      event.preventDefault();
      if (!event.repeat) this.selectAll();
      return;
    }
    if (key === 'j') {
      event.preventDefault();
      if (!event.repeat) this.openViewOptions();
      return;
    }
    if (key === 'd') {
      event.preventDefault();
      if (!event.repeat) this.duplicateSelection(this.currentSelectionItems());
      return;
    }
    if (key === '0' && event.metaKey && event.ctrlKey) {
      event.preventDefault();
      if (!event.repeat) this.desktop.toggleStacks();
    }
  }

  private iconItems(item: DesktopItem): MenuEntry[] {
    const node = item.node;
    return [
      { id: 'o', label: this.i18n.t('shell.dock.open'), run: () => item.open() },
      {
        id: 'w',
        label: this.i18n.t('shell.desktop.openWith'),
        disabled: !node || node.kind !== 'file' || isPackageName(node.name),
        submenu:
          node && node.kind === 'file' && !isPackageName(node.name) ?
            openWithCommands(
              this.opener.choices(node),
              appId => this.opener.openApp(appId, node),
              () => {
                if (node.path) this.fileOperation.set({ kind: 'open-with', node });
              },
              this.i18n.t
            )
          : undefined
      },
      '-',
      {
        id: 'i',
        label: this.i18n.t('shell.menu.getInfo'),
        key: '⌘I',
        run: () => {
          if (!node) {
            this.toast.show(this.info(item));
            return;
          }
          const { menuPoint, menuKeyboard } = this;
          this.menuPoint = null;
          this.menuKeyboard = false;
          showInfoPanel(this.popover, node, menuPoint ?? undefined, menuKeyboard);
        }
      },
      {
        id: 'r',
        label: this.i18n.t('shell.desktop.rename'),
        disabled: !item.id.startsWith('file:'),
        run: () => this.startRename(item)
      },
      { id: 'd', label: this.i18n.t('shell.desktop.duplicate'), key: '⌘D', run: () => this.duplicateFromItem(item) },
      '-',
      { id: 't', label: this.i18n.t('shell.menu.moveToTrash'), key: '⌘⌫', run: () => this.trash(item) },
      '-',
      { id: 'q', label: this.i18n.t('shell.desktop.quickLook'), key: '␣', run: () => this.quickLook(item) }
    ];
  }

  /** Sort By 子菜单：勾出当前依据，None 回到手动排布。 */
  private sortSubmenu(): readonly MenuEntry[] {
    const current = this.desktop.sortCriteria();
    const entry = (id: string, label: string, criteria: DesktopSort | null): MenuEntry => ({
      id,
      label,
      checked: current === criteria,
      run: () => this.desktop.sortBy(criteria)
    });
    return [
      entry('sb-none', this.i18n.t('shell.desktop.none'), null),
      entry('sb-name', this.i18n.t('shell.desktop.name'), 'name'),
      entry('sb-kind', this.i18n.t('shell.desktop.kind'), 'kind'),
      entry('sb-date', this.i18n.t('shell.desktop.dateModified'), 'date'),
      entry('sb-size', this.i18n.t('shell.desktop.size'), 'size')
    ];
  }

  /** Clean Up By 子菜单：先按依据排序再紧凑重排。 */
  private cleanUpSubmenu(): readonly MenuEntry[] {
    return [
      { id: 'cu-name', label: this.i18n.t('shell.desktop.name'), run: () => this.desktop.cleanUp('name') },
      { id: 'cu-kind', label: this.i18n.t('shell.desktop.kind'), run: () => this.desktop.cleanUp('kind') },
      {
        id: 'cu-date',
        label: this.i18n.t('shell.desktop.dateModified'),
        run: () => this.desktop.cleanUp('date')
      },
      { id: 'cu-size', label: this.i18n.t('shell.desktop.size'), run: () => this.desktop.cleanUp('size') }
    ];
  }

  /** Show View Options（⌘J）：图标大小、网格间距、文字大小三组选项。 */
  private openViewOptions(): void {
    const point = this.menuPoint ?? { x: Math.round(innerWidth / 2), y: Math.round(innerHeight / 2) };
    this.menuPoint = null;
    this.menuKeyboard = false;
    const options = this.desktop.viewOptions();
    const pick = <K extends keyof DesktopViewOptions>(
      key: K,
      value: DesktopViewOptions[K],
      label: string
    ): MenuEntry => ({
      id: `vo-${key}-${value}`,
      label,
      checked: options[key] === value,
      run: () => this.desktop.setViewOption(key, value)
    });
    this.popover.openMenu(
      [
        {
          id: 'vo-size',
          label: this.i18n.t('shell.desktop.iconSize'),
          submenu: [
            pick('iconSize', 'small', this.i18n.t('shell.desktop.small')),
            pick('iconSize', 'medium', this.i18n.t('shell.desktop.medium')),
            pick('iconSize', 'large', this.i18n.t('shell.desktop.large'))
          ]
        },
        {
          id: 'vo-space',
          label: this.i18n.t('shell.desktop.gridSpacing'),
          submenu: [
            pick('gridSpacing', 'compact', this.i18n.t('shell.desktop.compact')),
            pick('gridSpacing', 'default', this.i18n.t('shell.desktop.default')),
            pick('gridSpacing', 'wide', this.i18n.t('shell.desktop.wide'))
          ]
        },
        {
          id: 'vo-text',
          label: this.i18n.t('shell.desktop.textSize'),
          submenu: [
            pick('textSize', 'small', this.i18n.t('shell.desktop.small')),
            pick('textSize', 'medium', this.i18n.t('shell.desktop.medium')),
            pick('textSize', 'large', this.i18n.t('shell.desktop.large'))
          ]
        }
      ],
      { x: point.x, y: point.y, origin: 'top left', label: this.i18n.t('shell.desktop.viewOptions') }
    );
  }

  /** Duplicate：右键的图标在选中集里就复制整组，否则只复制它。 */
  private duplicateFromItem(item: DesktopItem): void {
    const selected = this.selected();
    const items = selected.has(item.id) ? this.currentSelectionItems() : [item];
    this.duplicateSelection(items);
  }

  /** 逐个复制到桌面（fs.duplicate），完成后选中新条目。 */
  private duplicateSelection(items: readonly DesktopItem[]): void {
    const sources = items.flatMap(item => (item.node?.path ? [item.node.path] : []));
    if (!sources.length) return;
    void Promise.all(sources.map(path => this.fs.duplicate(path))).then(
      targets => this.selected.set(new Set(targets.map(path => desktopItemId(path.at(-1) ?? '')))),
      (error: unknown) => this.toast.show(describeDiskError(error))
    );
  }

  /** Quick Look：预览选中图标；空格与右键菜单共用，方向键在桌面条目之间切换。 */
  private quickLook(item: DesktopItem): void {
    const node = item.node;
    if (!node) {
      item.open();
      return;
    }
    const siblings = this.desktop.items().flatMap(entry => (entry.node && entry.node.path?.length ? [entry.node] : []));
    showQuickLook(this.popover, node, siblings);
  }

  private marquee(event: PointerEvent): void {
    const box = this.marqueeBox().nativeElement;
    const sx = event.clientX;
    const sy = event.clientY;
    /* Shift+框选：以按下时的选择为基准做并集，不替换。 */
    const base = event.shiftKey ? new Set(this.selected()) : null;
    let live = false;
    const move = (ev: PointerEvent): void => {
      if (!live && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
      live = true;
      const left = Math.min(sx, ev.clientX);
      const top = Math.min(sy, ev.clientY);
      const width = Math.abs(ev.clientX - sx);
      const height = Math.abs(ev.clientY - sy);
      Object.assign(box.style, {
        display: 'block',
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`
      });
      this.selectWithin(left, top, left + width, top + height, base);
    };
    const up = (): void => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      box.style.display = 'none';
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  }

  private selectWithin(
    left: number,
    top: number,
    right: number,
    bottom: number,
    base: ReadonlySet<string> | null
  ): void {
    const icons = [...this.surface().nativeElement.querySelectorAll<HTMLElement>('.dicon[data-id]')];
    const hit = icons.filter(icon => {
      const rect = icon.getBoundingClientRect();
      return !(rect.right < left || rect.left > right || rect.bottom < top || rect.top > bottom);
    });
    const ids = new Set(hit.map(icon => icon.dataset['id'] ?? ''));
    this.selected.set(base ? new Set([...base, ...ids]) : ids);
  }

  /** 叠的成员列表：锚定在叠上（键盘）或指针处（鼠标），成员点击即打开。 */
  private stackMenu(stack: DesktopStack, anchor: HTMLElement | null, point: Point | null = null): void {
    const members = stack.ids.flatMap(id => {
      const item = this.desktop.items().find(entry => entry.id === id);
      return item ? [{ id: `open-${id}`, label: item.name, icon: item.icon, run: () => item.open() }] : [];
    });
    if (anchor)
      this.popover.menuUnder(anchor, members, { keyboard: true, label: diskKindLabel(this.i18n.t, stack.kind) });
    else if (point)
      this.popover.openMenu(members, {
        x: point.left,
        y: point.top,
        origin: 'top left',
        label: diskKindLabel(this.i18n.t, stack.kind)
      });
  }

  private info(item: DesktopItem): string {
    const node = item.node;
    if (!node) return item.name;
    return node.kind === 'folder' ?
        this.i18n.t('shell.desktop.infoFolder', { name: node.name })
      : this.i18n.t('shell.desktop.infoFile', {
          name: node.name,
          kind: diskKindLabel(this.i18n.t, node.k),
          size: node.size
        });
  }

  private showDesktopInfo(): void {
    const node = this.fs.get(finderPathOf(DESKTOP));
    if (!node) return;
    const point = this.menuPoint;
    this.menuPoint = null;
    this.menuKeyboard = false;
    showInfoPanel(this.popover, node, point ?? undefined);
  }

  private commitRename(restore = true): void {
    const editing = this.renaming();
    if (!editing) return;
    const item = this.desktop.items().find(entry => entry.id === editing.id);
    this.renaming.set(null);
    this.renameBox.set(null);
    const name = editing.value.trim();
    if (!item?.node?.path || !name || name === item.node.name) {
      if (restore) this.focusIcon(editing.id);
      return;
    }
    this.desktop.rename(item, name).then(
      path => {
        const id = desktopItemId(path.at(-1) ?? name);
        this.selected.set(new Set([id]));
        if (restore) this.focusIcon(id);
      },
      (error: unknown) => {
        this.toast.show(describeDiskError(error));
        if (restore) this.renaming.set({ ...editing });
      }
    );
  }

  private cancelRename(): void {
    const editing = this.renaming();
    if (!editing) return;
    this.renaming.set(null);
    this.renameBox.set(null);
    this.focusIcon(editing.id);
  }

  /** 改名输入框摆到图标标签的位置上（桌面坐标）。 */
  private updateRenameBox(id: string): void {
    const label = this.surface().nativeElement.querySelector<HTMLElement>(`.dicon[data-id="${CSS.escape(id)}"] .lbl`);
    if (!label) return;
    const surface = this.surface().nativeElement.getBoundingClientRect();
    const rect = label.getBoundingClientRect();
    const width = 112;
    this.renameBox.set({
      left: rect.left - surface.left + rect.width / 2 - width / 2,
      top: rect.top - surface.top,
      width
    });
  }

  /** 改名结束后焦点回到图标；改名成功时新图标要等磁盘树刷出来，所以连续几帧里找。 */
  private focusIcon(id: string, left = 20): void {
    const icon = this.surface().nativeElement.querySelector<HTMLElement>(`.dicon[data-id="${CSS.escape(id)}"]`);
    if (icon) {
      icon.focus();
      return;
    }
    if (left > 0) requestAnimationFrame(() => this.focusIcon(id, left - 1));
  }

  private trash(item: DesktopItem): void {
    const selected = this.selected();
    this.trashItems(selected.has(item.id) ? [...selected] : [item.id]);
  }

  private trashItems(ids: readonly string[]): void {
    this.surface().nativeElement.focus();
    void this.desktop.remove(ids).then(removed => {
      if (!removed) return;
      const removedIds = new Set(ids);
      this.selected.update(selected => new Set([...selected].filter(id => !removedIds.has(id))));
    });
  }

  private settle(id: string): void {
    this.settling.set(id);
    setTimeout(() => {
      if (this.settling() === id) this.settling.set(null);
    }, 300);
  }

  private movableItems(ids: readonly string[]): readonly DesktopItem[] {
    const selected = new Set(ids);
    return this.desktop.items().filter(item => selected.has(item.id) && Boolean(item.node?.path?.length));
  }

  private currentSelectionItems(): readonly DesktopItem[] {
    const selected = this.selected();
    return this.desktop.items().filter(item => selected.has(item.id));
  }

  private clearMoving(ids: readonly string[]): void {
    if (!ids.length) return;
    this.movingToDirectory.update(current => new Set([...current].filter(id => !ids.includes(id))));
  }

  private prepareDragSelection(
    event: PointerEvent,
    item: DesktopItem
  ): { readonly ids: readonly string[]; readonly toggleOnClick: boolean; readonly collapseOnClick: boolean } {
    const current = this.selected();
    if (event.metaKey || event.ctrlKey) {
      if (current.has(item.id)) return { ids: [...current], toggleOnClick: true, collapseOnClick: false };
      const next = new Set(current).add(item.id);
      this.selected.set(next);
      return { ids: [...next], toggleOnClick: false, collapseOnClick: false };
    }
    /* Shift+点击：按网格顺序从上次的锚点连选到点击的图标（Finder 图标视图的行为）。 */
    if (event.shiftKey && this.selectionAnchor && this.selectionAnchor !== item.id) {
      const range = rangeSelectIds(this.desktop.items(), this.selectionAnchor, item.id);
      if (range.length > 1) {
        this.selected.set(new Set(range));
        return { ids: [...range], toggleOnClick: false, collapseOnClick: false };
      }
    }
    if (current.has(item.id)) return { ids: [...current], toggleOnClick: false, collapseOnClick: current.size > 1 };
    this.select(item.id);
    return { ids: [...this.selected()], toggleOnClick: false, collapseOnClick: false };
  }

  private finderDropDirectory(x: number, y: number): DiskPath | null {
    const encoded = this.document
      .elementsFromPoint(x, y)
      .map(element => element.closest<HTMLElement>('[data-drop-directory]')?.dataset['dropDirectory'])
      .find(Boolean);
    return encoded ? encoded.split('/') : null;
  }

  private updateFolderHover(x: number, y: number, sourceId: string): void {
    const overDock = this.dock.isDockAt(x, y);
    this.dock.setPointerX(overDock ? x : null);
    this.dockDragHover = overDock;
    if (this.dock.isTrashAt(x, y)) {
      this.clearFolderHover();
      this.dock.setTrashDropActive(true);
      return;
    }
    this.dock.setTrashDropActive(false);
    const folder = this.document
      .elementsFromPoint(x, y)
      .map(element => element.closest<HTMLElement>('.dicon[data-id]')?.dataset['id'])
      .map(id => (id ? this.desktop.items().find(item => item.id === id) : undefined))
      .find(item => item?.id !== sourceId && item?.node?.kind === 'folder');
    const next = folder?.id ?? null;
    if (next === this.folderHover()) return;
    this.clearFolderHover();
    if (!next) return;
    this.folderHover.set(next);
    this.folderHoverTimer = setTimeout(() => {
      this.folderHoverTimer = null;
      if (this.folderHover() !== next) return;
      this.desktop
        .items()
        .find(item => item.id === next)
        ?.open();
    }, 700);
  }

  private clearFolderHover(): void {
    if (this.folderHoverTimer !== null) {
      clearTimeout(this.folderHoverTimer);
      this.folderHoverTimer = null;
    }
    this.folderHover.set(null);
  }

  private clearDropTargets(): void {
    this.clearFolderHover();
    if (this.dockDragHover) this.dock.setPointerX(null);
    this.dockDragHover = false;
    this.dock.setTrashDropActive(false);
  }

  private cellAt(point: Point): [number, number] {
    const mb = this.menubarHeight();
    const grid = this.grid();
    const col = Math.round((innerWidth - GRID.padRight - grid.w - point.left) / grid.w);
    const row = Math.round((point.top - mb - GRID.padTop) / grid.h);
    const maxRow = Math.floor((innerHeight - mb - GRID.padTop - 110) / grid.h);
    return [clamp(col, 0, Math.floor(innerWidth / grid.w) - 2), clamp(row, 0, Math.max(0, maxRow))];
  }

  /** 目标格被占时顺着列往下让开。 */
  private freeCell(item: DesktopItem, [startCol, startRow]: [number, number]): [number, number] {
    let col = startCol;
    let row = startRow;
    const taken = (): boolean =>
      this.desktop.items().some(other => other !== item && other.cell[0] === col && other.cell[1] === row);
    for (let guard = 0; taken() && guard < 40; guard++) {
      row++;
      if (row > 5) {
        row = 0;
        col++;
      }
    }
    return [col, row];
  }

  /** 视图选项换算成网格尺寸；位置与吸附都用它。 */
  private grid(): { readonly w: number; readonly h: number } {
    const { w, h } = gridMetrics(this.desktop.viewOptions());
    return { w, h };
  }

  private menubarHeight(): number {
    return parseInt(getComputedStyle(this.root).getPropertyValue('--mb-h'), 10);
  }
}
