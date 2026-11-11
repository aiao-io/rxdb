import { restoreRuntimeSource } from './runtime-source';

export const SCRIPT_08_APPS2 = restoreRuntimeSource(String.raw`
/* ============================================================================
   12 · TERMINAL  —  a small but genuinely working shell
   ========================================================================== */
const HOME = ['Macintosh HD', 'Users', 'prasenjit'];
const shortPath = p => {
  if (p.join('/') === HOME.join('/')) return '~';
  if (p.slice(0, 3).join('/') === HOME.join('/')) return '~/' + p.slice(3).join('/');
  return '/' + p.slice(1).join('/');
};

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
  mount(w) {
    w.tabs = [Term.blankTab()]; w.tab = 0;
    return titlebar('prasenjit — -zsh', { dark: true, plain: false }) + \`
      <div class="term">
        <div class="tm-tabs" data-tabs></div>
        <div class="tm-body" data-body tabindex="-1"></div>
      </div>
      <input data-ghost style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0" autocomplete="off" spellcheck="false">\`;
  },
  ready(w) { Term.wire(w); Term.render(w); }
};

const Term = {
  active() { const f = WM.front; return f && f.app === 'terminal' ? f : WM.byApp('terminal').filter(x => !x.min).pop(); },
  blankTab() {
    return {
      cwd: HOME.slice(), lines: [
        { html: \`<span class="tdim">Last login: \${DAYS3[new Date().getDay()]} \${MONS3[new Date().getMonth()]} \${new Date().getDate()} \${time12(new Date()).replace(NBSP, ' ')} on ttys001</span>\` }
      ], hist: [], hi: -1, buf: ''
    };
  },

  wire(w) {
    const body = w.node.querySelector('[data-body]');
    const ghost = w.node.querySelector('[data-ghost]');
    w.ghost = ghost;

    const focus = () => { ghost.focus({ preventScroll: true }); body.classList.remove('blur'); };
    body.addEventListener('mousedown', e => { if (!getSelection().toString()) setTimeout(focus, 0); });
    w.node.addEventListener('pointerdown', () => { if (WM.front === w) setTimeout(() => { if (!getSelection().toString()) focus(); }, 0); });
    ghost.addEventListener('blur', () => body.classList.add('blur'));

    ghost.addEventListener('input', () => { this.tab(w).buf = ghost.value; this.paintInput(w); });
    ghost.addEventListener('keydown', e => this.key(w, e));
    ghost.addEventListener('click', () => this.paintInput(w));

    on(w.node, 'click', '[data-newtab]', () => this.newTab(w));
    on(w.node, 'click', '.tm-tab', (e, t) => { if (e.target.closest('.x')) return; w.tab = +t.dataset.i; this.render(w); });
    on(w.node, 'click', '.tm-tab .x', (e, t) => { e.stopPropagation(); this.closeTab(w, +t.closest('.tm-tab').dataset.i); });
    setTimeout(focus, 60);
  },

  tab(w) { return w.tabs[w.tab]; },

  newTab(w) {
    w = w || this.active(); if (!w) return WM.open('terminal');
    w.tabs.push(this.blankTab()); w.tab = w.tabs.length - 1;
    this.render(w); w.ghost.focus();
  },
  closeTab(w, i) {
    if (w.tabs.length === 1) return WM.close(w.id);
    w.tabs.splice(i, 1); w.tab = clamp(w.tab, 0, w.tabs.length - 1); this.render(w);
  },

  /* One wrapper span, because the live input line is a flex row and flex throws
     away whitespace-only text nodes between items — which ate the gaps in
     "user@host ~ %" on the prompt you actually type at. */
  promptHTML(t) {
    return \`<span class="tp"><span class="tg">\${SYS.user.toLowerCase()}@\${SYS.host}</span> \` +
      \`<span class="tb2">\${esc(shortPath(t.cwd))}</span> <span class="tw2">%</span> </span>\`;
  },

  render(w) {
    const t = this.tab(w);
    w.node.querySelector('[data-tabs]').innerHTML =
      w.tabs.map((tb, i) => \`<div class="tm-tab\${i === w.tab ? ' on' : ''}" data-i="\${i}">
        <span>\${esc(shortPath(tb.cwd))} — -zsh</span><span class="x">\${ic('g-x')}</span></div>\`).join('') +
      \`<div class="tm-tab" data-newtab style="padding:0 9px">\${ic('g-plus')}</div>\`;
    w.node.querySelector('.tm-tab[data-newtab] svg').style.cssText = 'width:10px;height:10px';
    const body = w.node.querySelector('[data-body]');
    body.innerHTML = t.lines.map(l => \`<div class="tm-line">\${l.html}</div>\`).join('') +
      \`<div class="tm-line tm-in" data-in>\${this.promptHTML(t)}<span class="ed" data-ed></span></div>\`;
    if (w.ghost) w.ghost.value = t.buf;
    this.paintInput(w);
    const tt = w.node.querySelector('.tb .title'); if (tt) tt.textContent = \`\${shortPath(t.cwd)} — -zsh — 80×24\`;
  },

  paintInput(w) {
    const t = this.tab(w), ghost = w.ghost;
    const ed = w.node.querySelector('[data-ed]'); if (!ed) return;
    const v = t.buf, cp = ghost ? (ghost.selectionStart ?? v.length) : v.length;
    ed.innerHTML = \`\${esc(v.slice(0, cp))}<span class="tm-cur"></span>\${esc(v.slice(cp))}\`;
    const body = w.node.querySelector('[data-body]');
    body.scrollTop = body.scrollHeight;
  },

  key(w, e) {
    const t = this.tab(w);
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); this.exec(w, 'clear', true); return; }
    if ((e.metaKey || e.ctrlKey) && (e.key === 't' || e.key === 'T')) { e.preventDefault(); this.newTab(w); return; }
    if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
      e.preventDefault();
      t.lines.push({ html: this.promptHTML(t) + esc(t.buf) + '<span class="tr">^C</span>' });
      t.buf = ''; w.ghost.value = ''; this.render(w); return;
    }
    if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) { e.preventDefault(); this.exec(w, 'clear', true); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = t.buf;
      t.lines.push({ html: this.promptHTML(t) + esc(cmd) });
      if (cmd.trim()) { t.hist.push(cmd); }
      t.hi = t.hist.length;
      t.buf = ''; w.ghost.value = '';
      this.exec(w, cmd);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!t.hist.length) return;
      t.hi = clamp(t.hi - 1, 0, t.hist.length - 1);
      t.buf = t.hist[t.hi]; w.ghost.value = t.buf;
      setTimeout(() => { w.ghost.setSelectionRange(t.buf.length, t.buf.length); this.paintInput(w) }, 0);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!t.hist.length) return;
      t.hi = clamp(t.hi + 1, 0, t.hist.length);
      t.buf = t.hi >= t.hist.length ? '' : t.hist[t.hi];
      w.ghost.value = t.buf;
      setTimeout(() => { w.ghost.setSelectionRange(t.buf.length, t.buf.length); this.paintInput(w) }, 0);
      return;
    }
    if (e.key === 'Tab') { e.preventDefault(); this.complete(w); return; }
    setTimeout(() => this.paintInput(w), 0);
  },

  complete(w) {
    const t = this.tab(w), v = t.buf;
    const parts = v.split(/\s+/);
    const frag = parts[parts.length - 1] || '';
    let pool;
    if (parts.length <= 1) pool = Object.keys(CMDS).concat(['clear', 'help']);
    else {
      const node = fsGet(t.cwd);
      pool = (node && node.children ? node.children : []).map(c => c.name + (c.kind === 'folder' ? '/' : ''));
    }
    const hits = pool.filter(p => p.toLowerCase().startsWith(frag.toLowerCase()));
    if (!hits.length) return;
    if (hits.length === 1) {
      parts[parts.length - 1] = hits[0];
      t.buf = parts.join(' ') + (hits[0].endsWith('/') ? '' : ' ');
    } else {
      /* longest common prefix, then list the options like zsh does */
      let lcp = hits[0];
      hits.forEach(h => { while (!h.toLowerCase().startsWith(lcp.toLowerCase())) lcp = lcp.slice(0, -1); });
      parts[parts.length - 1] = lcp;
      t.buf = parts.join(' ');
      t.lines.push({ html: this.promptHTML(t) + esc(v) });
      t.lines.push({ html: hits.map(h => \`<span class="\${h.endsWith('/') ? 'tb2' : 'tw2'}">\${esc(h.replace(/\/$/, ''))}</span>\`).join('   ') });
    }
    w.ghost.value = t.buf;
    this.render(w);
    setTimeout(() => w.ghost.setSelectionRange(t.buf.length, t.buf.length), 0);
  },

  out(w, html) { this.tab(w).lines.push({ html }); },
  exec(w, raw, silent) {
    const t = this.tab(w);
    const line = raw.trim();
    if (!line) { this.render(w); return; }
    const [cmd, ...args] = line.split(/\s+/);
    const fn = CMDS[cmd];
    if (fn) {
      try { fn({ w, t, args, raw: line, out: h => this.out(w, h), term: this }); }
      catch (err) { this.out(w, \`<span class="tr">\${esc(cmd)}: \${esc(err.message)}</span>\`); }
    } else {
      this.out(w, \`<span class="tr">zsh: command not found: \${esc(cmd)}</span>\`);
    }
    this.render(w);
    if (silent) w.ghost.focus();
  },
  run(cmd) { const w = this.active(); if (w) { this.tab(w).buf = ''; this.exec(w, cmd, true); } }
};

/* ---- the command table --------------------------------------------------- */
const CMDS = {
  help({ out }) {
    out(\`<span class="ty">Available commands</span>\`);
    const rows = [
      ['ls [-la] [dir]', 'list directory contents'],
      ['cd [dir]', 'change directory (.., ~, -, absolute)'],
      ['pwd', 'print working directory'],
      ['cat <file>', 'print a file'],
      ['open <file|.>', 'open in the matching app'],
      ['tree', 'recursive listing'],
      ['echo <text>', 'write text to stdout'],
      ['whoami / hostname / uname', 'identity'],
      ['date / uptime', 'time'],
      ['neofetch', 'system information'],
      ['mkdir / touch / rm', 'write to the virtual filesystem'],
      ['which <cmd>', 'locate a command'],
      ['history', 'command history'],
      ['df / top / ps', 'fake-but-plausible system stats'],
      ['theme [light|dark]', 'switch the appearance'],
      ['say <text>', 'notification banner'],
      ['clear', 'clear the screen (⌘K)'],
      ['exit', 'close the tab'],
    ];
    rows.forEach(([c, d]) => out(\`  <span class="tg">\${esc(c.padEnd(26))}</span><span class="tdim">\${esc(d)}</span>\`));
  },
  ls({ t, args, out }) {
    const flags = args.filter(a => a.startsWith('-')).join('');
    const rest = args.filter(a => !a.startsWith('-'));
    const target = rest.length ? resolve(t.cwd, rest[0]) : t.cwd;
    const node = fsGet(target);
    if (!node) return out(\`<span class="tr">ls: \${esc(rest[0])}: No such file or directory</span>\`);
    if (node.kind === 'file') return out(esc(node.name));
    const kids = node.children.slice().sort((a, b) => a.name.localeCompare(b.name));
    const all = flags.includes('a') ? [{ name: '.', kind: 'folder' }, { name: '..', kind: 'folder' }, { name: '.zshrc', kind: 'file', size: '1.2K', k: 'cfg' }, { name: '.gitconfig', kind: 'file', size: '312B' }].concat(kids) : kids;
    if (!all.length) return;
    if (flags.includes('l')) {
      out(\`<span class="tdim">total \${all.length * 8}</span>\`);
      all.forEach(f => {
        const dir = f.kind === 'folder';
        const perm = dir ? 'drwxr-xr-x' : '-rw-r--r--';
        const d = f.date || dt(7, 20);
        out(\`<span class="tdim">\${perm}</span>  <span class="tdim">\${dir ? '12' : ' 1'} \${SYS.user.toLowerCase()} staff</span>  \` +
          \`<span class="ty">\${String(f.size || '4.0K').padStart(8)}</span>  <span class="tdim">\${MONS3[d.getMonth()]} \${String(d.getDate()).padStart(2)} \${String(d.getHours()).padStart(2, '0')}:\${String(d.getMinutes()).padStart(2, '0')}</span>  \${colorName(f)}\`);
      });
    } else {
      const cols = 4, rows = Math.ceil(all.length / cols);
      const wCol = Math.max(...all.map(f => f.name.length)) + 3;
      for (let r = 0; r < rows; r++) {
        let s = '';
        for (let c = 0; c < cols; c++) {
          const f = all[c * rows + r]; if (!f) continue;
          s += colorName(f, wCol);
        }
        out(s);
      }
    }
  },
  cd({ t, args, out }) {
    const a = args[0] || '~';
    if (a === '-') { const p = t.prev || HOME; t.prev = t.cwd; t.cwd = p; return; }
    const target = resolve(t.cwd, a);
    const node = fsGet(target);
    if (!node) return out(\`<span class="tr">cd: no such file or directory: \${esc(a)}</span>\`);
    if (node.kind !== 'folder') return out(\`<span class="tr">cd: not a directory: \${esc(a)}</span>\`);
    t.prev = t.cwd; t.cwd = target;
  },
  pwd({ t, out }) { out(esc('/' + t.cwd.slice(1).join('/')).replace('Macintosh HD', '')); },
  cat({ t, args, out }) {
    if (!args[0]) return out(\`<span class="tr">usage: cat &lt;file&gt;</span>\`);
    const node = fsGet(resolve(t.cwd, args[0]));
    if (!node) return out(\`<span class="tr">cat: \${esc(args[0])}: No such file or directory</span>\`);
    if (node.kind === 'folder') return out(\`<span class="tr">cat: \${esc(args[0])}: Is a directory</span>\`);
    const body = FILE_TEXT[node.name];
    if (!body) return out(\`<span class="tdim">\${esc(node.name)}: binary file (\${esc(node.size || '?')})</span>\`);
    body.split('\n').forEach(l => out(esc(l) || '&nbsp;'));
  },
  open({ t, args, out }) {
    const a = args[0] || '.';
    if (a === '.') { WM.open('finder', { path: t.cwd.slice() }); return out(\`<span class="tdim">opening Finder at \${esc(shortPath(t.cwd))}</span>\`); }
    const node = fsGet(resolve(t.cwd, a));
    if (!node) return out(\`<span class="tr">Unable to find \${esc(a)}</span>\`);
    if (node.kind === 'folder') WM.open('finder', { path: resolve(t.cwd, a) });
    else Finder.openFile(node);
  },
  tree({ t, out }) {
    const node = fsGet(t.cwd);
    out(\`<span class="tb2">.</span>\`);
    let dirs = 0, files = 0;
    (function walk(n, pre) {
      const kids = (n.children || []);
      kids.forEach((c, i) => {
        const last = i === kids.length - 1;
        out(\`<span class="tdim">\${pre}\${last ? '└── ' : '├── '}</span>\${colorName(c)}\`);
        if (c.kind === 'folder') { dirs++; if (pre.length < 12) walk(c, pre + (last ? '    ' : '│   ')); }
        else files++;
      });
    })(node, '');
    out('');
    out(\`<span class="tdim">\${dirs} directories, \${files} files</span>\`);
  },
  echo({ raw, out }) { out(esc(raw.slice(4).trim().replace(/^["']|["']$/g, ''))); },
  whoami({ out }) { out(SYS.user.toLowerCase()); },
  hostname({ out }) { out(SYS.host + '.local'); },
  uname({ args, out }) {
    out(args.includes('-a')
      ? \`Darwin \${SYS.host}.local 25.0.0 Darwin Kernel Version 25.0.0: Tue Jun 16 21:04:12 PDT 2026; root:xnu-12377.41.5~19/RELEASE_ARM64_T6041 arm64\`
      : 'Darwin');
  },
  date({ out }) {
    const d = new Date();
    out(\`\${DAYS3[d.getDay()]} \${MONS3[d.getMonth()]} \${String(d.getDate()).padStart(2)} \${d.toTimeString().slice(0, 8)} IST \${d.getFullYear()}\`);
  },
  uptime({ out }) { out(\`\${new Date().toTimeString().slice(0, 5)}  up \${upStr()}, 3 users, load averages: 1.82 2.04 1.96\`); },
  history({ t, out }) { t.hist.forEach((h, i) => out(\`<span class="tdim">\${String(i + 1).padStart(5)}</span>  \${esc(h)}\`)); },
  clear({ t }) { t.lines = []; },
  exit({ w, term }) { term.closeTab(w, w.tab); },
  df({ out }) {
    out(\`<span class="ty">Filesystem      Size   Used  Avail Capacity  Mounted on</span>\`);
    out(\`/dev/disk3s1s1  1.8Ti  842Gi  921Gi    48%    /\`);
    out(\`/dev/disk3s6    1.8Ti  4.0Gi  921Gi     1%    /System/Volumes/VM\`);
  },
  ps({ out }) {
    out(\`<span class="ty">  PID TTY           TIME CMD</span>\`);
    [['501', 'ttys000', '0:00.42', '-zsh'], ['842', '??', '2:14.08', '/System/Applications/Safari.app'], ['913', '??', '0:48.21', 'WindowServer'], ['1204', 'ttys001', '0:00.09', 'ps']]
      .forEach(([p, tt, tm, c]) => out(\`\${p.padStart(5)} \${tt.padEnd(9)} \${tm.padStart(8)} \${esc(c)}\`));
  },
  top({ out }) {
    out(\`<span class="ty">Processes: 512 total, 3 running, 509 sleeping, 2841 threads</span>\`);
    out(\`Load Avg: 1.82, 2.04, 1.96   CPU usage: 6.41% user, 3.12% sys, 90.47% idle\`);
    out(\`PhysMem: 34G used (2.1G wired), 94G unused.\`);
    out(\`<span class="tdim">(this is a snapshot — press ⌘K to clear)</span>\`);
  },
  theme({ args, out }) {
    const m = (args[0] || '').toLowerCase();
    if (m === 'light' || m === 'dark') { Theme.set(m); out(\`<span class="tg">appearance → \${m}</span>\`); }
    else { Theme.toggle(); out(\`<span class="tg">appearance → \${SYS.theme}</span>\`); }
  },
  say({ raw, out }) { const m = raw.slice(3).trim(); Toast(m || 'Hello.'); out(\`<span class="tdim">🔊 \${esc(m)}</span>\`); },
  sudo({ out }) { out(\`<span class="tr">\${SYS.user.toLowerCase()} is not in the sudoers file. This incident has been reported.</span>\`); },
  git({ args, out }) {
    if (args[0] === 'status') {
      out('On branch <span class="tg">main</span>');
      out("Your branch is up to date with 'origin/main'.");
      out(''); out('nothing to commit, working tree clean');
    } else if (args[0] === 'log') {
      [['a1f9c2e', 'ship the dock magnification curve'], ['7de4b01', 'genie minimize'], ['3c0aa88', 'squircle every icon']]
        .forEach(([h, m]) => { out(\`<span class="ty">commit \${h}</span>\`); out(\`Author: \${SYS.user} <\${SYS.user.toLowerCase()}@macbook.local>\`); out(''); out('    ' + esc(m)); out(''); });
    } else out(\`<span class="tdim">usage: git &lt;status|log&gt;</span>\`);
  },
  curl({ args, out }) { out(\`<span class="tdim">curl: (6) Could not resolve host: \${esc((args[0] || '').replace(/^https?:\/\//, '').split('/')[0] || 'localhost')}</span>\`); },
  man({ args, out }) { out(\`<span class="tdim">No manual entry for \${esc(args[0] || 'man')} — try <span class="tg">help</span>.</span>\`); },
  /* mkdir / touch / rm write to the same virtual FS Finder reads from, so
     anything you create here shows up in an open Finder window. */
  mkdir({ t, args, out }) {
    const names = args.filter(a => !a.startsWith('-'));
    if (!names.length) return out(\`<span class="tr">usage: mkdir &lt;name&gt;</span>\`);
    const dir = fsGet(t.cwd);
    if (!dir || !dir.children) return out(\`<span class="tr">mkdir: \${esc(t.cwd[t.cwd.length - 1])}: Not a directory</span>\`);
    names.forEach(n => {
      if (dir.children.some(c => c.name === n)) return out(\`<span class="tr">mkdir: \${esc(n)}: File exists</span>\`);
      dir.children.push(FOLD(n, []));
    });
    Finder.reloadAll();
  },
  touch({ t, args, out }) {
    const names = args.filter(a => !a.startsWith('-'));
    if (!names.length) return out(\`<span class="tr">usage: touch &lt;file&gt;</span>\`);
    const dir = fsGet(t.cwd);
    if (!dir || !dir.children) return out(\`<span class="tr">touch: \${esc(t.cwd[t.cwd.length - 1])}: Not a directory</span>\`);
    names.forEach(n => {
      const hit = dir.children.find(c => c.name === n);
      if (hit) { hit.date = new Date(); return; }
      dir.children.push(FILE(n, iconFor(n), '0B', kindFor(n), new Date()));
    });
    Finder.reloadAll();
  },
  rm({ t, args, out }) {
    const names = args.filter(a => !a.startsWith('-'));
    const rec = args.some(a => a.startsWith('-') && a.includes('r'));
    if (names.some(n => n === '/' || n === '~' || n === '*')) {
      return out(\`<span class="tr">rm: I am not doing that. Nice try.</span>\`);
    }
    if (!names.length) return out(\`<span class="tr">usage: rm [-rf] &lt;file&gt;</span>\`);
    const dir = fsGet(t.cwd);
    names.forEach(n => {
      const i = (dir.children || []).findIndex(c => c.name === n);
      if (i < 0) return out(\`<span class="tr">rm: \${esc(n)}: No such file or directory</span>\`);
      if (dir.children[i].kind === 'folder' && !rec) return out(\`<span class="tr">rm: \${esc(n)}: is a directory</span>\`);
      TRASH.children.push(dir.children.splice(i, 1)[0]);
    });
    Finder.reloadAll();
  },
  which({ args, out }) {
    const c = args[0] || '';
    out(CMDS[c] ? \`/usr/bin/\${esc(c)}\` : \`<span class="tdim">\${esc(c)} not found</span>\`);
  },
  brew({ args, out }) {
    if (args[0] === 'install') return out(\`<span class="tdim">==> Downloading… this Mac ships with everything already.</span>\`);
    out(\`<span class="tdim">Homebrew 4.6.2 — nothing left to install.</span>\`);
  },
  vim({ out }) { out(\`<span class="tdim">vim: this terminal has no modal editor. Use <span class="tg">open</span> and TextEdit.</span>\`); },
  python({ out }) { out(\`<span class="tdim">python: no interpreter here — the whole machine is one HTML file.</span>\`); },
  neofetch({ out }) {
    const art = [
      ['                    \'c.', 0], ['                 ,xNMM.', 0], ['               .OMMMMo', 0], ['               OMMM0,', 0],
      ['     .;loddo:\' loolloddol;.', 0], ['   cKMMMMMMMMMMNWMMMMMMMMMM0:', 1], [' .KMMMMMMMMMMMMMMMMMMMMMMMWd.', 1],
      [' XMMMMMMMMMMMMMMMMMMMMMMMX.', 1], [';MMMMMMMMMMMMMMMMMMMMMMMM:', 2], [':MMMMMMMMMMMMMMMMMMMMMMMM:', 2],
      ['.MMMMMMMMMMMMMMMMMMMMMMMMX.', 3], [' kMMMMMMMMMMMMMMMMMMMMMMMMWd.', 3], [' .XMMMMMMMMMMMMMMMMMMMMMMMMMMk', 4],
      ['  .XMMMMMMMMMMMMMMMMMMMMMMMMK.', 4], ['    kMMMMMMMMMMMMMMMMMMMMMMd', 5], ['     ;KMMMMMMMWXXWMMMMMMMk.', 5],
      ['       .cooc,.    .,coo:.', 5],
    ];
    const cls = ['tg', 'ty', 'to', 'tr', 'tm2', 'tb2'];   // the six-stripe Apple
    const info = [
      [\`\${SYS.user.toLowerCase()}@\${SYS.host}\`, null],
      ['-'.repeat(SYS.user.length + SYS.host.length + 1), null],
      ['OS', 'macOS Tahoe 26.0 26A5240b arm64'],
      ['Host', 'MacBook Pro (16-inch, 2026)'],
      ['Kernel', '25.0.0'],
      ['Uptime', upStr()],
      ['Packages', '148 (brew), 62 (brew-cask)'],
      ['Shell', 'zsh 5.9'],
      ['Resolution', \`\${innerWidth * 2}x\${innerHeight * 2}@120Hz\`],
      ['DE', 'Aqua'],
      ['WM', 'Quartz Compositor'],
      ['WM Theme', SYS.theme === 'dark' ? 'Dark (Multicolour)' : 'Light (Multicolour)'],
      ['Terminal', 'prasen-term'],
      ['CPU', 'Apple M4 Max'],
      ['GPU', 'Apple M4 Max (40 cores)'],
      ['Memory', '34218MiB / 131072MiB'],
      ['Disk (/)', '842G / 1.8T (48%)'],
      ['Battery', \`\${SYS.battery}% \${SYS.charging ? '[charging]' : '[discharging]'}\`],
    ];
    const blocks = ['#1b1b1d', '#ff6b6b', '#4fe07f', '#ffd866', '#5fb2ff', '#d68cff', '#5fe1e6', '#e6e6e6'];
    const rows = Math.max(art.length, info.length + 3);
    let html = '<div style="display:flex;gap:18px;padding:4px 0">';
    html += '<div>' + art.map(([l, c]) => \`<div class="tm-line \${cls[c]}">\${esc(l)}</div>\`).join('') + '</div>';
    html += '<div style="padding-top:2px">' + info.map(([k, v]) =>
      \`<div class="tm-line">\${v === null ? \`<span class="tg">\${esc(k)}</span>\` : \`<span class="tg">\${esc(k)}</span><span class="tw2">: \${esc(v)}</span>\`}</div>\`).join('')
      + \`<div style="display:flex;margin-top:9px">\${blocks.map(b => \`<span style="width:16px;height:15px;background:\${b}"></span>\`).join('')}</div>\`
      + \`<div style="display:flex">\${blocks.map(b => \`<span style="width:16px;height:15px;background:\${b};filter:brightness(1.5)"></span>\`).join('')}</div>\`
      + '</div></div>';
    out(html);
  },
};
CMDS['ls-la'] = CMDS.ls;
CMDS.ll = ({ t, out, term, w }) => CMDS.ls({ t, args: ['-l'], out, term, w });
CMDS['..'] = ({ t, out, w, term }) => CMDS.cd({ t, args: ['..'], out, w, term });

function colorName(f, pad) {
  const cls = f.kind === 'folder' ? 'tb2' : /\.app$/.test(f.name) ? 'tg'
    : /\.(png|jpe?g|heic|mp4|mov|wav|mp3)$/i.test(f.name) ? 'tm2'
      : /\.(zip|xip|dmg|gz)$/i.test(f.name) ? 'tr' : 'tw2';
  const bold = f.kind === 'folder' ? 'font-weight:700' : '';
  const txt = pad ? f.name.padEnd(pad) : f.name;
  return \`<span class="\${cls}" style="\${bold}">\${esc(txt)}</span>\`;
}
function resolve(cwd, arg) {
  if (!arg || arg === '~') return HOME.slice();
  let parts;
  if (arg.startsWith('~/')) parts = HOME.concat(arg.slice(2).split('/'));
  else if (arg.startsWith('/')) parts = ['Macintosh HD'].concat(arg.split('/').filter(Boolean));
  else parts = cwd.concat(arg.split('/'));
  const out = [];
  parts.filter(Boolean).forEach(p => { if (p === '.') return; if (p === '..') { if (out.length > 1) out.pop(); } else out.push(p); });
  return out.length ? out : ['Macintosh HD'];
}
const upStr = () => {
  const ms = Date.now() - new Date(2026, 6, 24, 9, 12).getTime();
  const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60;
  return \`\${d} day\${d === 1 ? '' : 's'}, \${h} hour\${h === 1 ? '' : 's'}, \${m} min\${m === 1 ? '' : 's'}\`;
};

const FILE_TEXT = {
  'prasenx.txt': \`Where to find me
================

About me     https://prasen.dev
GitHub       https://github.com/StarKnightt
X            https://x.com/prasenx
YouTube      https://youtube.com/@prasendev
Instagram    https://www.instagram.com/prasenn_x/
Discord      https://discord.com/users/878205528570990602

Every link above opens in your real browser.\`,
  'todo.md': \`# todo

- [x] squircle clip path from a superellipse, not border-radius
- [x] layered window shadows (near + far)
- [x] cosine dock falloff
- [ ] Mission Control
- [ ] Stage Manager
- [ ] convince myself this is finished\`,
  'README.md': \`# desktop-web

A pixel-faithful desktop environment that runs in one file.

## Run it

    open index.html

That's the whole install process.\`,
  'on-restraint.md': \`# On restraint

Most interfaces fail by addition. A gradient here, a shadow there,
and then a spinner to cover the cost of all of it.

The details that actually land are the ones nobody can name:
traffic lights dimming when a window loses focus, the menu bar
filling in when something zooms, the dock tray widening as icons
grow and then holding perfectly steady.

Nobody will notice any of it. That's the point.\`,
  'index.html': \`<!DOCTYPE html>\n<html lang="en" data-theme="light">\n<head>\n  <title>macOS</title>\n  <!-- 400-odd KB of desktop -->\n</head>\n<body>\n  <div id="stage">…</div>\n</body>\n</html>\`,
  'main.swift': \`import SwiftUI\n\n@main\nstruct CleanTypeApp: App {\n    var body: some Scene {\n        MenuBarExtra("CleanType", systemImage: "textformat") {\n            SettingsView()\n        }\n        .menuBarExtraStyle(.window)\n    }\n}\`,
  'synth.ts': \`export class Voice {\n  constructor(private ctx: AudioContext) {}\n\n  play(freq: number, at = this.ctx.currentTime) {\n    const osc = this.ctx.createOscillator();\n    const gain = this.ctx.createGain();\n    osc.type = "sawtooth";\n    osc.frequency.value = freq;\n    gain.gain.setValueAtTime(0, at);\n    gain.gain.linearRampToValueAtTime(0.25, at + 0.01);\n    gain.gain.exponentialRampToValueAtTime(0.001, at + 1.2);\n    osc.connect(gain).connect(this.ctx.destination);\n    osc.start(at);\n    osc.stop(at + 1.3);\n  }\n}\`,
  'shadow-notes.md': \`## the four layers

0 0 0 .5px    the hairline. without it every edge looks soft.
0 3px 8px     contact. keeps the window sitting on something.
0 14px 28px   the body. this is the one people think of as "the shadow".
0 40px 80px   ambient spill. expensive, and the first to cut.

## focus

An unfocused window drops the outer two and lightens the rest.
That single difference is why a stack of windows reads as a stack
instead of a pile of rectangles.\`,
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
