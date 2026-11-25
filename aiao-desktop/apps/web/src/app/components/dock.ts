import { DOCUMENT } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  ViewEncapsulation,
  afterRenderEffect,
  computed,
  effect,
  inject,
  signal,
  viewChild,
  viewChildren
} from '@angular/core';
import { ApplicationRegistry } from '../services/application-registry';
import { EmptyTrashDialog } from './empty-trash-dialog';

import { finderDragPaths } from '../apps/finder/finder-drag-registry';
import { DiskPath, HOME } from '../disk/disk-path';
import { AppLauncher } from '../services/app-launcher';
import { Clock } from '../services/clock';
import { DesktopAppDefinition, DesktopAppId } from '../services/desktop-apps';
import { DockDragController, DockDropTarget } from '../services/dock-drag';
import { DockLayoutStore } from '../services/dock-layout';
import {
  DockDisplayItem,
  DockPanelRect,
  dockAxisOrigin,
  dockAxisPoint,
  dockIconCenter,
  dockSlots,
  insertMinimizedTiles,
  nearDockEdge,
  slotIndexAt,
  temporaryApps,
  withinDock
} from '../services/dock-layout-model';
import { DockRect, DockState, DockView } from '../services/dock-state';
import { FileImport } from '../services/file-import';
import { FileOpener } from '../services/file-opener';
import { FileSystem, describeDiskError } from '../services/file-system';
import { barIndex, isMenuKey } from '../services/focus-order';
import { MenuEntry } from '../services/menu';
import { PopoverService } from '../services/popover';
import { SystemState } from '../services/system-state';
import { Toast } from '../services/toast';
import { WindowManager } from '../services/window-manager';
import { fileTransfer } from '../shared/file-drop';
import { DAYS3, clamp } from '../shared/format';
import { Icon } from '../shared/icon';

/** 屏幕上的一格：应用图标（固定项、临时项或最小化窗口的 tile），或分隔线（`app` 为 `null`）。 */
interface DockSlot {
  readonly key: string;
  readonly app: DesktopAppDefinition | null;
  /** 本标签页正在运行、但没有固定的应用：接在固定项之后，退出后消失。 */
  readonly temporary: boolean;
  /** 固定在应用区的图标可以拖动调整顺序；临时项、最小化窗口 tile 和尾部区（废纸篓）不行。 */
  readonly draggable: boolean;
  /** 最小化窗口 tile 的窗口 id；普通应用图标没有。 */
  readonly windowId?: string;
  /** 最小化窗口 tile 的标题（跟随窗口标题变化）。 */
  readonly title?: string;
}

/** 一格的几何与放大状态，按格子的 key 保存：增减格子时其余格子的状态不丢。 */
interface SlotGeometry {
  /** 静止布局下的中心（相对 Dock 左缘）。 */
  base: number;
  width: number;
  /** 放大后实际排布的中心。 */
  laidCenter: number;
  scale: number;
  target: number;
}

/** 参与排布的一格；`index` 是它在 `slots()` 里的下标（也就是 DOM 节点的下标）。 */
interface ArrangedSlot {
  readonly slot: DockSlot;
  readonly index: number;
}

/** 静止布局：每格的中心与宽度，以及 Dock 的总宽。 */
interface RestLayout {
  readonly placed: readonly { readonly arranged: ArrangedSlot | null; readonly base: number; readonly width: number }[];
  readonly total: number;
}

/** 窄屏上 Dock 缩小到的最小图标尺寸（像素）：再小就点不准了，放不下的话 Dock 的两端会超出屏幕。 */
const MIN_DOCK_SIZE = 22;
/** Dock 与屏幕边缘的最小间距。 */
const DOCK_SIDE_MARGIN = 8;
/** 自动隐藏：指针离开 Dock 后多久滑回（毫秒）。 */
const AUTO_HIDE_DELAY_MS = 600;
/** 自动隐藏：贴住屏幕所在边多少像素内算「贴近」触发滑出。 */
const AUTO_HIDE_EDGE_PX = 4;
/** 普通尺寸保持原有间距，只有压到最小尺寸时才收紧窄屏布局。 */
const gapOf = (size: number): number => (size <= MIN_DOCK_SIZE ? 0 : Math.round(size * 0.095));
const padOf = (size: number): number => (size <= MIN_DOCK_SIZE ? 2 : Math.round(size * 0.15));

/**
 * Dock：一个 rAF 循环驱动的抛物线放大，外加弹跳、运行指示和右键菜单。
 * 格子由固定布局（`DockLayoutStore`）加上本标签页正在运行的未固定应用动态生成；
 * 图标可以拖动调整顺序、拖出取消固定，Launchpad 与 Finder 的图标可以拖进来固定（`DockDragController`）。
 */
