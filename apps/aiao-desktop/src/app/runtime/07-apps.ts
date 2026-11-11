import { restoreRuntimeSource } from './runtime-source';

export const SCRIPT_07_APPS = restoreRuntimeSource(String.raw`
/* ============================================================================
   10 · VIRTUAL FILESYSTEM
   ========================================================================== */
const dt = (m, d, h = 10, mi = 24) => new Date(2026, m - 1, d, h, mi);
/* A folder's date mirrors its newest child, the way the real Finder reports it. */
const FOLD = (name, children, icon = 'f-folder') => {
  const ds = (children || []).map(c => c.date).filter(Boolean);
  return { name, kind: 'folder', icon, children, k: 'Folder', date: ds.length ? new Date(Math.max(...ds)) : dt(7, 12, 9, 41) };
};
const FILE = (name, icon, size, k, date, extra) => Object.assign({ name, kind: 'file', icon, size, k, date }, extra);

const APP_FILES = ['Safari', 'Mail', 'Messages', 'Maps', 'Photos', 'Notes', 'Calendar', 'Music', 'Terminal',
  'Calculator', 'System Settings', 'Preview', 'Reminders', 'FaceTime', 'App Store', 'Podcasts', 'TV',
  'Weather', 'Stocks', 'Books', 'Contacts', 'Freeform', 'Clock']
  .map(n => FILE(n + '.app', 'f-app', 92 + n.length * 7 + 'MB', 'Application', dt(6, 12)));

const FS = FOLD('Macintosh HD', [
  FOLD('Applications', APP_FILES),
  FOLD('Library', [FOLD('Fonts', [FILE('SFPro.ttf', 'f-code', '4.2 MB', 'TrueType font', dt(3, 2))]), FOLD('Caches', []), FOLD('Preferences', [])]),
  FOLD('System', [FOLD('Library', []), FOLD('Volumes', [])]),
  FOLD('Users', [
    FOLD('prasenjit', [
      FOLD('Desktop', [
        FOLD('Projects', [
          FOLD('desktop-web', [
            FILE('index.html', 'f-code', '412 KB', 'HTML document', dt(7, 27, 16, 34)),
            FILE('README.md', 'f-txt', '3 KB', 'Markdown', dt(7, 27, 15, 10)),
            FILE('screenshot.png', 'f-img', '2.1 MB', 'PNG image', dt(7, 27, 16, 40)),
          ]),
          FOLD('cleantype', [FILE('main.swift', 'f-code', '18 KB', 'Swift source', dt(7, 19)), FILE('Package.swift', 'f-code', '2 KB', 'Swift source', dt(7, 19))]),
          FOLD('aurora-synth', [FILE('synth.ts', 'f-code', '44 KB', 'TypeScript', dt(7, 22)), FILE('index.html', 'f-code', '9 KB', 'HTML document', dt(7, 22))]),
          FILE('todo.md', 'f-txt', '1 KB', 'Markdown', dt(7, 26)),
        ]),
        FILE('prasenx.txt', 'f-txt', '1 KB', 'Plain text', dt(7, 27, 14, 2)),
        FILE('Screenshot 2026-07-27 at 4.34.11 PM.png', 'f-img', '3.8 MB', 'PNG image', dt(7, 27, 16, 34)),
        FILE('Interface Guidelines.pdf', 'f-pdf', '188 KB', 'PDF document', dt(7, 4)),
      ]),
      FOLD('Documents', [
        FOLD('Specs', [FILE('materials.pdf', 'f-pdf', '96 KB', 'PDF document', dt(7, 1)), FILE('motion-audit.pdf', 'f-pdf', '94 KB', 'PDF document', dt(7, 20))]),
        FOLD('Writing', [FILE('on-restraint.md', 'f-txt', '11 KB', 'Markdown', dt(7, 24)), FILE('shadow-notes.md', 'f-txt', '7 KB', 'Markdown', dt(7, 26))]),
        FILE('design-review.key', 'f-app', '24 MB', 'Keynote', dt(7, 23)),
        FILE('roadmap-2026.numbers', 'f-app', '1.8 MB', 'Numbers', dt(5, 9)),
      ]),
      FOLD('Downloads', [
        FILE('Xcode_26.xip', 'f-zip', '7.94 GB', 'Archive', dt(7, 15)),
        FILE('sf-symbols-7.dmg', 'f-app', '148 MB', 'Disk image', dt(7, 11)),
        FILE('wallpaper-tahoe-6k.heic', 'f-img', '32 MB', 'HEIC image', dt(7, 9)),
        FILE('render-final.mp4', 'f-movie', '412 MB', 'MPEG-4 movie', dt(7, 13)),
      ]),
      FOLD('Movies', [FILE('interaction-study.mp4', 'f-movie', '208 MB', 'MPEG-4 movie', dt(7, 13)), FILE('capture-timelapse.mov', 'f-movie', '1.2 GB', 'QuickTime movie', dt(7, 13))]),
      FOLD('Music', [FILE('aurora-synth-demo.wav', 'f-music', '58 MB', 'WAV audio', dt(7, 22)), FILE('lofi-loop.mp3', 'f-music', '6 MB', 'MP3 audio', dt(6, 30))]),
      FOLD('Pictures', [FILE('lake-braies.jpg', 'f-img', '5.2 MB', 'JPEG image', dt(6, 18)), FILE('dolomites-dawn.jpg', 'f-img', '4.4 MB', 'JPEG image', dt(6, 18)), FILE('night-sky.jpg', 'f-img', '3.1 MB', 'JPEG image', dt(5, 2))]),
      FOLD('Public', [FOLD('Drop Box', [])]),
    ]),
    FOLD('Shared', []),
  ]),
], 'f-hd');

const TRASH = FOLD('Trash', [FILE('old-draft.md', 'f-txt', '2 KB', 'Markdown', dt(7, 12))], 'app-trash');

/* Extension → icon / kind, for files created at runtime (terminal, New Folder). */
const EXT_MAP = {
  txt: ['f-txt', 'Plain text'], md: ['f-txt', 'Markdown'], rtf: ['f-txt', 'Rich text'],
  html: ['f-code', 'HTML document'], css: ['f-code', 'CSS'], js: ['f-code', 'JavaScript'],
  ts: ['f-code', 'TypeScript'], swift: ['f-code', 'Swift source'], json: ['f-code', 'JSON'],
  png: ['f-img', 'PNG image'], jpg: ['f-img', 'JPEG image'], jpeg: ['f-img', 'JPEG image'],
  gif: ['f-img', 'GIF image'], heic: ['f-img', 'HEIC image'], pdf: ['f-pdf', 'PDF document'],
  mp3: ['f-music', 'MP3 audio'], wav: ['f-music', 'WAV audio'], mov: ['f-movie', 'QuickTime movie'],
  mp4: ['f-movie', 'MPEG-4 movie'], zip: ['f-zip', 'ZIP archive'], app: ['f-app', 'Application'],
};
const extOf = n => (n.includes('.') ? n.split('.').pop() : '').toLowerCase();
const iconFor = n => (EXT_MAP[extOf(n)] || ['f-txt'])[0];
const kindFor = n => (EXT_MAP[extOf(n)] || [, 'Document'])[1];

function fsGet(path) {
  if (path[0] === 'Trash') return TRASH;
  let node = FS;
  for (let i = 1; i < path.length; i++) {
    if (!node.children) return null;
    const next = node.children.find(c => c.name === path[i]);
    if (!next) return null;
    node = next;
  }
  return node;
}
/* Friendly “Go”/sidebar shortcuts → absolute paths */
const PLACES = {
  'AirDrop': null, 'Recents': null,
  'Desktop': ['Macintosh HD', 'Users', 'prasenjit', 'Desktop'],
  'Documents': ['Macintosh HD', 'Users', 'prasenjit', 'Documents'],
  'Downloads': ['Macintosh HD', 'Users', 'prasenjit', 'Downloads'],
  'Movies': ['Macintosh HD', 'Users', 'prasenjit', 'Movies'],
  'Music': ['Macintosh HD', 'Users', 'prasenjit', 'Music'],
  'Pictures': ['Macintosh HD', 'Users', 'prasenjit', 'Pictures'],
  'Applications': ['Macintosh HD', 'Applications'],
  'prasenjit': ['Macintosh HD', 'Users', 'prasenjit'],
  'Macintosh HD': ['Macintosh HD'],
  'Trash': ['Trash'],
};
const RECENTS = () => [
  fsGet(['Macintosh HD', 'Users', 'prasenjit', 'Desktop', 'Projects', 'desktop-web', 'index.html']),
  fsGet(['Macintosh HD', 'Users', 'prasenjit', 'Desktop', 'prasenx.txt']),
  fsGet(['Macintosh HD', 'Users', 'prasenjit', 'Documents', 'Writing', 'on-restraint.md']),
  fsGet(['Macintosh HD', 'Users', 'prasenjit', 'Downloads', 'render-final.mp4']),
  fsGet(['Macintosh HD', 'Users', 'prasenjit', 'Desktop', 'Interface Guidelines.pdf']),
].filter(Boolean);

const fmtDate = d => d ? \`\${MONS3[d.getMonth()]} \${d.getDate()}, \${d.getFullYear()} at \${time12(d).replace(NBSP, ' ')}\` : '--';

/* ============================================================================
   11 · APP REGISTRY  (each app supplies mount/ready/menus)
   ========================================================================== */
const APPS = {};

/* ---------------------------------------------------------------- FINDER -- */
const SIDEBAR = [
  {
    head: 'Favourites', items: [
      ['AirDrop', 'g-airdrop'], ['Recents', 'g-clock-a'], ['Desktop', 'g-desktop'],
      ['Documents', 'g-docs'], ['Downloads', 'g-download'], ['Applications', 'g-apps'],
      ['prasenjit', 'g-folder-g'],
    ]
  },
  { head: 'iCloud', items: [['iCloud Drive', 'g-icloud-o']] },
  { head: 'Locations', items: [['Macintosh HD', 'g-hd'], ['Network', 'g-network']] },
  { head: 'Tags', items: [['Red', 'dot#ff5f57'], ['Orange', 'dot#ff9f0a'], ['Green', 'dot#30d158'], ['Blue', 'dot#0a84ff']] },
];

APPS.finder = {
  name: 'Finder', icon: 'app-finder', w: 940, h: 600, minW: 560, minH: 340, single: false,
  menus: () => APP_MENUS.finder,
  mount(w, opts) {
    const start = (opts.path || PLACES.prasenjit).slice();
    w.st = {
      path: start, view: 'icon', hist: [start.slice()], hi: 0,
      sidebar: true, pathbar: true, sel: null, q: '', colSel: [],
    };
    if (opts.path && opts.path.length === 1 && opts.path[0] === 'Trash') w.st.view = 'list';
    return \`<div class="wb">
      <div class="sbar" data-drag data-fsb><div class="sb-top"><div data-tl></div></div>\${SIDEBAR.map(g => \`
        <div class="grp"><div class="gh">\${g.head}</div>\${g.items.map(([n, i]) => \`
          <div class="si" data-place="\${esc(n)}">\${i.startsWith('dot#')
            ? \`<span class="ico" style="width:11px;height:11px;margin:0 2px;border-radius:50%;background:\${i.slice(3)}"></span>\`
            : ic(i, 'ico')}<span class="nm">\${esc(n)}</span></div>\`).join('')}</div>\`).join('')}
      </div>
      <div class="fx">
        <div class="fx-tb" data-drag>
          <button class="tbtn" data-nav="back" title="Back">\${ic('g-chev-l')}</button>
          <button class="tbtn" data-nav="fwd" title="Forward">\${ic('g-chev-r')}</button>
          <div class="fx-title" data-title></div>
          <div class="grow" style="flex:1"></div>
          <div class="seg" data-nodrag>
            <button data-view="icon" title="Icons">\${ic('g-grid')}</button>
            <button data-view="list" title="List">\${ic('g-list')}</button>
            <button data-view="column" title="Columns">\${ic('g-columns')}</button>
            <button data-view="gallery" title="Gallery">\${ic('g-gallery')}</button>
          </div>
          <button class="tbtn" data-sort title="Sort">\${ic('g-sort')}</button>
          <button class="tbtn" data-share title="Share">\${ic('g-share')}</button>
          <button class="tbtn" data-more title="More">\${ic('g-ellipsis')}</button>
          <div class="sfield" data-nodrag style="width:150px"><span>\${ic('g-search')}</span><input placeholder="Search" data-q></div>
        </div>
        <div class="fx-body scroll" data-body></div>
        <div class="fx-path" data-path></div>
      </div>
    </div>\`;
  },
  ready(w) { Finder.wire(w); Finder.render(w); },
  onResize(w) { if (w.st.view === 'column') Finder.render(w); }
};

const Finder = {
  active() { const f = WM.front; return f && f.app === 'finder' ? f : WM.byApp('finder').filter(x => !x.min).pop(); },
  /* After anything mutates the FS, repaint every open Finder window. */
  reloadAll() { WM.byApp('finder').forEach(w => { if (!w.dead) this.render(w); }); },

  wire(w) {
    const n = w.node;
    on(n, 'click', '[data-place]', (e, t) => this.goto(t.dataset.place, w));
    on(n, 'click', '[data-view]', (e, t) => this.setView(t.dataset.view, w));
    on(n, 'click', '[data-nav="back"]', () => this.back(w));
    on(n, 'click', '[data-nav="fwd"]', () => this.fwd(w));
    on(n, 'click', '[data-sort]', (e, t) => {
      const r = t.getBoundingClientRect();
      Pop.open(Pop.menu([{ head: 'Sort By' },
        { id: 'n', label: 'Name', checked: w.st.sort !== 'date' && w.st.sort !== 'size', run: () => { w.st.sort = 'name'; this.render(w) } },
        { id: 'd', label: 'Date Modified', checked: w.st.sort === 'date', run: () => { w.st.sort = 'date'; this.render(w) } },
        { id: 's', label: 'Size', checked: w.st.sort === 'size', run: () => { w.st.sort = 'size'; this.render(w) } },
        { id: 'k', label: 'Kind', checked: w.st.sort === 'kind', run: () => { w.st.sort = 'kind'; this.render(w) } },
      ]), { x: r.left, y: r.bottom + 4, origin: 'top left' });
    });
    on(n, 'click', '[data-share]', () => Toast('Nothing to share — it is all local.'));
    on(n, 'click', '[data-more]', (e, t) => {
      const r = t.getBoundingClientRect();
      Pop.open(Pop.menu([
        { id: 'sb', label: w.st.sidebar ? 'Hide Sidebar' : 'Show Sidebar', key: '⌥⌘S', run: () => this.toggleSidebar(w) },
        { id: 'pb', label: w.st.pathbar ? 'Hide Path Bar' : 'Show Path Bar', key: '⌥⌘P', run: () => this.togglePathBar(w) },
        '-', { id: 'nf', label: 'New Folder', key: '⇧⌘N', run: () => this.newFolder(w) },
      ]), { x: r.right, y: r.bottom + 4, right: true, origin: 'top right' });
    });
    n.querySelector('[data-q]').addEventListener('input', e => { w.st.q = e.target.value; this.render(w); });

    on(n, 'dblclick', '.fitem,.fv-list .r', (e, t) => this.enter(w, t.dataset.name));
    on(n, 'click', '.fitem,.fv-list .r', (e, t) => { w.st.sel = t.dataset.name; this.markSel(w); });
    on(n, 'click', '.fv-col .ci', (e, t) => this.colClick(w, t));
    on(n, 'dblclick', '.fv-col .ci', (e, t) => { if (t.dataset.kind === 'file') this.enter(w, t.dataset.name); });
    on(n, 'click', '.fv-gal .strip .t', (e, t) => { w.st.sel = t.dataset.name; this.render(w); });
    on(n, 'click', '.fx-path .seg', (e, t) => { const i = +t.dataset.i; this.nav(w, w.st.path.slice(0, i + 1)); });
    on(n, 'contextmenu', '.fitem,.fv-list .r,.fv-col .ci', (e, t) => {
      w.st.sel = t.dataset.name; this.markSel(w);
      ctxMenu(e, [
        { id: 'o', label: 'Open', run: () => this.enter(w, t.dataset.name) },
        { id: 'w', label: 'Open With', key: '▸' }, '-',
        { id: 'i', label: 'Get Info', key: '⌘I', run: () => this.info(w, t.dataset.name) },
        { id: 'r', label: 'Rename' }, { id: 'd', label: 'Duplicate', key: '⌘D' }, '-',
        { id: 't', label: 'Move to Trash', key: '⌘⌫', run: () => this.trashSelected(w) }, '-',
        { id: 'q', label: 'Quick Look', key: '␣', run: () => this.info(w, t.dataset.name) },
      ]);
    });
    on(n, 'contextmenu', '[data-body]', e => {
      if (e.target.closest('.fitem,.r,.ci')) return;
      ctxMenu(e, [
        { id: 'nf', label: 'New Folder', run: () => this.newFolder(w) },
        { id: 'gi', label: 'Get Info' }, '-',
        { id: 'v', label: 'View', key: '▸' },
        { id: 's', label: 'Sort By', key: '▸' },
      ]);
    });
  },

  /* Stable per-name seed so a file's generated preview never changes. */
  seed(name) { let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 997; return h; },

  contents(w) {
    const p = w.st.path;
    if (p[0] === 'Recents') return RECENTS();
    if (p[0] === 'AirDrop') return [];
    if (p[0] === 'iCloud Drive') return [FOLD('Desktop', []), FOLD('Documents', []), FILE('Keynote.key', 'f-app', '18 MB', 'Keynote', dt(6, 2))];
    if (p[0] === 'Network') return [FOLD('prasen-nas', [], 'f-hd')];
    const node = fsGet(p);
    let list = node && node.children ? node.children.slice() : [];
    if (w.st.q) { const q = w.st.q.toLowerCase(); list = this.deepSearch(node, q).slice(0, 200); }
    const s = w.st.sort;
    list.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
      if (s === 'date') return (b.date || 0) - (a.date || 0);
      if (s === 'kind') return String(a.k).localeCompare(b.k);
      if (s === 'size') return String(b.size || '').localeCompare(a.size || '');
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    });
    return list;
  },
  deepSearch(node, q, out = []) {
    if (!node || !node.children) return out;
    node.children.forEach(c => {
      if (c.name.toLowerCase().includes(q)) out.push(c);
      if (c.children) this.deepSearch(c, q, out);
    });
    return out;
  },

  title(w) {
    const p = w.st.path;
    return w.st.q ? \`Searching “\${w.st.q}”\` : p[p.length - 1];
  },

  render(w) {
    const st = w.st, n = w.node;
    n.querySelector('[data-title]').textContent = this.title(w);
    n.querySelector('.sbar').style.display = st.sidebar ? '' : 'none';
    $$('[data-view]', n).forEach(b => b.classList.toggle('on', b.dataset.view === st.view));
    $$('[data-place]', n).forEach(b => b.classList.toggle('on', b.dataset.place === st.path[st.path.length - 1] || (PLACES[b.dataset.place] || []).join('/') === st.path.join('/')));
    n.querySelector('[data-nav="back"]').classList.toggle('dis', st.hi <= 0);
    n.querySelector('[data-nav="fwd"]').classList.toggle('dis', st.hi >= st.hist.length - 1);

    const body = n.querySelector('[data-body]');
    const items = this.contents(w);
    body.classList.toggle('scroll', st.view !== 'column');
    body.style.overflow = st.view === 'column' ? 'hidden' : '';

    if (st.view === 'icon') {
      body.innerHTML = \`<div class="fv-icon">\${items.map(f => \`
        <div class="fitem\${f.name === st.sel ? ' sel' : ''}" data-name="\${esc(f.name)}">
          <div class="art">\${f.icon === 'f-img'
        ? \`<div class="shot">\${photoArt(this.seed(f.name), [0, 1, 3][this.seed(f.name) % 3])}</div>\`
        : ic(f.icon)}</div><div class="nm">\${esc(f.name)}</div></div>\`).join('')}</div>\`
        + (items.length ? '' : \`<div style="padding:40px;text-align:center;color:var(--txt-3);font-size:13px">\${st.q ? 'No results' : st.path[0] === 'AirDrop' ? 'No one nearby' : 'Empty folder'}</div>\`);
    } else if (st.view === 'list') {
      body.innerHTML = \`<div class="fv-list">
        <div class="hd"><div class="c1" style="padding-left:26px">Name</div><div class="c2">Date Modified</div><div class="c3">Size</div><div class="c4">Kind</div></div>
        \${items.map(f => \`<div class="r\${f.name === st.sel ? ' sel' : ''}" data-name="\${esc(f.name)}">
          <div class="c1"><span class="tw">\${f.kind === 'folder' ? ic('g-chev-r') : ''}</span><span class="art">\${f.icon === 'f-img'
        ? \`<div class="shot">\${photoArt(this.seed(f.name), [0, 1, 3][this.seed(f.name) % 3])}</div>\`
        : ic(f.icon)}</span><span>\${esc(f.name)}</span></div>
          <div class="c2">\${f.date ? \`\${MONS3[f.date.getMonth()]} \${f.date.getDate()}, \${f.date.getFullYear()} at \${time12(f.date).replace(NBSP, ' ')}\` : '--'}</div>
          <div class="c3">\${f.kind === 'folder' ? '--' : esc(f.size || '--')}</div>
          <div class="c4">\${esc(f.k || (f.kind === 'folder' ? 'Folder' : 'Document'))}</div></div>\`).join('')}
      </div>\`;
    } else if (st.view === 'column') {
      this.renderColumns(w, body);
    } else {
      const cur = items.find(f => f.name === st.sel) || items[0];
      /* Gallery view previews real content for images instead of a file icon. */
      const art = (f, big) => f.icon === 'f-img'
        ? \`<div class="shot\${big ? ' big' : ''}">\${photoArt(this.seed(f.name), [0, 1, 3][this.seed(f.name) % 3])}</div>\`
        : \`<div class="art">\${ic(f.icon)}</div>\`;
      body.innerHTML = \`<div class="fv-gal">
        <div class="stage">\${cur ? art(cur, true) : '<span style="color:var(--txt-3)">Nothing to preview</span>'}</div>
        \${cur ? \`<div class="cap"><b>\${esc(cur.name)}</b><span>\${esc(cur.k || (cur.kind === 'folder' ? 'Folder' : 'Document'))}\${cur.size ? ' · ' + esc(cur.size) : ''}\${cur.date ? ' · ' + fmtDate(cur.date) : ''}</span></div>\` : ''}
        <div class="strip">\${items.map(f => \`<div class="t\${f === cur ? ' sel' : ''}" data-name="\${esc(f.name)}">\${art(f)}</div>\`).join('')}</div>
      </div>\`;
    }

    this.paintPath(w);
  },

  paintPath(w) {
    const st = w.st, pb = w.node.querySelector('[data-path]');
    if (!pb) return;
    pb.style.display = st.pathbar ? '' : 'none';
    /* in column view the selection lives in colSel, so the bar has to walk that
       too or it skips every folder the user clicked into */
    const segs = st.view === 'column' ? st.path.concat(st.colSel) : st.path;
    const tail = st.view === 'column' ? null : st.sel;
    pb.innerHTML = segs.map((s, i) =>
      \`\${i ? ic('g-chev-r') : ''}<span class="seg" data-i="\${i}">\${ic(i === 0 ? 'g-hd' : 'g-folder-g')}\${esc(s)}</span>\`).join('')
      + (tail ? \`\${ic('g-chev-r')}<span class="seg">\${esc(tail)}</span>\` : '');
    pb.querySelectorAll('svg').forEach(s => { s.style.width = '11px'; s.style.height = '11px'; });
  },

  renderColumns(w, body) {
    const st = w.st;
    const chain = [];
    let node = st.path[0] === 'Trash' ? TRASH : fsGet(st.path);
    if (!node) node = FS;
    chain.push({ node, items: this.contents(w) });
    /* follow the selection chain of folders */
    let sel = st.colSel.slice();
    let cur = node;
    for (let i = 0; i < sel.length; i++) {
      const nx = (cur.children || []).find(c => c.name === sel[i]);
      if (!nx) { sel = sel.slice(0, i); break; }
      chain.push({ node: nx, items: nx.children ? nx.children.slice().sort((a, b) => a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'folder' ? -1 : 1) : null, file: nx.kind === 'file' });
      cur = nx;
      if (nx.kind === 'file') break;
    }
    st.colSel = sel;

    /* Only render the deepest columns that fit. macOS scrolls instead, but it
       always lands on a column boundary — dropping the ones that fall off the
       left gets the same look without a half-clipped first column. */
    const leafFile = chain.length && chain[chain.length - 1].file;
    const COL = 206.5, PREV = leafFile ? 250 : 0;
    const avail = (body.clientWidth || 620) - PREV;
    const cols = chain.filter(c => !c.file);
    const keep = Math.max(1, Math.floor(avail / COL));
    const from = Math.max(0, cols.length - keep);

    let html = '<div class="fv-col">';
    chain.forEach((c, ci) => {
      if (c.file || ci < from) return;
      const nextSel = sel[ci];
      html += \`<div class="col" data-ci="\${ci}">\${(c.items || []).map(f => \`
        <div class="ci\${f.name === nextSel ? (ci === sel.length - 1 ? ' sel' : ' dim') : ''}" data-ci="\${ci}" data-name="\${esc(f.name)}" data-kind="\${f.kind}">
          <span class="art">\${ic(f.icon)}</span><span class="nm">\${esc(f.name)}</span>\${f.kind === 'folder' ? ic('g-chev-r', 'ch') : ''}</div>\`).join('')
        || '<div style="padding:14px;color:var(--txt-3);font-size:12px;text-align:center">Empty</div>'}</div>\`;
    });
    const leaf = chain[chain.length - 1];
    if (leaf && leaf.file) {
      const f = leaf.node;
      html += \`<div class="fv-prev"><div class="big">\${ic(f.icon)}</div><div class="nm">\${esc(f.name)}</div>
        <dl><dt>Kind</dt><dd>\${esc(f.k || 'Document')}</dd><dt>Size</dt><dd>\${esc(f.size || '--')}</dd>
        <dt>Created</dt><dd>\${fmtDate(f.date)}</dd><dt>Modified</dt><dd>\${fmtDate(f.date)}</dd></dl>
        <button class="btn pri" data-openfile="\${esc(f.name)}">Open</button></div>\`;
    }
    body.innerHTML = html + '</div>';
    on(body, 'click', '[data-openfile]', (e, t) => this.enter(w, t.dataset.openfile));
  },

  colClick(w, t) {
    const ci = +t.dataset.ci;
    w.st.colSel = w.st.colSel.slice(0, ci);
    w.st.colSel[ci] = t.dataset.name;
    w.st.sel = t.dataset.name;
    this.render(w);
  },

  /* Repaint in place — a full render() here would swap the item nodes out from
     under the second click of a double-click, so folders would never open. */
  markSel(w) {
    $$('.fitem,.fv-list .r,.fv-gal .strip .t', w.node).forEach(n => n.classList.toggle('sel', n.dataset.name === w.st.sel));
    this.paintPath(w);
  },

  nav(w, path) {
    w = w || this.active(); if (!w) return;
    w.st.q = ''; const qi = w.node.querySelector('[data-q]'); if (qi) qi.value = '';
    w.st.path = path; w.st.sel = null; w.st.colSel = [];
    w.st.hist = w.st.hist.slice(0, w.st.hi + 1);
    w.st.hist.push(path.slice()); w.st.hi = w.st.hist.length - 1;
    this.render(w);
  },
  back(w) { w = w || this.active(); if (w && w.st.hi > 0) { w.st.hi--; w.st.path = w.st.hist[w.st.hi].slice(); w.st.sel = null; w.st.colSel = []; this.render(w); } },
  fwd(w) { w = w || this.active(); if (w && w.st.hi < w.st.hist.length - 1) { w.st.hi++; w.st.path = w.st.hist[w.st.hi].slice(); w.st.sel = null; w.st.colSel = []; this.render(w); } },

  goto(place, w) {
    w = w || this.active(); if (!w) return WM.open('finder', { path: PLACES[place] || PLACES.prasenjit });
    if (place === 'iCloud Drive') return this.nav(w, ['iCloud Drive']);
    if (place === 'AirDrop') return this.nav(w, ['AirDrop']);
    if (place === 'Recents') return this.nav(w, ['Recents']);
    if (place === 'Network') return this.nav(w, ['Network']);
    if (place.startsWith('Red') || place.startsWith('Orange') || place.startsWith('Green') || place.startsWith('Blue')) return Toast('No files tagged ' + place);
    this.nav(w, (PLACES[place] || PLACES.prasenjit).slice());
  },

  enter(w, name) {
    const items = this.contents(w);
    const f = items.find(x => x.name === name); if (!f) return;
    if (f.kind === 'folder') {
      /* search results / recents live outside the current path — resolve absolute */
      const abs = this.findPath(FS, f) || w.st.path.concat(name);
      this.nav(w, abs);
    } else this.openFile(f);
  },
  findPath(root, target, path = ['Macintosh HD']) {
    if (root === target) return path;
    for (const c of root.children || []) {
      const r = this.findPath(c, target, path.concat(c.name));
      if (r) return r;
    }
    return null;
  },
  openFile(f) {
    const n = f.name.toLowerCase();
    if (/\.app$/.test(n)) {
      const id = Object.keys(APPS).find(k => APPS[k].name.toLowerCase() === f.name.replace(/\.app$/i, '').toLowerCase());
      return id ? WM.open(id) : Toast(f.name + ' cannot open on this Mac.');
    }
    if (/\.(txt|md|swift|ts|html|json)$/.test(n)) return WM.open('textedit', { file: f.name, node: f });
    if (/\.(png|jpe?g|heic|pdf|key|numbers)$/.test(n)) return WM.open('preview', { file: f.name, node: f });
    if (/\.(mp3|wav)$/.test(n)) return WM.open('music');
    if (/\.(mp4|mov)$/.test(n)) return WM.open('preview', { file: f.name, node: f });
    Toast('No application can open “' + f.name + '”');
  },
  openSelected() { const w = this.active(); if (w && w.st.sel) this.enter(w, w.st.sel); },
  info(w, name) {
    const f = this.contents(w).find(x => x.name === name); if (!f) return;
    Toast(\`\${f.name} — \${f.k || 'Folder'}\${f.size ? ', ' + f.size : ''}\`);
  },
  setView(v, w) { w = w || this.active(); if (!w) return; w.st.view = v; this.render(w); },
  toggleSidebar(w) { w = w || this.active(); if (!w) return; w.st.sidebar = !w.st.sidebar; this.render(w); },
  togglePathBar(w) { w = w || this.active(); if (!w) return; w.st.pathbar = !w.st.pathbar; this.render(w); },
  newFolder(w) {
    w = w || this.active(); if (!w) return Desktop.newFolder();
    const node = fsGet(w.st.path);
    if (!node || !node.children) return;
    let name = 'untitled folder', i = 2;
    while (node.children.some(c => c.name === name)) name = 'untitled folder ' + i++;
    node.children.push(FOLD(name, []));
    w.st.sel = name; this.render(w);
  },
  trashSelected(w) {
    w = w || this.active(); if (!w || !w.st.sel) return;
    const node = fsGet(w.st.path);
    if (node && node.children) {
      const i = node.children.findIndex(c => c.name === w.st.sel);
      if (i >= 0) { TRASH.children.push(node.children[i]); node.children.splice(i, 1); Dock.setTrashFull(true); }
    }
    w.st.sel = null; this.render(w);
  }
};
`);
