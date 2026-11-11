import { restoreRuntimeSource } from './runtime-source';

export const SCRIPT_05_DOCK = restoreRuntimeSource(String.raw`
/* ============================================================================
   8 · DOCK  —  parabolic magnification driven by one rAF loop
   ========================================================================== */
const DOCK_ITEMS = [
  'finder', 'launchpad', 'safari', 'mail', 'messages', 'maps', 'photos',
  'notes', 'calendar', 'music', 'terminal', 'calculator', 'settings', '|', 'trash'
];

const Dock = {
  gap: 5, padX: 8, spread: 2.9,
  slots: [],           /* {node, base, w, id} */
  mx: null,            /* pointer x in dock space, null = not hovering */
  cur: [], tgt: [],    /* per-icon scale, smoothed */
  running: false, trashFull: false,

  init() {
    const dock = $('#dock');
    dock.innerHTML = '';
    this.slots = [];
    DOCK_ITEMS.forEach(id => {
      if (id === '|') { const d = el('<div class="divider"></div>'); dock.append(d); this.slots.push({ divider: true, node: d }); return; }
      const app = APPS[id];
      const node = el(\`<div class="di" data-app="\${id}" role="button" aria-label="\${esc(app.name)}">
          <div class="art">\${ic(app.icon)}</div><span class="dot"></span><span class="hit"></span></div>\`);
      dock.append(node);
      this.slots.push({ node, id, app });
    });
    dock.append(el('<div id="docktip"></div>'));

    this.cur = this.slots.map(() => 1);
    this.tgt = this.slots.map(() => 1);
    this.measure();

    dock.addEventListener('pointermove', e => { this.mx = e.clientX; this.kick(); });
    dock.addEventListener('pointerenter', e => { this.mx = e.clientX; this.kick(); });
    dock.addEventListener('pointerleave', () => { this.mx = null; this.hideTip(); this.kick(); });

    on(dock, 'pointerdown', '.di', (e, t) => {
      if (e.button !== 0) return;
      t.classList.add('press');
      const up = () => { t.classList.remove('press'); removeEventListener('pointerup', up); };
      addEventListener('pointerup', up);
    });
    on(dock, 'click', '.di', (e, t) => this.activate(t.dataset.app, t));
    on(dock, 'contextmenu', '.di', (e, t) => this.ctx(e, t));

    addEventListener('resize', () => this.measure());
    Bus.on('dockprefs', () => { this.measure(); });
  },

  /** Recompute base geometry; called on resize and preference changes. */
  measure() {
    const S = SYS.dockSize;
    document.documentElement.style.setProperty('--dock-size', S + 'px');
    this.gap = Math.round(S * 0.095);
    this.padX = Math.round(S * 0.15);
    let x = this.padX;
    this.slots.forEach(s => {
      if (s.divider) { s.w = Math.round(S * 0.30); s.base = x + s.w / 2; x += s.w; return; }
      s.w = S; s.base = x + S / 2; x += S + this.gap;
    });
    this.baseW = x - this.gap + this.padX;
    this.paint(true);
  },

  kick() { if (!this.running) { this.running = true; raf(this.frame); } },

  frame: null,   /* assigned below (needs \`this\` bound) */

  step() {
    const S = SYS.dockSize, dock = $('#dock');
    const rect = dock.getBoundingClientRect();
    const MAG = SYS.dockMagOn ? SYS.dockMag : 1;
    const reach = this.spread * S;

    /* --- targets ------------------------------------------------------- */
    /* Measured against the *rest* layout, not the live one. Feeding the magnified
       centres back in makes the scale an input to itself, which drags the peak off
       the icon you are actually pointing at as soon as magnification gets large.
       The tray is centre-anchored, so its midpoint is the one stable reference. */
    const restLeft = rect.left + rect.width / 2 - this.baseW / 2;
    let hovered = -1, best = 1e9;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (s.divider) { this.tgt[i] = 1; continue; }
      if (this.mx == null) { this.tgt[i] = 1; continue; }
      const cx = restLeft + s.base;
      const d = Math.abs(this.mx - cx);
      if (d < best) { best = d; hovered = i; }
      const u = clamp(1 - d / reach, 0, 1);
      /* cosine bell — matches the real dock's falloff far better than linear */
      this.tgt[i] = 1 + (MAG - 1) * (0.5 - 0.5 * Math.cos(Math.PI * u)) ** 0.86;
    }

    /* --- smoothing (critically damped feel) ------------------------------ */
    let settled = true;
    for (let i = 0; i < this.cur.length; i++) {
      const d = this.tgt[i] - this.cur[i];
      if (Math.abs(d) > 0.0007) { this.cur[i] += d * 0.38; settled = false; }
      else this.cur[i] = this.tgt[i];
    }

    this.paint();

    /* tooltip follows the nearest icon while hovering */
    if (this.mx != null && hovered >= 0 && best < S * 0.75) this.showTip(hovered);
    else this.hideTip();

    if (!settled) raf(this.frame); else this.running = false;
  },

  /** Lay icons out from their smoothed widths so nothing ever overlaps. */
  paint(force) {
    const S = SYS.dockSize;
    let total = this.padX * 2;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      total += (s.divider ? s.w : S * this.cur[i]) + (s.divider ? 0 : this.gap);
    }
    total -= this.gap;

    let x = this.padX;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i], k = this.cur[i];
      if (s.divider) {
        s.laidCenter = x + s.w / 2;
        s.node.style.transform = \`translateX(\${(x).toFixed(2)}px)\`;
        x += s.w; continue;
      }
      const w = S * k;
      s.laidCenter = x + w / 2;
      /* translate so the (unscaled) box lands centred on its slot, then scale from the base */
      const tx = s.laidCenter - S / 2;
      s.node.style.setProperty('--tf', \`translate3d(\${tx.toFixed(2)}px,0,0) scale(\${k.toFixed(4)})\`);
      s.node.style.transform = \`translate3d(\${tx.toFixed(2)}px,0,0) scale(\${k.toFixed(4)})\`;
      x += w + this.gap;
    }
    $('#dock').style.width = total.toFixed(2) + 'px';
  },

  showTip(i) {
    const s = this.slots[i]; if (!s || !s.app) return;
    const tip = $('#docktip');
    tip.textContent = s.app.name;
    tip.style.left = s.laidCenter + 'px';
    tip.classList.add('on');
  },
  hideTip() { const t = $('#docktip'); if (t) t.classList.remove('on'); },

  slotFor(id) { return this.slots.find(s => s.id === id); },
  rectFor(id) {
    const s = this.slotFor(id);
    if (!s) { const d = $('#dock').getBoundingClientRect(); return { x: d.left + d.width / 2, y: d.top + d.height / 2, w: SYS.dockSize, h: SYS.dockSize }; }
    const d = $('#dock').getBoundingClientRect();
    return { x: d.left + s.laidCenter, y: d.bottom - 9 - SYS.dockSize / 2, w: SYS.dockSize, h: SYS.dockSize };
  },

  activate(id, node) {
    if (id === 'launchpad') { Launchpad.toggle(); return; }
    if (id === 'trash') { WM.open('finder', { path: ['Trash'] }); return; }
    const existing = WM.byApp(id);
    if (existing.length) {
      const mini = existing.find(w => w.min);
      if (mini) WM.unmin(mini.id);
      else WM.focus(existing[existing.length - 1].id);
      return;
    }
    this.bounce(id);
    WM.open(id);
  },

  bounce(id) {
    const s = this.slotFor(id); if (!s) return;
    s.node.classList.remove('bounce'); void s.node.offsetWidth;
    s.node.classList.add('bounce');
    setTimeout(() => s.node.classList.remove('bounce'), 3200);
  },
  stopBounce(id) { const s = this.slotFor(id); if (s) s.node.classList.remove('bounce'); },

  setRunning(id, on) { const s = this.slotFor(id); if (s) s.node.classList.toggle('run', on); },
  setTrashFull(full) {
    this.trashFull = full;
    const s = this.slotFor('trash'); if (s) s.node.querySelector('.art').innerHTML = ic(full ? 'app-trash-full' : 'app-trash');
  },

  ctx(e, t) {
    const id = t.dataset.app, app = APPS[id];
    const open = WM.byApp(id);
    if (id === 'trash') {
      return ctxMenu(e, [
        { id: 'o', label: 'Open', run: () => WM.open('finder', { path: ['Trash'] }) },
        { id: 'e', label: 'Empty Trash', disabled: !this.trashFull, run: () => { this.setTrashFull(false); Toast('Trash emptied'); } },
      ]);
    }
    const items = [];
    if (open.length > 1) items.push({ head: 'Windows' }, ...open.map((w, i) => ({ id: 'w' + i, label: w.title, run: () => WM.focus(w.id) })), '-');
    items.push(
      { id: 'new', label: 'New Window', run: () => WM.open(id, { force: true }) },
      { id: 'opt', label: 'Options', key: '▸' },
      { id: 'show', label: 'Show in Finder', run: () => WM.open('finder', { path: ['Macintosh HD', 'Applications'], select: app.name + '.app' }) },
      '-',
      open.length
        ? { id: 'quit', label: 'Quit', run: () => WM.quitApp(id) }
        : { id: 'open', label: 'Open', run: () => this.activate(id, t) }
    );
    ctxMenu(e, items);
  }
};
Dock.frame = () => Dock.step();
`);