@Component({
  selector: 'app-dock',
  imports: [Icon, EmptyTrashDialog],
  templateUrl: './dock.html',
  styleUrl: './dock.scss',
  encapsulation: ViewEncapsulation.None,
  host: {
    '[style.display]': '"contents"',
    '(window:resize)': 'measure()',
    '(window:pointerup)': 'release()'
  }
})
export class Dock implements DockView, DockDropTarget {
  private readonly apps = inject(ApplicationRegistry).apps;
  private readonly system = inject(SystemState);
  private readonly wm = inject(WindowManager);
  private readonly popover = inject(PopoverService);
  private readonly toast = inject(Toast);
  private readonly layout = inject(DockLayoutStore);
  private readonly clock = inject(Clock);
  private readonly document = inject(DOCUMENT);
  private readonly root = this.document.documentElement;
  private readonly dock = viewChild.required<ElementRef<HTMLElement>>('dock');
  private readonly tip = viewChild.required<ElementRef<HTMLElement>>('tip');
  private readonly slotElements = viewChildren<ElementRef<HTMLElement>>('slotEl');
  private readonly geometry = new Map<string, SlotGeometry>();
  /** 弹跳时图标还没出现（比如刚打开的未固定应用）：等它的格子渲染出来再弹。 */
  private readonly pendingBounce = new Set<string>();
  private gap = 5;
  private padX = 8;
  /** 实际的图标尺寸：设置里的尺寸，视口太窄放不下整条 Dock 时按比例缩小。 */
  private size = this.system.dockSize();
  private readonly spread = 2.9;
  private baseWidth = 0;
  /** 指针在 Dock 布局主轴上的坐标（屏幕 x 或换算后的 y），`null` 表示不在 Dock 上。 */
  private pointerLocal: number | null = null;
  private looping = false;
  private pressed: HTMLElement | null = null;
  /** 键盘操作改变了格子（固定、取消固定）之后，渲染完把焦点还给这个图标。 */
  private refocus: string | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private edgeListener: ((event: PointerEvent) => void) | null = null;
  protected readonly launcher = inject(AppLauncher);
  protected readonly dockState = inject(DockState);
  protected readonly drag = inject(DockDragController);
  protected readonly fs = inject(FileSystem);
  protected readonly opener = inject(FileOpener);
  protected readonly fileImport = inject(FileImport);
  protected readonly emptyTrashPrompt = signal(false);
  /** 自动隐藏：Dock 滑出屏幕外的状态；关闭自动隐藏时恒为 false。 */
  protected readonly autoHidden = signal(false);
  /** HTML5 文件拖放悬停中的 Dock 图标（高亮用）。 */
  protected readonly fileDropApp = signal<DesktopAppId | null>(null);
  protected readonly calendarDate = computed(() => {
    const now = this.clock.now();
    return `${DAYS3[now.getDay()].toUpperCase()} ${now.getDate()}`;
  });

  protected readonly running = this.wm.runningApps;
  /** 最小化、且所属应用没有被 Hide 的窗口（Hide 是收起应用，不是最小化，不产生 Dock tile）。 */
  protected readonly minimizedWindows = computed(() =>
    this.wm
      .windows()
      .filter(win => win.minimized() && !win.closing() && !this.wm.hiddenApps().has(win.appId))
      .map(win => ({ appId: win.appId, windowId: win.id, title: win.title(), order: win.zIndex() }))
  );
  protected readonly slots = computed<readonly DockSlot[]>(() => {
    const layout = this.layout.layout();
    const temporary = temporaryApps(layout, this.running(), this.apps());
    const base = dockSlots(layout, temporary);
    return insertMinimizedTiles(base, this.minimizedWindows()).map(item => this.toSlot(item));
  });
  /** 有最小化窗口 tile 时 Dock 面板加高，给标题腾出位置。 */
  protected readonly hasMinis = computed(() => this.slots().some(slot => slot.windowId !== undefined));

  constructor() {
    this.dockState.attach(this);
    this.drag.attach(this);
    afterRenderEffect(() => {
      this.system.dockSize();
      this.system.dockPosition();
      this.autoHidden();
      this.measure();
      this.releaseHover();
      this.restoreFocus();
      this.flushBounce();
    });
    effect(() => {
      if (this.system.dockAutoHide()) {
        this.attachEdgeListener();
        this.autoHidden.set(true);
      } else {
        this.detachEdgeListener();
        this.cancelHideTimer();
        this.autoHidden.set(false);
      }
    });
    this.document.addEventListener('pointerup', this.onDocumentPointerUp);
    inject(DestroyRef).onDestroy(() => {
      this.document.removeEventListener('pointerup', this.onDocumentPointerUp);
      this.detachEdgeListener();
      this.cancelHideTimer();
    });
  }

