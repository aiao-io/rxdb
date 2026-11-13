import { DOCUMENT } from '@angular/common';
import {
  Component,
  ElementRef,
  ViewEncapsulation,
  afterRenderEffect,
  inject,
  viewChild,
  viewChildren
} from '@angular/core';

import { AppLauncher } from '../services/app-launcher';
import { DESKTOP_APPS, DesktopAppDefinition, DesktopAppId } from '../services/desktop-apps';
import { DockRect, DockState, DockView } from '../services/dock-state';
import { FileSystem, describeDiskError } from '../services/file-system';
import { MenuEntry } from '../services/menu';
import { PopoverService } from '../services/popover';
import { SystemState } from '../services/system-state';
import { Toast } from '../services/toast';
import { WindowManager } from '../services/window-manager';
import { clamp } from '../shared/format';
import { Icon } from '../shared/icon';

const DOCK_ITEMS: readonly (DesktopAppId | '|')[] = [
  'finder',
  'launchpad',
  'safari',
  'mail',
  'messages',
  'maps',
  'photos',
  'notes',
  'calendar',
  'music',
  'terminal',
  'vscode',
  'calculator',
  'settings',
  '|',
  'trash'
];

interface DockSlot {
  readonly key: string;
  readonly app: DesktopAppDefinition | null;
  /** 静止布局下的中心（相对 Dock 左缘）。 */
  base: number;
  width: number;
  /** 放大后实际排布的中心。 */
  laidCenter: number;
}

/** Dock：一个 rAF 循环驱动的抛物线放大，外加弹跳、运行指示和右键菜单。 */
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
export class Dock implements DockView {
  private readonly apps = inject(DESKTOP_APPS);
  private readonly system = inject(SystemState);
  private readonly wm = inject(WindowManager);
  private readonly popover = inject(PopoverService);
  private readonly toast = inject(Toast);
  private readonly root = inject(DOCUMENT).documentElement;
  private readonly dock = viewChild.required<ElementRef<HTMLElement>>('dock');
  private readonly tip = viewChild.required<ElementRef<HTMLElement>>('tip');
  private readonly slotElements = viewChildren<ElementRef<HTMLElement>>('slotEl');
  private gap = 5;
  private padX = 8;
  private readonly spread = 2.9;
  private baseWidth = 0;
  private pointerX: number | null = null;
  private current = DOCK_ITEMS.map(() => 1);
  private target = DOCK_ITEMS.map(() => 1);
  private looping = false;
  private pressed: HTMLElement | null = null;
  protected readonly launcher = inject(AppLauncher);
  protected readonly dockState = inject(DockState);
  protected readonly fs = inject(FileSystem);

  protected readonly slots: DockSlot[] = DOCK_ITEMS.map((id, index) => ({
    key: `${id}-${index}`,
    app: id === '|' ? null : this.apps[id],
    base: 0,
    width: 0,
    laidCenter: 0
  }));
  protected readonly running = this.wm.runningApps;

  constructor() {
    this.dockState.attach(this);
    afterRenderEffect(() => {
      this.system.dockSize();
      this.measure();
    });
  }

