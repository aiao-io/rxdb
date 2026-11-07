import { dockTargets, measureDock, placeDock, smoothDock, type DockGeometry } from './dock-layout.js';

/** 一个按需运行的动画循环管理 Dock 布局、名称气泡及独立的启动弹跳。 */
export class DockMotion {
  private readonly lifetime = new AbortController();
  private readonly media = matchMedia('(prefers-reduced-motion: reduce)');
  private readonly nodes: HTMLElement[];
  private readonly animations = new Map<string, Animation>();
  private geometry!: DockGeometry;
  private scales: number[] = [];
  private center = 0;
  private pointer: number | null = null;
  private focused = -1;
  private touching = false;
  private frame = 0;
  private lastTime = 0;

  private get enabled() {
    return !this.reducedMotion && !this.media.matches;
  }

  constructor(
    private readonly root: HTMLElement,
    private readonly tooltip: HTMLElement,
    private readonly reducedMotion: boolean
  ) {
    this.nodes = Array.from(root.querySelectorAll<HTMLElement>('[data-dock-slot]'));
    const options = { signal: this.lifetime.signal };
    root.addEventListener('pointerenter', this.point, options);
    root.addEventListener('pointermove', this.point, options);
    root.addEventListener('pointerdown', this.point, options);
    root.addEventListener('pointerleave', this.leave, options);
    root.addEventListener('pointercancel', this.leave, options);
    root.addEventListener('focusin', this.focus, options);
    root.addEventListener('focusout', this.unfocus, options);
    root.addEventListener('toggle', this.menu, { ...options, capture: true });
    window.addEventListener('resize', this.measure, options);
    window.addEventListener('blur', this.leave, options);
    document.addEventListener('visibilitychange', this.visibility, options);
    document.addEventListener('keydown', this.keyboard, options);
    this.media.addEventListener('change', this.preferences, options);
    this.measure();
  }

  bounce(id: string): void {
    if (!this.enabled) return;
    const node = this.nodes.find(node => node.dataset['dockId'] === id)!;
    const art = node.querySelector<HTMLElement>('.dock-art')!;
    this.animations.get(id)?.cancel();
    const animation = art.animate(
      [
        { transform: 'translateY(0)', offset: 0 },
        { transform: 'translateY(-40px)', offset: 0.22 },
        { transform: 'translateY(0)', offset: 0.48 },
        { transform: 'translateY(-5px)', offset: 0.55 },
        { transform: 'translateY(0)', offset: 0.62 },
        { transform: 'translateY(0)', offset: 1 }
      ],
      { duration: 920, easing: 'cubic-bezier(.33,0,.35,1)' }
    );
    this.animations.set(id, animation);
    const finished = () => {
      if (this.animations.get(id) === animation) this.animations.delete(id);
    };
    void animation.finished.then(finished, finished);
  }

  dispose(): void {
    this.lifetime.abort();
    cancelAnimationFrame(this.frame);
    for (const animation of this.animations.values()) animation.cancel();
    this.animations.clear();
    this.root.style.removeProperty('--dock-size');
    this.root.style.removeProperty('--dock-width');
    for (const node of this.nodes) {
      node.style.removeProperty('--dock-x');
      node.style.removeProperty('--dock-scale');
    }
    this.tooltip.removeAttribute('data-visible');
  }

  private readonly measure = () => {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.lastTime = 0;
    this.pointer = null;
    this.focused = -1;
    this.geometry = measureDock(
      this.nodes.map(node => (node.dataset['dockSlot'] === 'divider' ? 'divider' : 'icon')),
      Math.max(1, window.innerWidth - 24)
    );
    this.scales = this.nodes.map(() => 1);
    this.root.style.setProperty('--dock-size', `${this.geometry.size}px`);
    const bounds = this.root.getBoundingClientRect();
    this.center = bounds.left + bounds.width / 2;
    this.paint();
  };

  private readonly point = (event: PointerEvent) => {
    this.touching = event.pointerType === 'touch';
    if (this.touching) {
      this.leave();
      return;
    }
    if (this.root.querySelector('.running-menu[open]')) return;
    this.pointer = event.clientX - this.center + this.geometry.width / 2;
    this.focused = -1;
    this.kick();
  };

  private readonly leave = () => {
    this.pointer = null;
    this.focused = -1;
    this.kick();
  };

  private readonly keyboard = (event: KeyboardEvent) => {
    if (event.key !== 'Tab') return;
    this.touching = false;
    this.pointer = null;
    this.focused = this.nodes.findIndex(node => node.contains(document.activeElement));
    this.kick();
  };

  private readonly focus = (event: FocusEvent) => {
    if (this.touching || this.pointer !== null || !(event.target instanceof Element)) return;
    const item = event.target.closest<HTMLElement>('[data-dock-item]');
    this.focused = this.nodes.findIndex(node => node === item);
    this.kick();
  };

  private readonly unfocus = () => {
    this.focused = -1;
    this.kick();
  };

  private readonly menu = (event: Event) => {
    if (event.target instanceof Element && event.target.matches('.running-menu')) this.leave();
  };

  private readonly visibility = () => {
    if (document.hidden) this.measure();
  };

  private readonly preferences = () => {
    for (const animation of this.animations.values()) animation.cancel();
    this.animations.clear();
    this.measure();
  };

  private kick() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(this.step);
  }

  private readonly step = (now: number) => {
    this.frame = 0;
    const pointer = this.focused >= 0 ? this.geometry.slots[this.focused].center : this.pointer;
    const target = dockTargets(this.geometry, this.enabled ? pointer : null);
    const elapsed = this.lastTime === 0 ? 1000 / 60 : Math.min(64, now - this.lastTime);
    this.lastTime = now;
    this.scales = smoothDock(this.scales, target, elapsed);
    this.paint();
    if (this.scales.some((scale, index) => scale !== target[index])) this.kick();
    else this.lastTime = 0;
  };

  private paint() {
    const layout = placeDock(this.geometry, this.scales);
    this.root.style.setProperty('--dock-width', `${layout.width}px`);
    this.nodes.forEach((node, index) => {
      const item = layout.items[index];
      node.style.setProperty('--dock-x', `${item.x}px`);
      node.style.setProperty('--dock-scale', `${item.scale}`);
    });
    const hovered = this.nearest();
    this.tooltip.toggleAttribute('data-visible', hovered >= 0);
    if (hovered < 0) return;
    this.tooltip.textContent = this.nodes[hovered].dataset['dockLabel']!;
    this.tooltip.style.left = `${layout.items[hovered].center}px`;
    this.tooltip.style.bottom = `${9 + this.geometry.size * this.scales[hovered] + 14}px`;
  }

  private nearest(): number {
    if (this.root.querySelector('.running-menu[open]')) return -1;
    if (this.focused >= 0) return this.focused;
    if (this.pointer === null) return -1;
    let index = -1;
    let distance = this.geometry.size * 0.75;
    this.geometry.slots.forEach((slot, candidate) => {
      const delta = Math.abs(this.pointer! - slot.center);
      if (slot.kind === 'divider' || delta >= distance) return;
      index = candidate;
      distance = delta;
    });
    return index;
  }
}