  setPointerX(clientX: number | null): void {
    if (clientX === null) {
      this.setPointerLocal(null);
      return;
    }
    /* 桌面图标拖动只给屏幕 x：左/右 Dock 没有 y 推不出主轴坐标，不放大。 */
    if (this.system.dockPosition() !== 'bottom') return;
    const rect = this.dock().nativeElement.getBoundingClientRect();
    this.setPointerLocal(dockAxisPoint(rect, clientX, 0, 'bottom'));
  }

  focusApp(appId: string): void {
    const id = appId as DesktopAppId;
    /* 固定的图标，或还有别的窗口开着的未固定应用：图标留着，直接聚焦。否则图标这一帧还在、渲染后会消失，
       等渲染完把焦点交给相邻的图标（与键盘取消固定同一个机制）。 */
    const stays = this.layout.pinned(id) || this.wm.byApp(id).length > 0;
    const key = stays ? appId : this.neighborOf(id);
    if (key === null) return;
    const node = this.nodeFor(key);
    if (stays && node) node.focus();
    else this.refocus = key;
  }

  rectFor(appId: string): DockRect {
    const size = this.size;
    const rect = this.measureDockRect();
    const slot = this.slots().find(item => item.app?.id === appId);
    const laidCenter = slot ? this.geo(slot.key).laidCenter : rect.width / 2;
    const point = dockIconCenter(rect, laidCenter, size, this.system.dockPosition());
    return { x: point.x, y: point.y, w: size, h: size };
  }

  bounce(appId: string): void {
    if (!this.system.dockAnimateOpen()) return;
    const node = this.nodeFor(appId);
    if (!node) {
      this.pendingBounce.add(appId);
      setTimeout(() => this.pendingBounce.delete(appId), 3200);
      return;
    }
    this.startBounce(node);
  }

  stopBounce(appId: string): void {
    this.pendingBounce.delete(appId);
    this.nodeFor(appId)?.classList.remove('bounce');
  }

  accepts(x: number, y: number): boolean {
    const size = this.size;
    const rect = this.dock().nativeElement.getBoundingClientRect();
    const reach = this.baseWidth / 2 + size * 0.5;
    const position = this.system.dockPosition();
    if (position === 'bottom') return Math.abs(x - (rect.left + rect.width / 2)) <= reach && y >= rect.top - size * 1.2;
    const span = Math.abs(y - (rect.top + rect.height / 2)) <= reach;
    return position === 'left' ? span && x <= rect.left + rect.width + size * 1.2 : span && x >= rect.left - size * 1.2;
  }

  /** 指针位置对应的插入槽位：以去掉被拖图标、没有空位的静止布局为准，空位不会反过来影响判断。 */
  slotAtPoint(x: number, y: number): number {
    const { placed, total } = this.restLayout(this.arrange(null), this.size);
    const rect = this.dock().nativeElement.getBoundingClientRect();
    const position = this.system.dockPosition();
    const origin = dockAxisOrigin(rect, total, position);
    const centers = placed.filter(item => item.arranged?.slot.draggable).map(item => origin + item.base);
    const point = dockAxisPoint(rect, x, y, position);
    return slotIndexAt(centers, point);
  }

  /** 只认水平 x 轴的旧接口（底部 Dock）；左/右 Dock 走 {@link slotAtPoint}。 */
  slotAt(x: number): number {
    const { placed, total } = this.restLayout(this.arrange(null), this.size);
    const rect = this.dock().nativeElement.getBoundingClientRect();
    const left = rect.left + rect.width / 2 - total / 2;
    const centers = placed.filter(item => item.arranged?.slot.draggable).map(item => left + item.base);
    return slotIndexAt(centers, x);
  }

  protected requestEmptyTrash(): void {
    if (this.fs.trashFull()) this.emptyTrashPrompt.set(true);
  }

  protected finishEmptyTrash(confirmed: boolean): void {
    this.emptyTrashPrompt.set(false);
    if (!confirmed) return;
    this.fs.emptyTrash().then(
      () => this.toast.show('Trash emptied'),
      (error: unknown) => this.toast.show(describeDiskError(error))
    );
  }

  /** 重算静止几何；窗口缩放、偏好变化和格子增减时调用。 */
  protected measure(): void {
    const flow = this.arrange(this.drag.dropSlot());
    const size = this.fitSize(flow, this.system.dockSize());
    this.size = size;
    this.root.style.setProperty('--dock-size', `${size}px`);
    this.gap = gapOf(size);
    this.padX = padOf(size);
    const { placed, total } = this.restLayout(flow, size);
    for (const { arranged, base, width } of placed) {
      if (!arranged) continue;
      Object.assign(this.geo(arranged.slot.key), { base, width });
    }
    this.baseWidth = total;
    this.paint();
  }

  protected hover(event: PointerEvent): void {
    if (this.drag.active()) return;
    this.cancelHideTimer();
    const rect = this.dock().nativeElement.getBoundingClientRect();
    this.setPointerLocal(dockAxisPoint(rect, event.clientX, event.clientY, this.system.dockPosition()));
  }

