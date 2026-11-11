import { restoreRuntimeSource } from './runtime-source';

export const SCRIPT_03_MENUBAR = restoreRuntimeSource(String.raw`
/* ============================================================================
   6 · MENU BAR
   ========================================================================== */
function battSVG(pct, charging) {
  const w = clamp(pct, 0, 100) / 100 * 18.4;
  const col = charging ? '#34c759' : pct <= 10 ? '#ff453a' : pct <= 20 ? '#ff9f0a' : 'currentColor';
  return \`<svg viewBox="0 0 28 13" style="width:26px;height:12px">
    <rect x=".6" y=".6" width="22.8" height="11.8" rx="3.6" fill="none" stroke="currentColor" stroke-opacity=".45" stroke-width="1.1"/>
    <path d="M24.9 4.6a3.1 3.1 0 0 1 0 3.8z" fill="currentColor" fill-opacity=".45"/>
    <rect x="2.2" y="2.2" width="\${w.toFixed(1)}" height="8.6" rx="2.1" fill="\${col}"/>
    \${charging ? '<path d="M13.6 1.6 8.4 7.4h3.4l-1.4 4.8 5.4-6h-3.4z" fill="#fff" stroke="#1d1d1f" stroke-opacity=".25" stroke-width=".7" stroke-linejoin="round"/>' : ''}
  </svg>\`;
}

const MenuBar = {
  app: 'Finder',
  menus: null,
  openIdx: -1,

  init() {
    const bar = $('#menubar');
    bar.innerHTML =
      \`<div class="mb-left">
         <div class="mb-item apple" data-menu="apple">\${ic('g-apple', '')}</div>
         <div id="mb-titles" style="display:flex;align-items:stretch"></div>
       </div>
       <div class="mb-right"><div id="mb-status">
         <div class="mb-st" data-st="bt"    title="Bluetooth">\${ic('g-bt')}</div>
         <div class="mb-st" data-st="vol"   title="Sound"><span id="mb-volico">\${ic('g-vol')}</span></div>
         <div class="mb-st" data-st="batt"  title="Battery"><span class="batt-pct" id="mb-battpct"></span><span id="mb-batt"></span></div>
         <div class="mb-st" data-st="wifi"  title="Wi-Fi">\${ic('g-wifi')}</div>
         <div class="mb-st" data-st="spot"  title="Spotlight">\${ic('g-spot')}</div>
         <div class="mb-st" data-st="cc"    title="Control Center">\${ic('g-cc')}</div>
         <div class="mb-st" data-st="clock" id="mb-clock"></div>
       </div></div>\`;
    $('#menubar [data-st="bt"] svg').style.cssText = 'width:11px;height:16px';
    $('#menubar [data-st="wifi"] svg').style.cssText = 'width:16px;height:13px';
    $('#menubar [data-st="vol"] svg').style.cssText = 'width:16px;height:13px';
    $('#menubar [data-st="cc"] svg').style.cssText = 'width:15px;height:15px';
    $('#menubar [data-st="spot"] svg').style.cssText = 'width:14px;height:14px';
    $('#menubar .apple svg').style.cssText = 'width:13px;height:16px';

    this.setApp('Finder', APP_MENUS.finder);
    this.paintStatus();
    everySecond(d => {
      $('#mb-clock').textContent =
        \`\${DAYS3[d.getDay()]}\${NBSP}\${MONS3[d.getMonth()]}\${NBSP}\${d.getDate()}\${NBSP}\${NBSP}\${time12(d)}\`;
    });

    /* titles: click opens, hover switches while a menu is open */
    on(bar, 'mousedown', '.mb-item', (e, t) => { e.preventDefault(); this.toggle(t); });
    on(bar, 'mouseenter', '.mb-item', (e, t) => { if (this.openIdx >= 0 && !t.classList.contains('open')) this.toggle(t); }, true);
    on(bar, 'mousedown', '.mb-st', (e, t) => { e.preventDefault(); this.status(t); });
    /* The shield no longer covers the bar, so dead space has to dismiss itself. */
    bar.addEventListener('mousedown', e => { if (!e.target.closest('.mb-item,.mb-st')) Pop.close(); });

    Bus.on('theme', () => this.paintStatus());
    Bus.on('volume', () => this.paintStatus());
  },

  paintStatus() {
    $('#mb-batt').innerHTML = battSVG(SYS.battery, SYS.charging);
    $('#mb-battpct').textContent = SYS.battery + '%';
    const v = SYS.muted || SYS.volume === 0 ? 'g-vol-mute' : SYS.volume < .5 ? 'g-vol-lo' : 'g-vol';
    $('#mb-volico').innerHTML = ic(v);
    const s = $('#mb-volico svg'); if (s) s.style.cssText = 'width:16px;height:13px';
    $('#menubar [data-st="wifi"]').style.opacity = SYS.wifi ? '1' : '.45';
    $('#menubar [data-st="bt"]').style.opacity = SYS.bluetooth ? '1' : '.45';
  },

  setApp(name, menus) {
    this.app = name;
    this.menus = menus || APP_MENUS.finder;
    const titles = [{ label: name, app: true }, ...this.menus];
    $('#mb-titles').innerHTML = titles.map((m, i) =>
      \`<div class="mb-item\${m.app ? ' app' : ''}" data-menu="\${i}">\${esc(m.label)}</div>\`).join('');
  },

  menuSpec(key) {
    if (key === 'apple') return APPLE_MENU();
    const i = +key;
    if (i === 0) return (APP_ABOUT[this.app] || APP_ABOUT._)(this.app);
    return (this.menus[i - 1] || { items: [] }).items;
  },

  toggle(t) {
    const key = t.dataset.menu;
    if (t.classList.contains('open')) { Pop.close(); return; }
    $$('#menubar .mb-item.open').forEach(n => n.classList.remove('open'));
    t.classList.add('open');
    this.openIdx = key;
    const r = t.getBoundingClientRect();
    const node = Pop.menu(this.menuSpec(key), 'wide');
    Pop.open(node, {
      x: r.left, y: r.bottom + 2, origin: 'top left',
      onClose: () => { t.classList.remove('open'); this.openIdx = -1; }
    });
  },

  status(t) {
    const k = t.dataset.st, r = t.getBoundingClientRect();
    /* Clock first: it wears .open while Notification Centre is up, so the generic
       "already open → dismiss the popover" branch would swallow the toggle. */
    if (k === 'clock') { NotifCenter.toggle(); return; }
    if (t.classList.contains('open')) { Pop.close(); return; }
    if (k === 'spot') { Spotlight.open(); return; }
    $$('#menubar .mb-st.open').forEach(n => n.classList.remove('open'));
    t.classList.add('open');
    const node = STATUS_PANELS[k]();
    Pop.open(node, {
      x: r.right + 6, y: r.bottom + 4, right: true, origin: 'top right',
      onClose: () => t.classList.remove('open')
    });
  }
};

/* ---- Apple menu ---------------------------------------------------------- */
const APPLE_MENU = () => [
  { id: 'about', label: 'About This Mac', run: () => WM.open('about') },
  '-',
  { id: 'set', label: 'System Settings…', run: () => WM.open('settings') },
  { id: 'store', label: 'App Store…', key: '1 update', run: () => Toast('App Store is not part of this build') },
  '-',
  { id: 'recent', label: 'Recent Items', key: '▸' },
  '-',
  { id: 'force', label: 'Force Quit…', key: '⌥⌘⎋', run: () => WM.forceQuitPanel() },
  '-',
  { id: 'sleep', label: 'Sleep', run: () => Screen.sleep() },
  { id: 'restart', label: 'Restart…', run: () => Startup.restart() },
  { id: 'shut', label: 'Shut Down…', run: () => Startup.shutDown() },
  '-',
  { id: 'lock', label: 'Lock Screen', key: '⌃⌘Q', run: () => Startup.lock() },
  { id: 'logout', label: \`Log Out \${SYS.user}…\`, key: '⇧⌘Q', run: () => Startup.lock() },
];

const APP_ABOUT = {
  _: name => [
    { id: 'a', label: \`About \${name}\`, run: () => WM.open('about') }, '-',
    { id: 'p', label: 'Settings…', key: '⌘,', run: () => WM.open('settings') }, '-',
    { id: 'h', label: \`Hide \${name}\`, key: '⌘H', run: () => WM.hideFront() },
    { id: 'o', label: 'Hide Others', key: '⌥⌘H', run: () => WM.hideOthers() },
    { id: 's', label: 'Show All', run: () => WM.showAll() }, '-',
    { id: 'q', label: \`Quit \${name}\`, key: '⌘Q', run: () => WM.quitFront() },
  ]
};

/* ---- Per-app menu bars --------------------------------------------------- */
const M = (label, items) => ({ label, items });
const APP_MENUS = {
  finder: [
    M('File', [
      { id: 'nw', label: 'New Finder Window', key: '⌘N', run: () => WM.open('finder') },
      { id: 'nf', label: 'New Folder', key: '⇧⌘N', run: () => Finder.newFolder() },
      '-',
      { id: 'op', label: 'Open', key: '⌘O', run: () => Finder.openSelected() },
      { id: 'cl', label: 'Close Window', key: '⌘W', run: () => WM.closeFront() },
      '-',
      { id: 'gi', label: 'Get Info', key: '⌘I', run: () => Toast('Get Info') },
      { id: 'tr', label: 'Move to Trash', key: '⌘⌫', run: () => Finder.trashSelected() },
    ]),
    M('Edit', [
      { id: 'u', label: 'Undo', key: '⌘Z', disabled: true },
      { id: 'r', label: 'Redo', key: '⇧⌘Z', disabled: true }, '-',
      { id: 'x', label: 'Cut', key: '⌘X' }, { id: 'c', label: 'Copy', key: '⌘C' }, { id: 'v', label: 'Paste', key: '⌘V' },
      '-', { id: 'a', label: 'Select All', key: '⌘A' },
    ]),
    M('View', [
      { id: 'icons', label: 'as Icons', key: '⌘1', run: () => Finder.setView('icon') },
      { id: 'listv', label: 'as List', key: '⌘2', run: () => Finder.setView('list') },
      { id: 'colv', label: 'as Columns', key: '⌘3', run: () => Finder.setView('column') },
      { id: 'galv', label: 'as Gallery', key: '⌘4', run: () => Finder.setView('gallery') },
      '-',
      { id: 'sb', label: 'Hide Sidebar', key: '⌥⌘S', run: () => Finder.toggleSidebar() },
      { id: 'pb', label: 'Hide Path Bar', key: '⌥⌘P', run: () => Finder.togglePathBar() },
    ]),
    M('Go', [
      { id: 'g1', label: 'Recents', key: '⇧⌘F', run: () => Finder.goto('Recents') },
      { id: 'g2', label: 'Documents', key: '⇧⌘O', run: () => Finder.goto('Documents') },
      { id: 'g3', label: 'Desktop', key: '⇧⌘D', run: () => Finder.goto('Desktop') },
      { id: 'g4', label: 'Downloads', key: '⌥⌘L', run: () => Finder.goto('Downloads') },
      { id: 'g5', label: 'Applications', key: '⇧⌘A', run: () => Finder.goto('Applications') },
    ]),
    M('Window', WINDOW_MENU_LAZY()),
    M('Help', [
      { field: 'Search' },
      { id: 'h', label: 'macOS Help', key: '⌘?', run: () => Toast('Everything here is one HTML file.') },
      { id: 'n', label: 'New Features in macOS', run: () => WM.open('about') },
    ]),
  ],
};
function WINDOW_MENU_LAZY() {
  return [
    { id: 'min', label: 'Minimize', key: '⌘M', run: () => WM.minFront() },
    { id: 'zoo', label: 'Zoom', run: () => WM.zoomFront() },
    { id: 'fil', label: 'Fill', key: '⌃⌥⏎', run: () => WM.zoomFront() },
    '-',
    { id: 'cyc', label: 'Cycle Through Windows', key: '⌘\`', run: () => WM.cycle() },
    { id: 'brf', label: 'Bring All to Front', run: () => WM.showAll() },
  ];
}
/* Every app gets File/Edit/View/Window/Help; apps override the interesting bits. */
/* \`order\` lets an app place its own menus where AppKit puts them — Terminal has a
   Shell menu instead of File, Music slots Controls between View and Window. Without
   it, merged-in keys land after Help, which no Mac app does. */
function stdMenus(appId, over = {}, order = null) {
  const base = {
    File: [
      { id: 'n', label: 'New Window', key: '⌘N', run: () => WM.open(appId, { force: true }) },
      { id: 'w', label: 'Close Window', key: '⌘W', run: () => WM.closeFront() },
    ],
    Edit: [
      { id: 'u', label: 'Undo', key: '⌘Z', run: () => document.execCommand('undo') },
      { id: 'r', label: 'Redo', key: '⇧⌘Z', run: () => document.execCommand('redo') }, '-',
      { id: 'x', label: 'Cut', key: '⌘X', run: () => document.execCommand('cut') },
      { id: 'c', label: 'Copy', key: '⌘C', run: () => document.execCommand('copy') },
      { id: 'v', label: 'Paste', key: '⌘V', run: () => document.execCommand('paste') }, '-',
      { id: 'a', label: 'Select All', key: '⌘A', run: () => document.execCommand('selectAll') },
    ],
    View: [
      { id: 'f', label: 'Enter Full Screen', key: '⌃⌘F', run: () => WM.zoomFront() },
      { id: 't', label: 'Show Toolbar', key: '⌥⌘T', checked: true },
    ],
    Window: WINDOW_MENU_LAZY(),
    Help: [
      { field: 'Search' },
      { id: 'h', label: \`\${APPS[appId] ? APPS[appId].name : appId} Help\`, run: () => Toast('No help needed — click things.') },
      { id: 'k', label: 'Keyboard Shortcuts', run: () => Toast('⌘Space, ⌘W, ⌘Q, ⌃⌘F all work.') },
    ],
  };
  Object.assign(base, over);
  return (order || Object.keys(base)).filter(k => base[k]).map(k => M(k, base[k]));
}

/* ---- Status panels ------------------------------------------------------- */
const NETWORKS = [
  { n: 'Prasen 5G', s: 3, lock: true }, { n: 'Prasen 2.4G', s: 3, lock: true },
  { n: 'JioFiber-4821', s: 2, lock: true }, { n: 'Airtel_Xstream', s: 2, lock: true },
  { n: 'TP-Link_9C40', s: 1, lock: true }, { n: 'CoffeeHouse Guest', s: 1, lock: false },
];
const wifiBars = s => \`<svg viewBox="0 0 16 13" style="width:15px;height:12px">\${[0, 1, 2].map(i =>
  \`<path d="\${['M2 9.4a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8', 'M5.4 6.6a5 5 0 0 1 0 0', ''][0]}" />\`).join('')}
  <path d="M8 9.3a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z" fill="currentColor" opacity="1"/>
  <path d="M8 5.8c-1.2 0-2.3.45-3.1 1.2a.6.6 0 0 0 0 .9l.5.5c.24.24.6.25.86.03A2.6 2.6 0 0 1 8 7.8c.65 0 1.25.22 1.74.63.26.22.62.21.86-.03l.5-.5a.6.6 0 0 0 0-.9A4.55 4.55 0 0 0 8 5.8z" fill="currentColor" opacity="\${s >= 2 ? 1 : .3}"/>
  <path d="M8 2.1a8 8 0 0 0-5.6 2.28.6.6 0 0 0 0 .87l.5.5c.24.24.62.25.87.02A6.2 6.2 0 0 1 8 4.1a6.2 6.2 0 0 1 4.23 1.67c.25.23.63.22.87-.02l.5-.5a.6.6 0 0 0 0-.87A8 8 0 0 0 8 2.1z" fill="currentColor" opacity="\${s >= 3 ? 1 : .3}"/>
</svg>\`;

const STATUS_PANELS = {
  wifi() {
    const node = el(\`<div class="panel" style="min-width:290px">
      <div class="row" style="height:32px"><h4 style="margin:0">Wi-Fi</h4><div class="tail"><div class="sw\${SYS.wifi ? ' on' : ''}" data-t="wifi"></div></div></div>
      <div class="sep"></div>
      <div class="mhead" style="padding-left:0">Known Network</div>
      <div class="row" data-net="\${esc(SYS.wifiName)}"><span style="width:16px;color:var(--blue)">\${ic('g-check')}</span><span class="nm">\${esc(SYS.wifiName)}</span><span class="tail">\${ic('g-lock')}\${wifiBars(3)}</span></div>
      <div class="sep"></div>
      <div class="mhead" style="padding-left:0">Other Networks</div>
      <div id="netlist"></div>
      <div class="sep"></div>
      <div class="row" data-open-net-settings><span class="nm">Wi-Fi Settings…</span></div>
    </div>\`);
    node.querySelector('#netlist').innerHTML = NETWORKS.filter(x => x.n !== SYS.wifiName).map(x =>
      \`<div class="row" data-net="\${esc(x.n)}"><span style="width:16px"></span><span class="nm">\${esc(x.n)}</span><span class="tail">\${x.lock ? ic('g-lock') : ''}\${wifiBars(x.s)}</span></div>\`).join('');
    node.querySelectorAll('.tail svg').forEach(s => { if (s.querySelector('use')) s.style.cssText = 'width:12px;height:12px' });
    on(node, 'click', '[data-t="wifi"]', (e, t) => { SYS.wifi = !SYS.wifi; t.classList.toggle('on', SYS.wifi); MenuBar.paintStatus(); });
    on(node, 'click', '[data-net]', (e, t) => { SYS.wifiName = t.dataset.net; SYS.wifi = true; Pop.close(); MenuBar.paintStatus(); Toast('Connected to ' + t.dataset.net); });
    on(node, 'click', '[data-open-net-settings]', () => { Pop.close(); WM.open('settings', { section: 'wifi' }); });
    return node;
  },
  bt() {
    const devs = [['AirPods Pro', 'Connected'], ['Magic Keyboard', 'Connected'], ['Magic Trackpad', '92%'], ['Sony WH-1000XM5', 'Not Connected']];
    const node = el(\`<div class="panel" style="min-width:280px">
      <div class="row" style="height:32px"><h4 style="margin:0">Bluetooth</h4><div class="tail"><div class="sw\${SYS.bluetooth ? ' on' : ''}" data-t="bt"></div></div></div>
      <div class="sep"></div><div class="mhead" style="padding-left:0">Devices</div>
      \${devs.map(([n, s]) => \`<div class="row"><span class="nm">\${n}</span><span class="tail sub">\${s}</span></div>\`).join('')}
      <div class="sep"></div><div class="row" data-bts><span class="nm">Bluetooth Settings…</span></div></div>\`);
    on(node, 'click', '[data-t="bt"]', (e, t) => { SYS.bluetooth = !SYS.bluetooth; t.classList.toggle('on', SYS.bluetooth); MenuBar.paintStatus(); });
    on(node, 'click', '[data-bts]', () => { Pop.close(); WM.open('settings', { section: 'bluetooth' }); });
    return node;
  },
  batt() {
    const mins = Math.round(SYS.battery / 100 * 11.4 * 60);
    const node = el(\`<div class="panel" style="min-width:250px">
      <h4>Battery</h4>
      <div class="row" style="height:auto;padding:2px 6px 8px"><div><div style="font-size:26px;font-weight:500;letter-spacing:-.03em">\${SYS.battery}%</div>
      <div class="sub">\${SYS.charging ? 'Charging' : \`\${Math.floor(mins / 60)}:\${String(mins % 60).padStart(2, '0')} Remaining\`}</div></div>
      <div class="tail" style="transform:scale(1.5);transform-origin:right center">\${battSVG(SYS.battery, SYS.charging)}</div></div>
      <div class="sep"></div><div class="mhead" style="padding-left:0">Energy Use</div>
      <div class="row"><span class="nm">Safari</span><span class="tail sub">Low</span></div>
      <div class="row"><span class="nm">Music</span><span class="tail sub">Low</span></div>
      <div class="sep"></div>
      <div class="row" data-t="chg"><span class="nm">\${SYS.charging ? 'Unplug Power Adapter' : 'Simulate Charging'}</span></div>
      <div class="row" data-bs><span class="nm">Battery Settings…</span></div></div>\`);
    on(node, 'click', '[data-t="chg"]', () => { SYS.charging = !SYS.charging; Pop.close(); MenuBar.paintStatus(); Bus.emit('battery'); });
    on(node, 'click', '[data-bs]', () => { Pop.close(); WM.open('settings', { section: 'battery' }); });
    return node;
  },
  vol() {
    const node = el(\`<div class="panel" style="min-width:270px">
      <h4>Sound</h4>
      <div class="row" style="height:30px;gap:11px">
        <span style="color:var(--txt-2)">\${ic('g-vol-lo')}</span>
        <div class="sl" data-slider="vol"><div class="trk"><div class="fil"></div></div><div class="kn"></div></div>
        <span style="color:var(--txt-2)">\${ic('g-vol-hi')}</span>
      </div>
      <div class="sep"></div><div class="mhead" style="padding-left:0">Output</div>
      <div class="row on"><span style="width:15px;color:var(--blue)">\${ic('g-check')}</span><span class="nm">MacBook Pro Speakers</span></div>
      <div class="row"><span style="width:15px"></span><span class="nm">AirPods Pro</span></div>
      <div class="sep"></div><div class="row" data-ss><span class="nm">Sound Settings…</span></div></div>\`);
    node.querySelectorAll('svg').forEach(s => { if (!s.closest('.sl')) s.style.cssText = 'width:15px;height:15px' });
    Slider(node.querySelector('[data-slider="vol"]'), SYS.volume, v => { SYS.volume = v; SYS.muted = v === 0; Bus.emit('volume', v); });
    on(node, 'click', '[data-ss]', () => { Pop.close(); WM.open('settings', { section: 'sound' }); });
    return node;
  },
  cc() { return ControlCentre(); }
};

/* Re-usable slider behaviour */
function Slider(root, value, onChange, opts = {}) {
  if (!root) return;
  const fil = root.querySelector('.fil'), kn = root.querySelector('.kn');
  const paint = v => { fil.style.right = (100 - v * 100) + '%'; kn.style.left = \`calc(\${v * 100}% )\`; };
  let v = clamp(value, 0, 1); paint(v);
  const move = e => {
    const r = root.querySelector('.trk').getBoundingClientRect();
    v = clamp((e.clientX - r.left) / r.width, 0, 1);
    paint(v); onChange(v);
  };
  root.addEventListener('pointerdown', e => {
    e.preventDefault(); root.setPointerCapture(e.pointerId); move(e);
    const mv = ev => move(ev);
    const up = () => { root.removeEventListener('pointermove', mv); root.removeEventListener('pointerup', up); if (opts.done) opts.done(v); };
    root.addEventListener('pointermove', mv); root.addEventListener('pointerup', up);
  });
  return { set(nv) { v = clamp(nv, 0, 1); paint(v); } };
}

/* Control Centre */
function ControlCentre() {
  const tile = (body, style = '') => \`<div class="cc-tile" style="\${style}">\${body}</div>\`;
  const node = el(\`<div class="panel cc" style="min-width:0;width:302px;padding:12px">
    <div class="cc-grid">
      \${tile(\`<div class="cc-row" data-t="wifi"><i class="cc-b\${SYS.wifi ? ' on' : ''}">\${ic('g-wifi')}</i><div><b>Wi‑Fi</b><span>\${esc(SYS.wifiName)}</span></div></div>
              <div class="cc-row" data-t="bt"><i class="cc-b\${SYS.bluetooth ? ' on' : ''}">\${ic('g-bt')}</i><div><b>Bluetooth</b><span>\${SYS.bluetooth ? 'On' : 'Off'}</span></div></div>
              <div class="cc-row" data-t="ad"><i class="cc-b on">\${ic('g-airdrop')}</i><div><b>AirDrop</b><span>Contacts Only</span></div></div>\`, 'grid-column:span 2')}
      \${tile(\`<div class="cc-row" data-t="focus"><i class="cc-b">\${ic('g-moon')}</i><div><b>Focus</b><span>Off</span></div></div>\`, 'grid-column:span 2')}
      \${tile(\`<div class="cc-row" data-t="dark"><i class="cc-b\${SYS.theme === 'dark' ? ' on' : ''}">\${ic('g-moon')}</i><div><b>Dark Mode</b><span>\${SYS.theme === 'dark' ? 'On' : 'Off'}</span></div></div>\`, 'grid-column:span 1')}
      \${tile(\`<div class="cc-row" data-t="stage"><i class="cc-b">\${ic('g-grid')}</i><div><b>Stage Mgr</b><span>Off</span></div></div>\`, 'grid-column:span 1')}
      \${tile(\`<div class="cc-slab"><b>Display</b><div class="sl" data-slider="bri"><div class="trk"><div class="fil"></div></div><div class="kn"></div></div></div>\`, 'grid-column:span 2')}
      \${tile(\`<div class="cc-slab"><b>Sound</b><div class="sl" data-slider="snd"><div class="trk"><div class="fil"></div></div><div class="kn"></div></div></div>\`, 'grid-column:span 2')}
    </div></div>\`);
  node.querySelectorAll('.cc-b svg').forEach(s => s.style.cssText = 'width:15px;height:15px');
  Slider(node.querySelector('[data-slider="bri"]'), Screen.brightness, v => Screen.setBrightness(v));
  Slider(node.querySelector('[data-slider="snd"]'), SYS.volume, v => { SYS.volume = v; SYS.muted = v === 0; Bus.emit('volume', v); MenuBar.paintStatus(); });
  on(node, 'click', '[data-t]', (e, t) => {
    const k = t.dataset.t, b = t.querySelector('.cc-b'), sp = t.querySelector('span');
    if (k === 'wifi') { SYS.wifi = !SYS.wifi; b.classList.toggle('on', SYS.wifi); sp.textContent = SYS.wifi ? SYS.wifiName : 'Off'; MenuBar.paintStatus(); }
    if (k === 'bt') { SYS.bluetooth = !SYS.bluetooth; b.classList.toggle('on', SYS.bluetooth); sp.textContent = SYS.bluetooth ? 'On' : 'Off'; MenuBar.paintStatus(); }
    if (k === 'dark') { Theme.toggle(); b.classList.toggle('on', SYS.theme === 'dark'); sp.textContent = SYS.theme === 'dark' ? 'On' : 'Off'; }
    if (k === 'focus' || k === 'stage' || k === 'ad') { b.classList.toggle('on'); sp.textContent = b.classList.contains('on') ? 'On' : 'Off'; }
  });
  return node;
}
`);
