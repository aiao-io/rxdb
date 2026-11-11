import { restoreRuntimeSource } from './runtime-source';

export const SCRIPT_10_APPS4 = restoreRuntimeSource(String.raw`
/* ============================================================================
   18 · MUSIC
   ========================================================================== */
const ART = [
  { g: ['#ff6b8b', '#7c3aed'], s: 'circles' }, { g: ['#12c2e9', '#0b4f8a'], s: 'waves' },
  { g: ['#f9d423', '#e65c00'], s: 'sun' }, { g: ['#141e30', '#243b55'], s: 'bars' },
  { g: ['#43e97b', '#087f5b'], s: 'diag' }, { g: ['#f5f0e6', '#c0a880'], s: 'halftone' },
  { g: ['#0f0f12', '#3a3a45'], s: 'peaks' }, { g: ['#ff9a44', '#fc6076'], s: 'sun' },
  { g: ['#2b1055', '#7597de'], s: 'peaks' }, { g: ['#e0e5ec', '#9aa5b1'], s: 'arch' },
  { g: ['#00b4db', '#003357'], s: 'waves' }, { g: ['#ee0979', '#ff6a00'], s: 'diag' },
];
function albumArt(i) {
  const a = ART[i % ART.length], id = 'ag' + i;
  const shapes = {
    circles: \`<circle cx="50" cy="42" r="26" fill="rgba(255,255,255,.14)"/><circle cx="50" cy="42" r="17" fill="rgba(255,255,255,.18)"/><circle cx="50" cy="42" r="8" fill="rgba(255,255,255,.85)"/><rect x="18" y="80" width="46" height="4" rx="2" fill="rgba(255,255,255,.5)"/>\`,
    waves: \`<path d="M0 62c14 0 14-14 28-14s14 14 28 14 14-14 28-14 14 14 28 14v46H0z" fill="rgba(255,255,255,.16)"/><path d="M0 76c14 0 14-12 28-12s14 12 28 12 14-12 28-12 14 12 28 12v34H0z" fill="rgba(255,255,255,.22)"/><rect x="16" y="18" width="34" height="4" rx="2" fill="rgba(255,255,255,.6)"/>\`,
    sun: \`<circle cx="50" cy="56" r="22" fill="rgba(255,255,255,.9)"/><g stroke="rgba(255,255,255,.55)" stroke-width="3" stroke-linecap="round"><path d="M50 16v12M50 84v12M10 56h12M78 56h12M22 28l8 8M70 76l8 8M78 28l-8 8M30 76l-8 8"/></g>\`,
    bars: (() => {
      const h = [34, 58, 22, 74, 46, 88, 30, 62, 40];
      return \`<g fill="rgba(255,255,255,.26)">\${h.map((v, k) => \`<rect x="\${10 + k * 9}" y="\${94 - v}" width="5.5" height="\${v}" rx="2.6"/>\`).join('')}</g>
        <rect x="\${10 + 5 * 9}" y="\${94 - 88}" width="5.5" height="88" rx="2.6" fill="rgba(255,255,255,.9)"/>\`;
    })(),
    halftone: \`<g fill="rgba(0,0,0,.18)">\${[...Array(7)].map((_, r) => [...Array(7)].map((_, c) => {
      const dx = c - 3, dy = r - 3, d = Math.sqrt(dx * dx + dy * dy);
      return \`<circle cx="\${14 + c * 12}" cy="\${14 + r * 12}" r="\${(5.4 - d * 1.05).toFixed(2)}"/>\`;
    }).join('')).join('')}</g>\`,
    diag: \`<g stroke="rgba(255,255,255,.2)" stroke-width="7">\${[...Array(8)].map((_, k) => \`<path d="M\${-30 + k * 22} 110L\${20 + k * 22} -10"/>\`).join('')}</g><circle cx="50" cy="50" r="14" fill="rgba(255,255,255,.9)"/>\`,
    arch: \`<path d="M26 92V44a24 24 0 0 1 48 0v48z" fill="rgba(255,255,255,.6)"/><path d="M38 92V46a12 12 0 0 1 24 0v46z" fill="rgba(0,0,0,.16)"/><rect x="14" y="92" width="72" height="4" fill="rgba(0,0,0,.2)"/>\`,
    peaks: \`<path d="M0 74 26 40l17 20 21-30 36 44v26H0z" fill="rgba(255,255,255,.2)"/><path d="M0 86 30 60l20 16 24-14 26 20v18H0z" fill="rgba(255,255,255,.34)"/><circle cx="74" cy="26" r="10" fill="rgba(255,255,255,.85)"/>\`,
  }[a.s];
  return \`<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:100%"><defs><linearGradient id="\${id}" x1="0" y1="0" x2=".7" y2="1">
    <stop offset="0" stop-color="\${a.g[0]}"/><stop offset="1" stop-color="\${a.g[1]}"/></linearGradient></defs>
    <rect width="100" height="100" fill="url(#\${id})"/>\${shapes}</svg>\`;
}
const ALBUMS = [
  { t: 'Neon Interiors', a: 'Kaida', y: 2026, n: 9 }, { t: 'Deep Field', a: 'Orbital Fold', y: 2025, n: 11 },
  { t: 'Golden Hour', a: 'The Vireo', y: 2024, n: 8 }, { t: 'Nightgraph', a: 'Sable Court', y: 2026, n: 10 },
  { t: 'Fernlight', a: 'Moss & Marrow', y: 2023, n: 7 }, { t: 'Soft Static', a: 'Lantern Bay', y: 2025, n: 12 },
];
const SONGS = [
  { t: 'Aurora Drift', a: 'Kaida', al: 0, d: 224 }, { t: 'Glass Cathedral', a: 'Kaida', al: 0, d: 191 },
  { t: 'Low Orbit', a: 'Orbital Fold', al: 1, d: 268 }, { t: 'Parallax', a: 'Orbital Fold', al: 1, d: 205 },
  { t: 'Sunbleach', a: 'The Vireo', al: 2, d: 178 }, { t: 'Ochre', a: 'The Vireo', al: 2, d: 243 },
  { t: 'Nightgraph', a: 'Sable Court', al: 3, d: 302 }, { t: 'Velvet Static', a: 'Sable Court', al: 3, d: 216 },
  { t: 'Fernlight', a: 'Moss & Marrow', al: 4, d: 189 }, { t: 'Soft Static', a: 'Lantern Bay', al: 5, d: 231 },
];
const mmss = s => \`\${Math.floor(s / 60)}:\${String(Math.floor(s % 60)).padStart(2, '0')}\`;

/* ---- the sound ------------------------------------------------------------
   Music plays for real. There is no licensable audio to stream from a single
   HTML file, so each track is synthesised: a key, a mode, a tempo and a chord
   progression derived from its index, voiced with pads, bass, plucks and drums.
   Same song, same notes, every time — and the transport reads the audio clock,
   so the scrubber tracks what you are actually hearing.
   -------------------------------------------------------------------------- */
const MODES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
};
const PROGS = [[0, 5, 3, 4], [0, 4, 5, 3], [5, 3, 0, 4], [0, 3, 1, 4]];
const hz = midi => 440 * Math.pow(2, (midi - 69) / 12);

const Synth = {
  ctx: null, master: null, wet: null, timer: null,
  startAt: 0, offset: 0, nextBeat: 0, beat: 0, rec: null,

  /** Built on first play — browsers refuse an AudioContext without a gesture. */
  ensure() {
    if (this.ctx) return this.ctx;
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    const ctx = this.ctx = new C();

    /* A limiter on the end of the chain: pads, bass and drums all land on the same
       downbeat, and without it those peaks are what set the level for everything. */
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -10; lim.knee.value = 6;
    lim.ratio.value = 12; lim.attack.value = .004; lim.release.value = .18;
    lim.connect(ctx.destination);
    this.lim = lim;
    this.master = ctx.createGain();
    this.master.connect(lim);

    /* Reverb from a decaying noise impulse. Two seconds of tail is the difference
       between "synthesiser demo" and "record". */
    const len = Math.floor(ctx.sampleRate * 2.4);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    const verb = ctx.createConvolver(); verb.buffer = ir;
    this.wet = ctx.createGain(); this.wet.gain.value = .34;
    verb.connect(this.wet); this.wet.connect(this.master);
    this.verbIn = verb;

    /* One eighth-note of feedback delay, for the plucks to bounce around in. */
    const dl = ctx.createDelay(1); dl.delayTime.value = .34;
    const fb = ctx.createGain(); fb.gain.value = .3;
    const dw = ctx.createGain(); dw.gain.value = .22;
    dl.connect(fb); fb.connect(dl); dl.connect(dw); dw.connect(this.master);
    this.delayIn = dl;

    this.gain();
    return ctx;
  },
  gain() {
    if (!this.master) return;
    const v = SYS.muted ? 0 : Math.pow(SYS.volume, 1.4) * 1.15;
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, .04);
  },

  /* Everything musical about a track, from its position in the library. Fixed
     tables rather than randomness, so a song sounds the same on every play. */
  recipe(i) {
    const s = SONGS[i], al = s.al;
    const roots = [57, 55, 60, 53, 58, 62, 56, 59, 61, 54];
    const modeNames = ['minor', 'dorian', 'minor', 'major', 'dorian', 'lydian'];
    const warm = [2, 4, 5].includes(al);
    return {
      root: roots[i % roots.length],
      scale: MODES[modeNames[al % modeNames.length]],
      prog: PROGS[i % PROGS.length],
      bpm: warm ? 72 + (i * 5) % 14 : 88 + (i * 7) % 26,
      drums: !warm,
      /* Warm records get a slower, softer pluck and a wider tail. */
      arpDiv: warm ? 2 : 1,
      verb: warm ? .46 : .3,
      cutoff: warm ? 900 : 1500,
    };
  },
  /** Scale degree → midi note, wrapping into higher octaves past the seventh. */
  note(rec, deg, oct = 0) {
    const sc = rec.scale, n = sc.length;
    const o = Math.floor(deg / n) + oct;
    return rec.root + sc[((deg % n) + n) % n] + 12 * o;
  },

  /* ---- voices ---- */
  env(node, t, a, d, peak) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(.0001, t + a + d);
    node.connect(g);
    return g;
  },
  pad(degs, t, dur) {
    const ctx = this.ctx, rec = this.rec;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = rec.cutoff; lp.Q.value = .7;
    /* The filter drifting open and shut is what stops a held chord going static. */
    lp.frequency.setValueAtTime(rec.cutoff * .7, t);
    lp.frequency.linearRampToValueAtTime(rec.cutoff * 1.25, t + dur * .55);
    lp.frequency.linearRampToValueAtTime(rec.cutoff * .8, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(.1, t + dur * .28);
    g.gain.setValueAtTime(.1, t + dur * .7);
    g.gain.linearRampToValueAtTime(0, t + dur);
    lp.connect(g); g.connect(this.master); g.connect(this.verbIn);
    degs.forEach(deg => {
      [-5, 5].forEach(cents => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = hz(this.note(rec, deg, 1));
        o.detune.value = cents;
        o.connect(lp); o.start(t); o.stop(t + dur + .05);
      });
    });
  },
  bass(deg, t, dur) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.value = hz(this.note(this.rec, deg, -1));
    const sub = ctx.createOscillator(); sub.type = 'sine';
    sub.frequency.value = hz(this.note(this.rec, deg, -2));
    const g = this.env(o, t, .012, dur, .3);
    const g2 = this.env(sub, t, .012, dur, .22);
    g.connect(this.master); g2.connect(this.master);
    o.start(t); o.stop(t + dur + .05); sub.start(t); sub.stop(t + dur + .05);
  },
  pluck(deg, t, vel = 1) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.value = hz(this.note(this.rec, deg, 2));
    const g = this.env(o, t, .004, .34, .085 * vel);
    g.connect(this.master); g.connect(this.delayIn); g.connect(this.verbIn);
    o.start(t); o.stop(t + .4);
  },
  kick(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(46, t + .11);
    const g = this.env(o, t, .003, .17, .5);
    g.connect(this.master);
    o.start(t); o.stop(t + .22);
  },
  noise(t, dur, freq, peak, type = 'highpass') {
    const ctx = this.ctx;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    src.connect(f);
    const g = this.env(f, t, .002, dur, peak);
    g.connect(this.master);
    src.start(t); src.stop(t + dur + .02);
  },

  /* ---- transport ---- */
  /** Web Audio needs notes queued ahead of time; 40ms ticks, 180ms of lookahead. */
  tick() {
    const ctx = this.ctx, rec = this.rec;
    if (!ctx || !rec) return;
    const spb = 60 / rec.bpm / 2;               /* one eighth note */
    while (this.nextBeat < ctx.currentTime + .18) {
      const t = this.nextBeat, b = this.beat;
      const inBar = b % 8, barNo = Math.floor(b / 8);
      const chord = rec.prog[barNo % rec.prog.length];

      if (inBar === 0) this.pad([chord, chord + 2, chord + 4], t, spb * 8 * .98);
      if (inBar === 0 || inBar === 5) this.bass(chord, t, spb * 2.4);
      if (inBar === 3 && !rec.drums) this.bass(chord + 4, t, spb * 1.6);

      /* Rolling arpeggio over the chord tones, one note per eighth (or quarter
         on the warmer records), climbing then falling so it never marches. */
      if (b % rec.arpDiv === 0) {
        const shape = [0, 2, 4, 6, 4, 2, 4, 2];
        const deg = chord + shape[(b / rec.arpDiv | 0) % shape.length];
        this.pluck(deg, t, inBar % 2 ? .72 : 1);
      }
      if (rec.drums) {
        if (inBar === 0 || inBar === 6) this.kick(t);
        if (inBar === 4) this.noise(t, .12, 1900, .16);           /* snare */
        if (inBar % 2 === 1) this.noise(t, .035, 7200, .06);      /* hat */
      }
      this.nextBeat += spb;
      this.beat++;
    }
  },
  start(songIndex, from = 0) {
    const ctx = this.ensure();
    if (!ctx) return false;
    if (ctx.state === 'suspended') ctx.resume();
    this.stop(true);
    this.rec = this.recipe(songIndex);
    this.wet.gain.value = this.rec.verb;
    this.offset = from;
    this.startAt = ctx.currentTime + .06;
    /* Resume mid-song on a bar line so the progression stays intelligible. */
    const spb = 60 / this.rec.bpm / 2;
    this.beat = Math.round(from / spb / 8) * 8;
    this.nextBeat = this.startAt;
    this.offset = this.beat * spb;
    this.gain();
    this.tick();
    this.timer = setInterval(() => this.tick(), 40);
    return true;
  },
  stop(keep) {
    clearInterval(this.timer); this.timer = null;
    if (!keep && this.master && this.ctx) {
      /* Fade rather than cut, or every pause ends in a click. */
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, .02);
    }
  },
  pos() {
    if (!this.ctx || !this.timer) return null;
    return this.offset + (this.ctx.currentTime - this.startAt);
  },
  get live() { return !!this.timer; },
};
Bus.on('volume', () => Synth.gain());

APPS.music = {
  name: 'Music', icon: 'app-music', w: 1000, h: 640, minW: 620, minH: 400,
  menus: () => stdMenus('music', {
    Controls: [{ id: 'p', label: 'Play', key: '␣', run: () => Mu.toggle() },
    { id: 'n', label: 'Next', key: '⌘→', run: () => Mu.skip(1) },
    { id: 'b', label: 'Previous', key: '⌘←', run: () => Mu.skip(-1) }, '-',
    { id: 's', label: 'Shuffle', key: '⌘S' }, { id: 'r', label: 'Repeat', key: '⌘R' }],
  }, ['File', 'Edit', 'View', 'Controls', 'Window', 'Help']),
  mount(w) {
    w.st = { view: 'Recently Added' };
    const S = [
      { head: 'Apple Music', items: [['Home', 'g-globe'], ['New', 'g-star'], ['Radio', 'g-podcast']] },
      { head: 'Library', items: [['Recently Added', 'g-clock-a'], ['Artists', 'g-contacts2'], ['Albums', 'g-grid'], ['Songs', 'g-list'], ['Made for You', 'g-star']] },
      { head: 'Playlists', items: [['Focus', 'g-list'], ['Late Night', 'g-list'], ['Shipping Music', 'g-list']] },
    ];
    return \`<div class="wb col"><div class="mu">
      <div class="mu-top">
        <div class="sbar" data-drag style="width:206px"><div class="sb-top"><div data-tl></div></div>
        \${S.map(g => \`<div class="grp"><div class="gh">\${g.head}</div>\${g.items.map(([n, i]) =>
      \`<div class="si" data-mv="\${esc(n)}">\${ic(i === 'g-podcast' ? 'g-airplay' : i === 'g-contacts2' ? 'g-hand' : i, 'ico')}<span class="nm">\${esc(n)}</span></div>\`).join('')}</div>\`).join('')}
        </div>
        <div class="mu-main">
          <div class="tbar" data-drag style="height:52px;border-bottom:.5px solid var(--line)">
            <button class="tbtn dis" data-nodrag data-mnav="-1" title="Back">\${ic('g-chev-l')}</button>
            <button class="tbtn dis" data-nodrag data-mnav="1" title="Forward">\${ic('g-chev-r')}</button>
            <div class="grow" style="flex:1"></div>
            <div class="sfield" data-nodrag style="width:180px"><span>\${ic('g-search')}</span><input placeholder="Search" data-msearch></div>
          </div>
          <div class="mu-hd"><h2 data-mtitle>Recently Added</h2><span data-mcount></span></div>
          <div data-mbody style="flex:1;display:flex;flex-direction:column;min-height:0"></div>
        </div>
      </div>
      <div class="mu-bar">
        <div class="ctl">
          <button data-c="prev">\${ic('g-bwd')}</button>
          <button class="big" data-c="play">\${ic('g-play')}</button>
          <button data-c="next">\${ic('g-fwd')}</button>
        </div>
        <div class="cv" data-npcv></div>
        <div class="meta"><b data-npt>—</b><span data-npa></span></div>
        <div class="prog"><span class="t" data-cur>0:00</span>
          <div class="sl plain" data-slider="seek"><div class="trk"><div class="fil"></div></div><div class="kn"></div></div>
          <span class="t r" data-dur>0:00</span></div>
        <div class="vol">\${ic('g-vol-lo')}<div class="sl" data-slider="mvol"><div class="trk"><div class="fil"></div></div><div class="kn"></div></div></div>
        <button class="tbtn" data-c="shuffle">\${ic('g-shuffle')}</button>
        <button class="tbtn" data-c="repeat">\${ic('g-repeat')}</button>
      </div>
    </div></div>\`;
  },
  ready(w) {
    Mu.w = w;
    /* Sidebar picks push onto a history stack so back/forward mean something. */
    w.st.hist = [w.st.view]; w.st.hi = 0;
    const navBtns = () => {
      w.node.querySelector('[data-mnav="-1"]').classList.toggle('dis', w.st.hi <= 0);
      w.node.querySelector('[data-mnav="1"]').classList.toggle('dis', w.st.hi >= w.st.hist.length - 1);
    };
    on(w.node, 'click', '[data-mv]', (e, t) => {
      w.st.view = t.dataset.mv;
      w.st.hist = w.st.hist.slice(0, w.st.hi + 1); w.st.hist.push(w.st.view); w.st.hi = w.st.hist.length - 1;
      Mu.render(w); navBtns();
    });
    on(w.node, 'click', '[data-mnav]:not(.dis)', (e, t) => {
      w.st.hi = clamp(w.st.hi + +t.dataset.mnav, 0, w.st.hist.length - 1);
      w.st.view = w.st.hist[w.st.hi];
      Mu.render(w); navBtns();
    });
    w.node.querySelector('[data-msearch]').addEventListener('input', e => { w.st.q = e.target.value.trim().toLowerCase(); Mu.render(w); });
    on(w.node, 'click', '[data-c]', (e, t) => {
      const c = t.dataset.c;
      if (c === 'play') Mu.toggle(); if (c === 'next') Mu.skip(1); if (c === 'prev') Mu.skip(-1);
      if (c === 'shuffle' || c === 'repeat') t.classList.toggle('on');
    });
    on(w.node, 'click', '.alb', (e, t) => Mu.playAlbum(+t.dataset.al));
    on(w.node, 'dblclick', '.mu-song', (e, t) => Mu.play(+t.dataset.si));
    on(w.node, 'click', '.mu-song', (e, t) => { $$('.mu-song', w.node).forEach(x => x.classList.remove('pick')); t.classList.add('pick'); });
    /* Dragging only moves the labels; the audio is re-cued once on release, or the
       synth would tear itself down and rebuild on every pointer move. */
    Mu.seek = Slider(w.node.querySelector('[data-slider="seek"]'), 0,
      v => Mu.scrub(v), { done: v => Mu.seekTo(v) });
    Slider(w.node.querySelector('[data-slider="mvol"]'), SYS.volume, v => { SYS.volume = v; Bus.emit('volume', v); MenuBar.paintStatus(); });
    Mu.render(w); Mu.paintBar();
  },
  onClose(w) { if (Mu.w === w) { Mu.w = null; Mu.stopAll(); } }
};

const Mu = {
  w: null, i: 0, pos: 0, playing: false, seek: null,
  cur() { return SONGS[this.i]; },
  render(w) {
    w = w || this.w; if (!w) return;
    const st = w.st;
    $$('[data-mv]', w.node).forEach(b => b.classList.toggle('on', b.dataset.mv === st.view));
    w.node.querySelector('[data-mtitle]').textContent = st.q ? \`Search: \${st.q}\` : st.view;
    const body = w.node.querySelector('[data-mbody]');
    /* A live query outranks the sidebar, the way typing in Music jumps to results. */
    if (st.q) {
      const hits = SONGS.map((s, i) => [s, i]).filter(([s]) =>
        (s.t + ' ' + s.a + ' ' + ALBUMS[s.al].t).toLowerCase().includes(st.q));
      w.node.querySelector('[data-mcount]').textContent = \`\${hits.length} result\${hits.length === 1 ? '' : 's'}\`;
      body.innerHTML = hits.length ? \`<div class="mu-songs scroll">\${hits.map(([s, i], k) => \`
        <div class="mu-song\${i === this.i ? ' on' : ''}" data-si="\${i}">
          <span class="n">\${k + 1}</span><span class="cv">\${albumArt(s.al)}</span>
          <span class="ti"><b>\${esc(s.t)}</b><span>\${esc(s.a)} — \${esc(ALBUMS[s.al].t)}</span></span>
          <span class="du">\${mmss(s.d)}</span></div>\`).join('')}</div>\`
        : \`<div style="flex:1;display:grid;place-items:center;color:var(--txt-3);font-size:13px">No results for “\${esc(st.q)}”</div>\`;
      return;
    }
    if (st.view === 'Songs' || st.view.startsWith('Focus') || st.view === 'Late Night' || st.view === 'Shipping Music') {
      w.node.querySelector('[data-mcount]').textContent = \`\${SONGS.length} songs · \${mmss(SONGS.reduce((a, s) => a + s.d, 0))}\`;
      body.innerHTML = \`<div class="mu-songs scroll">\${SONGS.map((s, i) => \`
        <div class="mu-song\${i === this.i ? ' on' : ''}" data-si="\${i}">
          <span class="n">\${i + 1}</span><span class="cv">\${albumArt(s.al)}</span>
          <span class="ti"><b>\${esc(s.t)}</b><span>\${esc(s.a)} — \${esc(ALBUMS[s.al].t)}</span></span>
          <span class="du">\${mmss(s.d)}</span></div>\`).join('')}</div>\`;
    } else if (st.view === 'Artists') {
      const artists = [...new Set(ALBUMS.map(a => a.a))];
      w.node.querySelector('[data-mcount]').textContent = \`\${artists.length} artists\`;
      body.innerHTML = \`<div class="mu-grid scroll">\${artists.map((a, i) => \`
        <div class="alb" data-al="\${ALBUMS.findIndex(x => x.a === a)}"><div class="cv" style="border-radius:50%">\${albumArt(i + 2)}
          <span class="pl">\${ic('g-play')}</span></div><b>\${esc(a)}</b><span>Artist</span></div>\`).join('')}</div>\`;
    } else {
      w.node.querySelector('[data-mcount]').textContent = \`\${ALBUMS.length} albums\`;
      body.innerHTML = \`<div class="mu-grid scroll">\${ALBUMS.map((a, i) => \`
        <div class="alb\${this.cur().al === i ? ' on' : ''}" data-al="\${i}"><div class="cv">\${albumArt(i)}
          <span class="pl">\${ic('g-play')}</span></div><b>\${esc(a.t)}</b><span>\${esc(a.a)} · \${a.y}</span></div>\`).join('')}</div>\`;
    }
  },
  paintBar() {
    const w = this.w; if (!w) return;
    const s = this.cur();
    w.node.querySelector('[data-npcv]').innerHTML = albumArt(s.al);
    w.node.querySelector('[data-npt]').textContent = s.t;
    w.node.querySelector('[data-npa]').textContent = \`\${s.a} — \${ALBUMS[s.al].t}\`;
    w.node.querySelector('[data-cur]').textContent = mmss(this.pos);
    w.node.querySelector('[data-dur]').textContent = '-' + mmss(Math.max(0, s.d - this.pos));
    w.node.querySelector('[data-c="play"]').innerHTML = ic(this.playing ? 'g-pause' : 'g-play');
    if (this.seek && !this.scrubbing) this.seek.set(this.pos / s.d);
  },
  toggle() {
    if (!this.w) return WM.open('music');
    this.playing = !this.playing;
    if (this.playing) Synth.start(this.i, this.pos); else { this.pos = Synth.pos() ?? this.pos; Synth.stop(); }
    this.paintBar(); this.render();
  },
  play(i, from = 0) {
    this.i = clamp(i, 0, SONGS.length - 1);
    this.pos = from;
    this.playing = true;
    Synth.start(this.i, from);
    this.render(); this.paintBar();
  },
  playAlbum(al) { const i = SONGS.findIndex(s => s.al === al); this.play(i < 0 ? 0 : i); },
  skip(d) { this.play((this.i + d + SONGS.length) % SONGS.length); },
  scrub(frac) { this.scrubbing = true; this.pos = clamp(frac, 0, .999) * this.cur().d; this.paintBar(); },
  /** On release the piece picks up from the nearest bar to where you dropped it. */
  seekTo(frac) {
    const at = clamp(frac, 0, .999) * this.cur().d;
    this.scrubbing = false;
    this.pos = at;
    if (this.playing) Synth.start(this.i, at);
    this.paintBar();
  },
  stopAll() { this.playing = false; Synth.stop(); },
};
/* The transport follows the audio clock while sound is playing, and falls back to
   wall-clock stepping only if the browser gave us no AudioContext at all. */
setInterval(() => {
  if (!Mu.playing || !Mu.w) return;
  const p = Synth.pos();
  Mu.pos = p == null ? Mu.pos + 1 : p;
  if (Mu.pos >= Mu.cur().d) Mu.skip(1); else Mu.paintBar();
}, 1000);

/* ============================================================================
   19 · SYSTEM SETTINGS
   ========================================================================== */
const ST_SECTIONS = [
  { id: 'wifi', name: 'Wi‑Fi', icon: 'g-wifi', bg: '#0a84ff' },
  { id: 'bluetooth', name: 'Bluetooth', icon: 'g-bt', bg: '#0a84ff' },
  { id: 'network', name: 'Network', icon: 'g-network', bg: '#0a84ff' },
  { sep: true },
  { id: 'general', name: 'General', icon: 'g-gear', bg: '#8e8e93' },
  { id: 'appearance', name: 'Appearance', icon: 'g-display', bg: '#1d1d1f' },
  { id: 'wallpaper', name: 'Wallpaper', icon: 'g-globe', bg: '#30d158' },
  { id: 'dock', name: 'Desktop & Dock', icon: 'g-slider-h', bg: '#1d1d1f' },
  { id: 'displays', name: 'Displays', icon: 'g-display', bg: '#0a84ff' },
  { id: 'sound', name: 'Sound', icon: 'g-vol-hi', bg: '#ff375f' },
  { id: 'battery', name: 'Battery', icon: 'g-batt-glyph', bg: '#30d158' },
  { sep: true },
  { id: 'privacy', name: 'Privacy & Security', icon: 'g-hand', bg: '#0a84ff' },
];

APPS.settings = {
  name: 'System Settings', icon: 'app-settings', w: 800, h: 600, minW: 620, minH: 420,
  menus: () => stdMenus('settings'),
  mount(w, o) {
    w.st = { sec: o.section || 'appearance' };
    return \`<div class="wb"><div class="st">
      <div class="st-side" data-drag>
        <div style="display:flex;align-items:center;height:38px;padding:0 12px"><div data-tl></div></div>
        <div class="top"><div class="sfield" data-nodrag><span>\${ic('g-search')}</span><input placeholder="Search" data-stq></div></div>
        <div class="st-scroll">
          <div class="st-row" style="height:44px;margin-bottom:8px">
            <span class="bg" style="width:34px;height:34px;border-radius:50%;background-image:url('\${AVATAR}');background-size:cover;background-position:center"></span>
            <span style="display:flex;flex-direction:column"><b style="font-size:13px;font-weight:600">Prasenjit</b><span style="font-size:11px;color:var(--txt-2)">Apple Account</span></span>
          </div>
          \${ST_SECTIONS.map(s => s.sep ? \`<div class="msep" style="margin:8px 8px"></div>\` :
      \`<div class="st-row" data-sec="\${s.id}"><span class="bg" style="background:\${s.bg}">\${ic(s.icon)}</span><span>\${esc(s.name)}</span></div>\`).join('')}
        </div>
      </div>
      <div class="st-main scroll">
        <div class="st-head" data-drag><h2 data-sttitle></h2></div>
        <div class="st-body" data-stbody></div>
      </div>
    </div></div>\`;
  },
  ready(w) {
    Set2.w = w;
    on(w.node, 'click', '[data-sec]', (e, t) => { w.st.sec = t.dataset.sec; Set2.render(w); });
    Set2.render(w);
    Bus.on('theme', () => { if (w.st.sec === 'appearance' && !w.dead) Set2.render(w); });
  },
  onClose(w) { if (Set2.w === w) Set2.w = null; }
};

const Set2 = {
  w: null,
  render(w) {
    w = w || this.w; if (!w) return;
    const sec = ST_SECTIONS.find(s => s.id === w.st.sec) || ST_SECTIONS[4];
    $$('[data-sec]', w.node).forEach(b => b.classList.toggle('on', b.dataset.sec === sec.id));
    w.node.querySelector('[data-sttitle]').textContent = sec.name;
    const body = w.node.querySelector('[data-stbody]');
    body.innerHTML = (this.panes[sec.id] || this.panes._)(sec);
    body.querySelectorAll('.st-row svg,.bg svg').forEach(s => s.style.cssText = 'width:13px;height:13px');
    this.wire(w, body, sec.id);
  },

  wire(w, body, id) {
    on(body, 'click', '.sw', (e, t) => {
      t.classList.toggle('on');
      const k = t.dataset.k, on2 = t.classList.contains('on');
      if (k === 'wifi') { SYS.wifi = on2; MenuBar.paintStatus(); }
      if (k === 'bt') { SYS.bluetooth = on2; MenuBar.paintStatus(); }
      if (k === 'mag') { SYS.dockMagOn = on2; Dock.measure(); }
      if (k === 'dark') Theme.set(on2 ? 'dark' : 'light');
    });
    on(body, 'click', '[data-appear]', (e, t) => {
      Theme.setAppearance(t.dataset.appear);
      this.render(w);
    });
    on(body, 'click', '[data-accent]', (e, t) => { Theme.setAccent(t.dataset.accent); this.render(w); });
    on(body, 'click', '[data-hilite]', (e, t) => {
      SYS.highlight = t.dataset.hilite;
      const a = Theme.ACCENTS[SYS.highlight];
      const s = document.documentElement.style;
      /* 'accent' means "whatever the accent is", so the override comes back off. */
      if (!a || !a.hex) s.removeProperty('--sel');
      else s.setProperty('--sel', (SYS.theme === 'dark' ? (a.dark || a.hex) : a.hex));
      this.render(w);
    });
    /* The two popup buttons in this pane are real menus with real consequences. */
    on(body, 'click', '[data-pick]', (e, t) => {
      const k = t.dataset.pick;
      const opts = k === 'sidebarIcons'
        ? [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']]
        : [['auto', 'Automatically'], ['scrolling', 'When scrolling'], ['always', 'Always']];
      menuUnder(t, opts.map(([id, label]) => ({
        id, label, checked: SYS[k] === id,
        run: () => { SYS[k] = id; Set2.applyChrome(); this.render(w); },
      })));
    });
    on(body, 'click', '[data-wp]', (e, t) => {
      Wall.set(t.dataset.wp);
      $$('[data-wp]', body).forEach(x => x.classList.toggle('on', x === t));
    });
    on(body, 'click', '[data-net]', (e, t) => { SYS.wifiName = t.dataset.net; MenuBar.paintStatus(); this.render(w); });
    const dockSize = body.querySelector('[data-slider="dsize"]');
    if (dockSize) Slider(dockSize, (SYS.dockSize - 34) / 44, v => { SYS.dockSize = Math.round(34 + v * 44); Dock.measure(); Set2.dockPreview(body); });
    const dockMag = body.querySelector('[data-slider="dmag"]');
    if (dockMag) Slider(dockMag, (SYS.dockMag - 1) / 0.9, v => { SYS.dockMag = 1 + v * 0.9; SYS.dockMagOn = true; const sw = body.querySelector('[data-k="mag"]'); if (sw) sw.classList.add('on'); });
    const vol = body.querySelector('[data-slider="svol"]');
    if (vol) Slider(vol, SYS.volume, v => { SYS.volume = v; SYS.muted = v === 0; Bus.emit('volume', v); MenuBar.paintStatus(); });
    const bri = body.querySelector('[data-slider="sbri"]');
    if (bri) Slider(bri, Screen.brightness, v => Screen.setBrightness(v));
  },
  dockPreview(body) {
    const p = body.querySelector('[data-dockprev]');
    if (p) p.style.setProperty('--s', SYS.dockSize + 'px');
  },
  /* Sidebar icon size and scroll-bar policy are global, so they ride on the root as
     data attributes rather than being re-applied window by window. */
  applyChrome() {
    const d = document.documentElement.dataset;
    d.sbIcons = SYS.sidebarIcons;
    d.bars = SYS.scrollbars;
  },

  group: (label, rows) => \`\${label ? \`<div class="st-label">\${label}</div>\` : ''}<div class="st-group">\${rows}</div>\`,
  row: (lb, rt, hint) => \`<div class="st-item"><div class="lb">\${lb}\${hint ? \`<div class="hint">\${hint}</div>\` : ''}</div><div class="rt">\${rt}</div></div>\`,
  sw: (k, on) => \`<div class="sw\${on ? ' on' : ''}" data-k="\${k}"></div>\`,
  slider: (k, extra = '') => \`<div class="sl" data-slider="\${k}" style="max-width:220px;\${extra}"><div class="trk"><div class="fil"></div></div><div class="kn"></div></div>\`,

  panes: {
    appearance(s) {
      const G = Set2.group, R = Set2.row;
      const swatch = (mode) => {
        const light = mode !== 'dark';
        return \`<div class="sw2" style="background:\${light ? 'linear-gradient(160deg,#a8d8ea,#3a91b8)' : 'linear-gradient(160deg,#243b55,#0d1b2a)'}">
          <div class="bar" style="background:\${light ? 'rgba(255,255,255,.62)' : 'rgba(30,30,32,.7)'}"></div>
          <div class="wn" style="background:\${light ? '#fff' : '#2c2c2e'};box-shadow:0 2px 6px rgba(0,0,0,.25)"></div>
          <div class="dk" style="background:\${light ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.16)'}"></div></div>\`;
      };
      const A = Theme.ACCENTS;
      const dot = (key) => {
        const a = A[key], on = SYS.accent === key;
        const bg = key === 'multi'
          ? 'conic-gradient(from 210deg,#ff375f,#ff9f0a,#ffd60a,#30d158,#0a84ff,#bf5af2,#ff375f)'
          : (SYS.theme === 'dark' ? (a.dark || a.hex) : a.hex);
        return \`<span class="acc\${on ? ' on' : ''}" data-accent="\${key}" title="\${esc(a.name)}" style="background:\${bg}"></span>\`;
      };
      const hi = (key) => {
        const a = A[key], on = SYS.highlight === key;
        const bg = key === 'accent' ? 'var(--blue)' : (SYS.theme === 'dark' ? (a.dark || a.hex) : a.hex);
        return \`<span class="acc\${on ? ' on' : ''}" data-hilite="\${key}" title="\${key === 'accent' ? 'Accent Colour' : esc(a.name)}" style="background:\${bg}"></span>\`;
      };
      const SIZES = { small: 'Small', medium: 'Medium', large: 'Large' };
      const BARS = { auto: 'Automatically', scrolling: 'When scrolling', always: 'Always' };
      return G('', \`<div class="st-appear">
          <div class="opt\${SYS.appearance === 'light' ? ' on' : ''}" data-appear="light">\${swatch('light')}<span>Light</span></div>
          <div class="opt\${SYS.appearance === 'dark' ? ' on' : ''}" data-appear="dark">\${swatch('dark')}<span>Dark</span></div>
          <div class="opt\${SYS.appearance === 'auto' ? ' on' : ''}" data-appear="auto"><div class="sw2" style="background:linear-gradient(110deg,#a8d8ea 0 50%,#243b55 50% 100%)">
            <div class="bar" style="background:linear-gradient(110deg,rgba(255,255,255,.62) 0 50%,rgba(30,30,32,.7) 50%)"></div>
            <div class="wn" style="background:linear-gradient(110deg,#fff 0 50%,#2c2c2e 50%)"></div></div><span>Auto</span></div>
        </div>\`) +
        /* Multicolour, Blue, Purple, Pink, Red, Orange, Yellow, Green, Graphite —
           the order System Settings actually lists them in. */
        G('', R('Accent colour', \`<div class="accs">\${Object.keys(A).map(dot).join('')}</div>\`) +
          R('Highlight colour', \`<div class="accs">\${['accent', ...Object.keys(A).slice(1)].map(hi).join('')}</div>\`) +
          R('Sidebar icon size', \`<button class="btn" data-pick="sidebarIcons">\${SIZES[SYS.sidebarIcons]} \${ic('g-chev-d')}</button>\`) +
          R('Allow wallpaper tinting', Set2.sw('tint', true)) +
          R('Show scroll bars', \`<button class="btn" data-pick="scrollbars">\${BARS[SYS.scrollbars]} \${ic('g-chev-d')}</button>\`)) +
        \`<div class="hint" style="margin:-8px 0 0 4px">\${SYS.appearance === 'auto'
          ? 'Auto switches between light and dark as the day goes by.'
          : 'Accent colour applies to buttons, controls and selections.'}</div>\`;
    },
    wallpaper() {
      return Set2.group('Desktop picture', \`<div class="wp-grid">\${Object.entries(WALLPAPERS).map(([k, v]) =>
        \`<div class="wp\${SYS.wallpaper === k ? ' on' : ''}" data-wp="\${k}" style="background-image:url('\${v.url.replace('w=3200', 'w=420')}')"><span>\${esc(v.name)}</span></div>\`).join('')}</div>\`) +
        Set2.group('', Set2.row('Show on all Spaces', Set2.sw('spaces', true)) + Set2.row('Add wallpaper to Photos', Set2.sw('addp', false)));
    },
    dock() {
      const G = Set2.group, R = Set2.row;
      return G('Dock', R('Size', \`<span style="font-size:11px;color:var(--txt-2)">Small</span>\${Set2.slider('dsize')}<span style="font-size:11px;color:var(--txt-2)">Large</span>\`) +
        R('Magnification', \`<span style="font-size:11px;color:var(--txt-2)">Off</span>\${Set2.slider('dmag')}<span style="font-size:11px;color:var(--txt-2)">Large</span>\`) +
        R('Enable magnification', Set2.sw('mag', SYS.dockMagOn)) +
        R('Position on screen', \`<button class="btn">Bottom \${ic('g-chev-d')}</button>\`) +
        R('Minimise using', \`<button class="btn">Genie Effect \${ic('g-chev-d')}</button>\`) +
        R('Animate opening apps', Set2.sw('anim', true)) +
        R('Show indicators for open applications', Set2.sw('ind', true))) +
        G('Desktop & Stage Manager', R('Show items', \`<span style="font-size:12px;color:var(--txt-2)">On Desktop</span>\${Set2.sw('items', true)}\`) +
          R('Click wallpaper to reveal desktop', \`<button class="btn">Only in Stage Manager \${ic('g-chev-d')}</button>\`)) +
        G('Windows', R('Tiled windows have margins', Set2.sw('marg', true)) +
          R('Drag windows to screen edges to tile', Set2.sw('tile', true)));
    },
    sound() {
      const G = Set2.group, R = Set2.row;
      return G('Output & Input', R('Output volume', \`\${ic('g-vol-lo')}\${Set2.slider('svol')}\${ic('g-vol-hi')}\`) +
        R('Mute', Set2.sw('mute', SYS.muted)) +
        R('Show Sound in menu bar', \`<button class="btn">Always \${ic('g-chev-d')}</button>\`)) +
        G('Sound Effects', R('Alert sound', \`<button class="btn">Boop \${ic('g-chev-d')}</button>\`) +
          R('Play sound on startup', Set2.sw('boot', true)) +
          R('Play user-interface sound effects', Set2.sw('ui', true))) +
        G('Output device', \`<div class="st-item"><div class="lb" style="min-width:0;flex:1">MacBook Pro Speakers<div class="hint">Built‑in · 6 speakers</div></div><div class="rt" style="color:var(--blue)">\${ic('g-check')}</div></div>
        <div class="st-item"><div class="lb" style="min-width:0;flex:1">AirPods Pro<div class="hint">Bluetooth</div></div></div>\`);
    },
    wifi() {
      const G = Set2.group, R = Set2.row;
      return G('', R('Wi‑Fi', Set2.sw('wifi', SYS.wifi))) +
        G('Known Network', \`<div class="st-item"><div class="lb" style="min-width:0;flex:1">\${esc(SYS.wifiName)}<div class="hint">Connected · 1.2 Gbps</div></div><div class="rt">\${ic('g-lock')}\${wifiBars(3)}<button class="btn">Details…</button></div></div>\`) +
        G('Other Networks', NETWORKS.filter(n => n.n !== SYS.wifiName).map(n =>
          \`<div class="st-item" data-net="\${esc(n.n)}"><div class="lb" style="min-width:0;flex:1">\${esc(n.n)}</div><div class="rt">\${n.lock ? ic('g-lock') : ''}\${wifiBars(n.s)}</div></div>\`).join(''));
    },
    bluetooth() {
      const G = Set2.group, R = Set2.row;
      return G('', R('Bluetooth', Set2.sw('bt', SYS.bluetooth))) +
        G('My Devices', [['AirPods Pro', 'Connected'], ['Magic Keyboard', 'Connected'], ['Magic Trackpad', 'Connected · 92%'], ['Sony WH‑1000XM5', 'Not Connected']].map(([n, s]) =>
          \`<div class="st-item"><div class="lb" style="min-width:0;flex:1">\${n}<div class="hint">\${s}</div></div><div class="rt"><button class="btn">\${s === 'Not Connected' ? 'Connect' : 'Disconnect'}</button></div></div>\`).join(''));
    },
    network() {
      const G = Set2.group;
      return G('', [['Wi‑Fi', SYS.wifiName, '#30d158'], ['Thunderbolt Bridge', 'Not Connected', '#8e8e93'], ['VPN — Home', 'Not Connected', '#8e8e93']].map(([n, s, c]) =>
        \`<div class="st-item"><span style="width:9px;height:9px;border-radius:50%;background:\${c};flex:none"></span><div class="lb" style="min-width:0;flex:1">\${n}<div class="hint">\${s}</div></div><div class="rt">\${ic('g-chev-r')}</div></div>\`).join('')) +
        G('', Set2.row('Firewall', \`<span style="font-size:12px;color:var(--txt-2)">On</span>\${ic('g-chev-r')}\`));
    },
    general() {
      const G = Set2.group, R = Set2.row;
      return G('', [['About', 'g-gear'], ['Software Update', 'g-download'], ['Storage', 'g-hd'], ['AirDrop & Handoff', 'g-airdrop'], ['Login Items & Extensions', 'g-apps'], ['Language & Region', 'g-globe'], ['Date & Time', 'g-clock-a'], ['Sharing', 'g-share'], ['Time Machine', 'g-clock-a']]
        .map(([n, i]) => \`<div class="st-item"><span class="bg" style="width:20px;height:20px;border-radius:5px;background:#8e8e93;color:#fff;display:grid;place-items:center">\${ic(i)}</span><div class="lb" style="min-width:0;flex:1">\${n}</div><div class="rt">\${ic('g-chev-r')}</div></div>\`).join('')) +
        G('This Mac', \`<div class="st-item"><div class="lb" style="min-width:0;flex:1">MacBook Pro 16″ · Apple M4 Max · 128 GB<div class="hint">macOS Tahoe 26.0 (26A5240b) — up to date</div></div><div class="rt"><button class="btn pri">More Info…</button></div></div>\`);
    },
    displays() {
      const G = Set2.group, R = Set2.row;
      return G('Built‑in Liquid Retina XDR Display', R('Brightness', \`\${ic('g-sun')}\${Set2.slider('sbri')}\`) +
        R('Automatically adjust brightness', Set2.sw('autob', true)) +
        R('True Tone', Set2.sw('tt', true)) +
        R('Refresh rate', \`<button class="btn">ProMotion (120 Hz) \${ic('g-chev-d')}</button>\`) +
        R('Resolution', \`<button class="btn">\${innerWidth} × \${innerHeight} (Default) \${ic('g-chev-d')}</button>\`)) +
        G('Colour', R('Colour profile', \`<button class="btn">Apple XDR Display (P3‑1600 nits) \${ic('g-chev-d')}</button>\`) +
          R('Night Shift', \`<span style="font-size:12px;color:var(--txt-2)">Off</span>\${ic('g-chev-r')}\`));
    },
    battery() {
      const G = Set2.group, R = Set2.row;
      const mins = Math.round(SYS.battery / 100 * 11.4 * 60);
      return G('', \`<div class="st-item"><div class="lb" style="min-width:0;flex:1"><b style="font-size:22px;font-weight:500">\${SYS.battery}%</b>
        <div class="hint">\${SYS.charging ? 'Charging' : \`\${Math.floor(mins / 60)} hr \${mins % 60} min remaining\`}</div></div>
        <div class="rt" style="transform:scale(1.6);transform-origin:right center">\${battSVG(SYS.battery, SYS.charging)}</div></div>\`) +
        G('Battery Health', R('Condition', \`<span style="font-size:12px;color:var(--txt-2)">Normal</span>\${ic('g-chev-r')}\`) +
          R('Maximum capacity', \`<span style="font-size:12px;color:var(--txt-2)">98%</span>\`) +
          R('Cycle count', \`<span style="font-size:12px;color:var(--txt-2)">142</span>\`)) +
        G('Options', R('Low Power Mode', \`<button class="btn">Never \${ic('g-chev-d')}</button>\`) +
          R('Optimised battery charging', Set2.sw('obc', true)));
    },
    privacy() {
      const G = Set2.group;
      return G('', [['Location Services', 'g-network', '#0a84ff'], ['Contacts', 'g-hand', '#ff9f0a'], ['Calendars', 'g-clock-a', '#ff375f'], ['Photos', 'g-gallery', '#bf5af2'], ['Camera', 'g-display', '#8e8e93'], ['Microphone', 'g-vol-hi', '#ff375f'], ['Screen & System Audio Recording', 'g-display', '#8e8e93'], ['Full Disk Access', 'g-hd', '#8e8e93'], ['FileVault', 'g-lock', '#30d158']]
        .map(([n, i, c]) => \`<div class="st-item"><span class="bg" style="width:20px;height:20px;border-radius:5px;background:\${c};color:#fff;display:grid;place-items:center">\${ic(i)}</span><div class="lb" style="min-width:0;flex:1">\${n}</div><div class="rt">\${ic('g-chev-r')}</div></div>\`).join('')) +
        G('', Set2.row('Allow applications from', \`<button class="btn">App Store & known developers \${ic('g-chev-d')}</button>\`));
    },
    _(s) { return Set2.group('', Set2.row(s.name, \`<span style="font-size:12px;color:var(--txt-2)">Nothing to configure</span>\`)); }
  }
};
`);
