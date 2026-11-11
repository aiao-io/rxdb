import { restoreRuntimeSource } from './runtime-source';

export const SCRIPT_04_DESKTOP = restoreRuntimeSource(String.raw`
/* ============================================================================
   7 · DESKTOP
   ========================================================================== */
const GRID = { w: 92, h: 98, padTop: 8, padRight: 12 };

const Desktop = {
  items: [
    { id: 'hd', name: 'Macintosh HD', icon: 'f-hd', cell: [0, 0], open: () => WM.open('finder', { path: ['Macintosh HD'] }) },
    { id: 'projects', name: 'Projects', icon: 'f-folder', cell: [0, 1], open: () => WM.open('finder', { path: ['Prasenjit', 'Projects'] }) },
    { id: 'notes', name: 'prasenx.txt', icon: 'f-txt', cell: [0, 2], open: () => WM.open('textedit', { file: 'prasenx.txt' }) },
    { id: 'shot', name: 'Screenshot 2026‑07‑27 at 4.34.11 PM.png', icon: 'f-img', cell: [0, 3], open: () => WM.open('preview', { file: 'Screenshot' }) },
    { id: 'guide', name: 'Interface Guidelines.pdf', icon: 'f-pdf', cell: [1, 0], open: () => WM.open('preview', { file: 'Interface Guidelines.pdf' }) },
  ],

  init() {
    const host = $('#desktop');
    this.items.forEach(it => {
      const n = el(\`<div class="dicon" data-id="\${it.id}" tabindex="-1">
        <div class="art">\${ic(it.icon)}</div><div class="lbl">\${esc(it.name)}</div></div>\`);
      host.append(n); it.node = n;
    });
    this.layout();
    addEventListener('resize', () => this.layout());

    on(host, 'pointerdown', '.dicon', (e, t) => this.grab(e, t));
    on(host, 'dblclick', '.dicon', (e, t) => {
      const it = this.items.find(i => i.id === t.dataset.id);
      if (it && it.open) it.open();
    });
    on(host, 'contextmenu', '.dicon', (e, t) => {
      this.select(t.dataset.id);
      const it = this.items.find(i => i.id === t.dataset.id);
      ctxMenu(e, [
        { id: 'o', label: 'Open', run: () => it.open && it.open() },
        { id: 'w', label: 'Open With', key: '▸' }, '-',
        { id: 'i', label: 'Get Info', key: '⌘I', run: () => Toast(\`\${it.name} — 0 bytes\`) },
        { id: 'r', label: 'Rename', run: () => Toast('Renaming is left as an exercise.') },
        { id: 'd', label: 'Duplicate', key: '⌘D', run: () => Toast('Duplicated') }, '-',
        { id: 't', label: 'Move to Trash', key: '⌘⌫', run: () => this.trash(it) }, '-',
        { id: 'q', label: 'Quick Look', key: '␣', run: () => it.open && it.open() },
      ]);
    });

    /* marquee + deselect */
    host.addEventListener('pointerdown', e => {
      if (e.target.closest('.dicon, .wgt')) return;
      if (e.button !== 0) return;
      this.select(null);
      this.marquee(e);
    });
    host.addEventListener('contextmenu', e => {
      if (e.target.closest('.dicon, .wgt')) return;
      ctxMenu(e, [
        { id: 'nf', label: 'New Folder', run: () => this.newFolder() },
        { id: 'gi', label: 'Get Info', run: () => WM.open('about') }, '-',
        { id: 'cw', label: 'Change Wallpaper…', run: () => WM.open('settings', { section: 'wallpaper' }) },
        { id: 'ew', label: 'Edit Widgets…', run: () => Toast('Widgets are already on the desktop.') }, '-',
        { id: 'st', label: 'Use Stacks', key: '⌃⌘0' },
        { id: 'sb', label: 'Sort By', key: '▸' },
        { id: 'vo', label: 'Show View Options', key: '⌘J' },
      ]);
    });
    this.buildWidgets();
  },

  cellPos(col, row) {
    return {
      x: innerWidth - GRID.padRight - (col + 1) * GRID.w,
      y: parseInt(getComputedStyle(document.documentElement).getPropertyValue('--mb-h')) + GRID.padTop + row * GRID.h,
    };
  },
  posCell(x, y) {
    const mb = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--mb-h'));
    const col = Math.round((innerWidth - GRID.padRight - GRID.w - x) / GRID.w);
    const row = Math.round((y - mb - GRID.padTop) / GRID.h);
    const maxRow = Math.floor((innerHeight - mb - GRID.padTop - 110) / GRID.h);
    return [clamp(col, 0, Math.floor(innerWidth / GRID.w) - 2), clamp(row, 0, Math.max(0, maxRow))];
  },
  layout() {
    this.items.forEach(it => {
      const p = this.cellPos(it.cell[0], it.cell[1]);
      it.node.style.left = p.x + 'px'; it.node.style.top = p.y + 'px';
    });
  },
  select(id) {
    this.items.forEach(i => i.node.classList.toggle('sel', i.id === id));
  },

  grab(e, node) {
    if (e.button !== 0) return;
    const it = this.items.find(i => i.id === node.dataset.id);
    this.select(it.id);
    const sx = e.clientX, sy = e.clientY;
    const ox = parseFloat(node.style.left), oy = parseFloat(node.style.top);
    let moved = false;
    node.setPointerCapture(e.pointerId);
    const mv = ev => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!moved && Math.hypot(dx, dy) < 3) return;
      if (!moved) { moved = true; node.classList.add('drag'); node.classList.remove('settle'); }
      node.style.left = (ox + dx) + 'px';
      node.style.top = clamp(oy + dy, 22, innerHeight - 120) + 'px';
    };
    const up = () => {
      node.removeEventListener('pointermove', mv); node.removeEventListener('pointerup', up);
      if (!moved) return;
      node.classList.remove('drag');
      const [c, r] = this.posCell(parseFloat(node.style.left), parseFloat(node.style.top));
      /* nudge aside if the target cell is taken */
      let col = c, row = r, guard = 0;
      while (this.items.some(i => i !== it && i.cell[0] === col && i.cell[1] === row) && guard++ < 40) {
        row++; if (row > 5) { row = 0; col++; }
      }
      it.cell = [col, row];
      node.classList.add('settle');
      const p = this.cellPos(col, row);
      node.style.left = p.x + 'px'; node.style.top = p.y + 'px';
      setTimeout(() => node.classList.remove('settle'), 300);
    };
    node.addEventListener('pointermove', mv); node.addEventListener('pointerup', up);
  },

  marquee(e) {
    const box = $('#marquee'), sx = e.clientX, sy = e.clientY;
    let live = false;
    const mv = ev => {
      if (!live && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
      live = true; box.style.display = 'block';
      const l = Math.min(sx, ev.clientX), t = Math.min(sy, ev.clientY);
      const w = Math.abs(ev.clientX - sx), h = Math.abs(ev.clientY - sy);
      Object.assign(box.style, { left: l + 'px', top: t + 'px', width: w + 'px', height: h + 'px' });
      const R = { l, t, r: l + w, b: t + h };
      this.items.forEach(i => {
        const b = i.node.getBoundingClientRect();
        i.node.classList.toggle('sel', !(b.right < R.l || b.left > R.r || b.bottom < R.t || b.top > R.b));
      });
    };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); box.style.display = 'none'; };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  },

  newFolder() {
    const n = this.items.filter(i => i.name.startsWith('untitled folder')).length;
    const name = 'untitled folder' + (n ? ' ' + (n + 1) : '');
    let col = 0, row = 0, guard = 0;
    while (this.items.some(i => i.cell[0] === col && i.cell[1] === row) && guard++ < 40) { row++; if (row > 5) { row = 0; col++; } }
    const it = { id: 'nf' + Date.now(), name, icon: 'f-folder', cell: [col, row], open: () => WM.open('finder', { path: ['Prasenjit', 'Desktop'] }) };
    const node = el(\`<div class="dicon" data-id="\${it.id}"><div class="art">\${ic(it.icon)}</div><div class="lbl">\${esc(name)}</div></div>\`);
    $('#desktop').append(node); it.node = node; this.items.push(it);
    this.layout(); this.select(it.id);
  },
  trash(it) {
    it.node.style.transition = 'transform .22s var(--e-io),opacity .22s ease';
    it.node.style.transform = 'scale(.4)'; it.node.style.opacity = '0';
    setTimeout(() => { it.node.remove(); this.items = this.items.filter(i => i !== it); Dock.setTrashFull(true); }, 230);
  },

  buildWidgets() {
    $('#dwidgets').innerHTML = '';
    $('#dwidgets').append(Widgets.calendar({ compact: true }), Widgets.weather({ compact: true }), Widgets.stocks({ compact: true }));
  }
};

/* Sleep / lock screen */
const Screen = {
  brightness: 0.92,
  /* Dim with an overlay, never \`filter\` on the wallpaper: a filtered element gets
     its own render surface, and Chromium then composites the desktop icons *above*
     any backdrop-filter panel instead of blurring them into it. Dimming the whole
     stage is also what real brightness does — windows included. */
  setBrightness(v) {
    this.brightness = clamp(v, .25, 1);
    const d = $('#dimmer');
    if (d) d.style.opacity = ((1 - this.brightness) * .78).toFixed(3);
  },
  sleep() {
    Pop.close();
    const v = el(\`<div id="sleeper"></div>\`);
    document.body.append(v);
    setTimeout(() => { v.classList.add('wake'); setTimeout(() => v.remove(), 900); }, 1000);
  }
};

/* Toast — used for the handful of actions that have no real destination */
let toastTimer;
function Toast(msg) {
  let t = $('#toast');
  if (!t) { t = el(\`<div id="toast"></div>\`); $('#stage').append(t); }
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2100);
}
`);