  protected leave(): void {
    this.setPointerLocal(null);
    if (this.system.dockAutoHide()) this.scheduleHide();
  }

  protected press(event: PointerEvent, slot: DockSlot): void {
    if (event.button !== 0 || !slot.app) return;
    this.pressed = event.currentTarget as HTMLElement;
    this.pressed.classList.add('press');
    if (slot.draggable) this.drag.beginFromDock(event, slot.app.id);
  }

  protected release(): void {
    this.pressed?.classList.remove('press');
    this.pressed = null;
  }

  /** 点击或空格激活一格：最小化窗口 tile 是还原窗口，其余是打开应用（`role="button"` 的约定）。 */
  protected activateSlot(slot: DockSlot): void {
    if (slot.windowId !== undefined) this.wm.unminimize(slot.windowId);
    else if (slot.app) this.launcher.activate(slot.app.id);
  }

  protected activateByKey(event: Event, slot: DockSlot): void {
    event.preventDefault();
    this.activateSlot(slot);
  }

  protected iconMenu(event: MouseEvent, appId: DesktopAppId): void {
    this.popover.contextMenu(event, this.menuFor(appId, false), this.apps()[appId].name);
  }

  /**
   * 聚焦在图标上：左右方向键、Home、End 在图标之间移动（Dock 是工具栏）；Menu 键或 Shift+F10 弹出同一份菜单，
   * 焦点交给第一项，关闭后回到图标。
   */
  protected iconKey(event: KeyboardEvent, slot: DockSlot): void {
    if (!slot.app) return;
    const appId = slot.app.id;
    if (!isMenuKey(event)) {
      this.moveFocus(event, appId);
      return;
    }
    event.preventDefault();
    const anchor = event.currentTarget as HTMLElement;
    const rect = anchor.getBoundingClientRect();
    this.popover.openMenu(this.menuFor(appId, true), {
      x: rect.left + rect.width / 2,
      y: rect.top,
      origin: 'bottom left',
      focus: true,
      label: this.apps()[appId].name,
      onClose: () => anchor.focus()
    });
  }

  /** 图标的无障碍名称：最小化窗口 tile 报窗口标题；废纸篓里有东西时说明它是满的（图标画的是满的废纸篓）。 */
  protected labelOf(slot: DockSlot): string {
    const app = slot.app;
    if (!app) return 'Dock';
    if (slot.windowId !== undefined) return `${slot.title ?? app.name}, ${app.name}, minimized window`;
    return app.id === 'trash' && this.fs.trashFull() ? 'Trash, full' : app.name;
  }

  /** Dock 空白玻璃上的右键菜单。 */
  protected glassMenu(event: MouseEvent): void {
    if ((event.target as Element).closest('.di')) return;
    this.popover.contextMenu(event, [
      {
        id: 'mag',
        label: `Turn Magnification ${this.system.dockMagOn() ? 'Off' : 'On'}`,
        run: () => {
          this.system.dockMagOn.update(on => !on);
          this.measure();
        }
      },
      {
        id: 'hide',
        label: `Turn Hiding ${this.system.dockAutoHide() ? 'Off' : 'On'}`,
        run: () => this.system.dockAutoHide.update(on => !on)
      },
      {
        id: 'pos',
        label: 'Position on Screen',
        submenu: [
          {
            id: 'pos-left',
            label: 'Left',
            checked: this.system.dockPosition() === 'left',
            run: () => this.system.dockPosition.set('left')
          },
          {
            id: 'pos-bottom',
            label: 'Bottom',
            checked: this.system.dockPosition() === 'bottom',
            run: () => this.system.dockPosition.set('bottom')
          },
          {
            id: 'pos-right',
            label: 'Right',
            checked: this.system.dockPosition() === 'right',
            run: () => this.system.dockPosition.set('right')
          }
        ]
      },
      '-',
      { id: 'pref', label: 'Dock Settings…', run: () => this.wm.open('settings', { section: 'dock' }) }
    ]);
  }

  /** HTML5 文件拖过 Dock 图标：亮起目标图标，松手用该应用打开（与指针捕获式的应用拖动互不干扰）。 */
  protected fileOver(event: DragEvent, slot: DockSlot): void {
    if (slot.windowId !== undefined || !slot.app || slot.app.id === 'trash') return;
    const osFiles = fileTransfer(event);
    const paths = finderDragPaths();
    if (!osFiles && !paths?.length) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    this.fileDropApp.set(slot.app.id);
  }

  protected fileLeave(event: DragEvent): void {
    const node = event.currentTarget as Node;
    if (event.relatedTarget instanceof Node && node.contains(event.relatedTarget)) return;
    this.fileDropApp.set(null);
  }

