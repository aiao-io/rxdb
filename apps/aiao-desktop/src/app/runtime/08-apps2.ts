import { restoreRuntimeSource } from './runtime-source';

export const SCRIPT_08_APPS2 = restoreRuntimeSource(String.raw`
/* ============================================================================
   12 · TERMINAL  —  xterm connected to a real local shell
   ========================================================================== */
APPS.terminal = {
  name: 'Terminal', icon: 'app-terminal', w: 760, h: 470, minW: 420, minH: 220, single: false,
  menus: () => stdMenus('terminal', {
    Shell: [
      { id: 'nt', label: 'New Tab', key: '⌘T', run: () => Term.newTab() },
      { id: 'nw', label: 'New Window', key: '⌘N', run: () => WM.open('terminal', { force: true }) }, '-',
      { id: 'cl', label: 'Clear Scrollback', key: '⌘K', run: () => Term.run('clear') },
    ],
    Edit: [{ id: 'c', label: 'Copy', key: '⌘C' }, { id: 'v', label: 'Paste', key: '⌘V' }, '-',
    { id: 'f', label: 'Find…', key: '⌘F', disabled: true }],
  }, ['Shell', 'Edit', 'View', 'Window', 'Help']),
  mount() {
    return titlebar('Terminal — local shell', { dark: true, plain: false }) +
      '<div class="term" data-terminal></div>';
  },
  ready(w) {
    const bridge = window.__aiaoTerminalBridge;
    if (!bridge) return;
    w.terminal = bridge.mount(w.node.querySelector('[data-terminal]'), () => WM.close(w.id));
  },
  onResize(w) { w.terminal?.fit(); },
  onClose(w) { w.terminal?.dispose(); }
};

const Term = {
  active() { const f = WM.front; return f && f.app === 'terminal' ? f : WM.byApp('terminal').filter(x => !x.min).pop(); },
  newTab(w) {
    w = w || this.active();
    if (!w) return WM.open('terminal');
    w.terminal?.newTab();
  },
  run(command) {
    const w = this.active();
    if (w) w.terminal?.run(command);
  }
};

/* ============================================================================
   13 · CALCULATOR
   ========================================================================== */
APPS.calculator = {
  name: 'Calculator', icon: 'app-calculator', w: 254, h: 366, minW: 232, minH: 320,
  menus: () => stdMenus('calculator', {
    View: [{ id: 'b', label: 'Basic', key: '⌘1', checked: true }, { id: 's', label: 'Scientific', key: '⌘2', checked: false, run: () => Toast('Scientific mode is not in this build') }],
  }),
  mount(w) {
    w.calc = { acc: null, op: null, cur: '0', fresh: true, lastOp: null, lastArg: null };
    const K = [
      ['AC', 'fn', 'ac'], ['+/−', 'fn', 'neg'], ['%', 'fn', 'pct'], ['÷', 'op', 'div'],
      ['7', '', 'n7'], ['8', '', 'n8'], ['9', '', 'n9'], ['×', 'op', 'mul'],
      ['4', '', 'n4'], ['5', '', 'n5'], ['6', '', 'n6'], ['−', 'op', 'sub'],
      ['1', '', 'n1'], ['2', '', 'n2'], ['3', '', 'n3'], ['+', 'op', 'add'],
      ['0', ' w2', 'n0'], ['.', '', 'dot'], ['=', 'op', 'eq'],
    ];
    return titlebar('Calculator', { dark: true }) + \`<div class="calc">
      <div class="calc-out" data-out>0</div>
      <div class="calc-keys">\${K.map(([l, c, k]) => \`<button class="ck \${c}" data-k="\${k}">\${l}</button>\`).join('')}</div>
    </div>\`;
  },
  ready(w) {
    const paint = () => {
      const c = w.calc;
      w.node.querySelector('[data-out]').textContent = Calc.fmt(c.cur);
      $$('.ck.op', w.node).forEach(b => b.classList.toggle('on', c.op && b.dataset.k === c.op && c.fresh));
      $$('.ck.fn', w.node)[0].textContent = (c.cur !== '0' || c.op) ? 'C' : 'AC';
    };
    w.paint = paint;
    on(w.node, 'click', '[data-k]', (e, t) => { Calc.press(w, t.dataset.k); paint(); });
    on(w.node, 'pointerdown', '[data-k]', (e, t) => {
      t.classList.add('down');
      const up = () => { t.classList.remove('down'); removeEventListener('pointerup', up) };
      addEventListener('pointerup', up);
    });
    w.keyHandler = e => {
      if (WM.front !== w) return;
      const m = { '/': 'div', '*': 'mul', 'x': 'mul', '-': 'sub', '+': 'add', '=': 'eq', 'Enter': 'eq', '.': 'dot', ',': 'dot', '%': 'pct', 'Escape': 'ac', 'Backspace': 'del', 'Delete': 'ac' };
      let k = null;
      if (/^[0-9]$/.test(e.key)) k = 'n' + e.key;
      else if (m[e.key]) k = m[e.key];
      if (!k) return;
      e.preventDefault();
      const btn = w.node.querySelector(\`[data-k="\${k}"]\`);
      if (btn) { btn.classList.add('down'); setTimeout(() => btn.classList.remove('down'), 95); }
      Calc.press(w, k); paint();
    };
    addEventListener('keydown', w.keyHandler);
    paint();
  },
  onClose(w) { removeEventListener('keydown', w.keyHandler); }
};

const Calc = {
  fmt(s) {
    if (s === 'Error' || s === '∞') return s;
    const neg = s.startsWith('-');
    let v = neg ? s.slice(1) : s;
    let [i, d] = v.split('.');
    if (i.length > 15) { const n = Number(v); return (neg ? '-' : '') + n.toExponential(6).replace('e+', 'e'); }
    i = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-' : '') + i + (d !== undefined ? '.' + d : '');
  },
  apply(a, b, op) {
    switch (op) {
      case 'add': return a + b; case 'sub': return a - b;
      case 'mul': return a * b; case 'div': return b === 0 ? NaN : a / b;
    }
    return b;
  },
  str(n) {
    if (!isFinite(n)) return isNaN(n) ? 'Error' : '∞';
    const r = Math.round(n * 1e12) / 1e12;
    return String(Math.abs(r) < 1e-12 ? 0 : r);
  },
  press(w, k) {
    const c = w.calc;
    if (k[0] === 'n' && k.length === 2) {
      const d = k[1];
      if (c.fresh) { c.cur = d; c.fresh = false; }
      else c.cur = c.cur === '0' ? d : (c.cur.replace(/[^\d.-]/g, '').length < 16 ? c.cur + d : c.cur);
      return;
    }
    if (k === 'dot') { if (c.fresh) { c.cur = '0.'; c.fresh = false; } else if (!c.cur.includes('.')) c.cur += '.'; return; }
    if (k === 'del') { if (c.fresh) return; c.cur = c.cur.length > 1 ? c.cur.slice(0, -1) : '0'; if (c.cur === '-') c.cur = '0'; return; }
    if (k === 'ac') {
      if (c.cur !== '0' && !c.fresh) { c.cur = '0'; c.fresh = true; return; }
      Object.assign(c, { acc: null, op: null, cur: '0', fresh: true, lastOp: null, lastArg: null }); return;
    }
    if (k === 'neg') { c.cur = c.cur.startsWith('-') ? c.cur.slice(1) : (c.cur === '0' ? '0' : '-' + c.cur); return; }
    if (k === 'pct') { c.cur = this.str(parseFloat(c.cur) / 100); c.fresh = false; return; }
    if (k === 'eq') {
      const b = parseFloat(c.cur);
      if (c.op != null && c.acc != null) { c.cur = this.str(this.apply(c.acc, b, c.op)); c.lastOp = c.op; c.lastArg = b; }
      else if (c.lastOp) { c.cur = this.str(this.apply(b, c.lastArg, c.lastOp)); }
      c.acc = null; c.op = null; c.fresh = true; return;
    }
    /* an operator */
    const b = parseFloat(c.cur);
    if (c.op != null && c.acc != null && !c.fresh) { c.acc = this.apply(c.acc, b, c.op); c.cur = this.str(c.acc); }
    else c.acc = b;
    c.op = k; c.fresh = true; c.lastOp = null;
  }
};

/* ============================================================================
   14 · ABOUT · TEXTEDIT · PREVIEW
   ========================================================================== */
APPS.about = {
  name: 'Finder', icon: 'app-finder', w: 400, h: 468, minW: 400, minH: 468,
  mount() {
    return titlebar('', { plain: true }) + \`<div class="about">
      <svg class="mark" viewBox="0 0 15 18"><use href="#g-apple"/></svg>
      <h1>MacBook Pro</h1><div class="ver">16‑inch, 2026</div>
      <dl>
        <dt>Chip</dt><dd>Apple M4 Max</dd>
        <dt>Memory</dt><dd>128 GB</dd>
        <dt>Startup disk</dt><dd>Macintosh HD</dd>
        <dt>Serial number</dt><dd>C02PR4S3NX26</dd>
        <dt>macOS</dt><dd>Tahoe 26.0 (26A5240b)</dd>
        <dt>Display</dt><dd>\${innerWidth * 2} × \${innerHeight * 2} @ 120 Hz</dd>
        <dt>Rendered by</dt><dd>one HTML file</dd>
      </dl>
      <div class="btns"><button class="btn" data-more>More Info…</button><button class="btn" data-rep>System Report…</button></div>
      <div style="margin-top:auto;padding-top:16px;font-size:10.5px;color:var(--txt-3);text-align:center;line-height:1.5">
        ™ and © 2026 Apple Inc.<br>All rights reserved.</div>
    </div>\`;
  },
  ready(w) {
    on(w.node, 'click', '[data-more]', () => WM.open('settings', { section: 'general' }));
    on(w.node, 'click', '[data-rep]', () => WM.open('terminal'));
  }
};

APPS.textedit = {
  name: 'TextEdit', icon: 'f-txt', w: 620, h: 520, minW: 340, minH: 240, single: false,
  menus: () => stdMenus('textedit'),
  mount(w, o) {
    const name = (o.file && o.file.name) || o.file || 'Untitled.txt';
    const body = FILE_TEXT[name] || \`\${name}\n\n(this file is empty)\`;
    /* TextEdit detects bare URLs and makes them clickable, so this one does too. */
    const doc = esc(body).replace(/https?:\/\/[^\s<]+[^\s<.,)]/g,
      u => \`<a href="\${u}" data-openext="\${u}">\${u}</a>\`);
    return titlebar(name, { plain: true, right: \`<button class="tbtn" data-nodrag data-tefmt title="Format">\${ic('g-title')}</button>\` }) +
      \`<div class="te"><div class="te-doc selectable" contenteditable="true" spellcheck="false">\${doc}</div></div>\`;
  },
  ready(w) {
    const doc = w.node.querySelector('.te-doc');
    on(w.node, 'click', '[data-tefmt]', (e, t) => menuUnder(t, [
      { id: 'p', label: 'Plain Text', checked: !w.st || !w.st.rich, run: () => { w.st = { rich: false }; doc.style.font = ''; } },
      { id: 'r', label: 'Rich Text', checked: !!(w.st && w.st.rich), run: () => { w.st = { rich: true }; doc.style.font = '14px/1.65 -apple-system,Inter,sans-serif'; } }, '-',
      { id: 'b', label: 'Bold', key: '⌘B', run: () => { doc.focus(); document.execCommand('bold'); } },
      { id: 'i', label: 'Italic', key: '⌘I', run: () => { doc.focus(); document.execCommand('italic'); } }, '-',
      { id: 'w', label: 'Word Count', run: () => Toast(doc.textContent.trim().split(/\s+/).filter(Boolean).length + ' words') }]));
  }
};

APPS.preview = {
  name: 'Preview', icon: 'app-preview', w: 640, h: 560, minW: 360, minH: 300, single: false,
  menus: () => stdMenus('preview'),
  mount(w, o) {
    const name = (o.file && o.file.name) || o.file || 'Untitled';
    let inner;
    if (/guidelines|spec/i.test(name)) inner = \`<div class="sheet">
      <h1>Interface Guidelines</h1><p style="margin:0 0 2px;font-size:12.5px">Revision 4 · July 2026</p>
      <h3>1 · Materials</h3><p>Chrome is a material, not a colour. Every bar, sidebar and tray samples what sits behind it — blur, then saturate, then tint. Opacity alone always reads as a sticker pasted on the window.</p>
      <h3>2 · Depth</h3><p>Four shadow layers: a hairline for the edge, a contact shadow so it doesn't float, a body, and an ambient spill. Unfocused windows drop the outer two and lighten the rest.</p>
      <h3>3 · Motion</h3><p>Menus in 130ms, panels in 300ms, nothing past 350ms. Ease out harder than you ease in — the arrival is what the eye judges.</p>
      <h3>4 · Pointer</h3><p>The arrow is the default state and it stays the arrow over buttons. A hand means "this navigates". A hand on everything means nothing.</p>
      <h3>5 · Restraint</h3><p>If an effect cannot hold sixty frames, remove the effect. A dropped frame is more visible than any gradient you were trying to render.</p>
    </div>\`;
    else if (/\.(mp4|mov)$/i.test(name)) inner = \`<div style="width:min(520px,100%);aspect-ratio:16/9;border-radius:8px;background:#0c0c0e;display:grid;place-items:center;box-shadow:0 20px 60px -18px rgba(0,0,0,.6)">
      <button class="btn pri" style="height:44px;width:44px;padding:0;border-radius:50%">\${ic('g-play')}</button></div>
      <div style="margin-top:14px;font-size:12px;color:var(--txt-2)">\${esc(name)} — 1920×1080 · H.264</div>\`;
    else inner = \`<img src="\${WALLPAPERS[/screenshot/i.test(name) ? 'tahoe' : 'ridges'].url}" alt="\${esc(name)}" style="max-height:78%">
      <div style="margin-top:14px;font-size:12px;color:var(--txt-2)">\${esc(name)}</div>\`;
    return titlebar(name, {
      plain: true, right:
        \`<button class="tbtn" data-nodrag data-pvshare title="Share">\${ic('g-share')}</button>\` +
        \`<button class="tbtn" data-nodrag data-pvfind title="Search">\${ic('g-search')}</button>\` +
        \`<div class="sfield" data-nodrag data-pvfield style="width:0;padding:0;opacity:0;overflow:hidden;transition:width .22s var(--e-out),opacity .16s,padding .22s">
          <span>\${ic('g-search')}</span><input placeholder="Search" spellcheck="false"></div>\`
    }) + \`<div class="pv" style="flex-direction:column">\${inner}</div>\`;
  },
  ready(w) {
    const name = (w.node.querySelector('.tb .title') || {}).textContent || 'Document';
    on(w.node, 'click', '[data-pvshare]', (e, t) => menuUnder(t, [
      { id: 'm', label: 'Mail', icon: 'g-compose', run: () => Mail.compose(name) },
      { id: 'g', label: 'Messages', icon: 'g-facetime', run: () => WM.open('messages') }, '-',
      { id: 'c', label: 'Copy', run: () => Toast('Copied to clipboard') },
      { id: 'p', label: 'Print…', run: () => Toast('Sent to printer') }]));
    /* Find reveals an inline field and highlights matches in the rendered document. */
    on(w.node, 'click', '[data-pvfind]', () => {
      const f = w.node.querySelector('[data-pvfield]'), open = f.style.width !== '0px';
      f.style.width = open ? '0px' : '150px';
      f.style.padding = open ? '0' : '';
      f.style.opacity = open ? '0' : '1';
      if (!open) f.querySelector('input').focus(); else { f.querySelector('input').value = ''; mark(''); }
    });
    const body = w.node.querySelector('.pv');
    const mark = q => {
      $$('mark', body).forEach(m => m.replaceWith(document.createTextNode(m.textContent)));
      body.normalize();
      if (!q || q.length < 2) return 0;
      let n = 0;
      const walk = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
      const hits = [];
      while (walk.nextNode()) if (walk.currentNode.nodeValue.toLowerCase().includes(q)) hits.push(walk.currentNode);
      hits.forEach(node => {
        const parts = node.nodeValue.split(new RegExp(\`(\${q.replace(/[.*+?^\${}()|[\]\\]/g, '\\$&')})\`, 'ig'));
        const frag = document.createDocumentFragment();
        parts.forEach(p => {
          if (p.toLowerCase() === q) { const m = el('<mark style="background:#fff2a8;color:inherit;border-radius:2px">' + esc(p) + '</mark>'); frag.append(m); n++; }
          else frag.append(document.createTextNode(p));
        });
        node.replaceWith(frag);
      });
      return n;
    };
    const inp = w.node.querySelector('[data-pvfield] input');
    inp.addEventListener('input', () => {
      const n = mark(inp.value.trim().toLowerCase());
      if (inp.value.trim().length > 1) Toast(n ? n + (n === 1 ? ' match' : ' matches') : 'Not found');
    });
  }
};
`);
