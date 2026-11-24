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

import { FinderClipboard } from '../apps/finder/finder-clipboard';
import { showInfoPanel } from './overlays/info-panel';
import { DESKTOP, DiskPath, finderPathOf, samePath } from '../disk/disk-path';
import { DesktopItem, DesktopItems, desktopItemId } from '../services/desktop-items';
import { DockState } from '../services/dock-state';
import { describeDiskError, FileSystem } from '../services/file-system';
import { isMenuKey } from '../services/focus-order';
import { MenuEntry } from '../services/menu';
import { PopoverService } from '../services/popover';
import { Toast } from '../services/toast';
import { WindowManager } from '../services/window-manager';
import { FileDrop } from '../shared/file-drop';
import { FileThumbnail } from '../shared/file-thumbnail';
import { clamp } from '../shared/format';
import { Icon } from '../shared/icon';
import { CalendarWidget, StocksWidget, WeatherWidget } from './widgets/widgets';

const GRID = { w: 92, h: 98, padTop: 8, padRight: 12 } as const;

interface Point {
  readonly left: number;
  readonly top: number;
}

/**
 * 桌面：右上角起排的图标网格、拖动吸附、框选、右键菜单与左侧小组件。
 * 无障碍（ADESK-US-108）：每个图标是能 Tab 到的按钮（名称是文件名），空格打开，文件夹上 Enter 就地改名，
 * ⌘↓ 或 ⌘O 打开，Menu 键 / Shift+F10 弹出右键菜单；获得焦点就是选中它。桌面在 Tab 顺序里排在 Dock 之后。
 */
@Component({
  selector: 'app-desktop-surface',
  imports: [Icon, FileThumbnail, CalendarWidget, WeatherWidget, StocksWidget, FileDrop],
  templateUrl: './desktop-surface.html',
  styleUrl: './desktop-surface.scss',
  encapsulation: ViewEncapsulation.None,
  host: {
    '[style.display]': '"contents"',
    '(window:resize)': 'resize()',
    '(window:pointermove)': 'externalDragMove($event)',
    '(window:pointerup)': 'externalDragEnd()',
    '(window:pointercancel)': 'externalDragEnd()'
  }
})
export class DesktopSurface {
  private readonly wm = inject(WindowManager);
  private readonly popover = inject(PopoverService);
  private readonly toast = inject(Toast);
  private readonly fs = inject(FileSystem);
  private readonly clipboard = inject(FinderClipboard);
  private readonly dock = inject(DockState);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private readonly root = this.document.documentElement;
  private readonly surface = viewChild.required<ElementRef<HTMLElement>>('surface');
  private readonly marqueeBox = viewChild.required<ElementRef<HTMLElement>>('marquee');
  private dockDragHover = false;
  private folderHoverTimer: ReturnType<typeof setTimeout> | null = null;
  /** 最近一次右键/键盘菜单的位置，简介面板贴着它开。 */
  private menuPoint: { x: number; y: number } | null = null;

  protected readonly desktop = inject(DesktopItems);
  protected readonly desktopPath = DESKTOP;
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
    return {
      left: width - GRID.padRight - (item.cell[0] + 1) * GRID.w,
      top: this.menubarHeight() + GRID.padTop + item.cell[1] * GRID.h
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
        const copy = release.altKey || release.metaKey;
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
      this.desktop.move(item.id, this.freeCell(item, this.cellAt(drop.at)));
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
    this.popover.openMenu(this.iconItems(item), {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      origin: 'top left',
      focus: true,
      label: item.name,
      onClose: () => anchor.focus()
    });
  }