  /** 文件拖到 Dock 玻璃上（不是图标）：只拦下浏览器的默认打开，不做别的。 */
  protected glassFile(event: DragEvent): void {
    if (!fileTransfer(event) && !finderDragPaths()?.length) return;
    event.preventDefault();
    event.stopPropagation();
  }

  protected fileDrop(event: DragEvent, slot: DockSlot): void {
    if (slot.windowId !== undefined || !slot.app || slot.app.id === 'trash') return;
    const osFiles = fileTransfer(event);
    const paths = finderDragPaths();
    event.preventDefault();
    event.stopPropagation();
    this.fileDropApp.set(null);
    if (paths?.length) {
      this.openWithApp(slot.app.id, paths);
      return;
    }
    if (osFiles) void this.importAndOpen(slot.app.id, Array.from(osFiles.files));
  }

  protected iconOf(appId: DesktopAppId): string {
    return this.apps()[appId].icon;
  }

  private toSlot(item: DockDisplayItem): DockSlot {
    if (item.type === 'divider') return { key: 'divider', app: null, temporary: false, draggable: false };
    if (item.type === 'window') {
      const app = this.apps()[item.appId];
      return {
        key: `win:${item.windowId}`,
        app,
        temporary: true,
        draggable: false,
        windowId: item.windowId,
        title: item.title
      };
    }
    const app = this.apps()[item.id];
    const draggable = !item.temporary && (app.dockZone ?? 'apps') === 'apps';
    return { key: item.id, app, temporary: item.temporary, draggable };
  }

  private geo(key: string): SlotGeometry {
    let geometry = this.geometry.get(key);
    if (!geometry) {
      geometry = { base: 0, width: 0, laidCenter: 0, scale: 1, target: 1 };
      this.geometry.set(key, geometry);
    }
    return geometry;
  }

  /**
   * 参与排布的格子：被拖起的固定图标让出位置，拖动中的插入位置撑开一个空位（`null`）。
   * `dropSlot` 是去掉被拖图标之后的槽位，固定项排在最前，所以它就是空位在排布里的下标。
   */
  private arrange(dropSlot: number | null): (ArrangedSlot | null)[] {
    const lifted = this.drag.lifted();
    const flow: (ArrangedSlot | null)[] = this.slots()
      .map((slot, index) => ({ slot, index }))
      .filter(({ slot }) => slot.key !== lifted);
    if (dropSlot !== null) flow.splice(dropSlot, 0, null);
    return flow;
  }

  /** 静止布局：图标宽 `size`、间隔 `gap`，分隔线窄一些且后面不留间隔；空位与图标同宽。 */
  private restLayout(flow: readonly (ArrangedSlot | null)[], size: number): RestLayout {
    const gap = gapOf(size);
    const pad = padOf(size);
    let x = pad;
    let trailingGap = 0;
    const placed = flow.map(arranged => {
      const width = arranged && !arranged.slot.app ? Math.round(size * 0.3) : size;
      trailingGap = !arranged || arranged.slot.app ? gap : 0;
      const item = { arranged, base: x + width / 2, width };
      x += width + trailingGap;
      return item;
    });
    return { placed, total: x - trailingGap + pad };
  }

  /** 宽屏上就是设置里的尺寸；视口窄、整条 Dock 放不进屏幕时，图标按需要缩小，直到放得下（不小于 {@link MIN_DOCK_SIZE}）。 */
  private fitSize(flow: readonly (ArrangedSlot | null)[], preferred: number): number {
    /* Dock 的主轴：底部是屏幕宽，左/右是菜单栏以下的屏幕高（wrap 的高度，与 applyDockTransform 一致）。 */
    const available =
      (this.system.dockPosition() === 'bottom' ? innerWidth : innerHeight - this.wm.menubarHeight()) -
      2 * DOCK_SIDE_MARGIN;
    let size = preferred;
    while (size > MIN_DOCK_SIZE && this.restLayout(flow, size).total > available) size--;
    return Math.max(size, Math.min(preferred, MIN_DOCK_SIZE));
  }

  private menuFor(appId: DesktopAppId, keyboard: boolean): MenuEntry[] {
    return appId === 'trash' ? this.trashMenu() : this.appMenu(appId, keyboard);
  }

  private trashMenu(): MenuEntry[] {
    return [
      { id: 'o', label: 'Open', run: () => this.wm.open('finder', { path: ['Trash'] }) },
      {
        id: 'e',
        label: 'Empty Trash',
        disabled: !this.fs.trashFull(),
        run: () => this.requestEmptyTrash()
      },
      '-',
      this.layout.menuEntry('trash')
    ];
  }

