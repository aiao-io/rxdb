import { DOCUMENT } from '@angular/common';
import { Component, ElementRef, ViewEncapsulation, effect, inject, signal, viewChild } from '@angular/core';

import { DesktopItem, DesktopItems } from '../services/desktop-items';
import { PopoverService } from '../services/popover';
import { Toast } from '../services/toast';
import { WindowManager } from '../services/window-manager';
import { clamp } from '../shared/format';
import { Icon } from '../shared/icon';
import { CalendarWidget, StocksWidget, WeatherWidget } from './widgets/widgets';

const GRID = { w: 92, h: 98, padTop: 8, padRight: 12 } as const;

interface Point {
  readonly left: number;
  readonly top: number;
}

/** 桌面：右上角起排的图标网格、拖动吸附、框选、右键菜单与左侧小组件。 */
@Component({
  selector: 'app-desktop-surface',
  imports: [Icon, CalendarWidget, WeatherWidget, StocksWidget],
  templateUrl: './desktop-surface.html',
  styleUrl: './desktop-surface.scss',
  encapsulation: ViewEncapsulation.None,
  host: {
    '[style.display]': '"contents"',
    '(window:resize)': 'resize()'
  }
})
export class DesktopSurface {
  private readonly wm = inject(WindowManager);
  private readonly popover = inject(PopoverService);
  private readonly toast = inject(Toast);
  private readonly root = inject(DOCUMENT).documentElement;
  private readonly surface = viewChild.required<ElementRef<HTMLElement>>('surface');
  private readonly marqueeBox = viewChild.required<ElementRef<HTMLElement>>('marquee');

  protected readonly desktop = inject(DesktopItems);
  protected readonly viewport = signal<readonly [number, number]>([innerWidth, innerHeight]);
  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly dragging = signal<{ readonly id: string; readonly at: Point } | null>(null);
  protected readonly settling = signal<string | null>(null);
  protected readonly trashing = signal<ReadonlySet<string>>(new Set());

  constructor() {
    effect(() => {
      const created = this.desktop.created();
      if (created) this.selected.set(new Set([created]));
    });
  }

  protected resize(): void {
    this.viewport.set([innerWidth, innerHeight]);
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
    this.select(item.id);
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
      this.dragging.set({
        id: item.id,
        at: { left: origin.left + dx, top: clamp(origin.top + dy, 22, innerHeight - 120) }
      });
    };
    const up = (): void => {
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      const drop = this.dragging();
      if (!moved || !drop) return;
      this.dragging.set(null);
      this.desktop.move(item.id, this.freeCell(item, this.cellAt(drop.at)));
      this.settle(item.id);
    };
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', up);
  }

  protected iconMenu(event: MouseEvent, item: DesktopItem): void {
    this.select(item.id);
    this.popover.contextMenu(event, [
      { id: 'o', label: 'Open', run: () => item.open() },
      { id: 'w', label: 'Open With', key: '▸' },
      '-',
      { id: 'i', label: 'Get Info', key: '⌘I', run: () => this.toast.show(`${item.name} — 0 bytes`) },
      { id: 'r', label: 'Rename', run: () => this.toast.show('Renaming is left as an exercise.') },
      { id: 'd', label: 'Duplicate', key: '⌘D', run: () => this.toast.show('Duplicated') },
      '-',
      { id: 't', label: 'Move to Trash', key: '⌘⌫', run: () => this.trash(item) },
      '-',
      { id: 'q', label: 'Quick Look', key: '␣', run: () => item.open() }
    ]);
  }

  /** 空白处按下：取消选择并开始框选。 */
  protected pressSurface(event: PointerEvent): void {
    if ((event.target as Element).closest('.dicon, .wgt') || event.button !== 0) return;
    this.select(null);
    this.marquee(event);
  }

  protected surfaceMenu(event: MouseEvent): void {
    if ((event.target as Element).closest('.dicon, .wgt')) return;
    this.popover.contextMenu(event, [
      { id: 'nf', label: 'New Folder', run: () => this.desktop.newFolder() },
      { id: 'gi', label: 'Get Info', run: () => this.wm.open('about') },
      '-',
      { id: 'cw', label: 'Change Wallpaper…', run: () => this.wm.open('settings', { section: 'wallpaper' }) },
      { id: 'ew', label: 'Edit Widgets…', run: () => this.toast.show('Widgets are already on the desktop.') },
      '-',
      { id: 'st', label: 'Use Stacks', key: '⌃⌘0' },
      { id: 'sb', label: 'Sort By', key: '▸' },
      { id: 'vo', label: 'Show View Options', key: '⌘J' }
    ]);
  }

  private select(id: string | null): void {
    this.selected.set(new Set(id ? [id] : []));
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

  private trash(item: DesktopItem): void {
    this.trashing.update(ids => new Set([...ids, item.id]));
    setTimeout(() => this.desktop.remove(item.id), 230);
  }

  private settle(id: string): void {
    this.settling.set(id);
    setTimeout(() => {
      if (this.settling() === id) this.settling.set(null);
    }, 300);
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
