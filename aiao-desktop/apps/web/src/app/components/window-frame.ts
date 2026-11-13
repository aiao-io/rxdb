import { NgComponentOutlet } from '@angular/common';
import { Component, ElementRef, Injector, OnInit, Renderer2, computed, inject, input } from '@angular/core';

import { DesktopWindow, WindowBox, WindowFrameHandle } from '../services/desktop-window';
import { DockState } from '../services/dock-state';
import { placeOnScreen } from '../services/window-layout-model';
import { WindowManager } from '../services/window-manager';
import { clamp, lerp } from '../shared/format';
import { WindowStatus } from './window-status';

type ResizeEdge = 'n' | 's' | 'w' | 'e' | 'nw' | 'ne' | 'sw' | 'se';

const EDGES: readonly ResizeEdge[] = ['n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se'];
const CURSORS: Readonly<Record<ResizeEdge, string>> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize'
};
/** 开窗弹出动画的时长（与样式表里 `.win.opening` 一致）。 */
const OPENING_MS = 320;
/** 打开窗口时窗口比视口窄、矮的余量（与 `WindowManager.open` 一致）：最小尺寸也以此为上限。 */
const OPEN_WIDTH_MARGIN = 60;
const OPEN_HEIGHT_MARGIN = 90;

const roundBox = (box: WindowBox): WindowBox => ({
  left: Math.round(box.left),
  top: Math.round(box.top),
  width: Math.round(box.width),
  height: Math.round(box.height)
});

/** 标题栏里这些元素自己处理指针，不触发拖动与双击缩放。 */
const NO_DRAG = 'button,input,.tl,.seg,.sfield,[data-nodrag]';

/**
 * 一个窗口的外框：宿主元素即 `.win`。拖动、缩放把手、缩放到全屏的补间与
 * 「神灯」最小化动画都在这里；内容由应用组件提供。
 */
@Component({
  selector: 'app-window-frame',
  imports: [NgComponentOutlet],
  host: {
    class: 'win',
    '[attr.id]': 'win().id',
    '[attr.data-app]': 'win().appId',
    '[class.opening]': 'win().opening()',
    '[class.closing]': 'win().closing()',
    '[class.front]': 'focused()',
    '[style.z-index]': 'win().zIndex() || 1',
    '(pointerdown)': 'startDrag($event)',
    '(dblclick)': 'titleDoubleClick($event)'
  },
  template: `
    @if (win().content(); as content) {
      <ng-container *ngComponentOutlet="content; injector: contentInjector()" />
    } @else {
      <ng-container *ngComponentOutlet="status; injector: contentInjector()" />
    }
    @for (edge of edges; track edge) {
      <div class="rz rz-{{ edge }}" [attr.data-rz]="edge" (pointerdown)="startResize($event, edge)"></div>
    }
  `
})
export class WindowFrame implements OnInit, WindowFrameHandle {
  private readonly wm = inject(WindowManager);
  private readonly dock = inject(DockState);
  private readonly renderer = inject(Renderer2);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  private prev: WindowBox | null = null;
  private genie: Animation | null = null;
  protected readonly edges = EDGES;
  protected readonly status = WindowStatus;
  protected readonly focused = computed(() => this.wm.focused() === this.win());
  protected readonly contentInjector = computed(() =>
    Injector.create({ providers: [{ provide: DesktopWindow, useValue: this.win() }], parent: this.injector })
  );

  readonly win = input.required<DesktopWindow>();

  constructor() {
    /* 捕获阶段聚焦：内部按钮弹出的菜单要落在已经抬到最前的窗口上。 */
    this.host.addEventListener('pointerdown', event => this.focusOnPress(event), true);
  }

  ngOnInit(): void {
    const win = this.win();
    win.frame = this;
    this.setBox(win.initialBox);
    /* 刷新后恢复出来的窗口（ADESK-US-104）带着缩放 / 最小化状态来，不放动画，直接就位。 */
    if (win.zoomed()) this.applyRestoredZoom();
    if (win.minimized()) this.applyRestoredMinimize();
  }

  minimize(): void {
    const win = this.win();
    if (win.minimized() || win.busy) return;
    win.busy = true;
    win.minimized.set(true);
    const rect = this.host.getBoundingClientRect();
    const target = this.dock.rectFor(win.appId);
    const tx = target.x - (rect.left + rect.width / 2);
    const ty = target.y - (rect.top + rect.height / 2);
    const sx = (target.w * 0.82) / rect.width;
    const sy = (target.h * 0.82) / rect.height;
    this.renderer.addClass(this.host, 'mini');
    const animation = this.host.animate(
      [
        {
          transform: 'translate(0px,0px) scale(1,1)',
          clipPath: 'polygon(0% 0%,100% 0%,100% 100%,0% 100%)',
          opacity: 1,
          borderRadius: '11px'
        },
        {
          transform: `translate(${tx * 0.5}px,${ty * 0.58}px) scale(${lerp(1, sx, 0.5)},${lerp(1, sy, 0.42)})`,
          clipPath: 'polygon(20% 0%,80% 0%,93% 100%,7% 100%)',
          opacity: 0.92,
          borderRadius: '22px',
          offset: 0.55
        },
        {
          transform: `translate(${tx}px,${ty}px) scale(${sx},${sy})`,
          clipPath: 'polygon(43% 0%,57% 0%,100% 100%,0% 100%)',
          opacity: 0.3,
          borderRadius: '40px'
        }
      ],
      { duration: 430, easing: 'cubic-bezier(.42,.02,.58,1)', fill: 'forwards' }
    );
    animation.onfinish = () => {
      this.host.style.visibility = 'hidden';
      win.hidden.set(true);
      win.busy = false;
      this.wm.focusFront();
    };
    this.genie = animation;
  }