  private appMenu(appId: DesktopAppId, keyboard: boolean): MenuEntry[] {
    const app = this.apps()[appId];
    const open = this.wm.byApp(appId);
    const dockEntry = this.layout.menuEntry(appId, keyboard ? () => this.markRefocus(appId) : undefined);
    const toggle: MenuEntry =
      open.length ?
        { id: 'quit', label: 'Quit', run: () => this.wm.quitApp(appId) }
      : { id: 'open', label: 'Open', run: () => this.launcher.activate(appId) };
    if (app.kind === 'system') return [dockEntry, '-', toggle];
    const windows: MenuEntry[] =
      open.length > 1 ?
        [
          { head: 'Windows' },
          ...open.map((win, i) => ({ id: `w${i}`, label: win.title(), run: () => this.wm.focus(win.id) })),
          '-'
        ]
      : [];
    /* macOS 把「保留在 Dock / 在访达中显示」收在 Options 子菜单里；运行中的应用另有 Hide。 */
    const options: MenuEntry = {
      id: 'options',
      label: 'Options',
      submenu: [
        dockEntry,
        {
          id: 'show',
          label: 'Show in Finder',
          run: () => this.wm.open('finder', { path: ['Macintosh HD', 'Applications'], select: `${app.name}.app` })
        }
      ]
    };
    const hide: MenuEntry[] = open.length ? [{ id: 'hide', label: 'Hide', run: () => this.wm.hideApp(appId) }] : [];
    return [
      ...windows,
      { id: 'new', label: 'New Window', run: () => this.wm.open(appId, { force: true }) },
      '-',
      options,
      ...hide,
      toggle
    ];
  }

  /** 左右方向键、Home、End：焦点在图标之间移动（分隔线不是图标，跳过），到头绕回另一头。 */
  private moveFocus(event: KeyboardEvent, appId: DesktopAppId): void {
    const icons = this.slotElements()
      .map(ref => ref.nativeElement)
      .filter(node => node.dataset['app'] !== undefined);
    const next = barIndex(
      event.key,
      icons.findIndex(node => node.dataset['app'] === appId),
      icons.length
    );
    if (next === null) return;
    event.preventDefault();
    icons[next].focus();
  }

  /** 键盘改动 Dock 之后，焦点留在这个图标上；取消固定后图标不复存在（没在运行）就交给相邻的图标。 */
  private markRefocus(appId: DesktopAppId): void {
    const stays = !this.layout.pinned(appId) || this.wm.runningApps().has(appId);
    this.refocus = stays ? appId : this.neighborOf(appId);
  }

  /** 图标消失后键盘焦点该去的地方：右边的图标，没有就左边的。 */
  private neighborOf(appId: DesktopAppId): string | null {
    const icons = this.slots().filter(slot => slot.app);
    const index = icons.findIndex(slot => slot.key === appId);
    return (icons[index + 1] ?? icons[index - 1])?.key ?? null;
  }

  private nodeFor(appId: string): HTMLElement | null {
    return this.slotElements().find(ref => ref.nativeElement.dataset['app'] === appId)?.nativeElement ?? null;
  }

  private startBounce(node: HTMLElement): void {
    node.classList.remove('bounce');
    void node.offsetWidth;
    node.classList.add('bounce');
    setTimeout(() => node.classList.remove('bounce'), 3200);
  }

  private flushBounce(): void {
    for (const appId of this.pendingBounce) {
      const node = this.nodeFor(appId);
      if (!node) continue;
      this.pendingBounce.delete(appId);
      this.startBounce(node);
    }
  }

  private restoreFocus(): void {
    const key = this.refocus;
    if (key === null) return;
    const node = this.nodeFor(key);
    if (!node) return;
    this.refocus = null;
    node.focus();
  }

  /** 拖动开始时收起放大：拖动中指针不在图标上，放大的图标会挡住插入位置。 */
  private releaseHover(): void {
    if (!this.drag.active()) return;
    this.setPointerLocal(null);
  }

  /** 指针在主轴上的坐标（Dock 组件内部用的统一入口；`null` 时收起放大与提示）。 */
  private setPointerLocal(clientAxis: number | null): void {
    this.pointerLocal = clientAxis;
    if (clientAxis === null) this.hideTip();
    this.kick();
  }

  private kick(): void {
    if (this.looping) return;
    this.looping = true;
    requestAnimationFrame(() => this.step());
  }

  private step(): void {
    const size = this.size;
    const rect = this.dock().nativeElement.getBoundingClientRect();
    const mag = this.system.dockMagOn() ? this.system.dockMag() : 1;
    const reach = this.spread * size;
    /* 以静止布局为参照：放大后的中心若反馈回来，峰值会偏离指针下的图标。 */
    const origin = dockAxisOrigin(rect, this.baseWidth, this.system.dockPosition());
    const slots = this.slots();
    let hovered = -1;
    let best = 1e9;
    slots.forEach((slot, i) => {
      const geo = this.geo(slot.key);
      if (!slot.app || this.pointerLocal === null) {
        geo.target = 1;
        return;
      }
      const distance = Math.abs(this.pointerLocal - (origin + geo.base));
      if (distance < best) {
        best = distance;
        hovered = i;
      }
      const u = clamp(1 - distance / reach, 0, 1);
      /* 余弦钟形衰减，比线性更接近真实 Dock。 */
      geo.target = 1 + (mag - 1) * (0.5 - 0.5 * Math.cos(Math.PI * u)) ** 0.86;
    });

    let settled = true;
    for (const slot of slots) {
      const geo = this.geo(slot.key);
      const delta = geo.target - geo.scale;
      if (Math.abs(delta) <= 0.0007) geo.scale = geo.target;
      else {
        settled = false;
        geo.scale += delta * 0.38;
      }
    }
    this.paint();

    if (this.pointerLocal !== null && hovered >= 0 && best < size * 0.75) this.showTip(slots[hovered]);
    else this.hideTip();

    if (settled) this.looping = false;
    else requestAnimationFrame(() => this.step());
  }

