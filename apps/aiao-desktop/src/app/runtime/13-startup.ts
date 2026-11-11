import { restoreRuntimeSource } from './runtime-source';

export const SCRIPT_13_STARTUP = restoreRuntimeSource(String.raw`
/* ============================================================================
   30 · STARTUP — power-on, then login
   ========================================================================== */
const Startup = {
  /* Skippable, because a 2s boot in front of every reload is a tax on anyone
     poking at this — including the test harness, which passes ?boot=0. */
  wanted() {
    const q = new URLSearchParams(location.search);
    return q.get('boot') !== '0' && !/\bnoboot\b/.test(location.hash);
  },

  run() {
    const boot = $('#boot');
    if (!this.wanted()) { boot.remove(); return; }

    const fill = boot.querySelector('.bar i');
    /* Uneven steps: a perfectly linear bar looks like a loading GIF. Apple's
       stalls, jumps, then finishes. */
    const steps = [[120, 14], [420, 27], [700, 34], [980, 62], [1180, 74], [1400, 88], [1620, 100]];
    steps.forEach(([at, pct]) => setTimeout(() => { fill.style.width = pct + '%'; }, at));

    const done = () => { if (boot.isConnected) { boot.classList.add('out'); setTimeout(() => boot.remove(), 480); this.lock(); } };
    this.bootTimer = setTimeout(done, 1980);
    /* Impatience is allowed. */
    const skip = () => { clearTimeout(this.bootTimer); fill.style.width = '100%'; done(); };
    boot.addEventListener('click', skip);
    addEventListener('keydown', function once(e) { if ($('#boot')) { skip(); } removeEventListener('keydown', once); });
  },

  /* Shown after boot, and again from  > Lock Screen. */
  lock() {
    const n = $('#lock'); if (!n || n.dataset.on === '1') return;
    n.hidden = false; n.dataset.on = '1';
    n.classList.remove('out', 'opening');
    /* Reuse whatever the desktop is currently showing, procedural fallback included. */
    const live = $('#wall .layer.photo.on');
    n.querySelector('.lk-wall').style.backgroundImage =
      (live && live.style.backgroundImage) || \`url("\${WALLPAPERS[SYS.wallpaper].url}")\`;
    n.querySelector('[data-av]').style.backgroundImage = \`url("\${AVATAR}")\`;
    this.tick();
    this.timer = setInterval(() => this.tick(), 1000);
    Pop.close(true);
    if (!this.bound) {
      this.bound = true;
      n.addEventListener('click', () => this.unlock());
    }
    this.keyGo = e => { if (['Enter', ' ', 'Escape'].includes(e.key)) { e.preventDefault(); this.unlock(); } };
    addEventListener('keydown', this.keyGo);
  },

  tick() {
    const n = $('#lock'); if (!n) return;
    const d = new Date();
    n.querySelector('.lk-date').textContent = \`\${DAYS[d.getDay()]}, \${MONS[d.getMonth()]} \${d.getDate()}\`;
    n.querySelector('.lk-time').textContent = time12(d).replace(NBSP, ' ').replace(/\s?[AP]M$/, '');
  },

  /* Restart really does tear the session down — every window closes, the bar runs
     again, and you land back on the login screen. */
  restart() {
    WM.list.slice().forEach(w => WM.close(w.id));
    NotifCenter.close(); Pop.close(true);
    const boot = el(\`<div id="boot"><svg viewBox="0 0 15 18" class="bl"><use href="#g-apple"/></svg>
      <div class="bar"><i></i></div></div>\`);
    $('#stage').append(boot);
    const fill = boot.querySelector('.bar i');
    [[80, 18], [360, 30], [640, 48], [900, 70], [1120, 86], [1340, 100]]
      .forEach(([at, pct]) => setTimeout(() => { fill.style.width = pct + '%'; }, at));
    setTimeout(() => {
      boot.classList.add('out'); setTimeout(() => boot.remove(), 480);
      this.lock();
      setTimeout(() => WM.open('finder', { path: PLACES.prasenjit }), 900);
    }, 1700);
  },

  shutDown() {
    WM.list.slice().forEach(w => WM.close(w.id));
    NotifCenter.close(); Pop.close(true);
    const off = el(\`<div id="boot" style="cursor:var(--cur-hand)">
      <div style="font-size:13px;color:rgba(255,255,255,.5);position:absolute;bottom:16%">Click anywhere to start up</div></div>\`);
    $('#stage').append(off);
    off.addEventListener('click', () => { off.remove(); this.restart(); });
  },

  unlock() {
    const n = $('#lock'); if (!n || n.dataset.on !== '1') return;
    n.dataset.on = '0';
    clearInterval(this.timer);
    removeEventListener('keydown', this.keyGo);
    /* Wallpaper snaps back into focus a beat before the panel dissolves, which is
       what makes it feel like the desktop was always there. */
    n.classList.add('opening');
    setTimeout(() => {
      n.classList.add('out');
      setTimeout(() => { n.hidden = true; n.classList.remove('out', 'opening'); }, 480);
    }, 120);
  },
};

(function boot() {
  /* Calendar dock icon shows the live date, like the real one */
  const now = new Date();
  const dow = $('#cal-dow'), day = $('#cal-day');
  if (dow) dow.textContent = DAYS3[now.getDay()].toUpperCase();
  if (day) day.textContent = now.getDate();

  Theme.setAppearance(SYS.appearance);
  Theme.paintAccent();
  Set2.applyChrome();
  Wall.set(SYS.wallpaper);
  Screen.setBrightness(Screen.brightness);

  MenuBar.init();
  Desktop.init();
  Dock.init();

  /* Right-click the dock's empty glass */
  $('#dock').addEventListener('contextmenu', e => {
    if (e.target.closest('.di')) return;
    ctxMenu(e, [
      { id: 'mag', label: 'Turn Magnification ' + (SYS.dockMagOn ? 'Off' : 'On'), run: () => { SYS.dockMagOn = !SYS.dockMagOn; Dock.measure(); } },
      { id: 'pos', label: 'Position on Screen', key: '▸' },
      '-',
      { id: 'pref', label: 'Dock Settings…', run: () => WM.open('settings', { section: 'dock' }) },
    ]);
  });

  /* Menu-bar clock area also responds to a right-click */
  $('#menubar').addEventListener('contextmenu', e => {
    e.preventDefault();
    ctxMenu(e, [
      { id: 'a', label: 'Menu Bar Settings…', run: () => WM.open('settings', { section: 'appearance' }) },
      { id: 'c', label: 'Control Centre Settings…', run: () => WM.open('settings', { section: 'appearance' }) },
    ]);
  });

  /* Battery drifts down slowly so the UI is never quite static */
  setInterval(() => {
    if (SYS.charging) SYS.battery = Math.min(100, SYS.battery + 1);
    else if (Math.random() < .35) SYS.battery = Math.max(3, SYS.battery - 1);
    MenuBar.paintStatus();
  }, 42000);

  /* Open the window most people would open first */
  setTimeout(() => WM.open('finder', { path: PLACES.prasenjit }), 340);

  /* Launchpad's full-screen blur costs ~230ms the first time Chromium rasterises
     it — a visible stutter on the fade-in, and only ever on the first open. So
     pay it here, invisibly, while nobody is waiting on it. */
  const warm = () => {
    const n = el(\`<div id="lpad" class="nosel" style="opacity:.002;animation:none;pointer-events:none">
      <div class="grid">\${LAUNCH_ORDER.slice(0, PER_PAGE).map(id =>
      \`<div class="app"><div class="art">\${ic(APPS[id].icon)}</div><div class="nm">\${esc(APPS[id].name)}</div></div>\`).join('')}</div></div>\`);
    /* The tray pays the same first-rasterise toll as Launchpad — a tall blurred
       surface Chromium has never composited before. Warm it off the same idle beat. */
    const t = el(\`<div id="nc" class="nosel" style="opacity:.002;transform:none;animation:none;pointer-events:none"></div>\`);
    /* And the genie: the first window to warp costs three long frames while Chromium
       rasterises an animated clip-path for the first time. Run one through the same
       keyframes on a throwaway node so the toll is paid before anyone sees it. */
    const g = el(\`<div class="win mini" style="left:40px;top:40px;width:360px;height:260px;opacity:.002;pointer-events:none;visibility:visible">
      <div class="tb"></div><div class="wb"></div></div>\`);
    $('#layer-overlay').append(n, t, g);
    n.getBoundingClientRect(); t.getBoundingClientRect();
    const ga = g.animate([
      { transform: 'translate(0px,0px) scale(1,1)', clipPath: 'polygon(0% 0%,100% 0%,100% 100%,0% 100%)', borderRadius: '11px' },
      { transform: 'translate(120px,300px) scale(.3,.3)', clipPath: 'polygon(20% 0%,80% 0%,93% 100%,7% 100%)', borderRadius: '22px', offset: .55 },
      { transform: 'translate(240px,600px) scale(.06,.06)', clipPath: 'polygon(43% 0%,57% 0%,100% 100%,0% 100%)', borderRadius: '40px' },
    ], { duration: 120, easing: 'cubic-bezier(.42,.02,.58,1)' });
    ga.onfinish = () => g.remove();
    requestAnimationFrame(() => requestAnimationFrame(() => { n.remove(); t.remove(); }));
  };
  (window.requestIdleCallback || (f => setTimeout(f, 1400)))(warm, { timeout: 2600 });

  addEventListener('resize', () => {
    /* keep windows on screen when the viewport shrinks */
    WM.list.forEach(w => {
      const n = w.node;
      if (w.zoomed) { Object.assign(n.style, { left: '0px', top: WM.mb() + 'px', width: innerWidth + 'px', height: WM.visibleH() + 'px' }); return; }
      n.style.left = Math.min(n.offsetLeft, Math.max(10, innerWidth - 120)) + 'px';
      n.style.top = clamp(n.offsetTop, WM.mb(), Math.max(WM.mb(), innerHeight - 40)) + 'px';
    });
  });

  /* Don't let the browser's own menu appear on the wallpaper */
  document.addEventListener('contextmenu', e => {
    if (e.target.closest('input,textarea,[contenteditable="true"],.tm-body')) return;
    if (!e.defaultPrevented) e.preventDefault();
  });
  document.addEventListener('dragstart', e => e.preventDefault());

  Startup.run();
})();
`);