  rectFor(appId: string): DockRect {
    const size = this.system.dockSize();
    const rect = this.dock().nativeElement.getBoundingClientRect();
    const slot = this.slots.find(item => item.app?.id === appId);
    if (!slot) return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, w: size, h: size };
    return { x: rect.left + slot.laidCenter, y: rect.bottom - 9 - size / 2, w: size, h: size };
  }

  bounce(appId: string): void {
    const node = this.nodeFor(appId);
    if (!node) return;
    node.classList.remove('bounce');
    void node.offsetWidth;
    node.classList.add('bounce');
    setTimeout(() => node.classList.remove('bounce'), 3200);
  }

  stopBounce(appId: string): void {
    this.nodeFor(appId)?.classList.remove('bounce');
  }

  /** 重算静止几何；窗口缩放和偏好变化时调用。 */
  protected measure(): void {
    const size = this.system.dockSize();
    this.root.style.setProperty('--dock-size', `${size}px`);
    this.gap = Math.round(size * 0.095);
    this.padX = Math.round(size * 0.15);
    let x = this.padX;
    for (const slot of this.slots) {
      slot.width = slot.app ? size : Math.round(size * 0.3);
      slot.base = x + slot.width / 2;
      x += slot.width + (slot.app ? this.gap : 0);
    }
    this.baseWidth = x - this.gap + this.padX;
    this.paint();
  }

  protected hover(clientX: number): void {
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
  }

  protected release(): void {
    this.pressed?.classList.remove('press');
    this.pressed = null;
  }

  protected iconMenu(event: MouseEvent, appId: DesktopAppId): void {
    this.popover.contextMenu(event, appId === 'trash' ? this.trashMenu() : this.appMenu(appId));
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

  private appMenu(appId: DesktopAppId): MenuEntry[] {
    const open = this.wm.byApp(appId);
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
      { id: 'opt', label: 'Options', key: '▸' },
      {
        id: 'show',
        label: 'Show in Finder',
        run: () =>
          this.wm.open('finder', { path: ['Macintosh HD', 'Applications'], select: `${this.apps[appId].name}.app` })
      },
      '-',
      open.length ?
        { id: 'quit', label: 'Quit', run: () => this.wm.quitApp(appId) }
      : { id: 'open', label: 'Open', run: () => this.launcher.activate(appId) }
    ];
  }

  private nodeFor(appId: string): HTMLElement | null {
    const index = this.slots.findIndex(slot => slot.app?.id === appId);
    return index < 0 ? null : this.slotElements()[index].nativeElement;
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
    let hovered = -1;
    let best = 1e9;
    this.slots.forEach((slot, i) => {
      if (!slot.app || this.pointerX === null) {
        this.target[i] = 1;
        return;
      }
      const distance = Math.abs(this.pointerX - (restLeft + slot.base));
      if (distance < best) {
        best = distance;
        hovered = i;
      }
      const u = clamp(1 - distance / reach, 0, 1);
      /* 余弦钟形衰减，比线性更接近真实 Dock。 */
      this.target[i] = 1 + (mag - 1) * (0.5 - 0.5 * Math.cos(Math.PI * u)) ** 0.86;
    });

    let settled = true;
    this.current = this.current.map((value, i) => {
      const delta = this.target[i] - value;
      if (Math.abs(delta) <= 0.0007) return this.target[i];
      settled = false;
      return value + delta * 0.38;
    });
    this.paint();

    if (this.pointerX !== null && hovered >= 0 && best < size * 0.75) this.showTip(hovered);
    else this.hideTip();

    if (settled) this.looping = false;
    else requestAnimationFrame(() => this.step());
  }

  /** 按平滑后的宽度排布图标，互不重叠。 */
  private paint(): void {
    const size = this.system.dockSize();
    const nodes = this.slotElements();
    if (nodes.length !== this.slots.length) return;
    let total = this.padX * 2;
    this.slots.forEach((slot, i) => {
      total += slot.app ? size * this.current[i] + this.gap : slot.width;
    });
    total -= this.gap;

    let x = this.padX;
    this.slots.forEach((slot, i) => {
      const node = nodes[i].nativeElement;
      if (!slot.app) {
        slot.laidCenter = x + slot.width / 2;
        node.style.transform = `translateX(${x.toFixed(2)}px)`;
        x += slot.width;
        return;
      }
      const scale = this.current[i];
      const width = size * scale;
      slot.laidCenter = x + width / 2;
      const transform = `translate3d(${(slot.laidCenter - size / 2).toFixed(2)}px,0,0) scale(${scale.toFixed(4)})`;
      node.style.setProperty('--tf', transform);
      node.style.transform = transform;
      x += width + this.gap;
    });
    this.dock().nativeElement.style.width = `${total.toFixed(2)}px`;
  }

  private showTip(index: number): void {
    const slot = this.slots[index];
    if (!slot.app) return;
    const tip = this.tip().nativeElement;
    tip.textContent = slot.app.name;
    tip.style.left = `${slot.laidCenter}px`;
    tip.classList.add('on');
  }

  private hideTip(): void {
    this.tip().nativeElement.classList.remove('on');
  }
}