  /** 按平滑后的宽度排布图标，互不重叠；左/右 Dock 把整条玻璃转 ±90°，图标再反向转回来保持直立。 */
  private paint(): void {
    const size = this.size;
    const position = this.system.dockPosition();
    const vertical = position !== 'bottom';
    const rotate = position === 'left' ? -90 : 90;
    const dockHeight = vertical ? this.panelThickness() : 0;
    const nodes = this.slotElements();
    const slots = this.slots();
    /* 格子刚变、DOM 还没跟上的那一帧不排布，等渲染完成后的 measure() 补上。 */
    if (nodes.length !== slots.length || nodes.some((ref, i) => ref.nativeElement.dataset['key'] !== slots[i].key))
      return;
    let x = this.padX;
    let trailingGap = 0;
    for (const arranged of this.arrange(this.drag.dropSlot())) {
      if (!arranged) {
        x += size + this.gap;
        trailingGap = this.gap;
        continue;
      }
      const { slot, index } = arranged;
      const geo = this.geo(slot.key);
      const node = nodes[index].nativeElement;
      if (!slot.app) {
        const width = Math.round(size * 0.3);
        geo.laidCenter = x + width / 2;
        node.style.transform = `translateX(${x.toFixed(2)}px)`;
        x += width;
        trailingGap = 0;
        continue;
      }
      const width = size * geo.scale;
      geo.laidCenter = x + width / 2;
      if (vertical) {
        /* 放大与反向旋转都以图标中心为原点，中心落在 (laidCenter, dockHeight − 9 − size/2)。 */
        node.style.transformOrigin = '50% 50%';
        const transform = `translate3d(${(geo.laidCenter - size / 2).toFixed(2)}px,${(dockHeight - 9 - size).toFixed(
          2
        )}px,0) rotate(${rotate}deg) scale(${geo.scale.toFixed(4)})`;
        node.style.setProperty('--tf', transform);
        node.style.transform = transform;
      } else {
        node.style.transformOrigin = '';
        const transform = `translate3d(${(geo.laidCenter - size / 2).toFixed(2)}px,0,0) scale(${geo.scale.toFixed(4)})`;
        node.style.setProperty('--tf', transform);
        node.style.transform = transform;
      }
      x += width + this.gap;
      trailingGap = this.gap;
    }
    this.dock().nativeElement.style.width = `${(x - trailingGap + this.padX).toFixed(2)}px`;
    this.applyDockTransform();
  }

  /** 未旋转面板的厚度：玻璃高 = 图标尺寸 + 14（有最小化 tile 时 +36），与全局样式一致；不读 offsetHeight，避开高度过渡动画的中间值。 */
  private panelThickness(): number {
    return this.size + (this.hasMinis() ? 36 : 14);
  }

  private showTip(slot: DockSlot): void {
    if (!slot.app) return;
    const tip = this.tip().nativeElement;
    tip.textContent = slot.title ?? slot.app.name;
    tip.style.left = `${this.geo(slot.key).laidCenter}px`;
    tip.classList.add('on');
  }

  private hideTip(): void {
    this.tip().nativeElement.classList.remove('on');
  }

  /** 面板的未旋转测量框：暂时取下 transform（隐藏位移与左/右的旋转）量出的静止几何。 */
  private measureDockRect(): DockPanelRect {
    const node = this.dock().nativeElement;
    const transform = node.style.transform;
    if (transform) node.style.transform = '';
    const rect = node.getBoundingClientRect();
    if (transform) node.style.transform = transform;
    return rect;
  }