  restore(): void {
    const win = this.win();
    if (!win.minimized() || win.busy) return;
    win.busy = true;
    win.minimized.set(false);
    win.hidden.set(false);
    this.host.style.visibility = '';
    this.wm.raise(win);
    const animation = this.genie;
    if (!animation) {
      /* 刷新后恢复成最小化的窗口没有神灯动画可倒放：用开窗的弹出动画代替。 */
      win.opening.set(true);
      setTimeout(() => win.opening.set(false), OPENING_MS);
      this.finishRestore();
      return;
    }
    /* 隐藏过的图层要重新光栅化：先在 Dock 里缩着等两帧，再倒放。 */
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (win.minimized() || this.genie !== animation) return;
        animation.reverse();
        animation.onfinish = () => this.finishRestore();
      })
    );
  }

  toggleZoom(): void {
    const win = this.win();
    if (!win.zoomed()) {
      this.prev = this.currentBox();
      win.zoomed.set(true);
      this.renderer.addClass(this.host, 'zoomed');
      this.tween({ left: 0, top: this.wm.menubarHeight(), width: innerWidth, height: this.wm.visibleHeight() });
      return;
    }
    win.zoomed.set(false);
    const prev = this.prev ?? this.currentBox();
    this.tween(prev, () => {
      this.renderer.removeClass(this.host, 'zoomed');
      this.commitBox();
    });
  }

  keepOnScreen(): void {
    const mb = this.wm.menubarHeight();
    if (this.win().zoomed()) {
      this.setBox({ left: 0, top: mb, width: innerWidth, height: this.wm.visibleHeight() });
      return;
    }
    const placed = placeOnScreen(this.measure(), { width: innerWidth, height: innerHeight }, mb);
    this.host.style.left = `${placed.left}px`;
    this.host.style.top = `${placed.top}px`;
    this.commitBox();
  }

  protected startDrag(event: PointerEvent): void {
    const target = event.target as Element;
    if (event.button !== 0 || !target.closest('[data-drag]') || target.closest(NO_DRAG)) return;
    if (this.win().zoomed()) return;
    this.drag(event);
  }

  protected titleDoubleClick(event: MouseEvent): void {
    const target = event.target as Element;
    if (target.closest('[data-drag]') && !target.closest(NO_DRAG)) this.wm.zoom(this.win().id);
  }

  protected startResize(event: PointerEvent, edge: ResizeEdge): void {
    if (event.button !== 0) return;
    const win = this.win();
    if (win.zoomed()) {
      win.zoomed.set(false);
      this.renderer.removeClass(this.host, 'zoomed');
    }
    const start = { x: event.clientX, y: event.clientY, ...this.measure() };
    const mb = this.wm.menubarHeight();
    /* 窄屏上应用声明的最小尺寸可能比视口还大：缩放不能把窗口撑出屏幕，最小尺寸以视口为上限。 */
    const minWidth = Math.min(win.minWidth, innerWidth - OPEN_WIDTH_MARGIN);
    const minHeight = Math.min(win.minHeight, innerHeight - mb - OPEN_HEIGHT_MARGIN);
    this.renderer.addClass(this.host, 'rsz');
    document.body.style.cursor = CURSORS[edge];
    const move = (ev: PointerEvent): void => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      let { left, top, width, height } = start;
      if (edge.includes('e')) width = Math.max(minWidth, start.width + dx);
      if (edge.includes('s')) height = Math.max(minHeight, start.height + dy);
      if (edge.includes('w')) {
        width = Math.max(minWidth, start.width - dx);
        left = start.left + (start.width - width);
      }
      if (edge.includes('n')) {
        height = Math.max(minHeight, start.height - dy);
        top = start.top + (start.height - height);
        if (top < mb) {
          height -= mb - top;
          top = mb;
        }
      }
      this.setBox({ left, top, width, height });
    };
    const up = (): void => {
      removeEventListener('pointermove', move, true);
      removeEventListener('pointerup', up, true);
      this.renderer.removeClass(this.host, 'rsz');
      document.body.style.cursor = '';
      this.commitBox();
      win.afterResize.next();
    };
    addEventListener('pointermove', move, true);
    addEventListener('pointerup', up, true);
  }

  private focusOnPress(event: PointerEvent): void {
    if (!(event.target as Element).closest('.tl')) this.wm.focus(this.win().id);
  }

  private finishRestore(): void {
    this.renderer.removeClass(this.host, 'mini');
    this.genie?.cancel();
    this.genie = null;
    this.win().busy = false;
    this.wm.focus(this.win().id);
  }

  private drag(event: PointerEvent): void {
    const host = this.host;
    const start = { x: event.clientX, y: event.clientY, left: host.offsetLeft, top: host.offsetTop };
    const mb = this.wm.menubarHeight();
    const motion = { vx: 0, vy: 0, lx: start.x, ly: start.y, lt: performance.now(), moved: false };
    const place = (left: number, top: number): [number, number] => {
      const x = clamp(left, -host.offsetWidth + 90, innerWidth - 90);
      const y = clamp(top, mb, innerHeight - 34);
      host.style.left = `${x}px`;
      host.style.top = `${y}px`;
      return [x, y];
    };
    this.renderer.addClass(host, 'drag');
    document.body.style.cursor = 'default';
    const move = (ev: PointerEvent): void => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (!motion.moved && Math.abs(dx) + Math.abs(dy) < 2) return;
      motion.moved = true;
      const now = performance.now();
      const dt = Math.max(8, now - motion.lt);
      motion.vx = ((ev.clientX - motion.lx) / dt) * 16;
      motion.vy = ((ev.clientY - motion.ly) / dt) * 16;
      Object.assign(motion, { lx: ev.clientX, ly: ev.clientY, lt: now });
      place(start.left + dx, start.top + dy);
    };
    const up = (): void => {
      removeEventListener('pointermove', move, true);
      removeEventListener('pointerup', up, true);
      this.renderer.removeClass(host, 'drag');
      this.commitBox();
      if (motion.moved && Math.hypot(motion.vx, motion.vy) >= 3) this.glide(motion.vx, motion.vy, place);
    };
    addEventListener('pointermove', move, true);
    addEventListener('pointerup', up, true);
  }

  /** 松手后一小段阻尼滑行，甩窗口才有物理感。 */
  private glide(vx: number, vy: number, place: (left: number, top: number) => [number, number]): void {
    let x = parseFloat(this.host.style.left);
    let y = parseFloat(this.host.style.top);
    const tick = (): void => {
      vx *= 0.86;
      vy *= 0.86;
      [x, y] = place(x + vx, y + vy);
      if (Math.hypot(vx, vy) > 0.4) requestAnimationFrame(tick);
      else this.commitBox();
    };
    requestAnimationFrame(tick);
  }

  private tween(to: WindowBox, done?: () => void): void {
    const from = this.measure();
    const t0 = performance.now();
    const tick = (now: number): void => {
      const t = clamp((now - t0) / 300, 0, 1);
      const k = 1 - Math.pow(1 - t, 3.2);
      this.setBox({
        left: lerp(from.left, to.left, k),
        top: lerp(from.top, to.top, k),
        width: lerp(from.width, to.width, k),
        height: lerp(from.height, to.height, k)
      });
      if (t < 1) requestAnimationFrame(tick);
      else done?.();
    };
    requestAnimationFrame(tick);
  }

  /** 刷新后恢复成缩放状态：不放补间，直接铺满；取消缩放时回到缩放前的几何（即窗口的初始几何）。 */
  private applyRestoredZoom(): void {
    this.prev = this.win().initialBox;
    this.renderer.addClass(this.host, 'zoomed');
    this.setBox({ left: 0, top: this.wm.menubarHeight(), width: innerWidth, height: this.wm.visibleHeight() });
  }

  /** 刷新后恢复成最小化状态：直接藏起来；从 Dock 还原时没有神灯动画可倒放（见 `restore`）。 */
  private applyRestoredMinimize(): void {
    this.renderer.addClass(this.host, 'mini');
    this.host.style.visibility = 'hidden';
  }

  /** 把窗口当前（缩放前）的几何交给窗口，窗口布局据此记录；几何没变时窗口那一侧不会通知。 */
  private commitBox(): void {
    const win = this.win();
    win.box.set(win.zoomed() ? roundBox(this.prev ?? this.currentBox()) : this.measure());
  }

  private measure(): WindowBox {
    const host = this.host;
    return { left: host.offsetLeft, top: host.offsetTop, width: host.offsetWidth, height: host.offsetHeight };
  }

  private currentBox(): WindowBox {
    const style = this.host.style;
    return {
      left: parseFloat(style.left),
      top: parseFloat(style.top),
      width: parseFloat(style.width),
      height: parseFloat(style.height)
    };
  }

  private setBox(box: WindowBox): void {
    Object.assign(this.host.style, {
      left: `${box.left}px`,
      top: `${box.top}px`,
      width: `${box.width}px`,
      height: `${box.height}px`
    });
  }
}