  /** 空格也能打开图标（`role="button"` 的约定）。 */
  protected openByKey(event: Event, item: DesktopItem): void {
    event.preventDefault();
    item.open();
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

  /** 空白处按下：取消选择并开始框选。 */
  protected pressSurface(event: PointerEvent): void {
    if ((event.target as Element).closest('.dicon, .wgt, input') || event.button !== 0) return;
    this.select(null);
    this.marquee(event);
  }

  protected surfaceMenu(event: MouseEvent): void {
    if ((event.target as Element).closest('.dicon, .wgt, input')) return;
    this.menuPoint = { x: event.clientX, y: event.clientY };
    this.popover.contextMenu(event, [
      { id: 'nf', label: 'New Folder', run: () => this.desktop.newFolder() },
      {
        id: 'ps',
        label: 'Paste Item',
        key: '⌘V',
        disabled: !this.clipboard.snapshot(),
        run: () => this.desktop.paste()
      },
      { id: 'gi', label: 'Get Info', run: () => this.showDesktopInfo() },
      '-',
      { id: 'cw', label: 'Change Wallpaper…', run: () => this.wm.open('settings', { section: 'wallpaper' }) },
      { id: 'ew', label: 'Edit Widgets…', run: () => this.toast.show('Widgets are already on the desktop.') },
      '-',
      { id: 'st', label: 'Use Stacks', key: '⌃⌘0' },
      { id: 'sb', label: 'Sort By', key: '▸' },
      { id: 'vo', label: 'Show View Options', key: '⌘J' }
    ]);
  }

  private iconItems(item: DesktopItem): MenuEntry[] {
    return [
      { id: 'o', label: 'Open', run: () => item.open() },
      { id: 'w', label: 'Open With', key: '▸' },
      '-',
      {
        id: 'i',
        label: 'Get Info',
        key: '⌘I',
        run: () => {
          const node = item.node;
          if (node) showInfoPanel(this.popover, node, this.menuPoint ?? undefined);
          else this.toast.show(this.info(item));
        }
      },
      {
        id: 'r',
        label: 'Rename',
        disabled: !item.id.startsWith('file:'),
        run: () => this.startRename(item)
      },
      { id: 'd', label: 'Duplicate', key: '⌘D', run: () => this.toast.show('Duplicated') },
      '-',
      { id: 't', label: 'Move to Trash', key: '⌘⌫', run: () => this.trash(item) },
      '-',
      { id: 'q', label: 'Quick Look', key: '␣', run: () => item.open() }
    ];
  }

  private marquee(event: PointerEvent): void {
    const box = this.marqueeBox().nativeElement;
    const sx = event.clientX;
    const sy = event.clientY;
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
      this.selectWithin(left, top, left + width, top + height);
    };
    const up = (): void => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      box.style.display = 'none';
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  }

  private selectWithin(left: number, top: number, right: number, bottom: number): void {
    const icons = [...this.surface().nativeElement.querySelectorAll<HTMLElement>('.dicon')];
    const hit = icons.filter(icon => {
      const rect = icon.getBoundingClientRect();
      return !(rect.right < left || rect.left > right || rect.bottom < top || rect.top > bottom);
    });
    this.selected.set(new Set(hit.map(icon => icon.dataset['id'] ?? '')));
  }

  private info(item: DesktopItem): string {
    const node = item.node;
    if (!node) return item.name;
    return node.kind === 'folder' ? `${node.name} — Folder` : `${node.name} — ${node.k}, ${node.size}`;
  }

  private showDesktopInfo(): void {
    const node = this.fs.get(finderPathOf(DESKTOP));
    if (node) showInfoPanel(this.popover, node, this.menuPoint ?? undefined);
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
    const col = Math.round((innerWidth - GRID.padRight - GRID.w - point.left) / GRID.w);
    const row = Math.round((point.top - mb - GRID.padTop) / GRID.h);
    const maxRow = Math.floor((innerHeight - mb - GRID.padTop - 110) / GRID.h);
    return [clamp(col, 0, Math.floor(innerWidth / GRID.w) - 2), clamp(row, 0, Math.max(0, maxRow))];
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

  private menubarHeight(): number {
    return parseInt(getComputedStyle(this.root).getPropertyValue('--mb-h'), 10);
  }
}
