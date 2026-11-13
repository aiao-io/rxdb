import { DOCUMENT } from '@angular/common';
import {
  Component,
  ElementRef,
  ViewEncapsulation,
  afterRenderEffect,
  computed,
  inject,
  viewChild,
  viewChildren
} from '@angular/core';

import { AppLauncher } from '../services/app-launcher';
import { DESKTOP_APPS, DesktopAppDefinition, DesktopAppId } from '../services/desktop-apps';
import { DockDragController, DockDropTarget } from '../services/dock-drag';
import { DockLayoutStore } from '../services/dock-layout';
import { DockSlotItem, dockSlots, slotIndexAt, temporaryApps } from '../services/dock-layout-model';
import { DockRect, DockState, DockView } from '../services/dock-state';
import { FileSystem, describeDiskError } from '../services/file-system';
import { MenuEntry } from '../services/menu';
import { PopoverService } from '../services/popover';
import { SystemState } from '../services/system-state';
import { Toast } from '../services/toast';
import { WindowManager } from '../services/window-manager';
import { clamp } from '../shared/format';
import { Icon } from '../shared/icon';
import { isMenuKey } from '../shared/menu-list';

/** 屏幕上的一格：应用图标（固定项或临时项），或分隔线（`app` 为 `null`）。 */
interface DockSlot {
  readonly key: string;
  readonly app: DesktopAppDefinition | null;
  /** 本标签页正在运行、但没有固定的应用：接在固定项之后，退出后消失。 */
  readonly temporary: boolean;
  /** 固定在应用区的图标可以拖动调整顺序；临时项和尾部区（废纸篓）不行。 */
  readonly draggable: boolean;
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

/**
 * Dock：一个 rAF 循环驱动的抛物线放大，外加弹跳、运行指示和右键菜单。
 * 格子由固定布局（`DockLayoutStore`）加上本标签页正在运行的未固定应用动态生成；
 * 图标可以拖动调整顺序、拖出取消固定，Launchpad 与 Finder 的图标可以拖进来固定（`DockDragController`）。
 */
@Component({
  selector: 'app-dock',
  imports: [Icon],
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
  private readonly apps = inject(DESKTOP_APPS);
  private readonly system = inject(SystemState);
  private readonly wm = inject(WindowManager);
  private readonly popover = inject(PopoverService);
  private readonly toast = inject(Toast);
  private readonly layout = inject(DockLayoutStore);
  private readonly root = inject(DOCUMENT).documentElement;
  private readonly dock = viewChild.required<ElementRef<HTMLElement>>('dock');
  private readonly tip = viewChild.required<ElementRef<HTMLElement>>('tip');
  private readonly slotElements = viewChildren<ElementRef<HTMLElement>>('slotEl');
  private readonly geometry = new Map<string, SlotGeometry>();
  /** 弹跳时图标还没出现（比如刚打开的未固定应用）：等它的格子渲染出来再弹。 */
  private readonly pendingBounce = new Set<string>();
  private gap = 5;
  private padX = 8;
  private readonly spread = 2.9;
  private baseWidth = 0;
  private pointerX: number | null = null;
  private looping = false;
  private pressed: HTMLElement | null = null;
  /** 键盘操作改变了格子（固定、取消固定）之后，渲染完把焦点还给这个图标。 */
  private refocus: string | null = null;
  protected readonly launcher = inject(AppLauncher);
  protected readonly dockState = inject(DockState);
  protected readonly drag = inject(DockDragController);
  protected readonly fs = inject(FileSystem);

  protected readonly running = this.wm.runningApps;
  protected readonly slots = computed<readonly DockSlot[]>(() => {
    const layout = this.layout.layout();
    const temporary = temporaryApps(layout, this.running(), this.apps);
    return dockSlots(layout, temporary).map(item => this.toSlot(item));
  });

  constructor() {
    this.dockState.attach(this);
    this.drag.attach(this);
    afterRenderEffect(() => {
      this.system.dockSize();
      this.measure();
      this.releaseHover();
      this.restoreFocus();
      this.flushBounce();
    });
  }

  rectFor(appId: string): DockRect {
    const size = this.system.dockSize();
    const rect = this.dock().nativeElement.getBoundingClientRect();
    const slot = this.slots().find(item => item.app?.id === appId);
    if (!slot) return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, w: size, h: size };
    return { x: rect.left + this.geo(slot.key).laidCenter, y: rect.bottom - 9 - size / 2, w: size, h: size };
  }

  bounce(appId: string): void {
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
    const size = this.system.dockSize();
    const rect = this.dock().nativeElement.getBoundingClientRect();
    const reach = this.baseWidth / 2 + size * 0.5;
    return Math.abs(x - (rect.left + rect.width / 2)) <= reach && y >= rect.top - size * 1.2;
  }

  /** 指针 x 对应的插入槽位：以去掉被拖图标、没有空位的静止布局为准，空位不会反过来影响判断。 */
  slotAt(x: number): number {
    const { placed, total } = this.restLayout(this.arrange(null), this.system.dockSize());
    const rect = this.dock().nativeElement.getBoundingClientRect();
    const left = rect.left + rect.width / 2 - total / 2;
    const centers = placed.filter(item => item.arranged?.slot.draggable).map(item => left + item.base);
    return slotIndexAt(centers, x);
  }

  /** 重算静止几何；窗口缩放、偏好变化和格子增减时调用。 */
  protected measure(): void {
    const size = this.system.dockSize();
    this.root.style.setProperty('--dock-size', `${size}px`);
    this.gap = Math.round(size * 0.095);
    this.padX = Math.round(size * 0.15);
    const { placed, total } = this.restLayout(this.arrange(this.drag.dropSlot()), size);
    for (const { arranged, base, width } of placed) {
      if (!arranged) continue;
      Object.assign(this.geo(arranged.slot.key), { base, width });
    }
    this.baseWidth = total;
    this.paint();
  }

  protected hover(clientX: number): void {
    if (this.drag.active()) return;
    this.pointerX = clientX;
    this.kick();
  }

  protected leave(): void {
    this.pointerX = null;
    this.hideTip();
    this.kick();
  }

  protected press(event: PointerEvent, slot: DockSlot): void {
    if (event.button !== 0 || !slot.app) return;
    this.pressed = this.nodeFor(slot.app.id);
    this.pressed?.classList.add('press');
    if (slot.draggable) this.drag.beginFromDock(event, slot.app.id);
  }

  protected release(): void {
    this.pressed?.classList.remove('press');
    this.pressed = null;
  }

  /** 空格也能激活图标（`role="button"` 的约定）。 */
  protected activateByKey(event: Event, appId: DesktopAppId): void {
    event.preventDefault();
    this.launcher.activate(appId);
  }

  protected iconMenu(event: MouseEvent, appId: DesktopAppId): void {
    this.popover.contextMenu(event, this.menuFor(appId, false));
  }

  /** 聚焦在图标上按 Menu 键或 Shift+F10：弹出同一份菜单，焦点交给第一项，关闭后回到图标。 */
  protected iconKey(event: KeyboardEvent, appId: DesktopAppId): void {
    if (!isMenuKey(event)) return;
    event.preventDefault();
    const anchor = event.currentTarget as HTMLElement;
    const rect = anchor.getBoundingClientRect();
    this.popover.openMenu(this.menuFor(appId, true), {
      x: rect.left + rect.width / 2,
      y: rect.top,
      origin: 'bottom left',
      focus: true,
      onClose: () => anchor.focus()
    });
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
      { id: 'pos', label: 'Position on Screen', key: '▸' },
      '-',
      { id: 'pref', label: 'Dock Settings…', run: () => this.wm.open('settings', { section: 'dock' }) }
    ]);
  }

  protected iconOf(appId: DesktopAppId): string {
    return this.apps[appId].icon;
  }

  private toSlot(item: DockSlotItem): DockSlot {
    if (item.type === 'divider') return { key: 'divider', app: null, temporary: false, draggable: false };
    const app = this.apps[item.id];
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
    let x = this.padX;
    let trailingGap = 0;
    const placed = flow.map(arranged => {
      const width = arranged && !arranged.slot.app ? Math.round(size * 0.3) : size;
      trailingGap = !arranged || arranged.slot.app ? this.gap : 0;
      const item = { arranged, base: x + width / 2, width };
      x += width + trailingGap;
      return item;
    });
    return { placed, total: x - trailingGap + this.padX };
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
        run: () =>
          this.fs.emptyTrash().then(
            () => this.toast.show('Trash emptied'),
            (error: unknown) => this.toast.show(describeDiskError(error))
          )
      }
    ];
  }

  private appMenu(appId: DesktopAppId, keyboard: boolean): MenuEntry[] {
    const app = this.apps[appId];
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
    return [
      ...windows,
      { id: 'new', label: 'New Window', run: () => this.wm.open(appId, { force: true }) },
      dockEntry,
      {
        id: 'show',
        label: 'Show in Finder',
        run: () => this.wm.open('finder', { path: ['Macintosh HD', 'Applications'], select: `${app.name}.app` })
      },
      '-',
      toggle
    ];
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
    this.pointerX = null;
    this.hideTip();
    this.kick();
  }

  private kick(): void {
    if (this.looping) return;
    this.looping = true;
    requestAnimationFrame(() => this.step());
  }

  private step(): void {
    const size = this.system.dockSize();
    const rect = this.dock().nativeElement.getBoundingClientRect();
    const mag = this.system.dockMagOn() ? this.system.dockMag() : 1;
    const reach = this.spread * size;
    /* 以静止布局为参照：放大后的中心若反馈回来，峰值会偏离指针下的图标。 */
    const restLeft = rect.left + rect.width / 2 - this.baseWidth / 2;
    const slots = this.slots();
    let hovered = -1;
    let best = 1e9;
    slots.forEach((slot, i) => {
      const geo = this.geo(slot.key);
      if (!slot.app || this.pointerX === null) {
        geo.target = 1;
        return;
      }
      const distance = Math.abs(this.pointerX - (restLeft + geo.base));
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

    if (this.pointerX !== null && hovered >= 0 && best < size * 0.75) this.showTip(slots[hovered]);
    else this.hideTip();

    if (settled) this.looping = false;
    else requestAnimationFrame(() => this.step());
  }

  /** 按平滑后的宽度排布图标，互不重叠。 */
  private paint(): void {
    const size = this.system.dockSize();
    const nodes = this.slotElements();
    const slots = this.slots();
    /* 格子刚变、DOM 还没跟上的那一帧不排布，等渲染完成后的 measure() 补上。 */
    if (nodes.length !== slots.length || nodes.some((ref, i) => ref.nativeElement.dataset['key'] !== slots[i].key)) return;
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
      const transform = `translate3d(${(geo.laidCenter - size / 2).toFixed(2)}px,0,0) scale(${geo.scale.toFixed(4)})`;
      node.style.setProperty('--tf', transform);
      node.style.transform = transform;
      x += width + this.gap;
      trailingGap = this.gap;
    }
    this.dock().nativeElement.style.width = `${(x - trailingGap + this.padX).toFixed(2)}px`;
  }

  private showTip(slot: DockSlot): void {
    if (!slot.app) return;
    const tip = this.tip().nativeElement;
    tip.textContent = slot.app.name;
    tip.style.left = `${this.geo(slot.key).laidCenter}px`;
    tip.classList.add('on');
  }

  private hideTip(): void {
    this.tip().nativeElement.classList.remove('on');
  }
}
