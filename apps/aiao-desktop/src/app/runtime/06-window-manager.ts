import { restoreRuntimeSource } from './runtime-source';

export const SCRIPT_06_WINDOW_MANAGER = restoreRuntimeSource(String.raw`
/* ============================================================================
   9 · WINDOW MANAGER
   ========================================================================== */
const TL_HTML =
  \`<div class="tl" data-tl>
     <b class="c" data-w="close">\${ic('g-x')}</b>
     <b class="m" data-w="min">\${ic('g-minus')}</b>
     <b class="f" data-w="zoom">\${ic('g-chev-ud')}</b>
   </div>\`;

/** Standard title bar markup for apps that want one. */
function titlebar(title, o = {}) {
  return \`<div class="tb\${o.tall ? ' tall' : ''}\${o.plain ? ' plain' : ''}\${o.dark ? ' dark' : ''}" data-drag>
    <div class="title">\${esc(title)}</div>
    <div class="tbz">\${TL_HTML}\${o.left || ''}</div>
    <div class="grow"></div>
    <div class="tbz">\${o.right || ''}</div>
  </div>\`;
}

const WM = {
  list: [], z: 10, seq: 0, cascade: 0,

  mb() { return parseInt(getComputedStyle(document.documentElement).getPropertyValue('--mb-h')) || 25; },
  dockTop() { return innerHeight - (SYS.dockSize + 14 + 12); },

  byApp(id) { return this.list.filter(w => w.app === id && !w.dead); },
  get front() { return this.list.filter(w => !w.min && !w.dead).sort((a, b) => a.zi - b.zi).pop(); },

  open(appId, opts = {}) {
    const app = APPS[appId];
    if (!app) return Toast('Unknown app: ' + appId);
    if (!opts.force) {
      const ex = this.byApp(appId);
      if (ex.length && app.single !== false) {
        const w = ex[ex.length - 1];
        if (w.min) this.unmin(w.id); else this.focus(w.id);
        if (app.reopen) app.reopen(w, opts);
        return w;
      }
    }
    Dock.bounce(appId);

    const id = 'w' + (++this.seq);
    const W = Math.min(opts.w || app.w || 860, innerWidth - 60);
    const H = Math.min(opts.h || app.h || 560, innerHeight - this.mb() - 90);
    const step = 26, n = this.cascade++ % 7;
    const L = Math.round(clamp((innerWidth - W) / 2 - 90 + n * step, 14, innerWidth - W - 14));
    const T = Math.round(clamp(this.mb() + 26 + n * step, this.mb() + 6, innerHeight - H - 90));

    const node = el(\`<div class="win opening" id="\${id}" data-app="\${appId}"></div>\`);
    Object.assign(node.style, { left: L + 'px', top: T + 'px', width: W + 'px', height: H + 'px' });

    const w = {
      id, app: appId, node, title: app.name, min: false, zoomed: false,
      minW: app.minW || 380, minH: app.minH || 240, zi: 0, api: {}
    };
    this.list.push(w);

    node.innerHTML = (app.mount ? app.mount(w, opts) : \`<div class="wb"></div>\`) +
      ['n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se'].map(d => \`<div class="rz rz-\${d}" data-rz="\${d}"></div>\`).join('');

    const slot = node.querySelector('[data-tl]');
    if (slot) slot.outerHTML = TL_HTML.replace(' data-tl', '');
    else node.insertAdjacentHTML('afterbegin', TL_HTML.replace('class="tl"', 'class="tl float"'));

    $('#layer-win').append(node);
    if (app.ready) app.ready(w, opts);

    this.wire(w);
    this.focus(id);
    Dock.setRunning(appId, true);
    setTimeout(() => { node.classList.remove('opening'); Dock.stopBounce(appId); }, 320);
    return w;
  },

  wire(w) {
    const node = w.node;
    node.addEventListener('pointerdown', e => {
      if (!e.target.closest('.tl')) this.focus(w.id);
    }, true);
    on(node, 'click', '.tl b', (e, t) => {
      e.stopPropagation();
      const a = t.dataset.w;
      if (a === 'close') this.close(w.id);
      if (a === 'min') this.minimize(w.id);
      if (a === 'zoom') this.zoom(w.id);
    });
    on(node, 'pointerdown', '[data-drag]', (e, t) => {
      if (e.button !== 0) return;
      if (e.target.closest('button,input,.tl,.seg,.sfield,[data-nodrag]')) return;
      this.drag(w, e);
    });
    on(node, 'dblclick', '[data-drag]', e => {
      if (e.target.closest('button,input,.tl,.seg,.sfield,[data-nodrag]')) return;
      this.zoom(w.id);
    });
    on(node, 'pointerdown', '[data-rz]', (e, t) => { if (e.button === 0) this.resize(w, e, t.dataset.rz); });
  },

  focus(id) {
    const w = this.list.find(x => x.id === id); if (!w || w.dead) return;
    w.zi = ++this.z;
    this.list.forEach(x => { x.node.classList.toggle('front', x === w); x.node.style.zIndex = x.zi || 1; });
    const app = APPS[w.app];
    MenuBar.setApp(app.name, app.menus ? app.menus() : stdMenus(w.app));
    this.syncMenubarFill();
  },

  /* The menu bar goes opaque when a zoomed window reaches it, like the real thing. */
  syncMenubarFill() {
    const any = this.list.some(w => !w.dead && !w.min && w.zoomed);
    $('#menubar').classList.toggle('opaque', any);
  },

  close(id) {
    const w = this.list.find(x => x.id === id); if (!w || w.dead) return;
    w.dead = true;
    if (APPS[w.app].onClose) APPS[w.app].onClose(w);
    w.node.classList.add('closing');
    setTimeout(() => {
      w.node.remove();
      this.list = this.list.filter(x => x !== w);
      if (!this.byApp(w.app).length) Dock.setRunning(w.app, false);
      this.syncMenubarFill();
      const f = this.front;
      if (f) this.focus(f.id);
      else { MenuBar.setApp('Finder', APP_MENUS.finder); }
    }, 200);
  },

  minimize(id) {
    const w = this.list.find(x => x.id === id);
    if (!w || w.min || w.busy) return;
    w.busy = true; w.min = true;
    const n = w.node, r = n.getBoundingClientRect(), d = Dock.rectFor(w.app);
    const tx = d.x - (r.left + r.width / 2), ty = d.y - (r.top + r.height / 2);
    const sx = (d.w * 0.82) / r.width, sy = (d.h * 0.82) / r.height;
    n.classList.add('mini');
    const a = n.animate([
      { transform: 'translate(0px,0px) scale(1,1)', clipPath: 'polygon(0% 0%,100% 0%,100% 100%,0% 100%)', opacity: 1, borderRadius: '11px' },
      { transform: \`translate(\${tx * .5}px,\${ty * .58}px) scale(\${lerp(1, sx, .5)},\${lerp(1, sy, .42)})\`, clipPath: 'polygon(20% 0%,80% 0%,93% 100%,7% 100%)', opacity: .92, borderRadius: '22px', offset: .55 },
      { transform: \`translate(\${tx}px,\${ty}px) scale(\${sx},\${sy})\`, clipPath: 'polygon(43% 0%,57% 0%,100% 100%,0% 100%)', opacity: .3, borderRadius: '40px' },
    ], { duration: 430, easing: 'cubic-bezier(.42,.02,.58,1)', fill: 'forwards' });
    a.onfinish = () => {
      n.style.visibility = 'hidden'; w.busy = false;
      this.syncMenubarFill();
      const f = this.front; if (f) this.focus(f.id);
    };
    w.anim = a;
  },

  unmin(id) {
    const w = this.list.find(x => x.id === id);
    if (!w || !w.min || w.busy) return;
    w.busy = true; w.min = false;
    const n = w.node;
    n.style.visibility = '';
    /* Raise it without repainting the rest of the stack: a full focus() re-shadows
       every other window, and those shadows are expensive enough to eat frames off
       the front of the warp. The real focus lands when the window arrives. */
    n.style.zIndex = ++this.z;
    /* Un-hiding still costs a re-raster of the window's contents, since hidden layers
       get thrown away. Give the compositor two frames to catch up while the window
       sits shrunk in the dock, too small to see. */
    if (w.anim) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (w.min || !w.anim) return;
        w.anim.reverse();
        w.anim.onfinish = () => {
          n.classList.remove('mini'); if (w.anim) w.anim.cancel(); w.anim = null; w.busy = false;
          this.focus(id);
        };
      }));
    } else { n.classList.remove('mini'); w.busy = false; this.focus(id); }
  },

  /* AppKit's visibleFrame: zoom stops short of the dock instead of tucking under
     it. Read from the tokens, not the tray's box, so a mid-magnification hover
     can't change the answer. */
  visibleH() {
    const cs = getComputedStyle(document.documentElement);
    const px = k => parseFloat(cs.getPropertyValue(k)) || 0;
    return innerHeight - this.mb() - (px('--dock-size') + 14 + px('--dock-bottom') + 5);
  },

  zoom(id) {
    const w = this.list.find(x => x.id === id); if (!w) return;
    const n = w.node;
    const mb = this.mb();
    if (!w.zoomed) {
      w.prev = { left: n.style.left, top: n.style.top, width: n.style.width, height: n.style.height };
      w.zoomed = true; n.classList.add('zoomed');
      this.tweenBox(n, { left: 0, top: mb, width: innerWidth, height: this.visibleH() });
    } else {
      w.zoomed = false;
      this.tweenBox(n, {
        left: parseFloat(w.prev.left), top: parseFloat(w.prev.top),
        width: parseFloat(w.prev.width), height: parseFloat(w.prev.height)
      }, () => n.classList.remove('zoomed'));
    }
    this.syncMenubarFill();
  },

  tweenBox(n, to, done) {
    const from = { left: n.offsetLeft, top: n.offsetTop, width: n.offsetWidth, height: n.offsetHeight };
    const t0 = performance.now(), D = 300;
    const ease = t => 1 - Math.pow(1 - t, 3.2);
    const tick = now => {
      const t = clamp((now - t0) / D, 0, 1), k = ease(t);
      n.style.left = lerp(from.left, to.left, k) + 'px';
      n.style.top = lerp(from.top, to.top, k) + 'px';
      n.style.width = lerp(from.width, to.width, k) + 'px';
      n.style.height = lerp(from.height, to.height, k) + 'px';
      if (t < 1) raf(tick); else if (done) done();
    };
    raf(tick);
  },

  drag(w, e) {
    if (w.zoomed) return;
    const n = w.node;
    const sx = e.clientX, sy = e.clientY;
    const ox = n.offsetLeft, oy = n.offsetTop;
    const mb = this.mb();
    let vx = 0, vy = 0, lx = sx, ly = sy, lt = performance.now(), moved = false;
    n.classList.add('drag');
    document.body.style.cursor = 'default';
    const mv = ev => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 2) return;
      moved = true;
      const now = performance.now(), dt = Math.max(8, now - lt);
      vx = (ev.clientX - lx) / dt * 16; vy = (ev.clientY - ly) / dt * 16;
      lx = ev.clientX; ly = ev.clientY; lt = now;
      n.style.left = clamp(ox + dx, -n.offsetWidth + 90, innerWidth - 90) + 'px';
      n.style.top = clamp(oy + dy, mb, innerHeight - 34) + 'px';
    };
    const up = () => {
      removeEventListener('pointermove', mv, true); removeEventListener('pointerup', up, true);
      n.classList.remove('drag');
      if (!moved) return;
      /* short damped glide so releasing a flick feels physical, not abrupt */
      const speed = Math.hypot(vx, vy);
      if (speed < 3) return;
      let px = parseFloat(n.style.left), py = parseFloat(n.style.top);
      const tick = () => {
        vx *= 0.86; vy *= 0.86;
        px = clamp(px + vx, -n.offsetWidth + 90, innerWidth - 90);
        py = clamp(py + vy, mb, innerHeight - 34);
        n.style.left = px + 'px'; n.style.top = py + 'px';
        if (Math.hypot(vx, vy) > 0.4) raf(tick);
      };
      raf(tick);
    };
    addEventListener('pointermove', mv, true); addEventListener('pointerup', up, true);
  },

  resize(w, e, dir) {
    const n = w.node;
    if (w.zoomed) { w.zoomed = false; n.classList.remove('zoomed'); this.syncMenubarFill(); }
    const s = { x: e.clientX, y: e.clientY, l: n.offsetLeft, t: n.offsetTop, w: n.offsetWidth, h: n.offsetHeight };
    const mb = this.mb();
    n.classList.add('rsz');
    const cursor = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize' }[dir];
    document.body.style.cursor = cursor;
    const mv = ev => {
      const dx = ev.clientX - s.x, dy = ev.clientY - s.y;
      let L = s.l, T = s.t, W = s.w, H = s.h;
      if (dir.includes('e')) W = Math.max(w.minW, s.w + dx);
      if (dir.includes('s')) H = Math.max(w.minH, s.h + dy);
      if (dir.includes('w')) { W = Math.max(w.minW, s.w - dx); L = s.l + (s.w - W); }
      if (dir.includes('n')) { H = Math.max(w.minH, s.h - dy); T = s.t + (s.h - H); if (T < mb) { H -= (mb - T); T = mb; } }
      Object.assign(n.style, { left: L + 'px', top: T + 'px', width: W + 'px', height: H + 'px' });
    };
    const up = () => {
      removeEventListener('pointermove', mv, true); removeEventListener('pointerup', up, true);
      n.classList.remove('rsz'); document.body.style.cursor = '';
      if (APPS[w.app].onResize) APPS[w.app].onResize(w);
    };
    addEventListener('pointermove', mv, true); addEventListener('pointerup', up, true);
  },

  /* ---- menu-driven helpers ---- */
  closeFront() { const f = this.front; if (f) this.close(f.id); },
  minFront() { const f = this.front; if (f) this.minimize(f.id); },
  zoomFront() { const f = this.front; if (f) this.zoom(f.id); },
  hideFront() { const f = this.front; if (f) this.minimize(f.id); },
  hideOthers() { const f = this.front; this.list.forEach(w => { if (w !== f && !w.min) this.minimize(w.id); }); },
  showAll() { this.list.filter(w => w.min).forEach(w => this.unmin(w.id)); },
  quitFront() { const f = this.front; if (f) this.quitApp(f.app); },
  quitApp(id) { this.byApp(id).forEach(w => this.close(w.id)); },
  cycle() {
    const vis = this.list.filter(w => !w.min && !w.dead);
    if (vis.length < 2) return;
    const back = vis.sort((a, b) => a.zi - b.zi)[0];
    this.focus(back.id);
  },
  forceQuitPanel() {
    const apps = [...new Set(this.list.filter(w => !w.dead).map(w => w.app))];
    const node = el(\`<div class="pop wide" style="width:280px;padding:0">
      <div style="padding:12px 14px 8px;font-weight:600">Force Quit Applications</div>
      <div style="max-height:220px;overflow:auto;padding:0 6px 6px">
        \${apps.length ? apps.map(a => \`<div class="mi" data-q="\${a}" style="height:30px">\${ic(APPS[a].icon, 'ico')}<span>\${esc(APPS[a].name)}</span></div>\`).join('')
        : '<div style="padding:14px;color:var(--txt-2);font-size:12.5px">No applications are open.</div>'}
      </div></div>\`);
    node.querySelectorAll('.ico').forEach(s => s.style.cssText = 'width:19px;height:19px');
    on(node, 'click', '[data-q]', (e, t) => { Pop.close(); WM.quitApp(t.dataset.q); });
    Pop.open(node, { x: innerWidth / 2 - 140, y: innerHeight / 2 - 140, origin: 'center' });
  }
};

/* ---- global shortcuts ---------------------------------------------------- */
addEventListener('keydown', e => {
  const meta = e.metaKey || e.ctrlKey;
  const typing = /input|textarea/i.test(document.activeElement.tagName) || document.activeElement.isContentEditable;

  if (e.key === 'Escape') {
    if (Pop.cur) { Pop.close(); return; }
    if ($('#spot')) { Spotlight.close(); return; }
    if ($('#lpad')) { Launchpad.close(); return; }
    if ($('#nc')) { NotifCenter.close(); return; }
  }
  if (meta && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); Spotlight.toggle(); return; }
  if (meta && e.code === 'Space') { e.preventDefault(); Spotlight.toggle(); return; }
  if (e.key === 'F4') { e.preventDefault(); Launchpad.toggle(); return; }
  if (typing) return;
  if (meta && (e.key === 'w' || e.key === 'W')) { e.preventDefault(); WM.closeFront(); }
  else if (meta && (e.key === 'm' || e.key === 'M')) { e.preventDefault(); WM.minFront(); }
  else if (meta && (e.key === 'q' || e.key === 'Q')) { e.preventDefault(); WM.quitFront(); }
  else if (meta && e.key === '\`') { e.preventDefault(); WM.cycle(); }
  else if (meta && (e.key === 'n' || e.key === 'N')) {
    const f = WM.front; if (f) { e.preventDefault(); WM.open(f.app, { force: true }); }
  }
});
addEventListener('pointerup', () => { document.body.style.cursor = ''; });
`);
