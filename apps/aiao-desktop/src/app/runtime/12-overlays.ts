import { restoreRuntimeSource } from './runtime-source';

export const SCRIPT_12_OVERLAYS = restoreRuntimeSource(String.raw`
/* ============================================================================
   26 · LAUNCHPAD
   ========================================================================== */
const LAUNCH_ORDER = ['finder', 'safari', 'mail', 'messages', 'maps', 'photos', 'facetime',
  'calendar', 'contacts', 'reminders', 'notes', 'freeform', 'voice', 'appstore',
  'podcasts', 'music', 'tv', 'books', 'stocks', 'weather', 'clock',
  'terminal', 'activity', 'diskutil', 'fontbook', 'calculator', 'textedit', 'preview',
  'settings', 'about'];
const PER_PAGE = 28;   /* 7 × 4, like the real grid at this height */

const Launchpad = {
  page: 0,
  toggle() { $('#lpad') ? this.close() : this.open(); },
  open() {
    if ($('#lpad')) return;
    Pop.close(true);
    this.page = 0; this.q = '';
    const node = el(\`<div id="lpad" class="nosel">
      <div class="sq">\${ic('g-search')}<input placeholder="Search" data-lq spellcheck="false"></div>
      <div class="grid" data-lgrid></div>
      <div class="dots" data-ldots></div></div>\`);
    $('#layer-overlay').append(node);
    this.render();
    node.addEventListener('pointerdown', e => { if (e.target === node || e.target.classList.contains('grid')) this.close(); });
    on(node, 'click', '.app', (e, t) => {
      const id = t.dataset.app;
      this.close();
      setTimeout(() => Dock.activate(id), 90);
    });
    on(node, 'contextmenu', '.app', (e, t) => ctxMenu(e, [
      { id: 'o', label: 'Open', run: () => { this.close(); Dock.activate(t.dataset.app); } },
      { id: 'd', label: 'Add to Dock' }, { id: 'x', label: 'Delete', disabled: true },
    ]));
    const inp = node.querySelector('[data-lq]');
    inp.addEventListener('input', () => { this.q = inp.value; this.page = 0; this.render(); });
    inp.addEventListener('keydown', e => {
      if (e.key === 'Escape') this.close();
      if (e.key === 'Enter') { const first = node.querySelector('.app'); if (first) first.click(); }
      if (!this.q && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { e.preventDefault(); this.turn(e.key === 'ArrowRight' ? 1 : -1); }
    });
    setTimeout(() => inp.focus(), 120);
    node.addEventListener('wheel', e => {
      if (this.q) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) { if (e.deltaX > 12) this.turn(1); else if (e.deltaX < -12) this.turn(-1); }
    }, { passive: true });
  },
  turn(d) {
    const pages = Math.ceil(LAUNCH_ORDER.length / PER_PAGE);
    const p = clamp(this.page + d, 0, pages - 1);
    if (p !== this.page) { this.page = p; this.render(); }
  },
  render() {
    const node = $('#lpad'); if (!node) return;
    let ids = LAUNCH_ORDER;
    if (this.q) { const q = this.q.toLowerCase(); ids = ids.filter(i => APPS[i].name.toLowerCase().includes(q)); }
    const pages = Math.max(1, Math.ceil(ids.length / PER_PAGE));
    this.page = clamp(this.page, 0, pages - 1);
    const slice = ids.slice(this.page * PER_PAGE, (this.page + 1) * PER_PAGE);
    node.querySelector('[data-lgrid]').innerHTML = slice.map(id =>
      \`<div class="app" data-app="\${id}"><div class="art">\${ic(APPS[id].icon)}</div><div class="nm">\${esc(APPS[id].name)}</div></div>\`).join('')
      || \`<div style="grid-column:1/-1;text-align:center;color:rgba(255,255,255,.75);font-size:14px;padding-top:40px;text-shadow:0 1px 3px rgba(0,0,0,.4)">No results</div>\`;
    node.querySelector('[data-ldots]').innerHTML = pages > 1
      ? [...Array(pages)].map((_, i) => \`<i class="\${i === this.page ? 'on' : ''}"></i>\`).join('') : '';
  },
  close() {
    const node = $('#lpad'); if (!node) return;
    node.classList.add('out');
    setTimeout(() => node.remove(), 200);
  }
};

/* ============================================================================
   27 · SPOTLIGHT
   ========================================================================== */
const SPOT_ACTIONS = [
  { name: 'Toggle Dark Mode', kind: 'Action', icon: 'g-moon', run: () => Theme.toggle() },
  { name: 'Open Launchpad', kind: 'Action', icon: 'app-launchpad', run: () => Launchpad.open() },
  { name: 'Notification Centre', kind: 'Action', icon: 'g-cc', run: () => NotifCenter.open() },
  { name: 'Empty Trash', kind: 'Action', icon: 'app-trash', run: () => { Dock.setTrashFull(false); Toast('Trash emptied'); } },
  { name: 'Change Wallpaper', kind: 'Action', icon: 'g-globe', run: () => WM.open('settings', { section: 'wallpaper' }) },
  { name: 'Sleep', kind: 'Action', icon: 'g-power', run: () => Screen.sleep() },
];

const Spotlight = {
  sel: 0, results: [],
  toggle() { $('#spot') ? this.close() : this.open(); },
  open() {
    if ($('#spot')) return;
    Pop.close(true);
    const node = el(\`<div id="spot" class="nosel"><div class="scrim"></div>
      <div class="box"><div class="qrow">\${ic('g-spot')}<input data-sq placeholder="Spotlight Search" spellcheck="false" autocomplete="off"></div>
      <div class="res scroll" data-sres"></div></div></div>\`);
    $('#layer-overlay').append(node);
    node.querySelector('.scrim').addEventListener('pointerdown', () => this.close());
    const inp = node.querySelector('[data-sq]');
    inp.addEventListener('input', () => this.search(inp.value));
    inp.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); this.move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); this.move(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); this.fire(); }
      else if (e.key === 'Escape') { e.preventDefault(); this.close(); }
    });
    on(node, 'click', '.r', (e, t) => { this.sel = +t.dataset.i; this.fire(); });
    on(node, 'mousemove', '.r', (e, t) => { if (this.sel !== +t.dataset.i) { this.sel = +t.dataset.i; this.mark(); } });
    setTimeout(() => inp.focus(), 30);
    this.search('');
  },
  search(q) {
    const node = $('#spot'); if (!node) return;
    q = q.trim();
    const res = node.querySelector('.res');
    this.sel = 0;
    if (!q) { this.results = []; res.innerHTML = ''; return; }
    const lq = q.toLowerCase();
    const apps = LAUNCH_ORDER.filter(i => APPS[i].name.toLowerCase().includes(lq))
      .map(i => ({ name: APPS[i].name, kind: 'Application', icon: APPS[i].icon, run: () => Dock.activate(i) }));
    const acts = SPOT_ACTIONS.filter(a => a.name.toLowerCase().includes(lq));
    /* Bundles found on disk belong under Applications, not Documents. */
    const found = Finder.deepSearch(FS, lq).slice(0, 12).map(f => ({
      name: f.name,
      kind: f.kind === 'folder' ? 'Folder' : /\.app$/.test(f.name) ? 'Application' : (f.k || 'Document'),
      icon: f.icon,
      run: () => f.kind === 'folder' ? WM.open('finder', { path: Finder.findPath(FS, f) || PLACES.prasenjit }) : Finder.openFile(f)
    }));
    const notes = NOTE_SEED.filter(n => n.title.toLowerCase().includes(lq)).slice(0, 3)
      .map(n => ({ name: n.title, kind: 'Note', icon: 'app-notes', run: () => WM.open('notes') }));
    const web = [{ name: \`Search the web for “\${q}”\`, kind: 'Safari', icon: 'app-safari', run: () => Saf.go('search:' + q) }];
    /* Prefer the real app entry over its .app file for the same name */
    const seen = new Set(apps.map(a => a.name.toLowerCase() + '.app'));

    const groups = [
      ['Top Hit', (apps[0] ? [apps[0]] : acts[0] ? [acts[0]] : found[0] ? [found[0]] : [])],
      ['Applications', apps.concat(found.filter(f => f.kind === 'Application' && !seen.has(f.name.toLowerCase())))],
      ['Actions', acts],
      ['Documents', found.filter(f => f.kind !== 'Folder' && f.kind !== 'Application')],
      ['Folders', found.filter(f => f.kind === 'Folder')],
      ['Notes', notes],
      ['Suggested Websites', web],
    ];
    this.results = [];
    let html = '';
    groups.forEach(([g, items]) => {
      const uniq = items.filter(it => !this.results.some(r => r.name === it.name && r.kind === it.kind));
      if (!uniq.length) return;
      html += \`<div class="cat">\${g}</div>\`;
      uniq.slice(0, 6).forEach(it => {
        const i = this.results.length; this.results.push(it);
        html += \`<div class="r" data-i="\${i}"><span class="art">\${ic(it.icon)}</span><span class="nm">\${esc(it.name)}</span><span class="kind">\${esc(it.kind)}</span></div>\`;
      });
    });
    res.innerHTML = html || \`<div class="empty">No results for “\${esc(q)}”</div>\`;
    this.mark();
  },
  mark() {
    const node = $('#spot'); if (!node) return;
    $$('.r', node).forEach(r => r.classList.toggle('on', +r.dataset.i === this.sel));
    const on2 = node.querySelector('.r.on');
    if (on2) on2.scrollIntoView({ block: 'nearest' });
  },
  move(d) { if (!this.results.length) return; this.sel = clamp(this.sel + d, 0, this.results.length - 1); this.mark(); },
  fire() {
    const r = this.results[this.sel];
    this.close();
    if (r && r.run) setTimeout(() => r.run(), 60);
  },
  close() {
    const node = $('#spot'); if (!node) return;
    node.classList.add('out');
    setTimeout(() => node.remove(), 150);
  }
};

/* ============================================================================
   28 · WIDGETS  (shared by the desktop and Notification Centre)
   ========================================================================== */
function analogClock(d, size = 130) {
  const s = d.getSeconds(), m = d.getMinutes() + s / 60, h = (d.getHours() % 12) + m / 60;
  const A = (deg, r1, r2, w, col, cap = 'round') => {
    const a = (deg - 90) * Math.PI / 180;
    return \`<line x1="\${50 + Math.cos(a) * r1}" y1="\${50 + Math.sin(a) * r1}" x2="\${50 + Math.cos(a) * r2}" y2="\${50 + Math.sin(a) * r2}" stroke="\${col}" stroke-width="\${w}" stroke-linecap="\${cap}"/>\`;
  };
  const ticks = [...Array(60)].map((_, i) => {
    const a = (i * 6 - 90) * Math.PI / 180, big = i % 5 === 0;
    const r1 = big ? 38 : 40.5, r2 = 43.5;
    return \`<line x1="\${50 + Math.cos(a) * r1}" y1="\${50 + Math.sin(a) * r1}" x2="\${50 + Math.cos(a) * r2}" y2="\${50 + Math.sin(a) * r2}"
      stroke="currentColor" stroke-opacity="\${big ? .78 : .28}" stroke-width="\${big ? 2 : 1}" stroke-linecap="round"/>\`;
  }).join('');
  return \`<svg viewBox="0 0 100 100" style="width:\${size}px;height:\${size}px;color:var(--txt)">
    <circle cx="50" cy="50" r="47" fill="var(--win)" stroke="var(--line)" stroke-width="1"/>
    \${ticks}
    \${A(h * 30, -4, 25, 4.4, 'currentColor')}
    \${A(m * 6, -6, 36, 3, 'currentColor')}
    \${A(s * 6, -9, 38, 1.2, '#ff453a')}
    <circle cx="50" cy="50" r="2.6" fill="currentColor"/><circle cx="50" cy="50" r="1.2" fill="#ff453a"/>
  </svg>\`;
}

const Widgets = {
  /* Painted inline, not on the first tick: everySecond() fires before the node is
     in the document, so an isConnected guard would leave the face blank for up to
     a second every time the panel opens. */
  clock(o = {}) {
    const now = new Date(), sz = o.compact ? 118 : 132;
    const face = d => \`\${DAYS[d.getDay()]}, \${d.getDate()} \${MONS[d.getMonth()]}\`;
    const n = el(\`<div class="wgt"><div class="clockw" data-cl>\${analogClock(now, sz)}</div>
      <div style="text-align:center;font-size:12.5px;font-weight:600;margin-top:2px" data-cd>\${face(now)}</div></div>\`);
    everySecond(d => {
      if (!n.isConnected) return;
      n.querySelector('[data-cl]').innerHTML = analogClock(d, sz);
      n.querySelector('[data-cd]').textContent = face(d);
    });
    return n;
  },
  clockSq() {
    const n = el(\`<div class="wgt sqw"><div class="clockw" data-cl>\${analogClock(new Date(), 124)}</div></div>\`);
    everySecond(d => { if (n.isConnected) n.querySelector('[data-cl]').innerHTML = analogClock(d, 124); });
    return n;
  },
  batterySq() {
    const pct = SYS.battery, C = 2 * Math.PI * 40;
    const col = !SYS.charging && pct <= 20 ? '#ff9f0a' : '#30d158';
    const mins = Math.round(pct / 100 * 11.4 * 60);
    const n = el(\`<div class="wgt sqw batsq"><div class="wh"><span class="t">Battery</span></div>
      <div class="rw"><svg viewBox="0 0 96 96">
        <circle cx="48" cy="48" r="40" fill="none" stroke="var(--fill-2)" stroke-width="8"/>
        <circle cx="48" cy="48" r="40" fill="none" stroke="\${col}" stroke-width="8" stroke-linecap="round"
          stroke-dasharray="\${C}" stroke-dashoffset="\${C * (1 - pct / 100)}" transform="rotate(-90 48 48)"/>
        </svg><b>\${pct}%</b></div>
      <div class="sub">\${SYS.charging ? 'Charging' : \`\${Math.floor(mins / 60)}h \${mins % 60}m left\`}</div></div>\`);
    Bus.on('battery', () => { if (n.isConnected) n.replaceWith(Widgets.batterySq()); });
    return n;
  },
  weather(o = {}) {
    const n = el(\`<div class="wgt"><div class="wx" data-wxw></div></div>\`);
    const paint = () => {
      if (!n.isConnected && !o.compact) return;
      const c = Wx.now(), hrs = Wx.hours(5), [label, glyph] = Wx.code(c.code, c.day);
      n.querySelector('[data-wxw]').innerHTML = \`
        <div class="loc">\${esc(Wx.place)}</div>
        <div class="now"><span class="deg">\${c.t}°</span><span class="ico">\${ic(glyph)}</span></div>
        <div class="cond">\${esc(label)}</div><div class="hi">H:\${c.hi}° L:\${c.lo}°</div>
        <div class="hours">\${hrs.map(([h, t, g]) => \`<div><span>\${esc(h)}</span>\${ic(g)}<b>\${t}°</b></div>\`).join('')}</div>\`;
    };
    paint();
    Wx.load().then(paint);
    Bus.on('wx', paint);
    n.addEventListener('dblclick', () => WM.open('weather'));
    return n;
  },
  stocks(o = {}) {
    const n = el(\`<div class="wgt"><div class="wh"><span class="t">Stocks</span><span class="s">\${time12(new Date())}</span></div>
      <div class="stk">\${TICKERS.slice(0, 3).map((t, i) => \`<div class="row \${t.up ? 'up' : 'dn'}">
        <span class="sym"><b>\${t.s}</b><span>\${esc(t.n)}</span></span>
        <span class="spark">\${spark(t.up, 90, 26, i)}</span>
        <span class="num"><b>\${t.p.toFixed(2)}</b><span>\${t.up ? '+' : ''}\${t.d.toFixed(2)}%</span></span></div>\`).join('')}</div></div>\`);
    n.addEventListener('dblclick', () => WM.open('stocks'));
    return n;
  },
  calendar(o = {}) {
    const d = new Date();
    const fill = n => {
      const evs = evOn(d.getFullYear(), d.getMonth(), d.getDate());
      n.innerHTML = \`<div class="dow">\${DAYS[d.getDay()]}</div><div class="dnum">\${d.getDate()}</div>
      \${evs.length ? evs.map(e => \`<div class="ev"><i style="background:\${e.c}"></i><div class="b"><b>\${esc(e.t)}</b><span>\${esc(e.at)}</span></div></div>\`).join('')
          : '<div class="none">No more events today.</div>'}\`;
    };
    const n = el(\`<div class="wgt calw"></div>\`);
    fill(n);
    /* Adding, moving or hiding an event in Calendar has to show up here too. */
    Bus.on('events', () => { if (n.isConnected) fill(n); });
    n.addEventListener('dblclick', () => WM.open('calendar'));
    return n;
  },
  battery(o = {}) {
    const pct = SYS.battery, C = 2 * Math.PI * 27;
    const col = SYS.charging ? '#30d158' : pct <= 20 ? '#ff9f0a' : '#30d158';
    const mins = Math.round(pct / 100 * 11.4 * 60);
    const n = el(\`<div class="wgt sm"><div class="wh"><span class="t">Battery</span></div>
      <div class="batw"><svg class="ring" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r="27" fill="none" stroke="var(--fill-2)" stroke-width="7"/>
        <circle cx="32" cy="32" r="27" fill="none" stroke="\${col}" stroke-width="7" stroke-linecap="round"
          stroke-dasharray="\${C}" stroke-dashoffset="\${C * (1 - pct / 100)}" transform="rotate(-90 32 32)"/>
        </svg>
        <div class="info"><b>\${pct}%</b><span>\${SYS.charging ? 'Charging' : \`\${Math.floor(mins / 60)}h \${mins % 60}m left\`}</span></div></div></div>\`);
    Bus.on('battery', () => { if (n.isConnected) n.replaceWith(Widgets.battery(o)); });
    return n;
  },
  reminders() {
    const items = [['Send brand review feedback', '#ff375f'], ['Review PR #142', '#0a84ff'], ['Pick up dry cleaning', '#ff9f0a']];
    const n = el(\`<div class="wgt"><div class="wh"><span class="t">Today</span><span class="s">3 remaining</span></div>
      \${items.map(([t, c]) => \`<div style="display:flex;gap:9px;align-items:center;padding:5px 0;border-top:.5px solid var(--line)">
        <span style="width:15px;height:15px;border-radius:50%;border:1.6px solid \${c};flex:none"></span>
        <span style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">\${esc(t)}</span></div>\`).join('')}</div>\`);
    n.addEventListener('dblclick', () => WM.open('reminders'));
    return n;
  }
};

/* ============================================================================
   29 · NOTIFICATION CENTRE
   ========================================================================== */
const NotifCenter = {
  toggle() { $('#nc') ? this.close() : this.open(); },
  open() {
    if ($('#nc')) return;
    Pop.close(true);
    const scrim = el(\`<div id="nc-scrim"></div>\`);
    const node = el(\`<div id="nc" class="nosel"><div class="nc-scroll"></div></div>\`);
    const box = node.querySelector('.nc-scroll');
    const row = el(\`<div class="nc-row"></div>\`);
    row.append(Widgets.clockSq(), Widgets.batterySq());
    box.append(row, Widgets.weather(), Widgets.calendar(), Widgets.stocks(), Widgets.reminders());
    box.insertAdjacentHTML('beforeend', \`<div class="nc-title">Earlier Today</div>\`);
    [
      ['app-messages', 'Messages', 'Kate', 'bringing coffee AND a blanket, i know how you drive', '4:28 PM'],
      ['app-mail', 'Mail', 'Figma', 'Daniel left 3 comments on Desktop v4', '4:21 PM'],
      ['app-calendar', 'Calendar', 'Dentist', 'in 10 minutes · 3:50 PM', '3:40 PM'],
      ['app-settings', 'Software Update', 'macOS Tahoe 26.0.1', 'A new update is available.', '1:02 PM'],
    ].forEach(([ico, app, t, b, tm]) => box.insertAdjacentHTML('beforeend',
      \`<div class="note"><span class="art">\${ic(ico)}</span><span class="bd"><b>\${esc(t)}</b><p>\${esc(b)}</p></span><span class="tm">\${esc(tm)}</span></div>\`));
    /* Parked off-screen for its first frame: laying out five widgets and priming
       the panel's blur costs a paint, and it would otherwise land on frame one of
       the slide. One frame later the panel is warm and the slide runs clean. */
    node.style.transform = 'translateX(100%)';
    $('#layer-overlay').append(scrim, node);
    scrim.addEventListener('pointerdown', () => this.close());
    $('#menubar [data-st="clock"]').classList.add('open');
    requestAnimationFrame(() => {
      if (!node.isConnected) return;
      node.style.transform = '';                      // no transform may survive, or the blur dies
      /* fill:none, so no transform survives the slide */
      node.animate([{ transform: 'translateX(100%)', opacity: .4 }, { transform: 'none', opacity: 1 }],
        { duration: 380, easing: 'cubic-bezier(.22,1,.36,1)' });
    });
  },
  close() {
    const node = $('#nc'), scrim = $('#nc-scrim');
    if (!node) return;
    node.id = '';                                     // so a re-open can't find it
    if (scrim) scrim.remove();
    $('#menubar [data-st="clock"]').classList.remove('open');
    const a = node.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateX(101%)', opacity: .5 }],
      { duration: 260, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
    a.onfinish = () => node.remove();
  }
};
`);
