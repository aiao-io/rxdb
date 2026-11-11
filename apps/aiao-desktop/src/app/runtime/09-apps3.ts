import { restoreRuntimeSource } from './runtime-source';

export const SCRIPT_09_APPS3 = restoreRuntimeSource(String.raw`
/* ============================================================================
   15 · NOTES
   ========================================================================== */
const NOTE_SEED = [
  {
    id: 1, folder: 'Notes', title: 'Interface rules', date: dt(7, 27, 16, 12), pin: true,
    body: \`<h1>Interface rules</h1><div class="date">27 July 2026 at 4:12 PM</div>
<p>Collected from things that felt wrong and then didn't.</p>
<h2>Motion</h2>
<div class="todo done"><i>\${ic('g-check')}</i><span>Nothing animates longer than <b>350ms</b>. Past that it reads as lag, not polish.</span></div>
<div class="todo done"><i>\${ic('g-check')}</i><span>Menus open instantly. Panels can take their time.</span></div>
<div class="todo"><i>\${ic('g-check')}</i><span>If a transition can't hold 60fps, cut the effect, not the duration.</span></div>
<div class="todo"><i>\${ic('g-check')}</i><span>Easing out beats easing in — arrivals matter more than departures.</span></div>
<h2>Depth</h2><ul><li>One shadow reads as a sticker. Stack them.</li><li>Blur is not translucency. You need both.</li><li>An unfocused window should look asleep, not disabled.</li></ul>\`
  },
  {
    id: 2, folder: 'Notes', title: 'Window shadow recipe', date: dt(7, 26, 21, 40),
    body: \`<h1>Window shadow recipe</h1><div class="date">26 July 2026 at 9:40 PM</div>
<p>One shadow always looks fake. macOS stacks four.</p>
<table><tr><th>Layer</th><th>Purpose</th></tr>
<tr><td>0 0 0 .5px</td><td>the hairline that defines the edge</td></tr>
<tr><td>0 3px 8px</td><td>contact shadow, keeps it from floating</td></tr>
<tr><td>0 14px 28px</td><td>the body of the shadow</td></tr>
<tr><td>0 40px 80px</td><td>ambient spill — this is the expensive one</td></tr></table>
<p>Unfocused windows drop the last two and lighten the rest. That difference is why a stack of windows reads as a stack.</p>\`
  },
  {
    id: 3, folder: 'Notes', title: 'Dock falloff', date: dt(7, 25, 11, 8),
    body: \`<h1>Dock falloff</h1><div class="date">25 July 2026 at 11:08 AM</div>
<p>Linear distance → scale looks wrong. There's a visible crease where influence hits zero.</p>
<p>A raised cosine has zero slope at both ends, so the magnification eases in and out of the neighbouring icons instead of snapping:</p>
<p style="font-family:var(--font-mono);font-size:12.5px;background:var(--fill);padding:9px 12px;border-radius:7px">scale = 1 + (max−1) · (½ − ½cos(πu))<sup>0.86</sup></p>
<p>The 0.86 exponent narrows the peak slightly. Without it the whole row lifts and it feels mushy.</p>\`
  },
  {
    id: 4, folder: 'Notes', title: 'Grocery', date: dt(7, 24, 19, 2),
    body: \`<h1>Grocery</h1><div class="date">24 July 2026 at 7:02 PM</div>
<div class="todo done"><i>\${ic('g-check')}</i><span>Coffee — the good one</span></div>
<div class="todo done"><i>\${ic('g-check')}</i><span>Oat milk</span></div>
<div class="todo"><i>\${ic('g-check')}</i><span>Paneer</span></div>
<div class="todo"><i>\${ic('g-check')}</i><span>Tomatoes, ginger, green chilli</span></div>
<div class="todo"><i>\${ic('g-check')}</i><span>Dark chocolate (85%)</span></div>\`
  },
  {
    id: 5, folder: 'Notes', title: 'Sprint planning', date: dt(7, 20, 9, 30),
    body: \`<h1>Sprint planning</h1><div class="date">20 July 2026 at 9:30 AM</div>
<h2>Ship</h2><ul><li>Column view in Finder, with a working preview pane</li><li>Terminal tab completion (longest common prefix, then list)</li><li>Genie minimise — clip-path polygon, four points, don't cheat it</li></ul>
<h2>Park</h2><ul><li>Mission Control</li><li>Stage Manager</li></ul>
<p>Review PR #142 before Thursday.</p>\`
  },
  { id: 6, folder: 'Recently Deleted', title: 'Old draft', date: dt(7, 12, 8, 0), body: \`<h1>Old draft</h1><div class="date">12 July 2026 at 8:00 AM</div><p>Scrapped. The framing was wrong.</p>\` },
];

APPS.notes = {
  name: 'Notes', icon: 'app-notes', w: 940, h: 600, minW: 580, minH: 340,
  menus: () => stdMenus('notes', {
    File: [{ id: 'n', label: 'New Note', key: '⌘N', run: () => Notes.create() },
    { id: 'f', label: 'New Folder', key: '⇧⌘N' }, '-',
    { id: 'd', label: 'Delete Note', run: () => Notes.del() }],
    Format: [{ id: 'b', label: 'Bold', key: '⌘B', run: () => Notes.fmt('bold') },
    { id: 'i', label: 'Italic', key: '⌘I', run: () => Notes.fmt('italic') },
    { id: 'u', label: 'Underline', key: '⌘U', run: () => Notes.fmt('underline') }, '-',
    { id: 'c', label: 'Checklist', key: '⇧⌘L', run: () => Notes.checklist() },
    { id: 't', label: 'Table', run: () => Notes.table() }],
  }, ['File', 'Edit', 'Format', 'View', 'Window', 'Help']),
  mount(w) {
    w.st = { notes: NOTE_SEED.map(n => ({ ...n })), folder: 'Notes', sel: 1, q: '' };
    const F = [['All iCloud', 'g-icloud-o', 5], ['Notes', 'g-folder-g', 5], ['Recently Deleted', 'g-tag', 1]];
    return \`<div class="wb">
      <div class="sbar" data-drag style="width:196px">
        <div style="display:flex;align-items:center;height:38px;padding:0 10px 0 12px">
          <div data-tl></div><div style="flex:1"></div>
          <button class="tbtn" data-nodrag data-sbtoggle title="Hide Folders">\${ic('g-sidebar')}</button>
        </div>
        <div class="grp"><div class="gh">iCloud</div>
        \${F.map(([n, i, c]) => \`<div class="si" data-folder="\${esc(n)}">\${ic(i, 'ico')}<span class="nm">\${esc(n)}</span><span class="tail">\${c}</span></div>\`).join('')}
        </div></div>
      <div class="nt">
        <div class="nt-list">
          <div class="nt-search" data-drag style="display:flex;gap:8px;align-items:center;padding-top:9px">
            <div class="sfield" data-nodrag style="flex:1"><span>\${ic('g-search')}</span><input placeholder="Search" data-q></div>
            <button class="tbtn" data-new2 data-nodrag title="New Note">\${ic('g-compose')}</button>
          </div>
          <div class="nt-items scroll" data-items></div>
        </div>
        <div class="nt-ed">
          <div class="nt-fmt" data-drag>
            <div style="flex:1"></div>
            <button class="tbtn" data-f="bold" data-nodrag title="Bold">\${ic('g-bold')}</button>
            <button class="tbtn" data-f="italic" data-nodrag title="Italic">\${ic('g-italic')}</button>
            <button class="tbtn" data-f="underline" data-nodrag title="Underline">\${ic('g-underline')}</button>
            <button class="tbtn" data-f="strikeThrough" data-nodrag title="Strikethrough">\${ic('g-strike')}</button>
            <div class="sep"></div>
            <button class="tbtn" data-f="insertUnorderedList" data-nodrag title="Bulleted list">\${ic('g-bullets')}</button>
            <button class="tbtn" data-check data-nodrag title="Checklist">\${ic('g-checklist')}</button>
            <button class="tbtn" data-table data-nodrag title="Table">\${ic('g-table')}</button>
            <div class="sep"></div>
            <button class="tbtn" data-new data-nodrag title="New note">\${ic('g-plus')}</button>
            <div style="flex:1"></div>
          </div>
          <div class="nt-doc selectable" contenteditable="true" spellcheck="false" data-doc></div>
        </div>
      </div></div>\`;
  },
  ready(w) {
    Notes.w = w;
    on(w.node, 'click', '[data-folder]', (e, t) => { w.st.folder = t.dataset.folder; Notes.render(w); });
    on(w.node, 'click', '.nt-i', (e, t) => { Notes.save(w); w.st.sel = +t.dataset.id; Notes.render(w); });
    on(w.node, 'contextmenu', '.nt-i', (e, t) => {
      w.st.sel = +t.dataset.id; Notes.render(w);
      ctxMenu(e, [{ id: 'p', label: 'Pin Note' }, { id: 'd', label: 'Duplicate' }, '-', { id: 'x', label: 'Delete', run: () => Notes.del(w) }]);
    });
    on(w.node, 'click', '[data-f]', (e, t) => Notes.fmt(t.dataset.f, w));
    on(w.node, 'click', '[data-check]', () => Notes.checklist(w));
    on(w.node, 'click', '[data-table]', () => Notes.table(w));
    on(w.node, 'click', '[data-new],[data-new2]', () => Notes.create(w));
    on(w.node, 'click', '[data-sbtoggle]', () => {
      const sb = w.node.querySelector('.sbar');
      sb.style.display = sb.style.display === 'none' ? '' : 'none';
      if (sb.style.display === 'none') w.node.querySelector('.nt-search').prepend(w.node.querySelector('.tl'));
      else sb.firstElementChild.prepend(w.node.querySelector('.tl'));
    });
    on(w.node, 'click', '.nt-doc .todo i', (e, t) => { e.preventDefault(); t.closest('.todo').classList.toggle('done'); });
    w.node.querySelector('[data-q]').addEventListener('input', e => { w.st.q = e.target.value; Notes.render(w); });
    const doc = w.node.querySelector('[data-doc]');
    doc.addEventListener('input', () => { Notes.saveDebounced(w); });
    doc.addEventListener('keyup', () => Notes.fmtState(w));
    doc.addEventListener('mouseup', () => Notes.fmtState(w));
    /* Focusing the editor already puts the caret somewhere — if that somewhere is a
       heading, Bold belongs lit before anyone clicks it. */
    doc.addEventListener('focus', () => setTimeout(() => Notes.fmtState(w), 0));
    doc.addEventListener('keydown', e => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const m = { b: 'bold', i: 'italic', u: 'underline' }[e.key.toLowerCase()];
      if (m) { e.preventDefault(); Notes.fmt(m, w); }
    });
    Notes.render(w);
  },
  onClose(w) { Notes.save(w); if (Notes.w === w) Notes.w = null; }
};

const Notes = {
  w: null,
  cur(w) { w = w || this.w; return w && w.st.notes.find(n => n.id === w.st.sel); },
  list(w) {
    const st = w.st;
    let ns = st.notes.filter(n => st.folder === 'All iCloud' ? n.folder !== 'Recently Deleted' : n.folder === st.folder);
    if (st.q) { const q = st.q.toLowerCase(); ns = ns.filter(n => (n.title + ' ' + n.body).toLowerCase().includes(q)); }
    return ns.sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || b.date - a.date);
  },
  snippet(n) {
    const d = document.createElement('div'); d.innerHTML = n.body;
    d.querySelectorAll('h1,.date').forEach(e => e.remove());
    /* block boundaries need a separator or "Ship" + "Column view" become one word */
    d.querySelectorAll('h2,h3,p,li,tr,div,br').forEach(e => e.insertAdjacentText('afterend', ' '));
    return (d.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'No additional text';
  },
  render(w) {
    w = w || this.w; if (!w) return;
    const st = w.st, list = this.list(w);
    if (!list.some(n => n.id === st.sel)) st.sel = list.length ? list[0].id : null;
    $$('[data-folder]', w.node).forEach(b => b.classList.toggle('on', b.dataset.folder === st.folder));
    w.node.querySelector('[data-items]').innerHTML = list.length ? list.map(n => \`
      <div class="nt-i\${n.id === st.sel ? ' on' : ''}" data-id="\${n.id}">
        <b>\${n.pin ? '📌 ' : ''}\${esc(n.title || 'New Note')}</b>
        <div class="mt"><span>\${this.when(n.date)}</span><span class="sn">\${esc(this.snippet(n))}</span></div>
      </div>\`).join('') : \`<div style="padding:22px;text-align:center;color:var(--txt-3);font-size:12.5px">No notes</div>\`;
    const doc = w.node.querySelector('[data-doc]'), n = this.cur(w);
    if (n) { doc.innerHTML = n.body; doc.style.display = ''; }
    else { doc.innerHTML = ''; }
  },
  when(d) {
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return time12(d).replace(NBSP, ' ');
    const diff = (now - d) / 864e5;
    if (diff < 7) return DAYS[d.getDay()];
    return \`\${String(d.getDate()).padStart(2, '0')}/\${String(d.getMonth() + 1).padStart(2, '0')}/\${String(d.getFullYear()).slice(2)}\`;
  },
  save(w) {
    w = w || this.w; if (!w) return;
    const n = this.cur(w); if (!n) return;
    const doc = w.node.querySelector('[data-doc]'); if (!doc) return;
    n.body = doc.innerHTML;
    const h = doc.querySelector('h1');
    const t = (h ? h.textContent : (doc.textContent || '').split('\n')[0]).trim();
    if (t) n.title = t.slice(0, 60);
  },
  saveDebounced(w) { clearTimeout(this._t); this._t = setTimeout(() => { this.save(w); this.renderListOnly(w); }, 420); },
  renderListOnly(w) {
    const st = w.st, list = this.list(w);
    const host = w.node.querySelector('[data-items]'); if (!host) return;
    host.innerHTML = list.map(n => \`
      <div class="nt-i\${n.id === st.sel ? ' on' : ''}" data-id="\${n.id}">
        <b>\${n.pin ? '📌 ' : ''}\${esc(n.title || 'New Note')}</b>
        <div class="mt"><span>\${this.when(n.date)}</span><span class="sn">\${esc(this.snippet(n))}</span></div></div>\`).join('');
  },
  fmt(cmd, w) {
    w = w || this.w; if (!w) return;
    const doc = w.node.querySelector('[data-doc]');
    doc.focus();
    /* execCommand needs a range, and specifically one that lands inside a text node —
       a caret parked after the last block has nothing to hang a typing style on, so
       the command silently does nothing. */
    const sel = getSelection();
    if (!sel.rangeCount || !doc.contains(sel.anchorNode)) {
      const walk = document.createTreeWalker(doc, NodeFilter.SHOW_TEXT);
      let last = null;
      while (walk.nextNode()) if (walk.currentNode.nodeValue.trim()) last = walk.currentNode;
      const r = document.createRange();
      if (last) r.setStart(last, last.nodeValue.length);
      else { r.selectNodeContents(doc); }
      r.collapse(true);
      sel.removeAllRanges(); sel.addRange(r);
    }
    document.execCommand(cmd, false, null);
    this.fmtState(w);
    this.saveDebounced(w);
  },
  /* Toolbar buttons light up for the current caret, so pressing Bold with nothing
     selected still tells you the next thing you type will be bold. */
  fmtState(w) {
    w = w || this.w; if (!w) return;
    $$('[data-f]', w.node).forEach(b => {
      let on = false;
      try { on = document.queryCommandState(b.dataset.f); } catch (e) { }
      b.classList.toggle('on', on);
    });
  },
  checklist(w) {
    w = w || this.w; if (!w) return;
    const doc = w.node.querySelector('[data-doc]'); doc.focus();
    document.execCommand('insertHTML', false, \`<div class="todo"><i>\${ic('g-check')}</i><span>&nbsp;</span></div>\`);
    this.saveDebounced(w);
  },
  table(w) {
    w = w || this.w; if (!w) return;
    const doc = w.node.querySelector('[data-doc]'); doc.focus();
    document.execCommand('insertHTML', false,
      \`<table><tr><th>&nbsp;</th><th>&nbsp;</th><th>&nbsp;</th></tr><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr></table><p>&nbsp;</p>\`);
    this.saveDebounced(w);
  },
  create(w) {
    w = w || this.w; if (!w) return WM.open('notes');
    this.save(w);
    const id = Math.max(0, ...w.st.notes.map(n => n.id)) + 1;
    const d = new Date();
    w.st.notes.unshift({
      id, folder: w.st.folder === 'Recently Deleted' ? 'Notes' : (w.st.folder === 'All iCloud' ? 'Notes' : w.st.folder),
      title: 'New Note', date: d,
      body: \`<h1>New Note</h1><div class="date">\${d.getDate()} \${MONS[d.getMonth()]} \${d.getFullYear()} at \${time12(d).replace(NBSP, ' ')}</div><p><br></p>\`
    });
    w.st.sel = id; w.st.q = ''; const qi = w.node.querySelector('[data-q]'); if (qi) qi.value = '';
    this.render(w);
    const doc = w.node.querySelector('[data-doc]');
    doc.focus();
    const r = document.createRange(); r.selectNodeContents(doc.querySelector('h1')); r.collapse(false);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  },
  del(w) {
    w = w || this.w; if (!w) return;
    const n = this.cur(w); if (!n) return;
    if (n.folder === 'Recently Deleted') w.st.notes = w.st.notes.filter(x => x !== n);
    else n.folder = 'Recently Deleted';
    this.render(w);
  }
};

/* ============================================================================
   16 · CALENDAR
   ========================================================================== */
/* Calendars are the filter *and* the colour source, exactly as in Calendar.app —
   an event has no colour of its own, it inherits the list it belongs to. */
const CALS = [
  { id: 'home', name: 'Home', c: '#ff375f', on: true },
  { id: 'work', name: 'Work', c: '#0a84ff', on: true },
  { id: 'bday', name: 'Birthdays', c: '#30d158', on: true },
  { id: 'hol', name: 'Holidays', c: '#bf5af2', on: true },
];
const calOf = id => CALS.find(c => c.id === id) || CALS[0];

/* \`s\` is minutes past midnight and null means all-day; \`dur\` is length in minutes.
   Storing real numbers rather than "3:50 PM" is what lets events be moved, resized
   and laid out against each other instead of just listed. */
let EV_ID = 0;
/* Function declarations, not consts: the seed list below is built at parse time,
   which is before Cal exists. */
function clockLabel(mins) {
  const h = Math.floor(mins / 60) % 24, m = mins % 60;
  return \`\${h % 12 || 12}:\${String(m).padStart(2, '0')} \${h < 12 ? 'AM' : 'PM'}\`;
}
/** Keeps the fields other views read (\`at\`, \`c\`) in step with the underlying data. */
function syncEvent(ev) {
  ev.c = calOf(ev.cal).c;
  ev.at = ev.s == null ? 'all-day' : clockLabel(ev.s);
  return ev;
}
const mkEvent = o => syncEvent({ id: ++EV_ID, dur: 60, cal: 'work', loc: '', notes: '', ...o });
const EVENTS = [
  { d: [2026, 6, 27], t: 'Sprint planning', s: 570, dur: 45, cal: 'work' },
  { d: [2026, 6, 27], t: 'Dentist', s: 930, dur: 40, cal: 'home', loc: 'Dr. Reed · Stevens Creek' },
  { d: [2026, 6, 27], t: 'Dinner — Kate', s: 1200, dur: 120, cal: 'home', loc: 'Bar Aldo' },
  { d: [2026, 6, 28], t: 'One-on-one with Daniel', s: 630, dur: 30, cal: 'work' },
  { d: [2026, 6, 28], t: 'Deploy window', s: 1020, dur: 90, cal: 'work' },
  { d: [2026, 6, 29], t: 'Review PR #142', s: 660, dur: 60, cal: 'work' },
  { d: [2026, 6, 29], t: 'David — coffee', s: 1050, dur: 45, cal: 'home', loc: 'Third Wave' },
  { d: [2026, 6, 30], t: 'Podcast recording', s: 1020, dur: 90, cal: 'work', loc: 'Studio B' },
  { d: [2026, 7, 3], t: 'Flight to SFO', s: 375, dur: 210, cal: 'home', loc: 'BLR T2' },
  { d: [2026, 6, 21], t: 'Design review', s: 840, dur: 60, cal: 'work' },
  { d: [2026, 6, 15], t: 'Beta cutoff', s: null, cal: 'work' },
  { d: [2026, 6, 31], t: "John's birthday", s: null, cal: 'bday' },
  { d: [2026, 7, 15], t: 'Independence Day', s: null, cal: 'hol' },
].map(mkEvent);

/* Only events on visible calendars, in the order the day actually happens. */
const evOn = (y, m, d) => EVENTS
  .filter(e => e.d[0] === y && e.d[1] === m && e.d[2] === d && calOf(e.cal).on)
  .sort((a, b) => (a.s == null ? -1 : b.s == null ? 1 : a.s - b.s));

APPS.calendar = {
  name: 'Calendar', icon: 'app-calendar', w: 880, h: 600, minW: 560, minH: 380,
  menus: () => stdMenus('calendar', {
    View: [{ id: 'd', label: 'Day', key: '⌘1' }, { id: 'w', label: 'Week', key: '⌘2' },
    { id: 'm', label: 'Month', key: '⌘3', checked: true }, { id: 'y', label: 'Year', key: '⌘4' }, '-',
    { id: 't', label: 'Go to Today', key: '⌘T', run: () => Cal.today() }],
  }),
  mount(w) {
    const n = new Date();
    w.st = { y: n.getFullYear(), m: n.getMonth() };
    return \`<div class="wb">
      <div class="cal-side" data-drag><div class="sb-top" style="height:44px"><div data-tl></div></div>
        <div class="grp" style="padding:0 10px"><div class="gh">iCloud</div>
          <div data-cals></div>
        </div>
        <div data-mini></div>
        <div style="margin-top:auto;padding:10px 14px" data-agenda></div>
      </div>
      <div class="cal-main">
        <div class="cal-head" data-drag>
          <h3 data-mon></h3>
          <div class="grow" style="flex:1"></div>
          <button class="tbtn" data-nodrag data-p="-1">\${ic('g-chev-l')}</button>
          <button class="btn" data-nodrag data-today>Today</button>
          <button class="tbtn" data-nodrag data-p="1">\${ic('g-chev-r')}</button>
          <div class="seg" data-nodrag style="margin-left:6px">
            \${['Day', 'Week', 'Month', 'Year'].map(v =>
      \`<button data-view="\${v.toLowerCase()}"\${v === 'Month' ? ' class="on"' : ''} style="width:\${{ Day: 38, Week: 42, Month: 46, Year: 38 }[v]}px;font-size:11.5px">\${v}</button>\`).join('')}
          </div>
          <button class="tbtn" data-nodrag data-new>\${ic('g-plus')}</button>
        </div>
        <div class="cal-dows" data-dows>\${DAYS3.map(d => \`<div>\${d}</div>\`).join('')}</div>
        <div class="cal-grid" data-grid></div>
      </div></div>\`;
  },
  ready(w) {
    Cal.w = w;
    w.st.view = 'month'; w.st.day = new Date().getDate();
    on(w.node, 'click', '[data-p]', (e, t) => Cal.shift(w, +t.dataset.p));
    on(w.node, 'click', '[data-today]', () => Cal.today(w));
    on(w.node, 'click', '[data-view]', (e, t) => Cal.setView(w, t.dataset.view));
    on(w.node, 'click', '[data-new]', () => Cal.newEvent(w));
    /* Toggling a calendar hides its events everywhere, including the widget. */
    on(w.node, 'click', '[data-cal]', (e, t) => {
      const c = calOf(t.dataset.cal);
      c.on = !c.on;
      Cal.render(w);
      Bus.emit('events');
    });
    on(w.node, 'click', '.cal-cell', (e, t) => {
      if (t.classList.contains('out')) return;
      $$('.cal-cell.pick', w.node).forEach(c => c.classList.remove('pick'));
      t.classList.add('pick');
      w.st.day = +t.dataset.d;
    });
    /* Same gesture as Calendar.app: double-click empty space in a day to add. */
    on(w.node, 'dblclick', '.cal-cell', (e, t) => {
      if (t.classList.contains('out') || e.target.closest('.cal-ev')) return;
      Cal.edit(w, null, { y: +t.dataset.y, m: +t.dataset.m, d: +t.dataset.d });
    });
    on(w.node, 'click', '[data-ev]', (e, t) => {
      e.stopPropagation();
      const ev = EVENTS.find(x => x.id === +t.dataset.ev);
      if (ev) Cal.edit(w, ev);
    });
    /* Clicking an hour row opens the editor already set to that time. */
    on(w.node, 'dblclick', '.col', (e, t) => {
      if (e.target.closest('.ev')) return;
      const r = t.getBoundingClientRect();
      const mins = Cal.H0 * 60 + Math.round((e.clientY - r.top) / Cal.ROW * 60 / 15) * 15;
      Cal.edit(w, null, { y: +t.dataset.y, m: +t.dataset.m, d: +t.dataset.d, s: clamp(mins, 0, 1425) });
    });
    /* A month cell in year view jumps into that month. */
    on(w.node, 'click', '[data-ym]', (e, t) => {
      w.st.m = +t.dataset.ym; Cal.setView(w, 'month');
    });
    Cal.dragMove(w);
    Cal.render(w);
  }
};

const Cal = {
  w: null,
  /* A full day, like Calendar.app — a 7-to-9 window would clamp the early flight to
     the top of the grid and pretend the small hours don't exist. */
  H0: 0, H1: 23, ROW: 42,

  sync: syncEvent,
  clock: clockLabel,
  /* Accepts what people actually type: "9", "9:30", "9:30 pm", "21:30", "9p". */
  parseClock(str, fallback) {
    const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*(a|p)?m?\s*$/i.exec(str || '');
    if (!m) return fallback;
    let h = +m[1]; const min = +(m[2] || 0);
    if (h > 23 || min > 59) return fallback;
    if (m[3]) { h %= 12; if (/p/i.test(m[3])) h += 12; }
    return h * 60 + min;
  },
  parseDate(str, fallback) {
    const t = Date.parse(str);
    if (isNaN(t)) return fallback;
    const d = new Date(t);
    return [d.getFullYear(), d.getMonth(), d.getDate()];
  },
  dateLabel(d) { return \`\${MONS3[d[1]]} \${d[2]}, \${d[0]}\`; },

  /* The arrows step by whatever the current view shows. */
  shift(w, d) {
    w = w || this.w;
    const v = w.st.view || 'month';
    if (v === 'year') { w.st.y += d; }
    else if (v === 'week' || v === 'day') {
      const base = new Date(w.st.y, w.st.m, w.st.day || 1);
      base.setDate(base.getDate() + d * (v === 'week' ? 7 : 1));
      w.st.y = base.getFullYear(); w.st.m = base.getMonth(); w.st.day = base.getDate();
    } else {
      const m = w.st.m + d; w.st.y += Math.floor(m / 12); w.st.m = ((m % 12) + 12) % 12;
    }
    this.render(w);
  },
  today(w) {
    w = w || this.w; if (!w) return WM.open('calendar');
    const n = new Date();
    w.st.y = n.getFullYear(); w.st.m = n.getMonth(); w.st.day = n.getDate();
    this.render(w);
  },
  setView(w, v) {
    w = w || this.w; if (!w) return;
    w.st.view = v;
    $$('[data-view]', w.node).forEach(b => b.classList.toggle('on', b.dataset.view === v));
    this.render(w);
  },
  newEvent(w) {
    w = w || this.w; if (!w) return;
    this.edit(w, null, { y: w.st.y, m: w.st.m, d: w.st.day || 1 });
  },

  /** The one editor for both new and existing events, like Calendar's inspector. */
  edit(w, ev, seed = {}) {
    w = w || this.w; if (!w) return;
    const isNew = !ev;
    const now = new Date();
    const base = ev || {
      d: [seed.y ?? w.st.y, seed.m ?? w.st.m, seed.d ?? (w.st.day || 1)],
      t: '', s: seed.s ?? Math.min(1380, (Math.floor(now.getHours()) + 1) * 60),
      dur: 60, cal: 'work', loc: '', notes: '',
    };
    const allDay = base.s == null;
    const F = (label, inner) => \`<div class="ce-row"><span>\${label}</span>\${inner}</div>\`;
    const node = el(\`<div class="pop ce" style="width:340px">
      <div class="ce-top">
        <div class="ce-title">\${isNew ? 'New Event' : 'Event'}</div>
        \${isNew ? '' : \`<button class="tbtn" data-del title="Delete">\${ic('g-trash')}</button>\`}
      </div>
      <input class="ce-name" data-f="t" placeholder="New Event" spellcheck="false" value="\${esc(base.t)}">
      <input class="ce-loc" data-f="loc" placeholder="Add Location" spellcheck="false" value="\${esc(base.loc || '')}">
      <div class="ce-body">
        \${F('all-day', \`<div class="sw\${allDay ? ' on' : ''}" data-allday style="margin-left:auto;transform:scale(.82);transform-origin:left center"></div>\`)}
        \${F('date', \`<input data-f="date" value="\${this.dateLabel(base.d)}" spellcheck="false">\`)}
        <div data-times style="\${allDay ? 'display:none' : ''}">
          \${F('from', \`<input data-f="from" value="\${this.clock(base.s ?? 540)}" spellcheck="false">\`)}
          \${F('to', \`<input data-f="to" value="\${this.clock((base.s ?? 540) + (base.dur || 60))}" spellcheck="false">\`)}
        </div>
        \${F('calendar', \`<div class="ce-cals" style="margin-left:auto">\${CALS.map(c =>
      \`<span class="acc\${c.id === base.cal ? ' on' : ''}" data-pickcal="\${c.id}" title="\${c.name}" style="width:15px;height:15px;background:\${c.c}"></span>\`).join('')}</div>\`)}
      </div>
      <textarea class="ce-notes" data-f="notes" placeholder="Add Notes" spellcheck="false">\${esc(base.notes || '')}</textarea>
      <div class="ce-foot">
        <button class="btn" data-cancel>Cancel</button>
        <button class="btn pri" data-save>\${isNew ? 'Add' : 'Done'}</button>
      </div></div>\`);

    let cal = base.cal, day = !allDay;
    node.querySelector('[data-allday]').onclick = e => {
      const sw = e.currentTarget;
      sw.classList.toggle('on');
      day = !sw.classList.contains('on');
      node.querySelector('[data-times]').style.display = day ? '' : 'none';
    };
    on(node, 'click', '[data-pickcal]', (e, t) => {
      cal = t.dataset.pickcal;
      $$('[data-pickcal]', node).forEach(x => x.classList.toggle('on', x === t));
    });
    const val = f => node.querySelector(\`[data-f="\${f}"]\`).value;
    node.querySelector('[data-cancel]').onclick = () => Pop.close();
    if (!isNew) node.querySelector('[data-del]').onclick = () => {
      const i = EVENTS.indexOf(ev);
      if (i >= 0) EVENTS.splice(i, 1);
      Pop.close(); this.render(w); Bus.emit('events');
      Toast('Event deleted');
    };
    node.querySelector('[data-save]').onclick = () => {
      const d = this.parseDate(val('date'), base.d);
      const s = day ? this.parseClock(val('from'), base.s ?? 540) : null;
      /* An end before its start means the next day in Calendar; here it just clamps
         to a fifteen-minute minimum, which is the only sane reading in one grid. */
      const dur = day ? Math.max(15, this.parseClock(val('to'), (s || 0) + 60) - s) : 0;
      const t = val('t').trim() || 'New Event';
      if (isNew) EVENTS.push(mkEvent({ d, t, s, dur, cal, loc: val('loc').trim(), notes: val('notes') }));
      else Object.assign(ev, { d, t, s, dur, cal, loc: val('loc').trim(), notes: val('notes') }) && this.sync(ev);
      w.st.y = d[0]; w.st.m = d[1]; w.st.day = d[2];
      Pop.close(); this.render(w); Bus.emit('events');
      Toast(isNew ? \`Added “\${t}” on \${MONS3[d[1]]} \${d[2]}\` : 'Event updated');
    };
    const r = w.node.getBoundingClientRect();
    Pop.open(node, { x: Math.min(r.right - 356, innerWidth - 356), y: r.top + 64, origin: 'top right' });
    setTimeout(() => node.querySelector('.ce-name').focus(), 60);
    /* Enter saves, which is the whole point of a one-field-deep sheet. */
    node.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); node.querySelector('[data-save]').click(); }
      if (e.key === 'Escape') { e.preventDefault(); Pop.close(); }
    });
  },

  /* Dragging an event onto another day moves it, the way it does in month view. */
  dragMove(w) {
    let drag = null;
    w.node.addEventListener('pointerdown', e => {
      const chip = e.target.closest('.cal-ev[data-ev]');
      if (!chip || e.button) return;
      const ev = EVENTS.find(x => x.id === +chip.dataset.ev);
      if (!ev) return;
      drag = { ev, chip, x: e.clientX, y: e.clientY, live: false };
    });
    addEventListener('pointermove', e => {
      if (!drag) return;
      if (!drag.live) {
        if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4) return;
        drag.live = true;
        drag.chip.classList.add('dragging');
        document.body.style.cursor = 'grabbing';
      }
      const cell = document.elementFromPoint(e.clientX, e.clientY)?.closest('.cal-cell:not(.out)');
      $$('.cal-cell.drop', w.node).forEach(c => c.classList.remove('drop'));
      if (cell) cell.classList.add('drop');
    });
    addEventListener('pointerup', e => {
      if (!drag) return;
      const d = drag;
      drag = null;
      document.body.style.cursor = '';
      $$('.cal-cell.drop', w.node).forEach(c => c.classList.remove('drop'));
      if (!d.live) return;
      d.chip.classList.remove('dragging');
      const cell = document.elementFromPoint(e.clientX, e.clientY)?.closest('.cal-cell:not(.out)');
      if (!cell) return;
      const to = [+cell.dataset.y, +cell.dataset.m, +cell.dataset.d];
      if (to.join() === d.ev.d.join()) return;
      d.ev.d = to;
      this.render(w); Bus.emit('events');
      Toast(\`Moved to \${MONS3[to[1]]} \${to[2]}\`);
    });
  },

  render(w) {
    w = w || this.w; if (!w) return;
    const v = w.st.view || 'month';
    if (v === 'day') return this.renderDay(w);
    if (v === 'week') return this.renderWeek(w);
    if (v === 'year') return this.renderYear(w);
    return this.renderMonth(w);
  },

  /* Shared chrome: the calendar list, mini-month and agenda don't change per view. */
  side(w) {
    const { y, m } = w.st, now = new Date();
    w.node.querySelector('[data-cals]').innerHTML = CALS.map(c =>
      \`<div class="si cal-tick\${c.on ? '' : ' off'}" data-cal="\${c.id}">
        <span class="tick" style="--c:\${c.c}">\${ic('g-check')}</span><span class="nm">\${c.name}</span></div>\`).join('');
    w.node.querySelector('[data-mini]').innerHTML = this.miniHTML(y, m);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const upcoming = EVENTS
      .filter(e => calOf(e.cal).on && new Date(e.d[0], e.d[1], e.d[2]) >= today)
      .sort((a, b) => (new Date(a.d[0], a.d[1], a.d[2]) - new Date(b.d[0], b.d[1], b.d[2])) || (a.s ?? -1) - (b.s ?? -1))
      .slice(0, 4);
    w.node.querySelector('[data-agenda]').innerHTML =
      \`<div class="gh" style="padding-left:0">Upcoming</div>\` + (upcoming.length ? upcoming.map(e =>
        \`<div class="cal-up" data-ev="\${e.id}"><i style="background:\${e.c}"></i>
        <div style="min-width:0"><div class="t">\${esc(e.t)}</div>
        <div class="s">\${MONS3[e.d[1]]} \${e.d[2]} · \${e.at}</div></div></div>\`).join('')
        : \`<div style="font-size:11.5px;color:var(--txt-3)">Nothing scheduled.</div>\`);
  },

  /* Hour rows, shared by day and week. Events sit at their start minute, are as tall
     as they are long, and split the column when they overlap — the three things that
     separate a timetable from a list of times. */
  layout(evs) {
    const timed = evs.filter(e => e.s != null);
    const cols = [];
    timed.forEach(e => {
      const end = e.s + (e.dur || 60);
      let c = cols.findIndex(col => col.every(o => e.s >= o.s + (o.dur || 60) || end <= o.s));
      if (c < 0) { cols.push([e]); c = cols.length - 1; } else cols[c].push(e);
      e._col = c;
    });
    const n = Math.max(1, cols.length);
    timed.forEach(e => { e._w = 100 / n; e._x = e._col * (100 / n); });
    return { timed, allDay: evs.filter(e => e.s == null) };
  },
  /** The fixed band above the hour grid. Empty days still need a cell, for alignment. */
  allDayBand(days) {
    const cells = days.map(d => evOn(d.getFullYear(), d.getMonth(), d.getDate()).filter(e => e.s == null));
    if (!cells.some(c => c.length)) return '';
    return \`<div class="cal-band"><div class="gut">all-day</div>
      \${cells.map(evs => \`<div class="cell">\${evs.map(e =>
      \`<div class="chip" data-ev="\${e.id}" style="background:\${e.c}">\${esc(e.t)}</div>\`).join('')}</div>\`).join('')}</div>\`;
  },
  /** The scrolling hour grid, wrapped so the band can sit above it and stay put. */
  gridHTML(days) {
    return \`<div class="cal-grid cal-stack" data-grid>\${this.allDayBand(days)}
      <div class="scroll" data-scroller style="flex:1;min-height:0">\${this.timeCol(days)}</div></div>\`;
  },
  timeCol(days) {
    const { H0, H1, ROW } = this;
    const hours = [];
    for (let h = H0; h <= H1; h++) hours.push(h);
    const label = h => \`\${h % 12 || 12} \${h < 12 ? 'AM' : 'PM'}\`;
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    return \`<div class="cal-time">
      <div class="gut">\${hours.map(h => \`<div style="height:\${ROW}px">\${label(h)}</div>\`).join('')}</div>
      \${days.map(d => {
      const { timed, allDay } = this.layout(evOn(d.getFullYear(), d.getMonth(), d.getDate()));
      const isToday = d.toDateString() === now.toDateString();
      void allDay; /* drawn in the band above, not in the hour grid */
      return \`<div class="col\${isToday ? ' today' : ''}" data-y="\${d.getFullYear()}" data-m="\${d.getMonth()}" data-d="\${d.getDate()}">
          \${hours.map(() => \`<div class="hr" style="height:\${ROW}px"></div>\`).join('')}
          \${timed.map(e => {
        const top = (e.s / 60 - H0) * ROW;
        const h = Math.max(17, (e.dur || 60) / 60 * ROW - 2);
        return \`<div class="ev" data-ev="\${e.id}" style="top:\${top}px;height:\${h}px;left:\${e._x}%;width:calc(\${e._w}% - 4px);background:\${e.c}">
              <b>\${esc(e.t)}</b><span>\${e.at}\${e.loc ? ' · ' + esc(e.loc) : ''}</span></div>\`;
      }).join('')}
          \${isToday ? \`<div class="cal-now" style="top:\${(nowMins / 60 - H0) * ROW}px"></div>\` : ''}
        </div>\`;
    }).join('')}
    </div>\`;
  },

  renderDay(w) {
    const { y, m } = w.st, d = new Date(y, m, w.st.day || 1);
    w.node.querySelector('[data-mon]').textContent = \`\${DAYS[d.getDay()]}, \${MONS[m]} \${d.getDate()}, \${y}\`;
    w.node.querySelector('[data-dows]').innerHTML = \`<div style="flex:1;text-align:left;padding-left:64px">\${DAYS[d.getDay()]} \${d.getDate()}</div>\`;
    w.node.querySelector('[data-grid]').outerHTML = this.gridHTML([d]);
    this.scrollToHour(w);
    this.side(w);
  },

  /* Open on the working day, and follow the clock once it's past mid-morning. The
     clamp is what stops a 2am visit from landing on an empty stretch of night. */
  scrollToHour(w) {
    const grid = w.node.querySelector('[data-scroller]');
    if (!grid) return;
    const now = new Date();
    const shown = new Date(w.st.y, w.st.m, w.st.day || 1);
    const anchor = shown.toDateString() === now.toDateString()
      ? clamp(now.getHours() - 2, 7, 16) : 7;
    grid.scrollTop = (anchor - this.H0) * this.ROW;
  },

  renderWeek(w) {
    const { y, m } = w.st, base = new Date(y, m, w.st.day || 1);
    const start = new Date(base); start.setDate(base.getDate() - base.getDay());
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
    const a = days[0], b = days[6];
    w.node.querySelector('[data-mon]').textContent = a.getMonth() === b.getMonth()
      ? \`\${MONS[a.getMonth()]} \${a.getDate()} – \${b.getDate()}, \${b.getFullYear()}\`
      : \`\${MONS3[a.getMonth()]} \${a.getDate()} – \${MONS3[b.getMonth()]} \${b.getDate()}, \${b.getFullYear()}\`;
    w.node.querySelector('[data-dows]').innerHTML =
      \`<div style="width:52px;flex:none"></div>\` + days.map(d =>
        \`<div\${d.toDateString() === new Date().toDateString() ? ' style="color:var(--blue);font-weight:650"' : ''}>\${DAYS3[d.getDay()]} \${d.getDate()}</div>\`).join('');
    w.node.querySelector('[data-grid]').outerHTML = this.gridHTML(days);
    this.scrollToHour(w);
    this.side(w);
  },

  renderYear(w) {
    const { y } = w.st, now = new Date();
    w.node.querySelector('[data-mon]').textContent = String(y);
    w.node.querySelector('[data-dows]').innerHTML = '';
    w.node.querySelector('[data-grid]').outerHTML = \`<div class="cal-grid scroll cal-year" data-grid>
      \${MONS.map((name, mi) => {
      const first = new Date(y, mi, 1).getDay(), dim = new Date(y, mi + 1, 0).getDate();
      let cells = '';
      for (let i = 0; i < first; i++) cells += \`<i></i>\`;
      for (let d = 1; d <= dim; d++) {
        const t = d === now.getDate() && mi === now.getMonth() && y === now.getFullYear();
        const has = evOn(y, mi, d).length;
        cells += \`<i class="\${t ? 'today' : has ? 'has' : ''}">\${d}</i>\`;
      }
      return \`<div class="ym" data-ym="\${mi}"><div class="mh">\${name}</div>
        <div class="mg">\${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(s => \`<span>\${s}</span>\`).join('')}\${cells}</div></div>\`;
    }).join('')}</div>\`;
    this.side(w);
  },

  renderMonth(w) {
    w = w || this.w; if (!w) return;
    const { y, m } = w.st, now = new Date();
    w.node.querySelector('[data-mon]').textContent = \`\${MONS[m]} \${y}\`;
    w.node.querySelector('[data-dows]').innerHTML = DAYS3.map(d => \`<div>\${d}</div>\`).join('');
    const gridNode = w.node.querySelector('[data-grid]');
    gridNode.outerHTML = \`<div class="cal-grid" data-grid></div>\`;
    const first = new Date(y, m, 1).getDay();
    const dim = new Date(y, m + 1, 0).getDate();
    const pdim = new Date(y, m, 0).getDate();
    const cells = [];
    for (let i = 0; i < first; i++) cells.push({ d: pdim - first + 1 + i, out: true, y: m === 0 ? y - 1 : y, m: (m + 11) % 12 });
    for (let d = 1; d <= dim; d++) cells.push({ d, y, m });
    while (cells.length % 7) cells.push({ d: cells.length - first - dim + 1, out: true, y: m === 11 ? y + 1 : y, m: (m + 1) % 12 });
    while (cells.length < 35) cells.push({ d: cells.length - first - dim + 1, out: true, y: m === 11 ? y + 1 : y, m: (m + 1) % 12 });

    w.node.querySelector('[data-grid]').innerHTML = cells.map(c => {
      const isToday = !c.out && c.d === now.getDate() && c.m === now.getMonth() && c.y === now.getFullYear();
      const evs = evOn(c.y, c.m, c.d);
      return \`<div class="cal-cell\${c.out ? ' out' : ''}\${isToday ? ' today' : ''}" data-y="\${c.y}" data-m="\${c.m}" data-d="\${c.d}">
        <span class="d">\${c.d}</span>
        \${evs.slice(0, 3).map(e => \`<div class="cal-ev\${e.s == null ? ' allday' : ''}" data-ev="\${e.id}" style="background:\${e.c}" title="\${esc(e.t)} · \${e.at}">\${esc(e.t)}</div>\`).join('')}
        \${evs.length > 3 ? \`<div class="cal-more">\${evs.length - 3} more</div>\` : ''}
      </div>\`;
    }).join('');
    this.side(w);
  },
  miniHTML(y, m) {
    const now = new Date();
    const first = new Date(y, m, 1).getDay(), dim = new Date(y, m + 1, 0).getDate();
    let cells = '';
    for (let i = 0; i < first; i++) cells += \`<i class="out"></i>\`;
    for (let d = 1; d <= dim; d++) {
      const t = d === now.getDate() && m === now.getMonth() && y === now.getFullYear();
      cells += \`<i class="\${t ? 'today' : ''}">\${d}</i>\`;
    }
    return \`<div class="mini"><div class="mh"><span>\${MONS[m]} \${y}</span></div>
      <div class="mg">\${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => \`<span>\${d}</span>\`).join('')}\${cells}</div></div>\`;
  }
};

/* ============================================================================
   17 · SAFARI
   ========================================================================== */
/* Pages served from inside the file. Everything else goes to the network. */
const SITES = {
  'apple.com': {
    title: 'Apple', fav: '#111',
    html: \`<div class="site light">
      <div class="avatar" style="background:#1d1d1f">\${ic('g-apple')}</div>
      <h1 style="font-size:34px">macOS Tahoe 26</h1><p class="role">Liquid Glass. Everywhere.</p>
      <div class="links"><a data-goto="en.wikipedia.org/wiki/MacOS">Learn more</a><a data-openext="https://www.apple.com/macos/">Open apple.com</a></div>
      <div class="foot">Copyright © 2026 Apple Inc. All rights reserved.</div></div>\`
  },
};
/* Just enough Markdown to read an article. The extractor's output is predictable,
   so this stays deliberately small — and every link is rewritten to navigate
   inside this browser instead of leaving the page. */
function mdInline(s) {
  return esc(s)
    .replace(/!\[(?:Image \d+:\s*)?([^\]]*)\]\(([^)\s]+)[^)]*\)/g,
      (m, a, u) => /^https?:/.test(u) ? \`<img src="\${u}" alt="\${a}" loading="lazy">\` : '')
    /* Link text that is itself a URL means an icon or vote arrow the extractor
       couldn't name — printing it just fills the page with addresses. */
    .replace(/\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (m, a, u) => {
      const txt = a.trim();
      if (!/^https?:/.test(u)) return txt;
      if (!txt || /^https?:\/\//.test(txt)) return '';
      return \`<a data-goto="\${u.replace(/^https?:\/\//, '')}">\${txt}</a>\`;
    })
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<i>$2</i>')
    .replace(/\`([^\`]+)\`/g, '<code>$1</code>');
}
function mdHTML(src) {
  /* Listing pages come back as one enormous line with the item numbers inline.
     Long lines get split back into list items; short ones are left alone so
     ordinary prose keeps its decimals. */
  const src2 = src.replace(/\r/g, '').split('\n')
    .map(l => l.length > 140 ? l.replace(/\s(\d{1,3})\.(?!\d)\s*/g, '\n$1. ') : l).join('\n');
  const out = [], lines = src2.split('\n');
  let para = [], list = null, code = null;
  const flushP = () => {
    if (!para.length) return;
    const html = mdInline(para.join(' ').replace(/\s{2,}/g, ' ')).trim();
    if (html) out.push(\`<p>\${html}</p>\`);
    para = [];
  };
  const flushL = () => {
    if (!list) return;
    const items = list.items.map(i => mdInline(i).trim()).filter(Boolean);
    if (items.length) out.push(\`<\${list.t}>\${items.map(i => \`<li>\${i}</li>\`).join('')}</\${list.t}>\`);
    list = null;
  };
  const flush = () => { flushP(); flushL(); };
  for (const raw of lines) {
    const ln = raw.trimEnd();
    if (code !== null) {
      if (/^\`\`\`/.test(ln)) { out.push(\`<pre><code>\${esc(code.join('\n'))}</code></pre>\`); code = null; }
      else code.push(raw);
      continue;
    }
    if (/^\`\`\`/.test(ln)) { flush(); code = []; continue; }
    if (!ln.trim()) { flush(); continue; }
    if (/^(Published Time|URL Source|Warning):/.test(ln)) continue;
    const h = ln.match(/^(#{1,6})\s+(.*)$/);
    if (h) { flush(); const lvl = Math.min(h[1].length + 1, 6); out.push(\`<h\${lvl}>\${mdInline(h[2])}</h\${lvl}>\`); continue; }
    if (/^([-*_])\1{2,}$/.test(ln.replace(/\s/g, ''))) { flush(); out.push('<hr>'); continue; }
    const li = ln.match(/^\s*(?:[-*+]\s+|\d{1,3}\.(?!\d)\s*)(.*)$/);
    if (li) {
      const t = /^\s*\d/.test(ln) ? 'ol' : 'ul';
      flushP(); if (list && list.t !== t) flushL();
      (list = list || { t, items: [] }).items.push(li[1]);
      continue;
    }
    const q = ln.match(/^>\s?(.*)$/);
    if (q) { flush(); out.push(\`<blockquote>\${mdInline(q[1])}</blockquote>\`); continue; }
    flushL(); para.push(ln.trim());
  }
  if (code) out.push(\`<pre><code>\${esc(code.join('\n'))}</code></pre>\`);
  flush();
  return out.join('\n');
}

/* Whatever the URL bar can't resolve locally is searched for real. */
const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const WIKI_REST = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
/* DuckDuckGo answers 200 even for hosts with no icon, so a missing favicon is a
   decode failure the markup can style around rather than a console error. */
const favicon = host => \`https://icons.duckduckgo.com/ip3/\${encodeURIComponent(host)}.ico\`;

const FAVS = [['Apple', '#1d1d1f'], ['Wikipedia', '#636466'], ['YouTube', '#ff0033'],
['Hacker News', '#ff6600'], ['MDN', '#000'], ['Can I use', '#1d78c1'],
['Internet Archive', '#000'], ['JSFiddle', '#0084ff']];
const FAV_URL = {
  'Apple': 'apple.com', 'Wikipedia': 'en.wikipedia.org/wiki/MacOS',
  'YouTube': 'youtube.com', 'Hacker News': 'news.ycombinator.com',
  'MDN': 'developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter', 'Can I use': 'caniuse.com',
  'Internet Archive': 'archive.org', 'JSFiddle': 'jsfiddle.net',
};
/* Most recent first, deduplicated — feeds the History menu and the start page. */
const HISTORY = [];
const READING = [
  ['en.wikipedia.org/wiki/Bézier_curve', 'Bézier curve'],
  ['en.wikipedia.org/wiki/Subpixel_rendering', 'Subpixel rendering'],
];

APPS.safari = {
  name: 'Safari', icon: 'app-safari', w: 1020, h: 660, minW: 520, minH: 360, single: false,
  menus: () => stdMenus('safari', {
    File: [{ id: 't', label: 'New Tab', key: '⌘T', run: () => Saf.newTab() },
    { id: 'w', label: 'New Window', key: '⌘N', run: () => WM.open('safari', { force: true }) }, '-',
    { id: 'c', label: 'Close Tab', key: '⌘W', run: () => Saf.closeTab() }],
    View: [{ id: 'sb', label: (Saf.w && Saf.w.st.sidebar ? 'Hide' : 'Show') + ' Sidebar', key: '⌃⌘S', run: () => Saf.toggleSidebar() },
    { id: 'fb', label: (SYS.safariFavs ? 'Hide' : 'Show') + ' Favourites Bar', key: '⇧⌘B', run: () => Saf.toggleFavBar() }, '-',
    { id: 'r', label: 'Reload Page', key: '⌘R', run: () => Saf.reload() }],
    History: [{ id: 'b', label: 'Back', key: '⌘[', run: () => Saf.back() }, { id: 'f', label: 'Forward', key: '⌘]', run: () => Saf.fwd() }, '-',
    ...(HISTORY.length ? HISTORY.slice(0, 8).map((u, i) => ({ id: 'h' + i, label: Saf.titleFor(u), run: () => Saf.go(u) }))
      : [{ id: 'h', label: 'No history yet', disabled: true }])],
    Bookmarks: FAVS.map(([n]) => ({ id: n, label: n, run: () => Saf.go(FAV_URL[n]) })),
  }, ['File', 'Edit', 'View', 'History', 'Bookmarks', 'Window', 'Help']),
  mount(w) {
    w.st = { tabs: [{ url: '', hist: [''], hi: 0 }], t: 0, sidebar: false };
    return \`<div class="sf" data-sf>
      <div class="sf-top" data-drag>
        <div class="sf-r1">
          <div class="sf-l">
            <div data-tl></div><div style="width:8px"></div>
            <button class="tbtn" data-nodrag data-sb title="Sidebar">\${ic('g-sidebar')}</button>
            <div class="sf-sep"></div>
            <button class="tbtn" data-nodrag data-back title="Back">\${ic('g-chev-l')}</button>
            <button class="tbtn" data-nodrag data-fwd title="Forward">\${ic('g-chev-r')}</button>
          </div>
          <div class="sf-url" data-nodrag>
            <button class="tbtn rd" data-reader title="Show Reader">\${ic('g-glasses')}</button>
            <span data-urlico>\${ic('g-search')}</span>
            <input data-url spellcheck="false" autocomplete="off" placeholder="Search or enter website name">
            <button class="tbtn" data-reload style="min-width:20px;height:20px" title="Reload">\${ic('g-reload')}</button>
          </div>
          <div class="sf-r">
            <button class="tbtn" data-nodrag data-share title="Share">\${ic('g-share')}</button>
            <button class="tbtn" data-nodrag data-overview title="Show Tab Overview">\${ic('g-grid')}</button>
            <button class="tbtn" data-nodrag data-newtab title="New Tab">\${ic('g-plus')}</button>
          </div>
        </div>
        <div class="sf-tabs" data-tabs></div>
        <div class="sf-fav" data-nodrag data-favbar></div>
      </div>
      <div class="sf-body">
        <div class="sf-side" data-side></div>
        <div class="sf-page scroll" data-page><div class="sf-prog" data-prog></div></div>
      </div>
    </div>\`;
  },
  ready(w) {
    Saf.w = w;
    const url = w.node.querySelector('[data-url]');
    on(w.node, 'click', '[data-back]', () => Saf.back(w));
    on(w.node, 'click', '[data-fwd]', () => Saf.fwd(w));
    on(w.node, 'click', '[data-reload]', () => Saf.reload(w));
    on(w.node, 'click', '[data-newtab]', () => Saf.newTab(w));
    on(w.node, 'click', '[data-share]', () => Saf.share(w));
    on(w.node, 'click', '[data-tryframe]', (e, t) => {
      const page = w.node.querySelector('[data-page]');
      page.innerHTML = \`<div class="sf-prog" data-prog></div>\` + Saf.framePage(t.dataset.tryframe, true);
    });
    on(w.node, 'click', '[data-overview]', () => Saf.overview(w));
    on(w.node, 'click', '[data-sb]', () => Saf.toggleSidebar(w));
    on(w.node, 'click', '[data-reader]', () => Saf.toggleReader(w));
    on(w.node, 'click', '[data-fav]', (e, t) => Saf.go(FAV_URL[t.dataset.fav] || t.dataset.fav, w));
    on(w.node, 'click', '.sf-tab', (e, t) => { if (e.target.closest('.x')) return; w.st.t = +t.dataset.i; Saf.render(w); });
    on(w.node, 'click', '.sf-tab .x', (e, t) => { e.stopPropagation(); Saf.closeTab(w, +t.closest('.sf-tab').dataset.i); });
    url.addEventListener('focus', () => url.select());
    url.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); url.blur(); Saf.go(url.value.trim(), w); }
      if (e.key === 'Escape') { url.blur(); Saf.render(w); }
    });
    Saf.render(w);
  }
};

const Saf = {
  w: null,
  tab(w) { w = w || this.w; return w.st.tabs[w.st.t]; },
  site(url) {
    const clean = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
    return SITES[clean] || null;
  },
  /* Classify what the user typed. Anything with a dot and no spaces is treated as
     an address; everything else is a search, same as the real omnibar. */
  kind(url) {
    const u = url.replace(/^https?:\/\//, '');
    if (!u.trim()) return 'start';
    if (SITES[u.replace(/\/$/, '')]) return 'local';
    if (/^en\.wikipedia\.org\/wiki\//.test(u)) return 'wiki';
    if (/(^|\.)youtube\.com\/watch\?v=|(^|\.)youtu\.be\//.test(u)) return 'video';
    if (/^[^\s/]+\.[a-z]{2,}(\/|$|\?)/i.test(u)) return 'web';
    return 'search';
  },
  host(url) { return url.replace(/^https?:\/\//, '').split('/')[0]; },
  /* Titles have to be known before content arrives, or the tab strip flickers. */
  titleFor(url) {
    const k = this.kind(url), u = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (k === 'start') return 'Start Page';
    if (k === 'local') return SITES[u].title;
    if (k === 'wiki') return decodeURIComponent(u.split('/wiki/')[1] || '').replace(/_/g, ' ') + ' — Wikipedia';
    if (k === 'search') return \`\${url} — Search\`;
    return this.host(url);
  },
  favFor(url) {
    const k = this.kind(url), u = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (k === 'local') return SITES[u].fav;
    if (k === 'search' || k === 'start') return '#8e8e93';
    return null;                                  // real favicon, fetched
  },

  /* Chrome that lives outside the page: tab strip, favourites bar, sidebar. */
  paintChrome(w) {
    const st = w.st, t = this.tab(w), k = this.kind(t.url);
    w.node.querySelector('[data-url]').value = k === 'start' ? '' : t.url;
    w.node.querySelector('[data-urlico]').innerHTML = ic(k === 'start' || k === 'search' ? 'g-search' : 'g-lock');
    const rd = w.node.querySelector('[data-reader]');
    rd.classList.toggle('show', k === 'web');
    rd.classList.toggle('on', k === 'web' && (t.reader === true || (t.reader == null && !this.framable(t.url))));
    w.node.querySelector('[data-back]').classList.toggle('dis', t.hi <= 0);
    w.node.querySelector('[data-fwd]').classList.toggle('dis', t.hi >= t.hist.length - 1);
    w.node.querySelector('[data-sb]').classList.toggle('on', st.sidebar);
    w.node.querySelector('[data-sf]').classList.toggle('sb', st.sidebar);
    /* A lone tab needs no strip; the empty container collapses itself. */
    w.node.querySelector('[data-tabs]').innerHTML = st.tabs.length < 2 ? '' : st.tabs.map((tb, i) =>
      \`<div class="sf-tab\${i === st.t ? ' on' : ''}" data-i="\${i}">
        <span class="x">\${ic('g-x')}</span>
        <span class="mid">\${this.favHTML(tb.url)}<span class="nm">\${esc(this.titleFor(tb.url))}</span></span></div>\`
    ).join('');
    w.node.querySelector('[data-favbar]').innerHTML = SYS.safariFavs
      ? FAVS.map(([n, c]) => \`<a data-fav="\${esc(n)}"><i style="background:\${c}"></i>\${esc(n)}</a>\`).join('') : '';
    w.node.querySelector('[data-side]').innerHTML = st.sidebar ? this.sideHTML(t.url) : '';
  },
  favHTML(url, size = 14) {
    const c = this.favFor(url);
    return c ? \`<span class="fav" style="background:\${c};width:\${size}px;height:\${size}px"></span>\`
      : \`<img class="fav" src="\${favicon(this.host(url))}" alt="" onerror="this.style.visibility='hidden'"
          style="width:\${size}px;height:\${size}px;border-radius:3px">\`;
  },
  sideHTML(cur) {
    const row = (u, label, icon) => \`<div class="si\${u === cur ? ' on' : ''}" data-goto="\${esc(u)}">
      \${icon || this.favHTML(u, 16)}<span class="nm">\${esc(label)}</span></div>\`;
    return \`<div class="in">
      <div class="grp"><div class="gh">Favourites</div>\${FAVS.map(([n]) => row(FAV_URL[n], n)).join('')}</div>
      <div class="grp"><div class="gh">Reading List</div>\${READING.map(([u, n]) => row(u, n, ic('g-glasses', 'ico'))).join('')}</div>
    </div>\`;
  },
  /* Safari's start page: favourites as tiles, then whatever you've actually opened. */
  startHTML() {
    const tile = (u, label, dot) => \`<a class="sf-tile" data-goto="\${esc(u)}">
      <span class="sq">\${dot ? \`<i style="background:\${dot}">\${esc((label[0] || '?').toUpperCase())}</i>\`
        : \`<img src="\${favicon(this.host(u))}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('i'),{textContent:'\${esc((label[0] || '?').toUpperCase())}',style:'background:#8e8e93'}))">\`}</span>
      <span>\${esc(label)}</span></a>\`;
    const recent = HISTORY.filter(u => this.kind(u) !== 'start').slice(0, 8);
    return \`<div class="sf-start">
      <h2>Favourites</h2>
      <div class="sf-grid">\${FAVS.map(([n, c]) => tile(FAV_URL[n], n, SITES[FAV_URL[n]] ? c : null)).join('')}</div>
      \${recent.length ? \`<h2>Frequently Visited</h2>
        <div class="sf-grid">\${recent.map(u => tile(u, this.titleFor(u).split(' — ')[0], this.favFor(u))).join('')}</div>\` : ''}
      <div class="sf-priv">\${ic('g-shield')}<div><b>Privacy Report</b> · \${9 + (HISTORY.length % 7)} trackers prevented from profiling you</div></div>
    </div>\`;
  },

  render(w) {
    w = w || this.w; if (!w) return;
    const t = this.tab(w);
    this.paintChrome(w);
    w.title = this.titleFor(t.url);
    const tt = w.node.querySelector('.tb .title'); if (tt) tt.textContent = w.title;

    const page = w.node.querySelector('[data-page]');
    page.innerHTML = \`<div class="sf-prog" data-prog></div>\`;
    page.dataset.kind = this.kind(t.url);
    const prog = page.querySelector('[data-prog]');
    prog.classList.add('on'); prog.style.width = '18%';
    raf(() => raf(() => { prog.style.width = '72%'; }));

    /* Every navigation gets a token; a slow fetch that lands after the user has
       moved on must not paint over the newer page. */
    const token = (w.nav = (w.nav || 0) + 1);
    const finish = html => {
      if (w.dead || w.nav !== token) return;
      page.innerHTML = \`<div class="sf-prog on" data-prog style="width:100%"></div>\` + html;
      setTimeout(() => { const p = page.querySelector('[data-prog]'); if (p) p.classList.remove('on'); }, 260);
    };
    this.paint(t.url, finish, w);
  },

  /* Resolves a URL to markup, hitting the network when it has to. */
  paint(url, done, w) {
    const k = this.kind(url), u = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (k === 'start') return done(this.startHTML());
    if (k === 'local') return done(SITES[u].html);
    if (k === 'wiki') return this.paintWiki(decodeURIComponent(u.split('/wiki/')[1] || 'MacOS'), done);
    if (k === 'search') return this.paintSearch(url, done);
    if (k === 'video') {
      const id = (u.match(/[?&]v=([\w-]{6,})/) || u.match(/youtu\.be\/([\w-]{6,})/) || [])[1];
      /* YouTube rejects players whose embedder has no origin, which is every page
         opened straight off the disk. Served over http it plays for real, so say
         which situation you're in rather than showing their error 153. */
      if (id && location.protocol === 'file:') return done(\`<div class="sf-blocked">
        <div class="ico"><img src="\${favicon('youtube.com')}" alt="" onerror="this.style.display='none'"></div>
        <h3>Embeds need a real origin</h3>
        <p>YouTube won't embed into a page opened from the filesystem. Served over http it plays here.</p>
        <div style="display:flex;gap:9px;margin-top:6px">
          <button class="btn pri" data-openext="https://www.youtube.com/watch?v=\${esc(id)}">Watch on YouTube</button>
          <button class="btn" data-tryframe="youtube.com/embed/\${esc(id)}">Try Anyway</button>
        </div></div>\`);
      if (id) return done(\`<iframe class="sf-frame" src="https://www.youtube.com/embed/\${id}?autoplay=0&rel=0"
        allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture"
        allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>\`);
    }
    /* Embeddable hosts get a real frame; everything else is read for real
       through the extractor, which is what Reader does anyway. */
    const t = w && this.tab(w);
    if (t && t.reader === true) return this.paintReader(url, done);
    const frame = this.framePage(url, !!(t && t.reader === false));
    return frame ? done(frame) : this.paintReader(url, done);
  },

  /* A page served from a file:// document can't tell a refused frame from a real
     one — both fire load, and both refuse DOM access because the parent origin is
     opaque. So instead of guessing wrong, hosts known to allow embedding are framed
     straight away and the rest are read as text. */
  framable(url) {
    const h = this.host(url).replace(/^www\./, '');
    return /(^|\.)(example\.(com|org)|youtube(-nocookie)?\.com|youtu\.be|player\.vimeo\.com|jsfiddle\.net|archive\.org|wikipedia\.org|github\.io|caniuse\.com)$/.test(h);
  },

  framePage(url, force) {
    if (!force && !this.framable(url)) return null;
    const src = /^https?:\/\//.test(url) ? url : 'https://' + url;
    return \`<iframe class="sf-frame" src="\${esc(src)}" referrerpolicy="no-referrer"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>\`;
  },

  /* Reader. A CORS-enabled extractor hands back the article as Markdown, which
     renders here as type — no frame, so no X-Frame-Options to argue with. */
  reader: 'https://r.jina.ai/',
  async paintReader(url, done) {
    done(\`<div class="sf-load"><div class="sf-spin"></div></div>\`);
    const full = /^https?:\/\//.test(url) ? url : 'https://' + url;
    const ac = new AbortController(), kill = setTimeout(() => ac.abort(), 15000);
    try {
      const r = await fetch(this.reader + full, { signal: ac.signal, referrerPolicy: 'no-referrer' });
      if (!r.ok) throw new Error(r.status);
      const raw = await r.text();
      clearTimeout(kill);
      const title = ((raw.match(/^Title:\s*(.*)$/m) || [])[1] || this.host(url)).trim();
      const body = raw.split(/^Markdown Content:\s*$/m).slice(1).join('\n') || raw;
      const html = mdHTML(body.trim());
      if (html.replace(/<[^>]*>/g, '').trim().length < 40) throw new Error('empty');
      done(\`<div class="rdr">
        <h1>\${esc(title)}</h1>
        <div class="meta">\${this.favHTML(url, 15)}<span>\${esc(this.host(url))}</span></div>
        <div class="body">\${html}</div>
        <div class="foot">
          <button class="btn" data-tryframe="\${esc(url)}">Load the live page</button>
          <button class="btn" data-openext="\${esc(full)}">Open in New Window</button>
        </div></div>\`);
    } catch (e) {
      clearTimeout(kill);
      done(this.blockedPage(url));
    }
  },

  blockedPage(url) {
    const h = this.host(url);
    return \`<div class="sf-blocked">
      <div class="ico"><img src="\${favicon(h)}" alt="" onerror="this.style.display='none'"></div>
      <h3>Can't open \${esc(h)}</h3>
      <p>This site refuses to be embedded and couldn't be read as text either.</p>
      <div style="display:flex;gap:9px;margin-top:6px">
        <button class="btn pri" data-tryframe="\${esc(url)}">Load Anyway</button>
        <button class="btn" data-openext="\${esc(/^https?:/.test(url) ? url : 'https://' + url)}">Open in New Window</button>
      </div></div>\`;
  },

  async paintSearch(q, done) {
    done(\`<div class="sf-load"><div class="sf-spin"></div></div>\`);
    try {
      const r = await fetch(\`\${WIKI_API}?action=query&list=search&srsearch=\${encodeURIComponent(q)}\` +
        \`&srlimit=8&format=json&origin=*\`, { referrerPolicy: 'no-referrer' });
      const j = await r.json();
      const hits = (j.query && j.query.search) || [];
      if (!hits.length) throw new Error('empty');
      done(\`<div class="srch"><h2>\${esc(q)}</h2>
        <div class="q">\${hits.length} results</div>
        <div class="res">\${hits.map(h => {
        const slug = h.title.replace(/ /g, '_');
        return \`<a data-goto="en.wikipedia.org/wiki/\${encodeURIComponent(slug)}">
            <div class="u">en.wikipedia.org › wiki › \${esc(slug)}</div>
            <div class="t">\${esc(h.title)}</div>
            <div class="d">\${h.snippet}</div></a>\`;
      }).join('')}</div></div>\`);
    } catch (e) {
      done(this.offlineSearch(q));
    }
  },

  async paintWiki(title, done) {
    done(\`<div class="sf-load"><div class="sf-spin"></div></div>\`);
    try {
      const [sum, body] = await Promise.all([
        fetch(WIKI_REST + encodeURIComponent(title), { referrerPolicy: 'no-referrer' }).then(r => r.json()),
        fetch(\`\${WIKI_API}?action=parse&page=\${encodeURIComponent(title)}&prop=text&section=0\` +
          \`&format=json&origin=*\`, { referrerPolicy: 'no-referrer' }).then(r => r.json()).catch(() => null),
      ]);
      if (sum.type === 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found') throw new Error('404');
      let lead = '';
      if (body && body.parse && body.parse.text) {
        const box = document.createElement('div');
        box.innerHTML = body.parse.text['*'];
        box.querySelectorAll('style,script,.mw-editsection,.reference,sup.reference,.hatnote,.navbox,table,figure,.thumb')
          .forEach(n => n.remove());
        /* Internal links keep working, but inside this browser. */
        box.querySelectorAll('a[href^="/wiki/"]').forEach(a => {
          a.setAttribute('data-goto', 'en.wikipedia.org' + a.getAttribute('href'));
          a.removeAttribute('href');
        });
        box.querySelectorAll('a[href]').forEach(a => a.removeAttribute('href'));
        /* MediaWiki emits protocol-relative sources, which resolve against file://
           and fail. Pin them to https and drop the responsive set. */
        box.querySelectorAll('img').forEach(im => {
          const s = im.getAttribute('src') || '';
          if (s.startsWith('//')) im.setAttribute('src', 'https:' + s);
          im.removeAttribute('srcset');
        });
        lead = box.innerHTML;
      }
      /* Articles carry a display title — macOS, not MacOS. */
      const shown = ((sum.titles && sum.titles.display) || sum.title || title).replace(/<[^>]+>/g, '');
      done(\`<div class="wiki">
        <h1>\${esc(shown)}</h1>
        \${sum.description ? \`<p class="desc">\${esc(sum.description)}</p>\` : ''}
        <div class="lead">
          \${/* The parsed lead is the real article text; the summary extract is only
                a fallback, and printing both repeats the same paragraph twice. */''}
          <div class="body">\${lead || \`<p>\${esc(sum.extract || '')}</p>\`}</div>
          \${sum.thumbnail ? \`<div class="thumb"><img src="\${esc(sum.thumbnail.source)}" alt=""
            onerror="this.closest('.thumb').remove()"></div>\` : ''}
        </div>
        <div class="foot">Text is available under CC BY-SA 4.0.</div>
      </div>\`);
    } catch (e) {
      done(\`<div class="sf-blocked"><div class="ico">\${ic('g-globe')}</div>
        <h3>Couldn't reach Wikipedia</h3>
        <p>No network, or that article doesn't exist.</p>
        <button class="btn pri" data-goto="">Start Page</button></div>\`);
    }
  },
  overview(w) {
    w = w || this.w; if (!w) return;
    const r = w.node.getBoundingClientRect();
    const node = el(\`<div class="pop" style="width:min(560px,\${Math.round(r.width - 40)}px);padding:14px">
      <div style="font-size:12px;font-weight:600;color:var(--txt-2);padding:0 2px 10px">\${w.st.tabs.length} Tab\${w.st.tabs.length > 1 ? 's' : ''}</div>
      <div class="sf-ov">\${w.st.tabs.map((tb, i) => {
      const c = this.favFor(tb.url), title = this.titleFor(tb.url);
      return \`<button data-ovi="\${i}"\${i === w.st.t ? ' class="on"' : ''}>
          <span class="pv">\${esc(title[0] || '?')}</span>
          <span class="lb">\${c ? \`<i style="background:\${c}"></i>\`
        : \`<img src="\${favicon(this.host(tb.url))}" alt="" onerror="this.style.visibility='hidden'"
            style="width:12px;height:12px;border-radius:3px;flex:none">\`}\${esc(title)}</span></button>\`;
    }).join('')}
      <button data-ovnew><span class="pv add">\${ic('g-plus')}</span><span class="lb">New Tab</span></button></div></div>\`);
    on(node, 'click', '[data-ovi]', (e, t) => { w.st.t = +t.dataset.ovi; Pop.close(); this.render(w); });
    on(node, 'click', '[data-ovnew]', () => { Pop.close(); this.newTab(w); });
    Pop.open(node, { x: r.left + 20, y: r.top + 70, origin: 'top' });
  },
  /* Used when the search API can't be reached, so the browser still answers. */
  offlineSearch(q) {
    const hits = [
      { u: 'en.wikipedia.org/wiki/MacOS', t: 'macOS — Wikipedia', d: 'A Unix operating system developed and marketed by Apple since 2001.' },
      { u: 'caniuse.com', t: 'Can I use — Support tables for HTML5, CSS3, etc', d: 'Browser support tables for modern web technologies.' },
      { u: 'developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter', t: 'backdrop-filter — CSS | MDN', d: 'Applies graphical effects such as blur to the area behind an element.' },
      { u: 'example.com', t: 'Example Domain', d: 'This domain is for use in illustrative examples in documents.' },
    ];
    return \`<div class="srch"><h2>\${esc(q)}</h2>
      <div class="q">Offline — showing local results</div>
      <div class="res">\${hits.map(h => \`<a data-goto="\${esc(h.u)}"><div class="u">\${esc(h.u)}</div><div class="t">\${esc(h.t)}</div><div class="d">\${esc(h.d)}</div></a>\`).join('')}</div></div>\`;
  },
  go(url, w) {
    w = w || this.w; if (!w) return;
    if (url == null) return;
    const t = this.tab(w);
    t.hist = t.hist.slice(0, t.hi + 1);
    t.url = url; t.reader = null; t.hist.push(url); t.hi = t.hist.length - 1;
    if (url.trim()) {
      const at = HISTORY.indexOf(url);
      if (at >= 0) HISTORY.splice(at, 1);
      HISTORY.unshift(url);
      HISTORY.length = Math.min(HISTORY.length, 24);
    }
    this.render(w);
  },
  toggleSidebar(w) {
    w = w || this.w; if (!w) return;
    w.st.sidebar = !w.st.sidebar;
    this.paintChrome(w);
  },
  toggleFavBar(w) {
    SYS.safariFavs = !SYS.safariFavs;
    WM.byApp('safari').forEach(x => this.paintChrome(x));
    Toast(SYS.safariFavs ? 'Favourites bar shown' : 'Favourites bar hidden');
  },
  toggleReader(w) {
    w = w || this.w; if (!w) return;
    const t = this.tab(w);
    if (this.kind(t.url) !== 'web') return Toast('Reader isn’t available on this page');
    t.reader = !(t.reader === true || (t.reader == null && !this.framable(t.url)));
    this.render(w);
  },
  share(w) {
    w = w || this.w;
    const url = w ? this.tab(w).url : '';
    if (navigator.clipboard && url) navigator.clipboard.writeText(/^https?:/.test(url) ? url : 'https://' + url).catch(() => { });
    Toast(url ? 'Copied link to clipboard' : 'Nothing to share');
  },
  back(w) { w = w || this.w; const t = this.tab(w); if (t.hi > 0) { t.hi--; t.url = t.hist[t.hi]; t.reader = null; this.render(w); } },
  fwd(w) { w = w || this.w; const t = this.tab(w); if (t.hi < t.hist.length - 1) { t.hi++; t.url = t.hist[t.hi]; t.reader = null; this.render(w); } },
  reload(w) { this.render(w || this.w); },
  newTab(w) {
    w = w || this.w; if (!w) return WM.open('safari');
    w.st.tabs.push({ url: '', hist: [''], hi: 0 });
    w.st.t = w.st.tabs.length - 1; this.render(w);
    const u = w.node.querySelector('[data-url]'); if (u) u.focus();
  },
  closeTab(w, i) {
    w = w || this.w; if (!w) return;
    if (i == null) i = w.st.t;
    if (w.st.tabs.length === 1) return WM.close(w.id);
    w.st.tabs.splice(i, 1); w.st.t = clamp(w.st.t, 0, w.st.tabs.length - 1); this.render(w);
  }
};
document.addEventListener('click', e => {
  const g = e.target.closest('[data-goto]');
  if (g) {
    e.preventDefault();
    /* A link inside a window navigates that window, not whichever Safari was
       focused last — two open browsers otherwise fight over each other. */
    const host = g.closest('.win');
    const w = host && WM.list.find(x => x.node === host && x.app === 'safari');
    return Saf.go(g.dataset.goto, w || undefined);
  }
  /* The only place this desktop hands off to the real browser. */
  const x = e.target.closest('[data-openext]');
  if (x) { e.preventDefault(); window.open(x.dataset.openext, '_blank', 'noopener'); }
});
`);