  /**
   * 位置与自动隐藏合成面板的内联 transform：左/右转 ±90°（以贴屏边为旋转轴，玻璃加高时只向屏幕内长），
   * 隐藏时沿面板自身厚度方向滑出屏幕。保持在内联样式里（不放进类），measureDockRect 才能取下它量出静止几何。
   */
  private applyDockTransform(): void {
    const position = this.system.dockPosition();
    const node = this.dock().nativeElement;
    const hide = this.autoHidden() ? ' translateY(calc(100% + 10px))' : '';
    if (position === 'bottom') {
      node.style.removeProperty('position');
      node.style.removeProperty('left');
      node.style.removeProperty('top');
      node.style.removeProperty('transform-origin');
      node.style.transform = `${hide}`;
      return;
    }
    /* 未旋转的盒子先放到「旋转后恰好贴住屏幕边、主轴居中」的位置：以贴屏边为原点转 90°。
       left/top 相对 #dockwrap（左贴屏幕左缘、右贴右缘），右 Dock 的盒子要越过 wrap 原点向左主轴长加半个厚度。
       宽度读 paint 刚落下的内联宽，厚度取 {@link panelThickness} 的终值，与过渡动画无关。 */
    const width = parseFloat(node.style.width) || node.offsetWidth;
    const height = this.panelThickness();
    const wrapHeight = innerHeight - this.wm.menubarHeight();
    node.style.position = 'absolute';
    node.style.transformOrigin = position === 'left' ? '0% 50%' : '100% 50%';
    /* 旋转轴在盒子的贴屏边中点：左/右内容从轴心向屏幕内铺开，主轴行整体落在旋转轴的下方，
       所以让「旋转轴」而不是「盒子」居中——top 再减去半个厚度。 */
    node.style.top = `${(wrapHeight - width - height) / 2}px`;
    node.style.left = position === 'left' ? `${height / 2}px` : `${-(width + height / 2)}px`;
    node.style.transform = `${position === 'left' ? 'rotate(90deg)' : 'rotate(-90deg)'}${hide}`;
  }

  /** 滑出 Dock 并取消即将到来的收起。 */
  private revealDock(): void {
    this.cancelHideTimer();
    this.autoHidden.set(false);
  }

  /** 指针离开 Dock 与触发条带约 0.6 秒后滑回；拖动中不收起，免得吞掉拖放。 */
  private scheduleHide(): void {
    if (this.hideTimer !== null || this.autoHidden() || this.drag.active()) return;
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null;
      if (this.drag.active() || !this.system.dockAutoHide()) return;
      this.autoHidden.set(true);
      this.setPointerLocal(null);
    }, AUTO_HIDE_DELAY_MS);
  }

  private cancelHideTimer(): void {
    if (this.hideTimer === null) return;
    clearTimeout(this.hideTimer);
    this.hideTimer = null;
  }

  /** 自动隐藏开启后监听指针：贴近所在边滑出，离开 Dock 区域后延迟滑回。 */
  private attachEdgeListener(): void {
    if (this.edgeListener) return;
    this.edgeListener = (event: PointerEvent) => {
      const position = this.system.dockPosition();
      if (nearDockEdge(event.clientX, event.clientY, innerWidth, innerHeight, position, AUTO_HIDE_EDGE_PX)) {
        this.revealDock();
        return;
      }
      if (this.autoHidden()) return;
      const rect = this.dock().nativeElement.getBoundingClientRect();
      if (withinDock(rect, event.clientX, event.clientY, position)) this.cancelHideTimer();
      else this.scheduleHide();
    };
    this.document.addEventListener('pointermove', this.edgeListener);
  }

  private detachEdgeListener(): void {
    if (!this.edgeListener) return;
    this.document.removeEventListener('pointermove', this.edgeListener);
    this.edgeListener = null;
  }

  /** 用指定应用打开一批文件；节点找不回来就提示（DOCKREG）。 */
  private openWithApp(appId: DesktopAppId, paths: readonly DiskPath[]): void {
    for (const path of paths) {
      const node = this.fs.nodeAt(path);
      if (!node) {
        this.toast.show(`Couldn’t find “${path.at(-1) ?? ''}”`);
        continue;
      }
      this.opener.openApp(appId, node);
    }
  }

  /** 本机文件拖到 Dock 应用图标：先导入「下载」，再用该应用打开导入的节点。 */
  private async importAndOpen(appId: DesktopAppId, files: readonly File[]): Promise<void> {
    const paths = await this.fileImport.importFiles([...HOME, 'Downloads'], files);
    for (const path of paths) this.opener.openApp(appId, this.fs.nodeAt(path));
  }

  /**
   * Finder / 桌面的文件拖放以指针捕获进行，松手在拖放源的监听器里收尾；这里先于它执行（构造时挂的监听），
   * 读到还没清空的拖放注册表（finder-drag-registry），落在 Dock 应用图标上就用该应用打开。
   */
  private readonly onDocumentPointerUp = (event: PointerEvent): void => {
    if (this.drag.active()) return;
    const paths = finderDragPaths();
    if (!paths?.length) return;
    const icon = this.document.elementFromPoint(event.clientX, event.clientY)?.closest('#dock .di[data-app]');
    if (!(icon instanceof HTMLElement)) return;
    this.openWithApp(icon.dataset['app'] as DesktopAppId, paths);
  };
}
