import { restoreRuntimeSource } from './runtime-source';

export const SCRIPT_11_APPS5 = restoreRuntimeSource(String.raw`
/* ============================================================================
   20 · GENERATED "PHOTOS"  (used by Photos, Mail, TV, Books…)
   ========================================================================== */
const PAL = [
  ['#0f2b4a', '#2d7ea8', '#9fdcef', '#ffd9a0'], ['#1b1030', '#5b2a7a', '#c65fa0', '#ffd1a9'],
  ['#0a2f22', '#2f7a4f', '#98d17f', '#f3f0c8'], ['#2b1408', '#8a4a1e', '#e0913f', '#ffe1b0'],
  ['#101418', '#3a4652', '#8b9aa8', '#dfe6ec'], ['#25082a', '#7a1c58', '#e0417f', '#ffd0e0'],
  ['#04202b', '#0a6f7a', '#57ccbf', '#e8fbf5'], ['#301a04', '#a05a12', '#f0a83c', '#fff0cf'],
];
function photoArt(i, kindOverride) {
  /* One 32-bit scramble drives palette, composition and the small variations, so
     a wall of forty-eight of these doesn't visibly repeat every eighth cell. */
  let h = Math.imul(i + 1, 2654435761) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13;
  const t = (sh, n) => ((h >>> sh) & 255) / 255 * n;      // jitter tap in 0..n
  const p = PAL[(h >>> 3) % PAL.length];
  const kind = kindOverride ?? (h >>> 11) % 5;
  const id = 'ph' + i + '_' + (kindOverride ?? 'x');
  const sun = (x, y, r, o = .9) => \`<circle cx="\${x}" cy="\${y}" r="\${r}" fill="\${p[3]}" opacity="\${o}"/>\`;
  const body = [
    /* ridgeline */
    \`<rect width="100" height="100" fill="url(#\${id})"/>\${sun(58 + t(2, 30), 20 + t(5, 14), 8 + t(9, 5))}
     <path d="M0 \${70 + t(6, 8)} \${20 + t(7, 12)} \${46 + t(4, 10)}l18 16 20-24 38 30v34H0z" fill="\${p[0]}" opacity=".55"/>
     <path d="M0 84 \${26 + t(8, 12)} \${62 + t(3, 10)}l22 14 26-16 22 14v30H0z" fill="\${p[0]}"/>\`,
    /* rolling hills */
    \`<rect width="100" height="100" fill="url(#\${id})"/>\${sun(18 + t(4, 26), 18 + t(6, 12), 7 + t(2, 4), .85)}
     <path d="M0 \${58 + t(5, 8)}c16 0 16-10 32-10s16 10 32 10 16-10 36-10v50H0z" fill="\${p[0]}" opacity=".45"/>
     <path d="M0 \${72 + t(7, 6)}c16 0 16-8 32-8s16 8 32 8 16-8 36-8v40H0z" fill="\${p[0]}"/>\`,
    /* bokeh */
    \`<rect width="100" height="100" fill="\${p[0]}"/>
     <circle cx="\${42 + t(3, 16)}" cy="\${42 + t(6, 16)}" r="\${28 + t(9, 10)}" fill="url(#\${id})" opacity=".92"/>
     <circle cx="\${42 + t(3, 16)}" cy="\${42 + t(6, 16)}" r="\${14 + t(4, 8)}" fill="\${p[3]}" opacity=".3"/>
     \${sun(42 + t(3, 16), 42 + t(6, 16), 6 + t(8, 4))}\`,
    /* skyline */
    \`<rect width="100" height="100" fill="url(#\${id})"/>
     <g fill="\${p[0]}" opacity=".85">\${[...Array(7)].map((_, k) =>
      \`<rect x="\${2 + k * 14.6}" y="\${100 - (22 + t(k * 3 + 1, 46))}" width="\${9 + t(k * 2, 4)}" height="\${22 + t(k * 3 + 1, 46)}"/>\`).join('')}</g>
     \${sun(70 + t(5, 22), 16 + t(7, 12), 7 + t(2, 4))}\`,
    /* still water, with the sun broken up on the surface */
    \`<rect width="100" height="100" fill="url(#\${id})"/>
     \${sun(30 + t(4, 40), 26 + t(6, 10), 8 + t(3, 4))}
     <rect y="\${58 + t(8, 8)}" width="100" height="50" fill="\${p[1]}" opacity=".55"/>
     <g fill="\${p[3]}" opacity=".5">\${[...Array(5)].map((_, k) =>
      \`<rect x="\${24 + t(4, 40) - (5 + k * 1.6)}" y="\${64 + t(8, 8) + k * 6}" width="\${12 + k * 4}" height="2.4" rx="1.2"/>\`).join('')}</g>
     <path d="M0 \${74 + t(9, 10)}h100v40H0z" fill="\${p[0]}" opacity=".8"/>\`,
  ][kind];
  return \`<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" style="width:100%;height:100%"><defs>\` +
    \`<linearGradient id="\${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="\${p[1]}"/>\` +
    \`<stop offset=".55" stop-color="\${p[2]}"/><stop offset="1" stop-color="\${p[3]}"/></linearGradient></defs>\${body}</svg>\`;
}

/* ============================================================================
   21 · MAIL
   ========================================================================== */
const MAILS = [
  { f: 'Figma', s: 'Daniel left 3 comments on Desktop v4', p: 'Tray blur reads heavy at 62px — can we try 44 and put them side by side?', t: '4:21 PM', c: '#a259ff', unread: true, flag: true },
  { f: 'Vercel', s: 'Your deployment is live', p: 'desktop-web is ready. Build finished in 0s — there was nothing to build.', t: '3:58 PM', c: '#1d1d1f', unread: true },
  { f: 'Linear', s: 'ENG-412 moved to In Review', p: 'Shadow repaint during minimise: 12 dropped frames down to 0. Needs your sign-off.', t: '1:12 PM', c: '#5e6ad2' },
  { f: 'GitHub', s: '[workspace/desktop] PR #142 review requested', p: 'Column view: preview pane sizing. 4 files changed, +218 −31.', t: '11:04 AM', c: '#24292f' },
  { f: 'Anna Haro', s: 'Re: dock easing', p: 'The cosine falloff is right, but shorten the settle. Under 300ms or it reads as lag.', t: 'Yesterday', c: '#bf5af2' },
  { f: 'Apple Developer', s: 'macOS Tahoe 26 beta 4 is available', p: 'Liquid Glass refinements, Spotlight actions, and 42 resolved issues.', t: 'Yesterday', c: '#1d1d1f' },
  { f: 'Mom', s: 'call me when free', p: 'and eat something that is not coffee', t: 'Saturday', c: '#ff375f', flag: true },
];
APPS.mail = {
  name: 'Mail', icon: 'app-mail', w: 1020, h: 640, minW: 620, minH: 380,
  menus: () => stdMenus('mail'),
  mount(w) {
    w.st = { sel: 0, box: 'Inbox' };
    const boxes = [['Inbox', 'g-download', 2], ['VIP', 'g-star', ''], ['Flagged', 'g-tag', 2], ['Drafts', 'g-title', 1], ['Sent', 'g-share', ''], ['Junk', 'g-trash-glyph', ''], ['Trash', 'g-trash-glyph', '']];
    return \`<div class="wb">
      <div class="sbar" data-drag style="width:196px"><div class="sb-top"><div data-tl></div></div>
        <div class="grp"><div class="gh">Mailboxes</div>
        \${boxes.map(([n, i, c]) => \`<div class="si" data-box="\${n}">\${ic(i === 'g-trash-glyph' ? 'g-tag' : i, 'ico')}<span class="nm">\${n}</span>\${c ? \`<span class="tail">\${c}</span>\` : ''}</div>\`).join('')}
        </div>
        <div class="grp"><div class="gh">Smart Mailboxes</div>
          <div class="si">\${ic('g-star', 'ico')}<span class="nm">Today</span></div>
          <div class="si">\${ic('g-tag', 'ico')}<span class="nm">Attachments</span></div></div>
      </div>
      <div class="fx">
        <div class="fx-tb" data-drag>
          <button class="tbtn" data-nodrag data-mcompose title="New Message">\${ic('g-plus')}</button>
          <button class="tbtn" data-nodrag data-mflag title="Flag">\${ic('g-tag')}</button>
          <button class="tbtn" data-nodrag data-mshare title="Share">\${ic('g-share')}</button>
          <div class="fx-title" data-mbtitle>Inbox</div>
          <div class="grow" style="flex:1"></div>
          <div class="sfield" data-nodrag style="width:170px"><span>\${ic('g-search')}</span><input placeholder="Search"></div>
        </div>
        <div class="wb" style="flex:1;min-height:0">
          <div class="msg-list scroll" data-mlist style="width:344px"></div>
          <div class="pv scroll" data-mread style="place-items:start stretch;padding:0;background:var(--win)"></div>
        </div>
      </div></div>\`;
  },
  ready(w) {
    const render = () => {
      w.node.querySelector('[data-mbtitle]').textContent = w.st.box;
      const list = w.st.box === 'Flagged' ? MAILS.filter(m => m.flag) : MAILS;
      $$('[data-box]', w.node).forEach(b => b.classList.toggle('on', b.dataset.box === w.st.box));
      w.node.querySelector('[data-mlist]').innerHTML = list.map((m, i) => \`
        <div class="msg-c\${i === w.st.sel ? ' on' : ''}" data-mi="\${i}">
          <span class="av" style="background:\${m.c}">\${esc(m.f[0])}</span>
          <span class="bd"><b>\${m.unread ? '<span style="color:var(--blue)">●</span> ' : ''}\${esc(m.f)}</b>
            <b style="font-weight:500;font-size:12px">\${esc(m.s)}</b><p>\${esc(m.p)}</p></span>
          <span class="tm">\${esc(m.t)}</span></div>\`).join('');
      const m = list[w.st.sel] || list[0];
      w.node.querySelector('[data-mread]').innerHTML = m ? \`<div style="padding:24px 30px;max-width:640px">
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:18px">
          <span class="av" style="width:42px;height:42px;border-radius:50%;background:\${m.c};display:grid;place-items:center;color:#fff;font-weight:600;font-size:16px">\${esc(m.f[0])}</span>
          <div><div style="font-size:14px;font-weight:600">\${esc(m.f)}</div><div style="font-size:11.5px;color:var(--txt-2)">To: Prasenjit · \${esc(m.t)}</div></div></div>
        <h2 style="margin:0 0 14px;font-size:19px;font-weight:600;letter-spacing:-.02em">\${esc(m.s)}</h2>
        <p style="font-size:13.5px;line-height:1.6;color:var(--txt)">\${esc(m.p)}</p>
        <p style="font-size:13.5px;line-height:1.6;color:var(--txt-2)">Sent from a Mac that only exists as markup.</p>
      </div>\` : '';
    };
    on(w.node, 'click', '[data-mi]', (e, t) => { w.st.sel = +t.dataset.mi; MAILS[w.st.sel].unread = false; render(); });
    on(w.node, 'click', '[data-box]', (e, t) => { w.st.box = t.dataset.box; w.st.sel = 0; render(); });
    on(w.node, 'click', '[data-mcompose]', () => Mail.compose());
    on(w.node, 'click', '[data-mflag]', () => {
      const list = w.st.box === 'Flagged' ? MAILS.filter(m => m.flag) : MAILS;
      const m = list[w.st.sel] || list[0];
      if (!m) return;
      m.flag = !m.flag;
      Toast(m.flag ? 'Flagged' : 'Flag removed');
      render();
    });
    on(w.node, 'click', '[data-mshare]', (e, t) => {
      const list = w.st.box === 'Flagged' ? MAILS.filter(m => m.flag) : MAILS;
      const m = list[w.st.sel] || list[0];
      menuUnder(t, [
        { id: 'r', label: 'Reply', run: () => Mail.compose('Re: ' + (m ? m.s : ''), m ? m.f : '') },
        { id: 'f', label: 'Forward', run: () => Mail.compose('Fwd: ' + (m ? m.s : '')) }, '-',
        { id: 'c', label: 'Copy Link', run: () => Toast('Link copied') },
        { id: 'p', label: 'Print…', run: () => Toast('Sent to printer') }]);
    });
    render();
  }
};

/* A compose sheet, because a mail app whose New Message button only toasts is a
   mail app with a dead button. */
const Mail = {
  compose(subject = '', to = '') {
    const node = el(\`<div class="pop" style="padding:0;width:min(600px,84vw);border-radius:12px;overflow:hidden">
      <div class="fx-tb" style="height:46px;padding:0 12px;gap:8px;border-bottom:.5px solid var(--line)">
        <div class="fx-title" style="position:static;flex:1;text-align:left">New Message</div>
        <button class="btn" data-cancel style="height:22px">Cancel</button>
        <button class="btn pri" data-send style="height:22px">Send</button>
      </div>
      <div style="padding:0 14px">
        \${[['To', to], ['Subject', subject]].map(([l, v]) => \`<div style="display:flex;align-items:center;gap:8px;height:34px;border-bottom:.5px solid var(--line)">
          <span style="width:54px;font-size:12px;color:var(--txt-2)">\${l}:</span>
          <input data-f="\${l}" value="\${esc(v)}" style="flex:1;border:0;background:none;font-size:13px;outline:none;color:var(--txt)"></div>\`).join('')}
      </div>
      <div contenteditable="true" data-body style="min-height:180px;padding:14px;font-size:13.5px;line-height:1.6;outline:none"></div></div>\`);
    Pop.open(node, { x: innerWidth / 2 - 300, y: 96, origin: 'top center' });
    setTimeout(() => node.querySelector(subject ? '[data-body]' : '[data-f="To"]').focus(), 60);
    node.querySelector('[data-cancel]').onclick = () => Pop.close();
    node.querySelector('[data-send]').onclick = () => {
      const to = node.querySelector('[data-f="To"]').value.trim();
      Pop.close();
      Toast(to ? 'Message sent to ' + to : 'Message sent');
    };
  },
};

/* ============================================================================
   22 · MESSAGES
   ========================================================================== */
const CHATS = [
  {
    n: 'Kate', c: '#64d2ff', t: '4:28 PM', msgs: [
      ['them', 'lake trip still on for saturday?'], ['them', 'weather says clear all weekend'],
      ['me', 'yes. leaving at 6 so we get the light'], ['them', 'six in the morning is a threat'],
      ['me', 'bring coffee then'], ['them', 'bringing coffee AND a blanket, i know how you drive'],
    ]
  },
  {
    n: 'John', c: '#30d158', t: '2:14 PM', msgs: [
      ['them', 'did the review land'], ['me', 'merged an hour ago'],
      ['them', 'legend. the animation on the sidebar is so smooth now'],
      ['me', 'took four tries to get the easing right'], ['them', 'it shows, in a good way'],
    ]
  },
  {
    n: 'Design Crew', c: '#bf5af2', t: '11:40 AM', group: true, msgs: [
      ['them', 'Daniel: shadows on the unfocused windows are too heavy'],
      ['me', 'fixed — dropped the two outer layers'],
      ['them', 'Daniel: much better, they sit back now'],
      ['them', 'Freda: can we get the same treatment on the sheets?'],
      ['me', 'already in, refresh'], ['them', 'Freda: 🤝'],
    ]
  },
  {
    n: 'David', c: '#ff9f0a', t: '10:02 AM', msgs: [
      ['them', 'are you coming to the thing on friday'], ['me', 'what thing'],
      ['them', 'the thing i told you about twice'], ['me', 'the rooftop one?'],
      ['them', 'yes. 8pm. do not be fashionably late'], ['me', "i'll be unfashionably early"],
    ]
  },
  {
    n: 'Anna', c: '#0a84ff', t: '9:15 AM', msgs: [
      ['them', 'random but your site loads absurdly fast'], ['me', 'no framework, no fonts to wait on'],
      ['them', 'i keep forgetting that is allowed'],
    ]
  },
  {
    n: 'Chris', c: '#ff2d55', t: 'Yesterday', msgs: [
      ['them', 'sending you the playlist for the drive'], ['them', '4 hours, no repeats'],
      ['me', 'if there is a single sad song i am turning around'], ['them', 'no promises'],
    ]
  },
  {
    n: 'Hank', c: '#5e5ce6', t: 'Yesterday', msgs: [
      ['them', 'coffee thursday?'], ['me', 'the place with the bad chairs?'],
      ['them', 'the place with the good espresso and the bad chairs, yes'], ['me', 'deal'],
    ]
  },
  {
    n: 'Daniel', c: '#ffd60a', t: 'Sunday', msgs: [
      ['them', 'sent you the moodboard'], ['me', 'the third row is the one'],
      ['them', 'knew you would say that'],
    ]
  },
  {
    n: 'Freda', c: '#a2845e', t: 'Saturday', msgs: [
      ['them', 'did you get the keys back from the landlord'], ['me', 'picking them up tomorrow'],
      ['them', 'text me when you do'],
    ]
  },
  { n: 'Mom', c: '#ff375f', t: 'Friday', msgs: [['them', 'did you eat'], ['me', 'yes'], ['them', 'coffee is not food'], ['me', 'it has water in it'], ['them', 'call me tonight']] },
];
APPS.messages = {
  name: 'Messages', icon: 'app-messages', w: 900, h: 600, minW: 560, minH: 360,
  menus: () => stdMenus('messages'),
  mount(w) {
    w.st = { sel: 0, chats: CHATS.map(c => ({ ...c, msgs: c.msgs.map(m => m.slice()) })) };
    return \`<div class="wb"><div class="msg">
      <div class="msg-list scroll" data-drag style="padding-top:0">
        <div style="display:flex;align-items:center;height:38px;padding:0 4px 0 2px">
          <div data-tl></div><div style="flex:1"></div>
          <button class="tbtn" data-nodrag data-cnew title="New Message">\${ic('g-compose')}</button>
        </div>
        <div style="padding:0 2px 8px"><div class="sfield" data-nodrag><span>\${ic('g-search')}</span><input placeholder="Search" data-csearch></div></div>
        <div data-clist></div>
      </div>
      <div class="msg-th">
        <div class="msg-hd" data-drag>
          <span class="who" data-cdetails><span class="av sm" data-cav></span><span data-cname></span>\${ic('g-chev-r')}</span>
          <div style="flex:1"></div>
          <button class="tbtn" data-nodrag data-cft title="FaceTime">\${ic('g-facetime')}</button>
          <button class="tbtn" data-nodrag data-cinfo title="Details">\${ic('g-info')}</button>
        </div>
        <div class="msg-body scroll" data-cbody></div>
        <div class="msg-comp"><button class="tbtn" data-cattach title="Apps">\${ic('g-plus')}</button>
          <div class="fld"><input placeholder="iMessage" data-cinput></div>
          <button class="tbtn" data-send>\${ic('g-chev-u')}</button></div>
      </div></div></div>\`;
  },
  ready(w) {
    const render = () => {
      const st = w.st;
      const q = (st.q || '').toLowerCase();
      const hit = c => !q || c.n.toLowerCase().includes(q) || c.msgs.some(m => m[1].toLowerCase().includes(q));
      w.node.querySelector('[data-clist]').innerHTML = st.chats.map((c, i) => hit(c) ? \`
        <div class="msg-c\${i === st.sel ? ' on' : ''}" data-ci="\${i}">
          <span class="av" style="background:\${c.c}">\${esc(c.n[0])}</span>
          <span class="bd"><b>\${esc(c.n)}</b><p>\${esc(c.msgs[c.msgs.length - 1][1])}</p></span>
          <span class="tm">\${esc(c.t)}</span></div>\` : '').join('') ||
        \`<div style="padding:22px 10px;text-align:center;font-size:12px;color:var(--txt-3)">No Results</div>\`;
      const c = st.chats[st.sel];
      w.node.querySelector('[data-cname]').textContent = c.n;
      const av = w.node.querySelector('[data-cav]');
      av.textContent = c.n[0]; av.style.background = c.c;
      const body = w.node.querySelector('[data-cbody]');
      body.innerHTML = \`<div class="msg-day">Today \${time12(new Date()).replace(NBSP, ' ')}</div>\` +
        c.msgs.map((m, i) => {
          const last = i === c.msgs.length - 1 || c.msgs[i + 1][0] !== m[0];
          return \`<div class="bub\${m[0] === 'me' ? ' me' : ''}\${last ? ' tail' : ''}">\${esc(m[1])}</div>\`;
        }).join('');
      body.scrollTop = body.scrollHeight;
    };
    const send = () => {
      const inp = w.node.querySelector('[data-cinput]');
      const v = inp.value.trim(); if (!v) return;
      const c = w.st.chats[w.st.sel];
      c.msgs.push(['me', v]); inp.value = ''; render();
      setTimeout(() => {
        const replies = ['ok that\'s wild', 'send the file', 'how is this one HTML file', 'screenshotting this', 'wait do the windows resize too'];
        c.msgs.push(['them', replies[Math.floor(Math.random() * replies.length)]]); render();
      }, 1100);
    };
    const details = () => {
      const c = w.st.chats[w.st.sel];
      const node = el(\`<div class="pop" style="width:250px;padding:14px;text-align:center">
        <div class="av" style="width:56px;height:56px;border-radius:50%;background:\${c.c};display:grid;place-items:center;
          color:#fff;font-size:22px;font-weight:600;margin:0 auto 8px">\${esc(c.n[0])}</div>
        <div style="font-size:15px;font-weight:600">\${esc(c.n)}</div>
        <div style="font-size:11.5px;color:var(--txt-2);margin-bottom:12px">\${c.group ? c.msgs.length + ' messages · group' : 'iMessage'}</div>
        <div style="display:flex;gap:8px;justify-content:center">
          <button class="btn" data-d="audio" style="flex:1;height:26px">Audio</button>
          <button class="btn" data-d="video" style="flex:1;height:26px">Video</button></div>
        <div style="display:flex;flex-direction:column;gap:1px;margin-top:12px;background:var(--line);border-radius:8px;overflow:hidden">
          \${[['Hide Alerts', 'alerts'], ['Send Read Receipts', 'receipts']].map(([l, k]) =>
        \`<label style="display:flex;align-items:center;justify-content:space-between;gap:8px;background:var(--win-2);padding:7px 10px;font-size:12px">
              \${l}<span class="sw\${w.st[k] ? ' on' : ''}" data-t="\${k}"><i></i></span></label>\`).join('')}
        </div></div>\`);
      Pop.open(node, { x: innerWidth / 2 - 125, y: 120, origin: 'top center' });
      on(node, 'click', '[data-d]', (e, t) => { Pop.close(); WM.open('facetime'); Toast(\`Calling \${c.n}…\`); });
      on(node, 'click', '.sw', (e, t) => { const k = t.dataset.t; w.st[k] = !w.st[k]; t.classList.toggle('on', w.st[k]); });
    };
    on(w.node, 'click', '[data-ci]', (e, t) => { w.st.sel = +t.dataset.ci; render(); });
    on(w.node, 'click', '[data-send]', send);
    on(w.node, 'click', '[data-cinfo]', details);
    on(w.node, 'click', '[data-cdetails]', details);
    on(w.node, 'click', '[data-cft]', () => { WM.open('facetime'); Toast(\`Calling \${w.st.chats[w.st.sel].n}…\`); });
    on(w.node, 'click', '[data-cattach]', (e, t) => menuUnder(t, [
      { id: 'p', label: 'Photos', icon: 'g-gallery', run: () => WM.open('photos') },
      { id: 's', label: 'Stickers', icon: 'g-star', run: () => insert('👍') },
      { id: 'a', label: 'Audio', icon: 'g-vol-hi', run: () => WM.open('voice') }, '-',
      { id: 'f', label: 'Send a File…', run: () => Toast('No files selected') }]));
    /* New Message starts an empty thread at the top of the list, like ⌘N. */
    on(w.node, 'click', '[data-cnew]', () => {
      const name = 'New Message';
      w.st.chats.unshift({ n: name, c: '#8e8e93', t: 'now', msgs: [['them', 'Type a message to begin.']] });
      w.st.sel = 0; w.st.q = ''; w.node.querySelector('[data-csearch]').value = '';
      render();
      w.node.querySelector('[data-cinput]').focus();
    });
    const insert = s => {
      const inp = w.node.querySelector('[data-cinput]');
      inp.value += s; inp.focus();
    };
    w.node.querySelector('[data-csearch]').addEventListener('input', e => { w.st.q = e.target.value; render(); });
    w.node.querySelector('[data-cinput]').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); send(); } });
    render();
  }
};

/* ============================================================================
   23 · MAPS  (real tiles, live geocoding)
   ========================================================================== */
APPS.maps = {
  name: 'Maps', icon: 'app-maps', w: 940, h: 620, minW: 480, minH: 320,
  menus: () => stdMenus('maps', {
    View: [{ id: 'zi', label: 'Zoom In', key: '⌘+', run: () => Maps.zoom(1) },
    { id: 'zo', label: 'Zoom Out', key: '⌘-', run: () => Maps.zoom(-1) }, '-',
    { id: 'home', label: 'Go to Cupertino', run: () => Maps.goto(37.3349, -122.0090, 15, 'Apple Park', '1 Apple Park Way · Cupertino, CA') }],
  }, ['File', 'Edit', 'View', 'Window', 'Help']),
  mount(w) {
    return titlebar('Maps', {
      right: \`<div class="sfield" data-nodrag style="width:210px"><span>\${ic('g-search')}</span>
        <input data-msearch placeholder="Search Maps" spellcheck="false"></div>\`
    }) + \`<div class="maps" data-map>
      <div class="pane" data-pane></div>
      <svg class="pin" viewBox="0 0 26 34"><path fill="#f0453a" d="M13 0a13 13 0 0 0-13 13c0 8.7 13 21 13 21s13-12.3 13-21A13 13 0 0 0 13 0z"/><circle cx="13" cy="12.6" r="4.6" fill="#fff"/></svg>
      <div class="card" data-card></div>
      <div class="zoom"><button data-z="1" title="Zoom In">\${ic('g-plus')}</button><button data-z="-1" title="Zoom Out">\${ic('g-minus')}</button></div>
      <div class="attr">© OpenStreetMap · CARTO</div>
    </div>\`;
  },
  ready(w) { Maps.attach(w); },
  onResize(w) { if (w === Maps.w) Maps.layout(); },
  onClose(w) { if (w === Maps.w) Maps.w = null; },
};

/* A minimal slippy map. Web Mercator, 256px tiles, one transformed pane.
   Tiles come from CARTO's OSM basemaps because their light style is the closest
   free match to Apple Maps — flat, pale, and out of the way of the labels. */
const Maps = {
  w: null, tiles: new Map(), z: 15, lat: 37.3349, lon: -122.0090,
  TILE: 256,

  /* Voyager for light: blue water, green parks, white roads on warm land — the
     closest free raster style to Apple Maps. Dark Matter for the dark theme. */
  style() { return SYS.theme === 'dark' ? 'dark_all' : 'rastertiles/voyager'; },
  url(x, y, z) {
    const sub = 'abcd'[(x + y) % 4];
    return \`https://\${sub}.basemaps.cartocdn.com/\${this.style()}/\${z}/\${x}/\${y}\${devicePixelRatio > 1 ? '@2x' : ''}.png\`;
  },
  /* Mercator, in world pixels at the current zoom. */
  worldX(lon, z) { return (lon + 180) / 360 * this.TILE * (1 << z); },
  worldY(lat, z) {
    const s = Math.sin(clamp(lat, -85.05, 85.05) * Math.PI / 180);
    return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * this.TILE * (1 << z);
  },
  lonAt(x, z) { return x / (this.TILE * (1 << z)) * 360 - 180; },
  latAt(y, z) {
    const n = Math.PI - 2 * Math.PI * y / (this.TILE * (1 << z));
    return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  },

  attach(w) {
    this.w = w;
    this.tiles.clear();
    this.card('Apple Park', '1 Apple Park Way · Cupertino, CA');
    /* One frame later the window has a real size to measure. */
    raf(() => this.layout());
    Bus.on('theme', () => { if (this.w && !this.w.dead) { this.tiles.clear(); this.pane().innerHTML = ''; this.layout(); } });

    const box = w.node.querySelector('[data-map]');
    on(w.node, 'click', '[data-z]', (e, t) => this.zoom(+t.dataset.z));

    box.addEventListener('pointerdown', e => {
      if (e.target.closest('.zoom,.card,.results')) return;
      box.setPointerCapture(e.pointerId);
      const ox = e.clientX, oy = e.clientY;
      const sx = this.worldX(this.lon, this.z), sy = this.worldY(this.lat, this.z);
      let moved = false;
      const mv = ev => {
        const dx = ev.clientX - ox, dy = ev.clientY - oy;
        if (!moved && Math.hypot(dx, dy) < 2) return;
        moved = true;
        this.lon = this.lonAt(sx - dx, this.z);
        this.lat = this.latAt(clamp(sy - dy, 0, this.TILE * (1 << this.z)), this.z);
        this.layout();
      };
      const up = () => {
        box.removeEventListener('pointermove', mv);
        box.removeEventListener('pointerup', up);
        if (moved) this.card('Dropped Pin', \`\${this.lat.toFixed(4)}, \${this.lon.toFixed(4)}\`);
      };
      box.addEventListener('pointermove', mv);
      box.addEventListener('pointerup', up);
    });

    /* Wheel zooms about the cursor, the way every map does. */
    box.addEventListener('wheel', e => {
      e.preventDefault();
      const dir = e.deltaY < 0 ? 1 : -1;
      const r = box.getBoundingClientRect();
      this.zoom(dir, e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2);
    }, { passive: false });

    box.addEventListener('dblclick', e => {
      if (e.target.closest('.zoom,.card,.results')) return;
      const r = box.getBoundingClientRect();
      this.zoom(1, e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2);
    });

    const input = w.node.querySelector('[data-msearch]');
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); this.search(input.value.trim()); }
      if (e.key === 'Escape') { input.value = ''; this.clearResults(); }
    });
  },

  pane() { return this.w && this.w.node.querySelector('[data-pane]'); },

  zoom(dir, ax = 0, ay = 0) {
    if (!this.w) return;
    const nz = clamp(this.z + dir, 2, 19);
    if (nz === this.z) return;
    /* Keep the point under the cursor fixed: convert it to lat/lon first, then
       recentre so it lands in the same place at the new zoom. */
    const px = this.worldX(this.lon, this.z) + ax, py = this.worldY(this.lat, this.z) + ay;
    const alat = this.latAt(py, this.z), alon = this.lonAt(px, this.z);
    this.z = nz;
    this.lon = this.lonAt(this.worldX(alon, nz) - ax, nz);
    this.lat = this.latAt(clamp(this.worldY(alat, nz) - ay, 0, this.TILE * (1 << nz)), nz);
    this.layout();
  },

  goto(lat, lon, z, title, sub) {
    if (!this.w) return;
    this.lat = lat; this.lon = lon; if (z) this.z = clamp(z, 2, 19);
    this.layout();
    if (title) this.card(title, sub || '');
    /* Re-run the pin's drop so the arrival is visible. */
    const pin = this.w.node.querySelector('.pin');
    if (pin) { pin.style.animation = 'none'; raf(() => { pin.style.animation = ''; }); }
  },

  layout() {
    const w = this.w; if (!w || w.dead) return;
    const box = w.node.querySelector('[data-map]'), pane = this.pane();
    if (!box || !pane) return;
    const vw = box.clientWidth, vh = box.clientHeight;
    if (!vw || !vh) return;

    const z = this.z, T = this.TILE, n = 1 << z;
    const cx = this.worldX(this.lon, z), cy = this.worldY(this.lat, z);
    /* Top-left of the viewport in world pixels. */
    const ox = cx - vw / 2, oy = cy - vh / 2;
    /* One tile of margin beyond the viewport, so a drag reveals loaded map
       rather than the backdrop. */
    const x0 = Math.floor(ox / T) - 1, x1 = Math.floor((ox + vw) / T) + 1;
    const y0 = Math.floor(oy / T) - 1, y1 = Math.floor((oy + vh) / T) + 1;

    /* Subpixel offset lives on the pane; whole tiles are placed on the grid. */
    pane.style.transform = \`translate3d(\${-Math.round(ox)}px,\${-Math.round(oy)}px,0)\`;

    const want = new Set();
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      if (y < 0 || y >= n) continue;
      const wx = ((x % n) + n) % n;                    // wrap the globe east–west
      const key = \`\${z}/\${wx}/\${y}/\${x}\`;
      want.add(key);
      if (this.tiles.has(key)) continue;
      const img = new Image();
      img.src = this.url(wx, y, z);
      img.alt = '';
      img.style.left = x * T + 'px';
      img.style.top = y * T + 'px';
      img.addEventListener('load', () => { img.classList.add('in'); this.online(true); });
      img.addEventListener('error', () => { img.remove(); this.tiles.delete(key); this.online(false); });
      pane.append(img);
      this.tiles.set(key, img);
    }
    /* Drop anything that scrolled well out of view, and everything from the
       previous zoom level, so the pane doesn't grow without bound. */
    for (const [key, img] of this.tiles) {
      if (want.has(key)) continue;
      const [tz] = key.split('/');
      const [, , ty, tx] = key.split('/').map(Number);
      if (+tz !== z || tx < x0 - 2 || tx > x1 + 2 || ty < y0 - 2 || ty > y1 + 2) {
        img.remove(); this.tiles.delete(key);
      }
    }
  },

  /* Tiles failing in bulk means no network, which is worth saying once. */
  online(ok) {
    const w = this.w; if (!w || w.dead) return;
    if (ok) { this.fails = 0; const n = w.node.querySelector('.offline'); if (n) n.remove(); return; }
    this.fails = (this.fails || 0) + 1;
    if (this.fails < 4 || w.node.querySelector('.offline')) return;
    w.node.querySelector('[data-map]').append(el(
      \`<div class="offline"><b style="display:block;font-size:13px;color:var(--txt);margin-bottom:2px">Map unavailable</b>
       Tiles come from the network, and there isn't one right now.</div>\`));
  },

  card(title, sub, extra) {
    const w = this.w; if (!w) return;
    const c = w.node.querySelector('[data-card]'); if (!c) return;
    c.innerHTML = \`<h3>\${esc(title)}</h3><p>\${esc(sub)}</p>
      \${extra ? \`<p style="margin-top:6px;color:var(--green)">\${esc(extra)}</p>\` : ''}
      <div class="row"><button class="btn pri" style="flex:1" data-dir>Directions</button>
      <button class="btn" style="flex:1" data-save>Save</button></div>\`;
    on(c, 'click', '[data-dir]', () => Toast(\`Routing to \${title} isn't in this build\`));
    on(c, 'click', '[data-save]', () => Toast(\`\${title} added to Favourites\`));
  },

  clearResults() {
    const w = this.w; if (!w) return;
    const r = w.node.querySelector('.results'); if (r) r.remove();
  },

  /* Nominatim: OpenStreetMap's own geocoder, no key, CORS open. One request per
     Enter press, never per keystroke — their usage policy asks for exactly that. */
  async search(q) {
    if (!q || !this.w) return;
    this.clearResults();
    const box = this.w.node.querySelector('[data-map]');
    const panel = el(\`<div class="results"><div style="padding:9px 10px;font-size:12px;color:var(--txt-2)">Searching…</div></div>\`);
    box.append(panel);
    try {
      const r = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=' +
        encodeURIComponent(q), { headers: { 'Accept': 'application/json' } });
      const list = await r.json();
      if (!this.w || this.w.dead || !panel.isConnected) return;
      if (!list.length) {
        panel.innerHTML = \`<div style="padding:9px 10px;font-size:12px;color:var(--txt-2)">No results for “\${esc(q)}”</div>\`;
        return;
      }
      panel.innerHTML = list.map((h, i) => {
        const name = h.name || h.display_name.split(',')[0];
        return \`<button data-hit="\${i}"><b>\${esc(name)}</b><span>\${esc(h.display_name)}</span></button>\`;
      }).join('');
      on(panel, 'click', '[data-hit]', (e, t) => {
        const h = list[+t.dataset.hit];
        const z = h.boundingbox ? this.zoomForBox(h.boundingbox) : 15;
        this.goto(+h.lat, +h.lon, z, h.name || h.display_name.split(',')[0],
          h.display_name.split(',').slice(1, 4).join(',').trim());
        this.clearResults();
      });
    } catch (e) {
      if (panel.isConnected) panel.innerHTML =
        \`<div style="padding:9px 10px;font-size:12px;color:var(--txt-2)">Search needs a network connection.</div>\`;
    }
  },

  /* Fit the result's bounding box, so a country doesn't land at street zoom. */
  zoomForBox(bb) {
    const [s, n, wl, e] = bb.map(Number);
    const span = Math.max(Math.abs(n - s), Math.abs(e - wl));
    if (span > 20) return 4; if (span > 8) return 6; if (span > 2) return 8;
    if (span > .5) return 11; if (span > .1) return 13; if (span > .02) return 15;
    return 16;
  },
};

/* ============================================================================
   24 · PHOTOS
   ========================================================================== */
/* The library is real photographs — Commons featured pictures, carrying the titles,
   places, dates and photographers they actually came with. \`th\` is a 1000px thumbnail
   URL, and Commons will render any width from it, so tiles ask for what they need. */
const PHOTOS = [
  { t: 'Sydney (AU), Coast, Australian Fur Seals', place: 'Sydney, Australia', by: 'Dietmar Rabich', album: 'Coast', when: '2026-05-11',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Sydney_%28AU%29%2C_Coast%2C_Australian_Fur_Seals_--_2019_--_3489.jpg/500px-Sydney_%28AU%29%2C_Coast%2C_Australian_Fur_Seals_--_2019_--_3489.jpg' },
  { t: 'New York City at night', place: 'New York City', by: 'Paulo Barcellos Jr.', album: 'Cities', when: '2025-03-15',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/New_York_City_at_night_HDR.jpg/500px-New_York_City_at_night_HDR.jpg' },
  { t: 'Northern lights over Mývatn (Iceland)', place: 'Iceland', by: 'Giles Laurent', album: 'Skies', when: '2024-12-14',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/039_Northern_lights_over_M%C3%BDvatn_%28Iceland%29_Photo_by_Giles_Laurent.jpg/500px-039_Northern_lights_over_M%C3%BDvatn_%28Iceland%29_Photo_by_Giles_Laurent.jpg' },
  { t: 'Human looking at the stars during Perseids with th', place: 'Under the Perseids', by: 'Giles Laurent', album: 'Skies', when: '2023-12-14',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/018_Human_looking_at_the_stars_during_Perseids_with_the_Milky_Way_in_the_background_Photo_by_Giles_Laurent.jpg/500px-018_Human_looking_at_the_stars_during_Perseids_with_the_Milky_Way_in_the_background_Photo_by_Giles_Laurent.jpg' },
  { t: 'Étang de Thau and Sète', place: 'Sète, France', by: 'Christian Ferrer', album: 'Coast', when: '2022-01-10',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/%C3%89tang_de_Thau_and_S%C3%A8te.jpg/500px-%C3%89tang_de_Thau_and_S%C3%A8te.jpg' },
  { t: 'Peterborough (AU), Port Campbell National Park, Worm B', place: 'Victoria, Australia', by: 'Dietmar Rabich', album: 'Coast', when: '2021-07-20',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e2/Peterborough_%28AU%29%2C_Port_Campbell_National_Park%2C_Worm_Bay_--_2019_--_0863.jpg/500px-Peterborough_%28AU%29%2C_Port_Campbell_National_Park%2C_Worm_Bay_--_2019_--_0863.jpg' },
  { t: 'Lac de Montriond', place: 'Haute-Savoie, France', by: 'Krzysztof Golik', album: 'Landscapes', when: '2020-06-30',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Lac_de_Montriond_06.jpg/500px-Lac_de_Montriond_06.jpg' },
  { t: 'Gaztelugache, Bermeo', place: 'Bermeo, Basque Country', by: 'Diego Delso', album: 'Coast', when: '2019-08-13',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/64/Gaztelugache%2C_Bermeo%2C_Pa%C3%ADs_Vasco%2C_Espa%C3%B1a%2C_2019-08-13%2C_DD_14.jpg/500px-Gaztelugache%2C_Bermeo%2C_Pa%C3%ADs_Vasco%2C_Espa%C3%B1a%2C_2019-08-13%2C_DD_14.jpg' },
  { t: 'Water reflection of Kinkaku-ji Temple a sunny day, Kyo', place: 'Kyoto, Japan', by: 'Basile Morin', album: 'Travel', when: '2019-08-13',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/Water_reflection_of_Kinkaku-ji_Temple_a_sunny_day%2C_Kyoto%2C_Japan.jpg/500px-Water_reflection_of_Kinkaku-ji_Temple_a_sunny_day%2C_Kyoto%2C_Japan.jpg' },
  { t: 'Sunlight through clouds and view of Ginkaku-ji Temple', place: 'Kyoto, Japan', by: 'Basile Morin', album: 'Travel', when: '2019-06-11',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Sunlight_through_clouds_and_view_of_Ginkaku-ji_Temple_from_above%2C_Kyoto%2C_Japan.jpg/500px-Sunlight_through_clouds_and_view_of_Ginkaku-ji_Temple_from_above%2C_Kyoto%2C_Japan.jpg' },
  { t: 'Bontecou Lake Milky Way panorama', place: 'Hudson Valley, New York', by: 'Juliancolton', album: 'Skies', when: '2018-09-05',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Bontecou_Lake_Milky_Way_panorama.jpg/500px-Bontecou_Lake_Milky_Way_panorama.jpg' },
  { t: 'Lo sbadiglio', place: '', by: 'Alberto Peracchio', album: 'Wildlife', when: '2018-02-25',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/Lo_sbadiglio.jpg/500px-Lo_sbadiglio.jpg' },
  { t: 'Dülmen, Börnste, Waldweg', place: 'Dülmen, Germany', by: 'Dietmar Rabich', album: 'Nature', when: '2017-09-19',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/D%C3%BClmen%2C_B%C3%B6rnste%2C_Waldweg_--_2015_--_4649.jpg/500px-D%C3%BClmen%2C_B%C3%B6rnste%2C_Waldweg_--_2015_--_4649.jpg' },
  { t: 'Québec city at night, view from Lévis city', place: 'Québec City, Canada', by: 'Wilfredor', album: 'Cities', when: '2017-08-26',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f4/Qu%C3%A9bec_city_at_night%2C_view_from_L%C3%A9vis_city.jpg/500px-Qu%C3%A9bec_city_at_night%2C_view_from_L%C3%A9vis_city.jpg' },
  { t: 'Vulpes lagopus in Iceland', place: 'Iceland', by: 'Jonathen Pie https://unsplash.com/@r3dmax', album: 'Wildlife', when: '2017-01-13',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/Vulpes_lagopus_in_Iceland.jpg/500px-Vulpes_lagopus_in_Iceland.jpg' },
  { t: 'Larus occidentalis in flight', place: '', by: 'Frank Schulenburg', album: 'Wildlife', when: '2016-01-25',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ad/Larus_occidentalis_in_flight_%28Bodega_Head%29.jpg/500px-Larus_occidentalis_in_flight_%28Bodega_Head%29.jpg' },
  { t: 'Afternoon at Tennfjorden, Raftsundet', place: 'Lofoten, Norway', by: 'Ximonic (Simo Räsänen)', album: 'Nature', when: '2015-09-21',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/Afternoon_at_Tennfjorden%2C_Raftsundet%2C_Hinn%C3%B8ya%2C_Norway%2C_2015_September_%2802%29.jpg/500px-Afternoon_at_Tennfjorden%2C_Raftsundet%2C_Hinn%C3%B8ya%2C_Norway%2C_2015_September_%2802%29.jpg' },
  { t: 'Hyacinth macaw (Anodorhynchus hyacinthinus) in flight', place: '', by: 'Charles J. Sharp', album: 'Wildlife', when: '2015-09-14',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/58/Hyacinth_macaw_%28Anodorhynchus_hyacinthinus%29_in_flight.JPG/500px-Hyacinth_macaw_%28Anodorhynchus_hyacinthinus%29_in_flight.JPG' },
  { t: 'Piazzetta San Marco Venice', place: 'Venice, Italy', by: 'Benh LIEU SONG', album: 'Travel', when: '2015-07-10',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/48/Piazzetta_San_Marco_Venice_BLS.jpg/500px-Piazzetta_San_Marco_Venice_BLS.jpg' },
  { t: 'Mountain lake, Mylgval mountain cirque, Western Caucas', place: 'Western Caucasus', by: 'Vyacheslav Argenberg', album: 'Landscapes', when: '2014-08-02',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/Mountain_lake%2C_Mylgval_mountain_cirque%2C_Western_Caucasus.jpg/500px-Mountain_lake%2C_Mylgval_mountain_cirque%2C_Western_Caucasus.jpg' },
  { t: 'Larus californicus Palo Alto May 2011', place: 'Palo Alto, California', by: 'King of Hearts', album: 'Wildlife', when: '2013-10-27',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Larus_californicus_Palo_Alto_May_2011_001.jpg/500px-Larus_californicus_Palo_Alto_May_2011_001.jpg' },
  { t: 'The Bridge', place: '', by: 'Frank Schulenburg', album: 'Cities', when: '2013-08-15',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/01/The_Bridge_%28August_2013%29.jpg/500px-The_Bridge_%28August_2013%29.jpg' },
  { t: 'Panorama Piazza San Marco and Venice on Easter 2013', place: 'Venice, Italy', by: 'This Photo was taken by Wolfgang Moroder. ', album: 'Travel', when: '2013-03-31',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/Panorama_Piazza_San_Marco_and_Venice_on_Easter_2013.jpg/500px-Panorama_Piazza_San_Marco_and_Venice_on_Easter_2013.jpg' },
  { t: 'Namib-Naukluft Sand Dunes', place: 'Sossusvlei, Namibia', by: 'Yathin S Krishnappa', album: 'Nature', when: '2013-02-08',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Namib-Naukluft_Sand_Dunes_%282011%29.jpg/500px-Namib-Naukluft_Sand_Dunes_%282011%29.jpg' },
  { t: 'Canal Grande Chiesa della Salute e Dogana dal ponte de', place: 'Venice, Italy', by: 'This Photo was taken by Wolfgang Moroder. ', album: 'Travel', when: '2012-12-12',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/Canal_Grande_Chiesa_della_Salute_e_Dogana_dal_ponte_dell_Accademia.jpg/500px-Canal_Grande_Chiesa_della_Salute_e_Dogana_dal_ponte_dell_Accademia.jpg' },
  { t: 'Aurora borealis above Storfjorden and the Lyngen Alps', place: 'Troms, Norway', by: 'Ximonic (Simo Räsänen)', album: 'Skies', when: '2012-03-04',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/Aurora_borealis_above_Storfjorden_and_the_Lyngen_Alps_in_moonlight%2C_2012_March.jpg/500px-Aurora_borealis_above_Storfjorden_and_the_Lyngen_Alps_in_moonlight%2C_2012_March.jpg' },
  { t: 'Tilisunahütte Panorama', place: 'Montafon, Austria', by: 'böhringer friedrich', album: 'Landscapes', when: '2011-08-01',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Tilisunah%C3%BCtte_Panorama.jpg/500px-Tilisunah%C3%BCtte_Panorama.jpg' },
  { t: 'Sossusvlei sand dunes', place: 'Sossusvlei, Namibia', by: 'Winfried Bruenken (Amrum)', album: 'Nature', when: '2009-12-19',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Sossusvlei_sand_dunes.jpg/500px-Sossusvlei_sand_dunes.jpg' },
  { t: 'Havelock Island, Sandy lagoon, Andaman Islands', place: 'Havelock Island, Andamans', by: 'Vyacheslav Argenberg', album: 'Coast', when: '2009-11-25',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/Havelock_Island%2C_Sandy_lagoon%2C_Andaman_Islands.jpg/500px-Havelock_Island%2C_Sandy_lagoon%2C_Andaman_Islands.jpg' },
  { t: 'Havelock Island, Mangrove tree on the beach, Andaman I', place: 'Havelock Island, Andamans', by: 'Vyacheslav Argenberg', album: 'Coast', when: '2009-11-21',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/51/Havelock_Island%2C_Mangrove_tree_on_the_beach%2C_Andaman_Islands.jpg/500px-Havelock_Island%2C_Mangrove_tree_on_the_beach%2C_Andaman_Islands.jpg' },
  { t: 'Chola Mountain Lake, Nepal', place: 'Solukhumbu, Nepal', by: 'Vyacheslav Argenberg', album: 'Landscapes', when: '2009-10-18',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Chola_Mountain_Lake%2C_Nepal.jpg/500px-Chola_Mountain_Lake%2C_Nepal.jpg' },
  { t: 'Mountains in snow, Mountain lake', place: 'Solukhumbu, Nepal', by: 'Vyacheslav Argenberg', album: 'Landscapes', when: '2009-10-18',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Mountains_in_snow%2C_Mountain_lake%2C_Chola_Valley%2C_Nepal%2C_Himalayas.jpg/500px-Mountains_in_snow%2C_Mountain_lake%2C_Chola_Valley%2C_Nepal%2C_Himalayas.jpg' },
  { t: 'San Francisco with two bridges and the low fog', place: 'San Francisco, California', by: 'Brocken Inaglory', album: 'Cities', when: '2009-10-15',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/San_Francisco_with_two_bridges_and_the_low_fog.jpg/500px-San_Francisco_with_two_bridges_and_the_low_fog.jpg' },
  { t: 'Golden Gate Bridge at sunset', place: 'San Francisco, California', by: 'Brocken Inaglory', album: 'Cities', when: '2009-10-15',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Golden_Gate_Bridge_at_sunset_1.jpg/500px-Golden_Gate_Bridge_at_sunset_1.jpg' },
  { t: 'Boletus in Finnish forest', place: 'Finland', by: 'Petritap', album: 'Nature', when: '2009-09-15',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/Boletus_in_Finnish_forest.jpg/500px-Boletus_in_Finnish_forest.jpg' },
  { t: 'Sunflower macro wide', place: '', by: 'Muhammad Mahdi Karim', album: 'Close-ups', when: '2009-03-09',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d7/Sunflower_macro_wide.jpg/500px-Sunflower_macro_wide.jpg' },
  { t: 'New York Midtown Skyline at night', place: 'New York City', by: 'Diliff', album: 'Cities', when: '2008-11-02',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/New_York_Midtown_Skyline_at_night_-_Jan_2006_edit1.jpg/500px-New_York_Midtown_Skyline_at_night_-_Jan_2006_edit1.jpg' },
  { t: 'Lily Lilium \'Citronella\' Flower', place: '', by: 'Photo by and (c)2007 Derek Ramsey (Ram-Man', album: 'Close-ups', when: '2007-09-20',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/Lily_Lilium_%27Citronella%27_Flower.jpg/500px-Lily_Lilium_%27Citronella%27_Flower.jpg' },
  { t: 'Lienz', place: 'Lienz, Austria', by: 'böhringer friedrich', album: 'Landscapes', when: '2007-09-13',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/76/Lienz_SG8.JPG/500px-Lienz_SG8.JPG' },
  { t: 'Sossusvlei Dune Namib Desert Namibia Luca Galuzzi 2004', place: 'Sossusvlei, Namibia', by: 'Luca Galuzzi (Lucag)', album: 'Nature', when: '2004-07-19',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/Sossusvlei_Dune_Namib_Desert_Namibia_Luca_Galuzzi_2004.JPG/500px-Sossusvlei_Dune_Namib_Desert_Namibia_Luca_Galuzzi_2004.JPG' },
].map((p, i) => ({ ...p, id: i + 1, fav: [1, 4, 9, 12, 19, 26].includes(i) }));
let PH_ID = PHOTOS.length;

/* upload.wikimedia.org only serves a fixed set of thumbnail widths now — ask for 400
   and you get a 400 back, with an HTML body that Chromium then blocks as an opaque
   response. So every request snaps up to the nearest size that exists. */
const PH_SIZES = [250, 500, 1280];
const phAt = (p, want) => {
  const w = PH_SIZES.find(s => s >= want) || PH_SIZES[PH_SIZES.length - 1];
  return p.th.replace(/\/\d+px-/, \`/\${w}px-\`);
};
const phDate = w => new Date(w + 'T12:00:00');

/* Forty tiles asking Wikimedia for a thumbnail at once earns a wall of 429s, which
   Chromium then blocks outright — a grid of grey squares. So loading is queued a few
   at a time, only for tiles near the viewport, and a rejected request is retried. */
const PhLoad = {
  q: [], active: 0, MAX: 5,
  io: typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(es => {
    es.forEach(e => {
      if (!e.isIntersecting) return;
      PhLoad.io.unobserve(e.target);
      PhLoad.q.push(e.target);
    });
    PhLoad.pump();
  }, { rootMargin: '320px' }),

  /** Hand every <img data-src> in a freshly rendered subtree to the queue. */
  scan(root) {
    root.querySelectorAll('img[data-src]:not([data-q])').forEach(img => {
      img.dataset.q = '1';
      /* The photo you actually opened jumps the queue. */
      if (img.hasAttribute('data-first')) this.q.unshift(img);
      else if (this.io) this.io.observe(img);
      else this.q.push(img);
    });
    this.pump();
  },
  pump() {
    while (this.active < this.MAX && this.q.length) {
      const img = this.q.shift();
      if (!img.isConnected || img.dataset.done) continue;
      this.active++;
      const next = () => { this.active--; this.pump(); };
      img.onload = () => { img.dataset.done = '1'; img.classList.add('in'); next(); };
      img.onerror = () => {
        const n = +(img.dataset.try || 0) + 1;
        img.dataset.try = n;
        if (n <= 3) setTimeout(() => { this.q.push(img); this.pump(); }, 500 * n * n);
        else { img.classList.add('failed'); img.dataset.done = '1'; }
        next();
      };
      /* A retry needs a URL the cache hasn't already filed as broken. Wikimedia
         ignores unknown query params on thumbnails, so this is a free cache-buster. */
      img.src = img.dataset.src + (img.dataset.try > 0 ? '?r=' + img.dataset.try : '');
    }
  },
};

APPS.photos = {
  name: 'Photos', icon: 'app-photos', w: 1060, h: 700, minW: 640, minH: 420,
  menus: () => stdMenus('photos', {
    View: [{ id: 'y', label: 'Years', run: () => Ph.group('Years') },
    { id: 'm', label: 'Months', run: () => Ph.group('Months') },
    { id: 'd', label: 'Days', run: () => Ph.group('Days') },
    { id: 'a', label: 'All Photos', checked: true, run: () => Ph.group('All') }],
  }),
  mount(w) {
    const albums = [...new Set(PHOTOS.map(p => p.album))].sort();
    w.st = { view: 'Library', group: 'All', sel: null, pick: null, q: '', web: null, info: true };
    const S = [
      { head: 'Photos', items: [['Library', 'g-gallery'], ['Recents', 'g-clock-a'], ['Favourites', 'g-star'], ['Memories', 'g-star']] },
      { head: 'Albums', items: albums.map(a => [a, 'g-folder-g']) },
    ];
    return \`<div class="wb"><div class="ph">
      <div class="sbar" data-drag style="width:206px"><div class="sb-top"><div data-tl></div></div>
      \${S.map(g => \`<div class="grp"><div class="gh">\${g.head}</div>\${g.items.map(([n, i]) =>
      \`<div class="si" data-pv="\${esc(n)}">\${ic(i, 'ico')}<span class="nm">\${esc(n)}</span></div>\`).join('')}</div>\`).join('')}
      </div>
      <div class="ph-main">
        <div class="tbar" data-drag style="height:52px">
          <button class="tbtn" data-nodrag data-pback title="Back" style="display:none">\${ic('g-chev-l')}</button>
          <div class="fx-title" data-ptitle style="position:static;text-align:left">Library</div>
          <div class="grow" style="flex:1"></div>
          <div class="seg" data-nodrag data-pseg>\${[['Years', 38], ['Months', 44], ['Days', 36], ['All', 32]].map(([g, wd]) =>
      \`<button data-pgroup="\${g}"\${g === 'All' ? ' class="on"' : ''} style="width:\${wd}px;font-size:11px">\${g}</button>\`).join('')}</div>
          <button class="tbtn" data-nodrag data-pfav title="Favourite">\${ic('g-star')}</button>
          <button class="tbtn" data-nodrag data-pinfo title="Info" style="display:none">\${ic('g-info')}</button>
          <button class="tbtn" data-nodrag data-pshare title="Share">\${ic('g-share')}</button>
          <div class="sfield" data-nodrag style="width:172px"><span>\${ic('g-search')}</span><input placeholder="Search" data-psearch spellcheck="false"></div>
        </div>
        <div class="ph-body" data-pbody></div>
        <div class="ph-foot" data-pstat></div>
      </div></div></div>\`;
  },
  ready(w) {
    Ph.w = w;
    on(w.node, 'click', '[data-pv]', (e, t) => {
      w.st.view = t.dataset.pv; w.st.sel = null; w.st.q = ''; w.st.web = null;
      w.node.querySelector('[data-psearch]').value = '';
      Ph.render(w);
    });
    on(w.node, 'click', '[data-pgroup]', (e, t) => Ph.group(t.dataset.pgroup, w));
    /* Selecting moves a class rather than re-rendering. Rebuilding the grid on the
       first click of a double-click swaps the element out from under the second one,
       so the dblclick never arrives and the photo never opens. */
    on(w.node, 'click', '[data-pi]', (e, t) => {
      w.st.pick = +t.dataset.pi;
      $$('.ph-cell', w.node).forEach(c => c.classList.toggle('on', c === t));
      Ph.paintChrome(w);
    });
    on(w.node, 'dblclick', '[data-pi]', (e, t) => Ph.open(w, +t.dataset.pi));
    on(w.node, 'click', '[data-pback]', () => { w.st.sel = null; Ph.render(w); });
    on(w.node, 'click', '[data-pstrip]', (e, t) => Ph.open(w, +t.dataset.pstrip));
    on(w.node, 'click', '[data-pfav]', () => Ph.toggleFav(w));
    on(w.node, 'click', '[data-pinfo]', () => { w.st.info = !w.st.info; Ph.render(w); });
    on(w.node, 'click', '[data-pdel]', () => Ph.remove(w));
    on(w.node, 'click', '[data-pweb]', (e, t) => Ph.search(w, t.dataset.pweb));
    on(w.node, 'click', '[data-padd]', (e, t) => Ph.add(w, +t.dataset.padd));
    on(w.node, 'click', '[data-pnudge]', (e, t) => Ph.step(w, +t.dataset.pnudge));
    on(w.node, 'click', '[data-pshare]', (e, t) => {
      const p = Ph.current(w);
      menuUnder(t, [
        { id: 'm', label: 'Mail', icon: 'g-compose', run: () => Mail.compose(p ? p.t : 'Photos') },
        { id: 'g', label: 'Messages', icon: 'g-facetime', run: () => WM.open('messages') }, '-',
        { id: 'c', label: 'Copy Photo', run: () => Toast(p ? 'Copied “' + p.t + '”' : 'Select a photo first') },
        { id: 'w', label: 'Open on Wikimedia Commons', run: () => p ? WM.open('safari', { url: p.th }) : Toast('Select a photo first') },
      ]);
    });
    const sf = w.node.querySelector('[data-psearch]');
    sf.addEventListener('input', () => {
      w.st.q = sf.value.trim(); w.st.sel = null; w.st.web = null;
      Ph.render(w);
    });
    /* Enter goes straight to the web, the way Photos falls through to its online
       results when the library has nothing to show. */
    sf.addEventListener('keydown', e => { if (e.key === 'Enter' && w.st.q) Ph.search(w, w.st.q); });
    /* Arrow keys drive the viewer, which is the only way anyone browses photos. */
    w.node.addEventListener('keydown', e => {
      if (w.st.sel == null) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); Ph.step(w, 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); Ph.step(w, -1); }
      if (e.key === 'Escape') { e.preventDefault(); w.st.sel = null; Ph.render(w); }
    });
    Ph.render(w);
  },
  onClose(w) { if (Ph.w === w) Ph.w = null; },
};

const Ph = {
  w: null,

  /** What the current sidebar selection and query resolve to. */
  list(w) {
    const v = w.st.view;
    let out = PHOTOS;
    if (v === 'Favourites') out = out.filter(p => p.fav);
    else if (v === 'Recents') out = out.slice(0, 18);
    else if (v === 'Memories') out = out.filter(p => ['Skies', 'Travel', 'Coast'].includes(p.album));
    else if (v !== 'Library') out = out.filter(p => p.album === v);
    const q = w.st.q.toLowerCase();
    if (q) out = out.filter(p =>
      (p.t + ' ' + p.place + ' ' + p.album + ' ' + p.by + ' ' + p.when).toLowerCase().includes(q));
    return out;
  },
  current(w) {
    const id = w.st.sel != null ? w.st.sel : w.st.pick;
    return id == null ? null : PHOTOS.find(p => p.id === id);
  },
  group(g, w) {
    w = w || this.w; if (!w) return;
    w.st.group = g; w.st.sel = null;
    this.render(w);
  },
  open(w, id) { w.st.sel = id; w.st.pick = id; this.render(w); },
  step(w, d) {
    const l = this.list(w);
    const i = l.findIndex(p => p.id === w.st.sel);
    if (i < 0) return;
    this.open(w, l[(i + d + l.length) % l.length].id);
  },
  toggleFav(w) {
    const p = this.current(w);
    if (!p) return Toast('Select a photo first');
    p.fav = !p.fav;
    /* In the grid only the pip and the toolbar change, and re-rendering would drop
       every tile back to a grey square while the queue reloaded it. */
    if (w.st.sel != null || w.st.view === 'Favourites') this.render(w);
    else {
      const cell = w.node.querySelector(\`.ph-cell[data-pi="\${p.id}"]\`);
      if (cell) {
        cell.querySelector('.fav')?.remove();
        if (p.fav) cell.insertAdjacentHTML('beforeend', \`<span class="fav">\${ic('g-star')}</span>\`);
      }
      this.paintChrome(w);
    }
    Toast(p.fav ? 'Added to Favourites' : 'Removed from Favourites');
  },
  remove(w) {
    const p = this.current(w);
    if (!p) return Toast('Select a photo first');
    PHOTOS.splice(PHOTOS.indexOf(p), 1);
    w.st.sel = null; w.st.pick = null;
    this.render(w);
    Toast('Deleted “' + p.t + '”');
  },

  /* ---- rendering ---- */
  /** Toolbar, title and status line — everything outside the photo area. */
  paintChrome(w) {
    const st = w.st, det = st.sel != null, cur = this.current(w);
    $$('[data-pv]', w.node).forEach(b => b.classList.toggle('on', b.dataset.pv === st.view));
    $$('[data-pgroup]', w.node).forEach(b => b.classList.toggle('on', b.dataset.pgroup === st.group));
    w.node.querySelector('[data-pback]').style.display = det ? '' : 'none';
    w.node.querySelector('[data-pseg]').style.display = det ? 'none' : '';
    w.node.querySelector('[data-pinfo]').style.display = det ? '' : 'none';
    w.node.querySelector('[data-pfav]').classList.toggle('on', !!(cur && cur.fav));
    w.node.querySelector('[data-pinfo]').classList.toggle('on', det && st.info);
    w.node.querySelector('[data-ptitle]').textContent =
      det ? (cur ? cur.t : st.view) : st.q ? \`Search: \${st.q}\` : st.view;
    const l = this.list(w);
    const favs = PHOTOS.filter(p => p.fav).length;
    const found = st.web && st.web.items ? \`\${st.web.items.length} from Wikimedia Commons\` : '';
    w.node.querySelector('[data-pstat]').textContent = det && cur
      ? [cur.place || cur.album, cur.when, cur.by].filter(Boolean).join(' · ')
      : [\`\${l.length} \${l.length === 1 ? 'Photo' : 'Photos'}\`, st.q ? found : \`\${favs} Favourite\${favs === 1 ? '' : 's'}\`]
        .filter(Boolean).join(' · ');
  },
  render(w) {
    w = w || this.w; if (!w) return;
    this.paintChrome(w);
    const body = w.node.querySelector('[data-pbody]');
    if (w.st.sel != null) { body.innerHTML = this.detailHTML(w); this.centreStrip(w); }
    else body.innerHTML = this.gridHTML(w);
    PhLoad.scan(body);
  },

  /** Section headings for the current grouping. */
  buckets(w, list) {
    const g = w.st.group;
    if (g === 'All') return [{ head: '', sub: '', items: list }];
    const keyOf = p => g === 'Years' ? p.when.slice(0, 4)
      : g === 'Months' ? p.when.slice(0, 7) : p.when;
    const map = new Map();
    list.forEach(p => { const k = keyOf(p); (map.get(k) || map.set(k, []).get(k)).push(p); });
    return [...map].map(([k, items]) => {
      const d = phDate(items[0].when);
      const head = g === 'Years' ? k
        : g === 'Months' ? \`\${MONS[d.getMonth()]} \${d.getFullYear()}\`
          : \`\${DAYS[d.getDay()]}, \${d.getDate()} \${MONS[d.getMonth()]} \${d.getFullYear()}\`;
      /* Photos captions a group with the places in it, so this does too. */
      const places = [...new Set(items.map(p => p.place).filter(Boolean))];
      const sub = places.slice(0, 3).join(' · ') + (places.length > 3 ? \` & \${places.length - 3} more\` : '');
      return { head, sub, items };
    });
  },
  gridHTML(w) {
    const st = w.st, list = this.list(w);
    const big = st.group !== 'All';
    /* Photos gives a day with only a shot or two more room, so a sparse group
       reads as emphasis rather than as an empty row. */
    const tile = (p, span) => \`<figure class="ph-cell\${p.id === st.pick ? ' on' : ''}" data-pi="\${p.id}"
      title="\${esc(p.t)}"\${span > 1 ? \` style="grid-column:span \${span}"\` : ''}>
      <img data-src="\${phAt(p, big ? 500 : 250)}" alt="\${esc(p.t)}" decoding="async">
      \${p.fav ? \`<span class="fav">\${ic('g-star')}</span>\` : ''}</figure>\`;

    if (!list.length && !st.web) {
      return \`<div class="ph-empty">
        <div class="ico">\${ic('g-gallery')}</div>
        <b>\${st.q ? \`No photos match “\${esc(st.q)}”\` : 'Nothing here yet'}</b>
        \${st.q ? \`<p>Look on Wikimedia Commons instead — whatever you pick joins your library.</p>
          <button class="btn pri" data-pweb="\${esc(st.q)}">Search the web for “\${esc(st.q)}”</button>\` : ''}</div>\`;
    }
    const cols = st.group === 'Years' ? 'repeat(auto-fill,minmax(340px,1fr))'
      : st.group === 'Months' ? 'repeat(auto-fill,minmax(240px,1fr))'
        : st.group === 'Days' ? 'repeat(auto-fill,minmax(190px,1fr))'
          : 'repeat(auto-fill,minmax(126px,1fr))';
    const sections = this.buckets(w, list).map(b => {
      const span = big && b.items.length < 3 ? 2 : 1;
      return \`\${b.head ? \`<div class="ph-head"><b>\${esc(b.head)}</b>\${b.sub ? \`<span>\${esc(b.sub)}</span>\` : ''}</div>\` : ''}
       <div class="ph-grid\${big ? ' big' : ''}" style="grid-template-columns:\${cols}">\${b.items.map(p => tile(p, span)).join('')}</div>\`;
    }).join('');
    return \`<div class="ph-scroll scroll">\${sections}\${this.webHTML(w)}
      \${st.q && !st.web ? \`<div class="ph-more"><button class="btn" data-pweb="\${esc(st.q)}">Search the web for “\${esc(st.q)}”</button></div>\` : ''}</div>\`;
  },
  /** The imported-from-the-web strip, with its loading and failure states. */
  webHTML(w) {
    const web = w.st.web;
    if (!web) return '';
    const head = sub => \`<div class="ph-head"><b>Wikimedia Commons</b><span>\${sub}</span></div>\`;
    if (web.loading) return head(\`Searching “\${esc(web.q)}”…\`) +
      \`<div class="ph-grid" style="grid-template-columns:repeat(auto-fill,minmax(126px,1fr))">
      \${[...Array(8)].map(() => \`<div class="ph-cell skel"></div>\`).join('')}</div>\`;
    if (web.error) return head(esc(web.error));
    if (!web.items.length) return head(\`Nothing found for “\${esc(web.q)}”\`);
    return head(\`\${web.items.length} results · click to add\`) +
      \`<div class="ph-grid" style="grid-template-columns:repeat(auto-fill,minmax(126px,1fr))">
      \${web.items.map((it, i) => \`<figure class="ph-cell web" data-padd="\${i}" title="\${esc(it.t)}">
        <img data-src="\${it.th}" alt="\${esc(it.t)}" decoding="async">
        <span class="plus">\${ic('g-plus')}</span></figure>\`).join('')}</div>\`;
  },
  detailHTML(w) {
    const p = PHOTOS.find(x => x.id === w.st.sel);
    if (!p) return '';
    const l = this.list(w);
    const i = l.findIndex(x => x.id === p.id);
    const d = phDate(p.when);
    return \`<div class="ph-det">
      <div class="stage">
        <button class="nav l" data-pnudge="-1" title="Previous">\${ic('g-chev-l')}</button>
        <img data-src="\${phAt(p, 1280)}" data-first alt="\${esc(p.t)}" decoding="async">
        <button class="nav r" data-pnudge="1" title="Next">\${ic('g-chev-r')}</button>
      </div>
      \${w.st.info ? \`<aside class="ph-info">
        <h4>\${esc(p.t)}</h4>
        <div class="when">\${DAYS[d.getDay()]}, \${d.getDate()} \${MONS[d.getMonth()]} \${d.getFullYear()}</div>
        \${p.place ? \`<div class="row">\${ic('g-pin')}<span>\${esc(p.place)}</span></div>\` : ''}
        <div class="row">\${ic('g-camera')}<span>\${esc(p.by)}</span></div>
        <div class="row">\${ic('g-folder-g')}<span>\${esc(p.album)}</span></div>
        <div class="acts">
          <button class="btn\${p.fav ? ' pri' : ''}" data-pfav>\${p.fav ? 'Favourited' : 'Favourite'}</button>
          <button class="btn" data-pdel>Delete</button>
        </div>
        <p class="lic">A featured picture from Wikimedia Commons, shown with the credit it carries.</p>
      </aside>\` : ''}
      <div class="ph-strip" data-pstripbox>\${l.map(x =>
      \`<img class="\${x.id === p.id ? 'on' : ''}" data-pstrip="\${x.id}" data-src="\${phAt(x, 250)}" alt="\${esc(x.t)}">\`).join('')}</div>
      <div class="ph-count">\${i + 1} of \${l.length}</div></div>\`;
  },
  /** Keep the open photo centred in the filmstrip. */
  centreStrip(w) {
    const box = w.node.querySelector('[data-pstripbox]');
    if (!box) return;
    const on = box.querySelector('.on');
    if (on) box.scrollLeft = on.offsetLeft - box.clientWidth / 2 + on.offsetWidth / 2;
  },

  /* ---- the web ---- */
  /** Live Commons search: no key, CORS-enabled, and every hit keeps its credit. */
  async search(w, q) {
    w = w || this.w; if (!w) return;
    w.st.web = { q, loading: true, items: [] };
    this.render(w);
    const url = 'https://commons.wikimedia.org/w/api.php?action=query&generator=search' +
      '&gsrsearch=' + encodeURIComponent('filetype:bitmap ' + q) +
      '&gsrlimit=18&gsrnamespace=6&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=250&format=json&origin=*';
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const items = Object.values((j.query || {}).pages || {}).map(pg => {
        const ii = (pg.imageinfo || [])[0];
        if (!ii || !ii.thumburl) return null;
        const md = ii.extmetadata || {};
        const by = String((md.Artist && md.Artist.value) || 'Unknown')
          .replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 42) || 'Unknown';
        return {
          t: pg.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, '').replace(/_/g, ' ').slice(0, 60),
          by, th: ii.thumburl,
        };
      }).filter(Boolean);
      /* A slower earlier search must not overwrite a newer one. */
      if (w.dead || !w.st.web || w.st.web.q !== q) return;
      w.st.web = { q, items };
    } catch (err) {
      if (w.dead || !w.st.web || w.st.web.q !== q) return;
      w.st.web = { q, items: [], error: navigator.onLine ? 'Commons did not answer' : 'You are offline' };
    }
    this.render(w);
  },
  add(w, i) {
    const it = w.st.web && w.st.web.items[i];
    if (!it) return;
    const p = {
      id: ++PH_ID, t: it.t, place: '', by: it.by, album: 'Imported',
      when: new Date().toISOString().slice(0, 10), th: it.th, fav: false,
    };
    PHOTOS.unshift(p);
    /* Imported is a brand-new album the first time, so the sidebar has to grow. */
    if (!w.node.querySelector('[data-pv="Imported"]')) {
      w.node.querySelectorAll('.sbar .grp')[1].insertAdjacentHTML('beforeend',
        \`<div class="si" data-pv="Imported">\${ic('g-folder-g', 'ico')}<span class="nm">Imported</span></div>\`);
    }
    w.st.pick = p.id;
    this.render(w);
    Toast('Added “' + p.t + '” to your library');
  },
};

/* ============================================================================
   25 · SMALLER APPS
   ========================================================================== */
APPS.reminders = {
  name: 'Reminders', icon: 'app-reminders', w: 760, h: 540, minW: 480, minH: 320,
  menus: () => stdMenus('reminders'),
  mount(w) {
    const L = [['Today', '#0a84ff', 3], ['Scheduled', '#ff375f', 5], ['All', '#1d1d1f', 11], ['Flagged', '#ff9f0a', 2], ['Completed', '#8e8e93', 24]];
    const items = [
      ['Send design review feedback', 'Today 5:00 PM', false, '#ff375f'],
      ['Review PR #142 — column view sizing', 'Today 6:30 PM', false, '#0a84ff'],
      ['Pick up dry cleaning', 'Today', false, '#ff9f0a'],
      ['Book the car for Saturday', 'Tomorrow', false, '#0a84ff'],
      ['Reply to Anna about the tray blur', 'Tomorrow 9:00 AM', false, '#30d158'],
      ['Fix unfocused window shadows', 'Done', true, '#8e8e93'],
      ['Write the neofetch ASCII by hand', 'Done', true, '#8e8e93'],
    ];
    return \`<div class="wb">
      <div class="sbar" data-drag style="width:206px"><div class="sb-top"><div data-tl></div></div>
        <div class="grp"><div class="gh">My Lists</div>
        \${L.map(([n, c, k]) => \`<div class="si"><span class="ico" style="width:16px;height:16px;border-radius:50%;background:\${c};color:#fff;display:grid;place-items:center;font-size:8px">●</span><span class="nm">\${n}</span><span class="tail">\${k}</span></div>\`).join('')}
        </div></div>
      <div class="wmain">
        <div class="tbar" data-drag style="height:52px">
          <div class="fx-title" style="color:var(--blue);font-size:22px;font-weight:700">Today</div>
          <div class="grow" style="flex:1"></div><button class="tbtn" data-nodrag data-radd title="New Reminder">\${ic('g-plus')}</button></div>
        <div class="scroll" style="flex:1;padding:6px 18px 20px" data-rlist>
        \${items.map((it, i) => \`<div class="rem" data-ri="\${i}" style="display:flex;gap:11px;align-items:flex-start;padding:9px 2px;border-bottom:.5px solid var(--line)">
          <span class="rc" style="width:17px;height:17px;border-radius:50%;border:1.6px solid \${it[2] ? it[3] : 'var(--txt-3)'};background:\${it[2] ? it[3] : 'transparent'};flex:none;margin-top:1px;display:grid;place-items:center;color:#fff">\${it[2] ? ic('g-check') : ''}</span>
          <span style="min-width:0"><span style="display:block;font-size:13px;\${it[2] ? 'color:var(--txt-3);text-decoration:line-through' : ''}">\${esc(it[0])}</span>
          <span style="font-size:11.5px;color:var(--txt-2)">\${esc(it[1])}</span></span></div>\`).join('')}
        </div></div></div>\`;
  },
  ready(w) {
    w.node.querySelectorAll('.rc svg').forEach(s => s.style.cssText = 'width:10px;height:10px');
    /* + inserts an empty row you type straight into, like the real app. */
    on(w.node, 'click', '[data-radd]', () => {
      const list = w.node.querySelector('[data-rlist]');
      const row = el(\`<div class="rem" style="display:flex;gap:11px;align-items:flex-start;padding:9px 2px;border-bottom:.5px solid var(--line)">
        <span class="rc" style="width:17px;height:17px;border-radius:50%;border:1.6px solid var(--txt-3);flex:none;margin-top:1px;display:grid;place-items:center;color:#fff"></span>
        <span style="min-width:0;flex:1"><span contenteditable="true" data-rnew style="display:block;font-size:13px;outline:none;min-height:17px"></span>
        <span style="font-size:11.5px;color:var(--txt-2)">Today</span></span></div>\`);
      list.prepend(row);
      const f = row.querySelector('[data-rnew]');
      f.focus();
      f.addEventListener('blur', () => { if (!f.textContent.trim()) row.remove(); else f.removeAttribute('contenteditable'); });
      f.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); f.blur(); } });
    });
    on(w.node, 'click', '.rem', (e, t) => {
      const c = t.querySelector('.rc'), done = !!c.querySelector('svg');
      const lbl = t.querySelector('span span');
      if (done) { c.innerHTML = ''; c.style.background = 'transparent'; c.style.borderColor = 'var(--txt-3)'; lbl.style.cssText = 'display:block;font-size:13px'; }
      else {
        c.innerHTML = ic('g-check'); c.querySelector('svg').style.cssText = 'width:10px;height:10px';
        c.style.background = '#0a84ff'; c.style.borderColor = '#0a84ff';
        lbl.style.cssText = 'display:block;font-size:13px;color:var(--txt-3);text-decoration:line-through';
      }
    });
  }
};

/* ----------------------------------------------------------------------------
   Live forecast. Open-Meteo needs no key and sends CORS headers, so the app and
   the notification-centre widget can share one real reading. Cupertino, because
   that's where macOS points on a fresh install.
   -------------------------------------------------------------------------- */
const Wx = {
  place: 'Cupertino', lat: 37.3230, lon: -122.0322,
  data: null, pending: null,

  /* WMO code → label and glyph. Night swaps the sun for a moon. */
  code(c, day = 1) {
    const t = {
      0: ['Clear', day ? 'g-sun' : 'g-moon'], 1: ['Mostly Clear', day ? 'g-sun' : 'g-moon'],
      2: ['Partly Cloudy', day ? 'g-suncloud' : 'g-mooncloud'], 3: ['Cloudy', 'g-cloud'],
      45: ['Fog', 'g-fog'], 48: ['Freezing Fog', 'g-fog'],
      51: ['Light Drizzle', 'g-drizzle'], 53: ['Drizzle', 'g-drizzle'], 55: ['Heavy Drizzle', 'g-drizzle'],
      56: ['Freezing Drizzle', 'g-drizzle'], 57: ['Freezing Drizzle', 'g-drizzle'],
      61: ['Light Rain', 'g-rain'], 63: ['Rain', 'g-rain'], 65: ['Heavy Rain', 'g-rain'],
      66: ['Freezing Rain', 'g-rain'], 67: ['Freezing Rain', 'g-rain'],
      71: ['Light Snow', 'g-snow'], 73: ['Snow', 'g-snow'], 75: ['Heavy Snow', 'g-snow'], 77: ['Snow Grains', 'g-snow'],
      80: ['Showers', 'g-rain'], 81: ['Showers', 'g-rain'], 82: ['Heavy Showers', 'g-rain'],
      85: ['Snow Showers', 'g-snow'], 86: ['Snow Showers', 'g-snow'],
      95: ['Thunderstorms', 'g-storm'], 96: ['Thunderstorms', 'g-storm'], 99: ['Thunderstorms', 'g-storm'],
    };
    return t[c] || ['—', 'g-cloud'];
  },

  /* One request per session, shared by every caller. */
  load() {
    if (this.data) return Promise.resolve(this.data);
    if (this.pending) return this.pending;
    const q = \`https://api.open-meteo.com/v1/forecast?latitude=\${this.lat}&longitude=\${this.lon}\` +
      \`&current=temperature_2m,weather_code,is_day&hourly=temperature_2m,weather_code\` +
      \`&daily=weather_code,temperature_2m_max,temperature_2m_min\` +
      \`&temperature_unit=fahrenheit&timezone=auto&forecast_days=7\`;
    this.pending = fetch(q).then(r => r.json()).then(j => {
      if (!j.current) throw new Error('bad payload');
      this.data = j; Bus.emit('wx', j); return j;
    }).catch(() => { this.pending = null; return null; });
    return this.pending;
  },

  /* Everything below reads whatever has arrived, falling back to a plausible
     reading so nothing renders empty while offline. */
  now() {
    const d = this.data;
    if (!d) return { t: 55, code: 0, day: 1, hi: 83, lo: 53, live: false };
    return {
      t: Math.round(d.current.temperature_2m), code: d.current.weather_code, day: d.current.is_day,
      hi: Math.round(d.daily.temperature_2m_max[0]), lo: Math.round(d.daily.temperature_2m_min[0]), live: true,
    };
  },
  hours(n = 6) {
    const d = this.data;
    if (!d) return [['Now', 55, 'g-sun'], ['5PM', 56, 'g-sun'], ['6PM', 54, 'g-suncloud'],
      ['7PM', 51, 'g-mooncloud'], ['8PM', 49, 'g-moon'], ['9PM', 47, 'g-moon']].slice(0, n);
    /* Open-Meteo returns the whole day from midnight; start at the current hour. */
    const now = new Date(d.current.time);
    let i = d.hourly.time.findIndex(t => new Date(t) >= now);
    if (i < 0) i = 0;
    const out = [];
    for (let k = 0; k < n; k++) {
      const j = Math.min(i + k, d.hourly.time.length - 1);
      const h = new Date(d.hourly.time[j]);
      const hr = h.getHours();
      out.push([k === 0 ? 'Now' : \`\${hr % 12 || 12}\${hr < 12 ? 'AM' : 'PM'}\`,
        Math.round(d.hourly.temperature_2m[j]),
        this.code(d.hourly.weather_code[j], hr >= 6 && hr < 20)[1]]);
    }
    return out;
  },
  days() {
    const d = this.data;
    if (!d) return [['Today', 53, 83, 'g-sun'], ['Tue', 55, 81, 'g-sun'], ['Wed', 56, 84, 'g-suncloud'],
      ['Thu', 57, 88, 'g-sun'], ['Fri', 56, 85, 'g-sun'], ['Sat', 54, 79, 'g-suncloud'], ['Sun', 52, 76, 'g-sun']];
    return d.daily.time.map((t, i) => [
      i === 0 ? 'Today' : DAYS3[new Date(t + 'T12:00').getDay()],
      Math.round(d.daily.temperature_2m_min[i]), Math.round(d.daily.temperature_2m_max[i]),
      this.code(d.daily.weather_code[i], 1)[1],
    ]);
  },
};

APPS.weather = {
  name: 'Weather', icon: 'app-weather', w: 460, h: 620, minW: 340, minH: 420,
  menus: () => stdMenus('weather'),
  mount() { return titlebar('Weather', { plain: true }) + \`<div class="wx-app" data-wx></div>\`; },
  ready(w) {
    const paint = () => {
      if (w.dead) return;
      const n = Wx.now(), hrs = Wx.hours(6), days = Wx.days();
      const [label] = Wx.code(n.code, n.day);
      /* Sky colour tracks day/night, the way the real app does. */
      const sky = n.day
        ? 'linear-gradient(175deg,#4aa3e8,#1f6fb8 55%,#17518d)'
        : 'linear-gradient(175deg,#274b7a,#1a2f52 55%,#141d33)';
      w.node.querySelector('[data-wx]').innerHTML = \`
        <div style="flex:1;min-height:0;overflow:auto;background:\${sky};color:#fff;padding:22px 20px 26px">
          <div style="text-align:center">
            <div style="font-size:15px;font-weight:500;letter-spacing:.01em">\${esc(Wx.place)}</div>
            <div style="font-size:74px;font-weight:200;letter-spacing:-.05em;line-height:1.05">\${n.t}°</div>
            <div style="font-size:14px;opacity:.9">\${esc(label)}</div>
            <div style="font-size:13px;opacity:.8;margin-top:2px">H:\${n.hi}° L:\${n.lo}°</div>
          </div>
          <div style="margin-top:22px;background:rgba(255,255,255,.14);border:.5px solid rgba(255,255,255,.2);border-radius:14px;padding:12px 14px;backdrop-filter:blur(12px)">
            <div style="font-size:11px;opacity:.75;letter-spacing:.03em;text-transform:uppercase;padding-bottom:9px;border-bottom:.5px solid rgba(255,255,255,.18)">\${esc(label)} conditions for the rest of the day.</div>
            <div style="display:flex;justify-content:space-between;padding-top:11px">
              \${hrs.map(([h, t2, i]) => \`<div style="display:flex;flex-direction:column;align-items:center;gap:7px;font-size:12px">
                <span>\${esc(h)}</span><span style="width:20px;height:20px;opacity:.95">\${ic(i)}</span><b style="font-size:14px;font-weight:600">\${t2}°</b></div>\`).join('')}
            </div></div>
          <div style="margin-top:14px;background:rgba(255,255,255,.14);border:.5px solid rgba(255,255,255,.2);border-radius:14px;padding:6px 14px">
            \${(() => {
          /* Each bar spans that day's range inside the week's range, so a cold
             day reads as a short bar sitting left — the whole point of the row. */
          const wLo = Math.min(...days.map(d => d[1])), wHi = Math.max(...days.map(d => d[2]));
          const span = Math.max(1, wHi - wLo);
          return days.map(([d, lo, hi, g]) => {
            const l = ((lo - wLo) / span * 100).toFixed(1), r = ((wHi - hi) / span * 100).toFixed(1);
            return \`<div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-top:.5px solid rgba(255,255,255,.14)">
              <span style="width:44px;font-size:13px;font-weight:500">\${esc(d)}</span>
              <span style="width:20px;height:20px;opacity:.95">\${ic(g)}</span>
              <span style="font-size:13px;opacity:.75;width:30px;text-align:right">\${lo}°</span>
              <span style="flex:1;height:4px;border-radius:2px;background:rgba(255,255,255,.22);position:relative">
                <i style="position:absolute;left:\${l}%;right:\${r}%;top:0;bottom:0;border-radius:2px;
                  background:linear-gradient(90deg,#7ed6ff,#ffd84d,#ff9f0a)"></i></span>
              <span style="font-size:13px;width:30px">\${hi}°</span></div>\`;
          }).join('');
        })()}
          </div>
          <div style="margin-top:12px;text-align:center;font-size:10.5px;opacity:.55">
            \${n.live ? 'Live from Open-Meteo' : 'Last known reading — no connection'}</div>
        </div>\`;
      w.node.querySelectorAll('[data-wx] svg').forEach(s => { s.style.cssText = 'width:100%;height:100%'; });
    };
    paint();
    Wx.load().then(() => paint());
    Bus.on('wx', () => paint());
  }
};

const TICKERS = [
  { s: 'AAPL', n: 'Apple Inc.', p: 232.40, d: 12.03, up: true }, { s: 'MSFT', n: 'Microsoft Corp.', p: 505.80, d: -3.12, up: false },
  { s: 'NVDA', n: 'NVIDIA Corp.', p: 168.25, d: -6.22, up: false }, { s: 'GOOGL', n: 'Alphabet Inc.', p: 204.11, d: 4.86, up: true },
  { s: 'TSLA', n: 'Tesla, Inc.', p: 318.94, d: 9.41, up: true }, { s: 'AMZN', n: 'Amazon.com', p: 241.62, d: 1.08, up: true },
];
/* \`steps\` controls how jagged the walk is, which is how the range selector makes a
   day look choppy and a decade look smooth. */
function spark(up, w = 90, h = 26, seed = 1, steps = 14) {
  let d = \`M0 \${h * .6}\`;
  for (let i = 1; i <= steps; i++) {
    const x = i / steps * w;
    const t = i / steps;
    const noise = Math.sin(i * 1.9 + seed * 3) * .18 + Math.sin(i * .7 + seed) * .12;
    const y = h * (up ? .78 - t * .58 + noise * .3 : .24 + t * .56 + noise * .3);
    d += \` L\${x.toFixed(1)} \${clamp(y, 2, h - 2).toFixed(1)}\`;
  }
  return \`<svg viewBox="0 0 \${w} \${h}" preserveAspectRatio="none" style="width:100%;height:100%"><path d="\${d}" fill="none" stroke="\${up ? '#28c840' : '#ff453a'}" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/></svg>\`;
}
APPS.stocks = {
  name: 'Stocks', icon: 'app-stocks', w: 800, h: 560, minW: 480, minH: 340,
  menus: () => stdMenus('stocks'),
  mount() {
    return \`<div class="wb">
      <div class="sbar" data-drag style="width:270px;padding-top:0"><div class="sb-top"><div data-tl></div></div>
        <div style="padding:0 10px 8px"><div class="sfield" data-nodrag><span>\${ic('g-search')}</span><input placeholder="Search"></div></div>
        <div style="overflow:auto;padding:0 8px">
        \${TICKERS.map((t, i) => \`<div class="si" data-ti="\${i}" style="height:52px;align-items:center">
          <span style="flex:1;min-width:0;display:flex;flex-direction:column">
            <b style="font-size:14px;font-weight:650;letter-spacing:-.01em">\${t.s}</b>
            <span style="font-size:11px;color:var(--txt-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">\${t.n}</span></span>
          <span style="width:56px;height:26px;flex:none">\${spark(t.up, 90, 26, i)}</span>
          <span style="display:flex;flex-direction:column;align-items:flex-end;width:74px;flex:none">
            <b style="font-size:13px;font-variant-numeric:tabular-nums">\${t.p.toFixed(2)}</b>
            <span style="font-size:10.5px;font-weight:600;color:#fff;background:\${t.up ? '#28c840' : '#ff453a'};padding:1px 5px;border-radius:4px">\${t.up ? '+' : ''}\${t.d.toFixed(2)}%</span></span>
        </div>\`).join('')}
        </div></div>
      <div class="wmain">
        <div class="tbar" data-drag style="height:52px"><div class="fx-title" data-stt></div></div>
        <div class="scroll" style="flex:1;padding:18px 22px" data-stbody></div>
      </div></div>\`;
  },
  ready(w) {
    const RANGES = ['1D', '1W', '1M', '3M', '6M', 'YTD', '1Y', '2Y', '5Y', '10Y'];
    w.st = { i: 0, range: '1M' };
    const render = i => {
      const t = TICKERS[i];
      w.st.i = i;
      w.node.querySelector('[data-stt]').textContent = t.s;
      $$('[data-ti]', w.node).forEach(b => b.classList.toggle('on', +b.dataset.ti === i));
      /* The range picks a different slice of the walk, so switching it really does
         redraw the chart — longer windows read smoother, as they should. */
      const ri = RANGES.indexOf(w.st.range);
      const detail = [26, 40, 60, 80, 100, 120, 140, 170, 200, 240][ri] || 60;
      w.node.querySelector('[data-stbody]').innerHTML = \`
        <div style="font-size:26px;font-weight:650;letter-spacing:-.03em">\${t.n}</div>
        <div style="display:flex;align-items:baseline;gap:10px;margin-top:2px">
          <span style="font-size:36px;font-weight:300;letter-spacing:-.03em;font-variant-numeric:tabular-nums">\${t.p.toFixed(2)}</span>
          <span style="font-size:15px;font-weight:600;color:\${t.up ? '#28c840' : '#ff453a'}">\${t.up ? '▲' : '▼'} \${Math.abs(t.d).toFixed(2)}%</span></div>
        <div style="display:flex;gap:4px;margin:16px 0 10px">\${RANGES.map(p =>
        \`<button class="btn" data-range="\${p}" style="height:22px;padding:0 9px;font-size:11px\${p === w.st.range ? ';background:var(--blue);color:#fff' : ''}">\${p}</button>\`).join('')}</div>
        <div style="height:190px;background:var(--win-2);border-radius:10px;padding:12px;box-shadow:0 0 0 .5px var(--line)">\${spark(t.up, 600, 165, i + 3 + ri * 5, detail)}</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1px;margin-top:16px;background:var(--line);border-radius:10px;overflow:hidden">
          \${[['Open', (t.p - t.d).toFixed(2)], ['High', (t.p * 1.014).toFixed(2)], ['Low', (t.p * .986).toFixed(2)], ['Vol', '58.2M'],
        ['P/E', '34.2'], ['Mkt Cap', '3.48T'], ['52W H', (t.p * 1.22).toFixed(2)], ['52W L', (t.p * .72).toFixed(2)]]
        .map(([k, v]) => \`<div style="background:var(--win-2);padding:9px 12px"><div style="font-size:10.5px;color:var(--txt-2)">\${k}</div><div style="font-size:13px;font-weight:600;font-variant-numeric:tabular-nums">\${v}</div></div>\`).join('')}
        </div>\`;
    };
    on(w.node, 'click', '[data-ti]', (e, t) => render(+t.dataset.ti));
    on(w.node, 'click', '[data-range]', (e, t) => { w.st.range = t.dataset.range; render(w.st.i); });
    render(0);
  }
};

APPS.clock = {
  name: 'Clock', icon: 'app-clock', w: 520, h: 420, minW: 360, minH: 300,
  menus: () => stdMenus('clock'),
  mount() {
    const zones = [['Cupertino', -12.5], ['Kolkata', 0], ['London', -4.5], ['Tokyo', 3.5]];
    return titlebar('Clock', { plain: true }) + \`<div style="flex:1;display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--line);min-height:0">
      \${zones.map(([z, off]) => \`<div style="background:var(--win);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:14px">
        <div data-cw="\${off}" style="width:104px;height:104px"></div>
        <div style="font-size:13px;font-weight:600">\${z}</div>
        <div style="font-size:11.5px;color:var(--txt-2)" data-ct="\${off}"></div></div>\`).join('')}
    </div>\`;
  },
  ready(w) {
    const tick = () => {
      if (w.dead) return;
      $$('[data-cw]', w.node).forEach(n => {
        const off = +n.dataset.cw;
        const d = new Date(Date.now() + off * 3600e3);
        n.innerHTML = analogClock(d, 104);
      });
      $$('[data-ct]', w.node).forEach(n => {
        const d = new Date(Date.now() + (+n.dataset.ct) * 3600e3);
        n.textContent = time12(d).replace(NBSP, ' ');
      });
    };
    everySecond(tick);
  }
};

APPS.contacts = {
  name: 'Contacts', icon: 'app-contacts', w: 760, h: 540, minW: 480, minH: 320,
  menus: () => stdMenus('contacts'),
  mount(w) {
    const C = [['Anna Haro', 'Product design', '#0a84ff'], ['Chris Lee', 'Photographer', '#ff2d55'],
    ['Daniel Higgins', 'Engineering manager', '#ffd60a'], ['David Taylor', 'Motion design', '#ff9f0a'],
    ['Freda Klein', 'Architect', '#a2845e'], ['Hank Zakroff', 'Type designer', '#5e5ce6'],
    ['John Appleseed', 'iOS engineer', '#30d158'], ['Kate Bell', 'Frontend', '#64d2ff'],
    ['Mom', 'Family', '#ff375f'], ['Dr. Reed', 'Dentist', '#8e8e93']];
    w.C = C;
    return \`<div class="wb">
      <div class="sbar" data-drag style="width:250px;padding-top:0"><div class="sb-top"><div data-tl></div></div>
        <div style="padding:0 10px 8px"><div class="sfield" data-nodrag><span>\${ic('g-search')}</span><input placeholder="Search"></div></div>
        <div style="overflow:auto;padding:0 8px">\${C.map((c, i) => \`<div class="si" data-ci2="\${i}" style="height:30px"><span class="nm">\${esc(c[0])}</span></div>\`).join('')}</div>
      </div>
      <div class="wmain"><div class="tbar" data-drag style="height:52px"></div>
        <div class="scroll" style="flex:1;padding:26px" data-cbody2></div></div></div>\`;
  },
  ready(w) {
    const render = i => {
      const c = w.C[i];
      $$('[data-ci2]', w.node).forEach(b => b.classList.toggle('on', +b.dataset.ci2 === i));
      w.node.querySelector('[data-cbody2]').innerHTML = \`
        <div style="display:flex;gap:18px;align-items:center">
          <div style="width:88px;height:88px;border-radius:50%;background:\${c[2]};display:grid;place-items:center;color:#fff;font-size:34px;font-weight:600">\${esc(c[0][0])}</div>
          <div><div style="font-size:25px;font-weight:600;letter-spacing:-.02em">\${esc(c[0])}</div>
          <div style="font-size:13px;color:var(--txt-2)">\${esc(c[1])}</div></div></div>
        <div style="margin-top:24px;max-width:420px">
          \${[['email', c[0].split(' ')[0].toLowerCase() + '@example.com'], ['home', 'Cupertino, CA']]
        .map(([k, v]) => \`<div style="display:flex;gap:16px;padding:8px 0;border-top:.5px solid var(--line)">
            <span style="width:60px;text-align:right;font-size:11.5px;color:var(--txt-2)">\${k}</span>
            <span style="font-size:13px;color:var(--blue)">\${esc(v)}</span></div>\`).join('')}
        </div>\`;
    };
    on(w.node, 'click', '[data-ci2]', (e, t) => render(+t.dataset.ci2));
    render(0);
  }
};

APPS.freeform = {
  name: 'Freeform', icon: 'app-freeform', w: 860, h: 600, minW: 480, minH: 320,
  menus: () => stdMenus('freeform'),
  mount() {
    return titlebar('Untitled Board', {
      right: \`<div class="seg" data-nodrag>\${['#1d1d1f', '#0a84ff', '#ff375f', '#30d158', '#ff9f0a'].map((c, i) =>
        \`<button data-pen="\${c}" class="\${i === 0 ? 'on' : ''}" style="width:26px"><span style="width:13px;height:13px;border-radius:50%;background:\${c};display:block"></span></button>\`).join('')}</div>
      <button class="tbtn" data-nodrag data-clear title="Clear">\${ic('g-x')}</button>\`
    }) + \`<div style="flex:1;position:relative;min-height:0;background:var(--win)">
        <canvas data-ff style="position:absolute;inset:0;width:100%;height:100%;display:block;cursor:var(--cur-cross)"></canvas>
        <div data-ffhint style="position:absolute;inset:0;display:grid;place-items:center;pointer-events:none;color:var(--txt-3);font-size:13px">Drag to draw</div>
      </div>\`;
  },
  ready(w) {
    const cv = w.node.querySelector('[data-ff]');
    let col = '#1d1d1f', dpr = Math.min(2, devicePixelRatio || 1), strokes = [];
    const fit = () => {
      const p = cv.parentElement;
      const r = { width: p.clientWidth, height: p.clientHeight };
      if (!r.width || !r.height) return;
      cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
      const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.lineCap = 'round'; g.lineJoin = 'round';
      strokes.forEach(s => { g.strokeStyle = s.c; g.lineWidth = 3; g.beginPath(); s.p.forEach((pt, i) => i ? g.lineTo(pt[0], pt[1]) : g.moveTo(pt[0], pt[1])); g.stroke(); });
    };
    w.ffFit = fit; setTimeout(fit, 30); addEventListener('resize', fit);
    Bus.on('theme', () => { if (!w.dead) fit(); });
    on(w.node, 'click', '[data-pen]', (e, t) => { col = t.dataset.pen; $$('[data-pen]', w.node).forEach(b => b.classList.toggle('on', b === t)); });
    on(w.node, 'click', '[data-clear]', () => { strokes = []; fit(); w.node.querySelector('[data-ffhint]').style.opacity = '1'; });
    cv.addEventListener('pointerdown', e => {
      w.node.querySelector('[data-ffhint]').style.opacity = '0';
      const r = cv.getBoundingClientRect(), g = cv.getContext('2d');
      const s = { c: col, p: [[e.clientX - r.left, e.clientY - r.top]] };
      strokes.push(s);
      g.strokeStyle = col; g.lineWidth = 3;
      const mv = ev => {
        const p = [ev.clientX - r.left, ev.clientY - r.top];
        const last = s.p[s.p.length - 1];
        g.beginPath(); g.moveTo(last[0], last[1]); g.lineTo(p[0], p[1]); g.stroke();
        s.p.push(p);
      };
      const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    });
  },
  onResize(w) { if (w.ffFit) w.ffFit(); }
};

/* Media-shelf apps share one shape */
function shelfApp(id, name, icon, title, rows, tint) {
  APPS[id] = {
    name, icon, w: 900, h: 600, minW: 520, minH: 340,
    menus: () => stdMenus(id),
    mount() {
      return titlebar(name, { right: \`<div class="sfield" data-nodrag style="width:160px"><span>\${ic('g-search')}</span><input placeholder="Search"></div>\` }) +
        \`<div class="scroll" style="flex:1;min-height:0;padding:18px 22px 28px;background:var(--win)">
          <h2 style="margin:0 0 3px;font-size:24px;font-weight:700;letter-spacing:-.025em">\${esc(title)}</h2>
          <div style="font-size:12.5px;color:var(--txt-2);margin-bottom:18px">\${esc(rows[0].sub)}</div>
          \${rows.map(r => \`<div style="margin-bottom:26px">
            <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:11px"><h3 style="margin:0;font-size:16px;font-weight:650;letter-spacing:-.015em">\${esc(r.head)}</h3>
            <span style="font-size:11.5px;color:var(--blue)">See All</span></div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:16px 14px">
            \${r.items.map((it, i) => \`<div class="alb"><div class="cv" style="aspect-ratio:\${r.ratio || 1};border-radius:8px">\${photoArt(i + r.seed)}<span class="pl">\${ic('g-play')}</span></div>
              <b>\${esc(it[0])}</b><span>\${esc(it[1])}</span></div>\`).join('')}</div></div>\`).join('')}
        </div>\`;
    }
  };
}
shelfApp('podcasts', 'Podcasts', 'app-podcasts', 'Listen Now', [
  { head: 'Up Next', sub: 'Six shows · 42 unplayed episodes', seed: 1, items: [['Design Details', 'Ep. 512 · Liquid Glass'], ['Syntax', 'Ep. 880 · One-file apps'], ['Acquired', 'Apple, Part IV'], ['The Talk Show', 'With John Gruber']] },
  { head: 'New Episodes', sub: '', seed: 5, items: [['Shop Talk', '2 hr ago'], ['Ship It', '5 hr ago'], ['Frontend First', 'Yesterday'], ['Hanselminutes', 'Yesterday']] },
]);
shelfApp('tv', 'TV', 'app-tv', 'Home', [
  { head: 'Continue Watching', sub: 'Apple TV+', seed: 2, ratio: 0.68, items: [['Severance', 'S2 · E4'], ['Silo', 'S2 · E7'], ['For All Mankind', 'S5 · E1'], ['Foundation', 'S3 · E9']] },
  { head: 'New & Noteworthy', sub: '', seed: 6, ratio: 0.68, items: [['The Studio', 'Comedy'], ['Presumed Innocent', 'Thriller'], ['Slow Horses', 'Drama'], ['Shrinking', 'Comedy']] },
]);
shelfApp('books', 'Books', 'app-books', 'Reading Now', [
  { head: 'Current', sub: '3 books in progress', seed: 3, ratio: 0.66, items: [['Refactoring UI', 'Wathan & Schoger'], ['The Design of Everyday Things', 'Norman'], ['Shape Up', 'Singer'], ['Thinking in Systems', 'Meadows']] },
  { head: 'Want to Read', sub: '', seed: 7, ratio: 0.66, items: [['Creative Selection', 'Kocienda'], ['Steal Like an Artist', 'Kleon'], ['The Making of Prince of Persia', 'Mechner'], ['Hackers & Painters', 'Graham']] },
]);
shelfApp('appstore', 'App Store', 'app-appstore', 'Discover', [
  { head: 'Featured', sub: 'Handpicked for you', seed: 4, items: [['CleanType', 'Typography utility'], ['Aurora Synth', 'Music'], ['Pattern Craft', 'Graphics'], ['Spark UI', 'Developer tools']] },
  { head: 'Top Free', sub: '', seed: 0, items: [['Raycast', 'Productivity'], ['Arc', 'Browser'], ['Figma', 'Design'], ['Warp', 'Terminal']] },
]);
APPS.facetime = {
  name: 'FaceTime', icon: 'app-facetime', w: 780, h: 560, minW: 440, minH: 320,
  menus: () => stdMenus('facetime'),
  mount(w) {
    w.st = {
      calls: [['Anna Haro', 'Outgoing', '24:12', 'Today 3:40 PM'], ['Design Crew', 'Missed', '', 'Today 11:02 AM'],
      ['John Appleseed', 'Incoming', '8:31', 'Yesterday'], ['Mom', 'Outgoing', '41:07', 'Saturday']],
      sel: 0, live: false, secs: 0, muted: false, cam: false,
    };
    return \`<div class="wb">
      <div class="sbar" data-drag style="width:270px;padding-top:0"><div class="sb-top"><div data-tl></div></div>
        <div style="padding:0 10px 10px"><button class="btn pri" data-ftnew style="width:100%;height:28px">New FaceTime</button></div>
        <div style="overflow:auto;padding:0 8px" data-ftlist></div></div>
      <div class="wmain" style="background:#111114">
        <div class="tbar" data-drag style="height:52px;background:transparent;border:0"></div>
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#8a8a92;gap:12px;padding-bottom:20px" data-ftstage></div>
      </div></div>\`;
  },
  ready(w) {
    const st = w.st;
    const initials = n => n.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
    const render = () => {
      w.node.querySelector('[data-ftlist]').innerHTML = st.calls.map(([n, kind, len, when], i) => \`
        <div class="si\${i === st.sel ? ' on' : ''}" data-fti="\${i}" style="height:46px;align-items:center">
          <span style="flex:1;min-width:0;display:flex;flex-direction:column"><b style="font-size:13px;font-weight:600">\${esc(n)}</b>
          <span style="font-size:11px;color:\${kind === 'Missed' ? 'var(--red)' : 'var(--txt-2)'}">\${kind}\${len ? ' · ' + len : ''}</span></span>
          <span style="font-size:10.5px;color:var(--txt-3)">\${esc(when)}</span></div>\`).join('');
      const c = st.calls[st.sel];
      const stage = w.node.querySelector('[data-ftstage]');
      if (!st.live) {
        stage.innerHTML = \`
          <div style="width:120px;height:120px;border-radius:50%;background:linear-gradient(150deg,#3a3a45,#1a1a20);display:grid;place-items:center;font-size:42px;color:#fff;font-weight:600">\${esc(initials(c[0]))}</div>
          <div style="font-size:19px;color:#fff;font-weight:500">\${esc(c[0])}</div>
          <div style="font-size:12.5px">\${esc(c[1])}\${c[2] ? ' · ' + c[2] : ''} — \${esc(c[3])}</div>
          <button class="btn pri" data-ftcall style="height:34px;padding:0 22px;border-radius:17px;margin-top:4px">\${ic('g-facetime')}<span style="margin-left:6px">FaceTime</span></button>\`;
        return;
      }
      stage.innerHTML = \`
        <div style="width:150px;height:150px;border-radius:50%;position:relative;display:grid;place-items:center;font-size:52px;color:#fff;font-weight:600;
          background:\${st.cam ? 'linear-gradient(150deg,#1d4b6e,#0d2436)' : 'linear-gradient(150deg,#3a3a45,#1a1a20)'}">
          \${st.cam ? '' : esc(initials(c[0]))}
          \${st.cam ? \`<svg viewBox="0 0 40 40" style="width:60px;height:60px;opacity:.5"><use href="#g-display"></use></svg>\` : ''}</div>
        <div style="font-size:19px;color:#fff;font-weight:500">\${esc(c[0])}</div>
        <div style="font-size:12.5px;font-variant-numeric:tabular-nums" data-fttimer>\${mmss(st.secs)}</div>
        <div style="display:flex;gap:12px;margin-top:6px">
          <button class="btn" data-ftmute title="\${st.muted ? 'Unmute' : 'Mute'}" style="background:\${st.muted ? '#fff' : '#2c2c30'};color:\${st.muted ? '#111' : '#fff'};box-shadow:none;height:38px;width:38px;border-radius:50%;padding:0">\${ic(st.muted ? 'g-vol-mute' : 'g-vol-hi')}</button>
          <button class="btn" data-ftend style="background:#ff453a;color:#fff;box-shadow:none;height:38px;padding:0 20px;border-radius:19px">End</button>
          <button class="btn" data-ftcam title="\${st.cam ? 'Turn Off Video' : 'Turn On Video'}" style="background:\${st.cam ? '#fff' : '#2c2c30'};color:\${st.cam ? '#111' : '#fff'};box-shadow:none;height:38px;width:38px;border-radius:50%;padding:0">\${ic('g-display')}</button>
        </div>\`;
    };
    const start = () => {
      st.live = true; st.secs = 0;
      clearInterval(w.ftTimer);
      w.ftTimer = setInterval(() => {
        if (w.dead || !st.live) return;
        st.secs++;
        const t = w.node.querySelector('[data-fttimer]');
        if (t) t.textContent = mmss(st.secs);
      }, 1000);
      render();
    };
    on(w.node, 'click', '[data-fti]', (e, t) => { st.sel = +t.dataset.fti; st.live = false; render(); });
    on(w.node, 'click', '[data-ftcall]', start);
    on(w.node, 'click', '[data-ftmute]', () => { st.muted = !st.muted; render(); Toast(st.muted ? 'Microphone off' : 'Microphone on'); });
    on(w.node, 'click', '[data-ftcam]', () => { st.cam = !st.cam; render(); });
    on(w.node, 'click', '[data-ftend]', () => {
      st.live = false; clearInterval(w.ftTimer);
      st.calls[st.sel] = [st.calls[st.sel][0], 'Outgoing', mmss(st.secs), 'Just now'];
      render(); Toast('Call ended · ' + mmss(st.secs));
    });
    /* New FaceTime asks who, then dials — no dead primary button. */
    on(w.node, 'click', '[data-ftnew]', (e, t) => {
      const node = el(\`<div class="pop" style="width:290px;padding:12px">
        <div style="font-size:12.5px;font-weight:600;margin-bottom:8px">New FaceTime</div>
        <div class="sfield" style="width:100%"><span>\${ic('g-search')}</span><input placeholder="Name or email" spellcheck="false"></div>
        <div style="display:flex;flex-direction:column;gap:1px;margin-top:10px;background:var(--line);border-radius:8px;overflow:hidden">
          \${['Anna Haro', 'David Taylor', 'Kate Bell', 'Mom'].map(n =>
        \`<div class="mi" data-pick="\${esc(n)}" style="background:var(--win-2);border-radius:0">\${esc(n)}</div>\`).join('')}</div>
        <button class="btn pri" data-go style="width:100%;height:26px;margin-top:10px">FaceTime</button></div>\`);
      menuUnder(t, []); Pop.close(true);
      const r = t.getBoundingClientRect();
      Pop.open(node, { x: r.left, y: r.bottom + 6, origin: 'top left' });
      const inp = node.querySelector('input');
      setTimeout(() => inp.focus(), 50);
      const dial = name => {
        if (!name) return Toast('Enter a name to call');
        Pop.close();
        st.calls.unshift([name, 'Outgoing', '', 'Just now']); st.sel = 0;
        start();
      };
      on(node, 'click', '[data-pick]', (e2, p) => dial(p.dataset.pick));
      node.querySelector('[data-go]').onclick = () => dial(inp.value.trim());
      inp.addEventListener('keydown', e2 => { if (e2.key === 'Enter') dial(inp.value.trim()); });
    });
    render();
  },
  onClose(w) { clearInterval(w.ftTimer); }
};
/* ============================================================================
   25b · UTILITIES
   ========================================================================== */
APPS.activity = {
  name: 'Activity Monitor', icon: 'app-activity', w: 860, h: 560, minW: 560, minH: 340,
  menus: () => stdMenus('activity'),
  mount(w) {
    w.st = { tab: 'CPU' };
    return titlebar('Activity Monitor', {
      right: \`<div class="seg" data-nodrag>\${['CPU', 'Memory', 'Energy', 'Disk', 'Network'].map((t, i) =>
        \`<button data-am="\${t}" class="\${i === 0 ? 'on' : ''}" style="width:auto;padding:0 9px;font-size:11.5px">\${t}</button>\`).join('')}</div>\`
    }) + \`<div class="wb col" style="background:var(--win)">
      <div class="fv-list scroll" style="flex:1">
        <div class="hd" data-head></div>
        <div data-proc></div>
      </div>
      <div style="flex:none;display:flex;gap:26px;align-items:center;height:70px;padding:0 20px;border-top:.5px solid var(--line);background:var(--win-2)">
        <div data-cpuring></div>
        <div style="display:grid;grid-template-columns:auto auto;gap:2px 14px;font-size:11.5px" data-legend></div>
        <div style="flex:1;height:44px;position:relative;overflow:hidden;border-radius:6px;background:var(--win-3)" data-graph></div>
      </div></div>\`;
  },
  ready(w) {
    /* name, pid, cpu, threads, mem MB, user, energy, disk MB/s, net KB/s */
    const PROCS = [
      ['WindowServer', 214, 9.4, 24, 412.6, 'root', 8.2, 0.4, 12],
      ['kernel_task', 0, 6.1, 512, 1864, 'root', 3.1, 2.8, 6],
      ['Safari', 1841, 4.2, 31, 996.4, 'prasenjit', 21.4, 1.2, 486],
      ['Cursor Helper (Renderer)', 2290, 3.8, 42, 1240, 'prasenjit', 16.8, 0.9, 74],
      ['Terminal', 2461, 1.2, 8, 84.2, 'prasenjit', 1.1, 0.1, 0],
      ['Music', 1902, 0.9, 26, 288.1, 'prasenjit', 4.6, 0.6, 128],
      ['Finder', 620, 0.4, 12, 142.8, 'prasenjit', 0.8, 0.2, 2],
      ['Dock', 618, 0.3, 9, 96.4, 'prasenjit', 0.6, 0.0, 0],
      ['mds_stores', 340, 0.2, 7, 58.9, 'root', 0.4, 3.4, 0],
      ['bluetoothd', 188, 0.1, 5, 18.2, 'root', 0.2, 0.0, 1],
      ['loginwindow', 174, 0.0, 4, 22.6, 'prasenjit', 0.1, 0.0, 0],
      ['cfprefsd', 121, 0.0, 3, 9.4, 'root', 0.1, 0.1, 0],
    ];
    const mb = v => v >= 1024 ? (v / 1024).toFixed(2) + ' GB' : v.toFixed(1) + ' MB';
    /* Each tab is a different sort key, column set, ring and legend — the way the
       real app re-tables itself rather than just re-labelling one view. */
    const TABS = {
      CPU: {
        cols: ['Process Name', 'PID', '% CPU', 'Threads', 'Memory', 'User'], key: 2, hue: '#0a84ff',
        cells: p => [p[1], p[2].toFixed(1), p[3], mb(p[4]), p[5]], hot: p => p[2] > 5,
        ring: rows => clamp(rows.reduce((s, r) => s + r[2], 0), 0, 100),
        legend(rows) {
          const t = rows.reduce((s, r) => s + r[2], 0), sys = t * .38, usr = t * .62;
          return [['System', sys.toFixed(2) + '%'], ['User', usr.toFixed(2) + '%'], ['Idle', (100 - t).toFixed(2) + '%']];
        },
      },
      Memory: {
        cols: ['Process Name', 'PID', 'Memory', 'Threads', 'Compressed', 'User'], key: 4, hue: '#30d158',
        cells: p => [p[1], mb(p[4]), p[3], mb(p[4] * .18), p[5]], hot: p => p[4] > 900,
        ring: rows => clamp(rows.reduce((s, r) => s + r[4], 0) / 1310, 0, 100),
        legend(rows) {
          const used = rows.reduce((s, r) => s + r[4], 0) / 1024;
          return [['Physical', '128.00 GB'], ['Used', used.toFixed(2) + ' GB'], ['Cached', (used * .42).toFixed(2) + ' GB']];
        },
      },
      Energy: {
        cols: ['Process Name', 'PID', 'Energy Impact', '12 hr Power', 'App Nap', 'User'], key: 6, hue: '#ff9f0a',
        cells: p => [p[1], p[6].toFixed(1), (p[6] * .42).toFixed(2), p[6] < 1 ? 'Yes' : 'No', p[5]], hot: p => p[6] > 15,
        ring: rows => clamp(rows.reduce((s, r) => s + r[6], 0), 0, 100),
        legend: rows => [['Energy Impact', rows.reduce((s, r) => s + r[6], 0).toFixed(1)],
          ['Battery', SYS.battery + '%'], ['Remaining', '6:24']],
      },
      Disk: {
        cols: ['Process Name', 'PID', 'Bytes Read/s', 'Bytes Written/s', 'Reads In', 'User'], key: 7, hue: '#af52de',
        cells: p => [p[1], p[7].toFixed(2) + ' MB', (p[7] * .38).toFixed(2) + ' MB', Math.round(p[7] * 214), p[5]], hot: p => p[7] > 2,
        ring: rows => clamp(rows.reduce((s, r) => s + r[7], 0) * 9, 0, 100),
        legend: rows => [['Reads/s', rows.reduce((s, r) => s + r[7], 0).toFixed(2) + ' MB'],
          ['Writes/s', (rows.reduce((s, r) => s + r[7], 0) * .38).toFixed(2) + ' MB'], ['Total read', '284.6 GB']],
      },
      Network: {
        cols: ['Process Name', 'PID', 'Rcvd Bytes/s', 'Sent Bytes/s', 'Packets In', 'User'], key: 8, hue: '#5e5ce6',
        cells: p => [p[1], p[8].toFixed(0) + ' KB', (p[8] * .31).toFixed(0) + ' KB', Math.round(p[8] * 3.4), p[5]], hot: p => p[8] > 200,
        ring: rows => clamp(rows.reduce((s, r) => s + r[8], 0) / 12, 0, 100),
        legend: rows => [['Data received/s', rows.reduce((s, r) => s + r[8], 0).toFixed(0) + ' KB'],
          ['Data sent/s', (rows.reduce((s, r) => s + r[8], 0) * .31).toFixed(0) + ' KB'], ['Packets in', '1,284,602']],
      },
    };
    const hist = {}; Object.keys(TABS).forEach(k => hist[k] = [...Array(60)].map(() => 8 + Math.random() * 14));
    const tick = () => {
      if (w.dead) return;
      const T = TABS[w.st.tab], jit = s => (Math.random() - .5) * s;
      const rows = PROCS.map(p => {
        const q = p.slice();
        q[2] = Math.max(0, q[2] + jit(1.4)); q[6] = Math.max(0, q[6] + jit(1.8));
        q[7] = Math.max(0, q[7] + jit(.5)); q[8] = Math.max(0, q[8] + jit(40));
        return q;
      }).sort((a, b) => b[T.key] - a[T.key]);
      w.node.querySelector('[data-head]').innerHTML =
        T.cols.map((c, i) => \`<span style="\${i ? 'width:104px;text-align:right' : 'flex:1'}">\${c}</span>\`).join('');
      w.node.querySelector('[data-proc]').innerHTML = rows.map((p, i) => \`
        <div class="r\${i % 2 ? ' alt' : ''}"><span class="nm" style="flex:1">\${esc(p[0])}</span>
          \${T.cells(p).map((v, k) => \`<span style="width:104px;text-align:right;font-variant-numeric:tabular-nums;\${k === 1 && T.hot(p) ? 'color:var(--red);font-weight:600;' : ''
        }\${k === 4 ? 'color:var(--txt-2)' : ''}">\${v}</span>\`).join('')}</div>\`).join('');
      w.node.querySelector('[data-legend]').innerHTML = T.legend(rows).map(([k, v]) =>
        \`<span style="color:var(--txt-2)">\${k}:</span><b style="font-variant-numeric:tabular-nums">\${v}</b>\`).join('');
      const C = 2 * Math.PI * 22, load = T.ring(rows) / 100;
      w.node.querySelector('[data-cpuring]').innerHTML = \`<svg viewBox="0 0 52 52" style="width:52px;height:52px">
        <circle cx="26" cy="26" r="22" fill="none" stroke="var(--fill-2)" stroke-width="6"/>
        <circle cx="26" cy="26" r="22" fill="none" stroke="\${T.hue}" stroke-width="6" stroke-linecap="round"
          stroke-dasharray="\${C}" stroke-dashoffset="\${C * (1 - load)}" transform="rotate(-90 26 26)"/>
        <text x="26" y="29.5" text-anchor="middle" font-size="11" font-weight="600" fill="currentColor">\${Math.round(load * 100)}%</text></svg>\`;
      const h = hist[w.st.tab];
      h.push(clamp(load * 100, 2, 96)); h.shift();
      const pts = h.map((v, i) => \`\${(i / (h.length - 1) * 100).toFixed(2)},\${(100 - v).toFixed(1)}\`).join(' ');
      w.node.querySelector('[data-graph]').innerHTML =
        \`<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:100%">
          <polygon points="0,100 \${pts} 100,100" fill="\${T.hue}30"/>
          <polyline points="\${pts}" fill="none" stroke="\${T.hue}" stroke-width="1.2" vector-effect="non-scaling-stroke"/></svg>\`;
    };
    on(w.node, 'click', '[data-am]', (e, t) => {
      w.st.tab = t.dataset.am;
      $$('[data-am]', w.node).forEach(b => b.classList.toggle('on', b === t));
      tick();
    });
    tick(); w.actTimer = setInterval(tick, 1400);
  },
  onClose(w) { clearInterval(w.actTimer); }
};

APPS.diskutil = {
  name: 'Disk Utility', icon: 'app-diskutil', w: 800, h: 520, minW: 560, minH: 340,
  menus: () => stdMenus('diskutil'),
  mount() {
    const used = 842, total = 2048, pct = used / total;
    const seg = [['Apps', 214, '#0a84ff'], ['Documents', 168, '#30d158'], ['Photos', 296, '#ff9f0a'], ['System', 164, '#8e8e93']];
    return \`<div class="wb">
      <div class="sbar" data-drag style="width:222px">
        <div style="display:flex;align-items:center;height:38px;padding:0 12px"><div data-tl></div></div>
        <div class="grp"><div class="gh">Internal</div>
          <div class="si">\${ic('g-hd', 'ico')}<span class="nm">APPLE SSD AP2048</span></div>
          <div class="si on" style="padding-left:26px">\${ic('g-hd', 'ico')}<span class="nm">Macintosh HD</span></div>
          <div class="si" style="padding-left:26px">\${ic('g-hd', 'ico')}<span class="nm">Data</span></div>
        </div>
        <div class="grp"><div class="gh">External</div>
          <div class="si">\${ic('g-hd', 'ico')}<span class="nm">Backup T7</span></div></div>
      </div>
      <div class="wmain">
        <div class="tbar" data-drag style="height:52px">
          <button class="tbtn" data-nodrag data-duadd title="Add Volume">\${ic('g-plus')}</button>
          <button class="tbtn" data-nodrag data-durm title="Remove Volume">\${ic('g-minus')}</button>
          <div class="fx-title">Macintosh HD</div><div style="flex:1"></div>
          <button class="btn" data-nodrag data-dufa>First Aid</button>
          <button class="btn" data-nodrag data-duerase>Erase</button>
        </div>
        <div class="scroll" style="flex:1;padding:24px 28px">
          <div style="display:flex;gap:18px;align-items:center">
            <div style="width:74px;height:74px">\${ic('f-hd')}</div>
            <div><div style="font-size:20px;font-weight:600;letter-spacing:-.02em">Macintosh HD</div>
              <div style="font-size:12.5px;color:var(--txt-2)">APFS Volume · Internal · Encrypted</div></div>
          </div>
          <div style="margin-top:22px;height:30px;border-radius:6px;overflow:hidden;display:flex;box-shadow:0 0 0 .5px var(--line)">
            \${seg.map(([, v, c]) => \`<div style="width:\${v / total * 100}%;background:\${c}"></div>\`).join('')}
            <div style="flex:1;background:var(--win-3)"></div>
          </div>
          <div style="display:flex;gap:20px;flex-wrap:wrap;margin-top:12px;font-size:12px">
            \${seg.map(([n, v, c]) => \`<span style="display:flex;align-items:center;gap:6px">
              <i style="width:9px;height:9px;border-radius:2px;background:\${c};display:block"></i>\${n} — \${v} GB</span>\`).join('')}
            <span style="display:flex;align-items:center;gap:6px;color:var(--txt-2)">
              <i style="width:9px;height:9px;border-radius:2px;background:var(--win-3);display:block"></i>Free — \${total - used} GB</span>
          </div>
          <div style="margin-top:24px;display:grid;grid-template-columns:repeat(2,1fr);gap:1px;background:var(--line);border-radius:10px;overflow:hidden">
            \${[['Mount Point', '/'], ['Capacity', '2.05 TB'], ['Available', \`\${((total - used) / 1000).toFixed(2)} TB (\${(100 - pct * 100).toFixed(0)}%)\`],
        ['Used', \`\${(used / 1000).toFixed(2)} TB\`], ['Type', 'APFS Volume'], ['Owners', 'Enabled'],
        ['Connection', 'PCI-Express'], ['Device', 'disk3s5s1']]
        .map(([k, v]) => \`<div style="background:var(--win-2);padding:9px 14px;display:flex;justify-content:space-between;font-size:12.5px">
              <span style="color:var(--txt-2)">\${k}:</span><b style="font-weight:550">\${v}</b></div>\`).join('')}
          </div></div></div></div>\`;
  },
  ready(w) {
    /* First Aid runs a real progress sheet; Erase asks first, and refuses the boot
       volume the way Disk Utility does. */
    on(w.node, 'click', '[data-dufa]', () => {
      const node = el(\`<div class="pop" style="width:400px;padding:16px">
        <div style="font-size:13px;font-weight:600;margin-bottom:4px">First Aid</div>
        <div style="font-size:12px;color:var(--txt-2);margin-bottom:12px">Checking Macintosh HD for errors.</div>
        <div style="height:6px;border-radius:3px;background:var(--fill-2);overflow:hidden"><i data-bar style="display:block;height:100%;width:0;background:var(--blue);transition:width .3s linear"></i></div>
        <pre data-log style="margin:10px 0 0;font:11px/1.55 var(--mono);color:var(--txt-2);max-height:110px;overflow:auto;white-space:pre-wrap"></pre>
        <div style="display:flex;justify-content:flex-end;margin-top:12px"><button class="btn pri" data-done style="height:24px" disabled>Done</button></div></div>\`);
      Pop.open(node, { x: innerWidth / 2 - 200, y: 160, origin: 'top center' });
      const steps = ['Running First Aid on “Macintosh HD”', 'Checking the container superblock',
        'Checking the object map', 'Checking the fsroot tree', 'Checking the snapshot metadata tree',
        'Verifying allocated space', 'The volume Macintosh HD appears to be OK', 'Operation successful.'];
      const log = node.querySelector('[data-log]'), bar = node.querySelector('[data-bar]');
      steps.forEach((s, i) => setTimeout(() => {
        if (!node.isConnected) return;
        log.textContent += s + '\n'; log.scrollTop = log.scrollHeight;
        bar.style.width = ((i + 1) / steps.length * 100) + '%';
        if (i === steps.length - 1) { const d = node.querySelector('[data-done]'); d.disabled = false; d.onclick = () => Pop.close(); }
      }, 260 + i * 340));
    });
    on(w.node, 'click', '[data-duerase]', () => {
      const node = el(\`<div class="pop" style="width:340px;padding:16px;text-align:center">
        <div style="width:52px;height:52px;margin:0 auto 10px">\${ic('f-hd')}</div>
        <div style="font-size:13px;font-weight:600">Erase “Macintosh HD”?</div>
        <div style="font-size:12px;color:var(--txt-2);margin:6px 0 14px">This is the startup disk. Erasing it would take the whole desktop with it — including this window.</div>
        <div style="display:flex;gap:8px"><button class="btn" data-x style="flex:1;height:26px">Cancel</button>
          <button class="btn" data-e style="flex:1;height:26px;background:var(--red);color:#fff">Erase</button></div></div>\`);
      Pop.open(node, { x: innerWidth / 2 - 170, y: 180, origin: 'top center' });
      node.querySelector('[data-x]').onclick = () => Pop.close();
      node.querySelector('[data-e]').onclick = () => { Pop.close(); Toast('Erase blocked — cannot erase the startup disk'); };
    });
    on(w.node, 'click', '[data-duadd]', () => Toast('Add APFS Volume — container is at capacity'));
    on(w.node, 'click', '[data-durm]', () => Toast('Select a non-system volume to remove'));
  }
};

APPS.fontbook = {
  name: 'Font Book', icon: 'app-fontbook', w: 820, h: 560, minW: 540, minH: 340,
  menus: () => stdMenus('fontbook'),
  mount(w) {
    w.st = { sel: 0 };
    const FONTS = [
      ['SF Pro', '-apple-system,BlinkMacSystemFont,Inter,sans-serif', 'Regular · Medium · Semibold · Bold'],
      ['Inter', 'Inter,sans-serif', 'Variable 100–900'],
      ['Helvetica Neue', '"Helvetica Neue",Helvetica,sans-serif', 'Regular · Bold · Italic'],
      ['Georgia', 'Georgia,serif', 'Regular · Italic · Bold'],
      ['Times New Roman', '"Times New Roman",Times,serif', 'Regular · Bold'],
      ['JetBrains Mono', '"JetBrains Mono",ui-monospace,monospace', 'Regular · Bold'],
      ['Courier New', '"Courier New",monospace', 'Regular · Bold'],
      ['Impact', 'Impact,sans-serif', 'Regular'],
    ];
    w.FONTS = FONTS;
    return \`<div class="wb">
      <div class="sbar" data-drag style="width:230px">
        <div style="display:flex;align-items:center;height:38px;padding:0 12px"><div data-tl></div></div>
        <div class="grp"><div class="gh">Collection</div>
          <div class="si on">\${ic('g-title', 'ico')}<span class="nm">All Fonts</span><span class="tail">\${FONTS.length}</span></div>
          <div class="si">\${ic('g-star', 'ico')}<span class="nm">Favourites</span></div>
          <div class="si">\${ic('g-tag', 'ico')}<span class="nm">Recently Used</span></div>
        </div>
        <div class="grp"><div class="gh">Family</div>
          \${FONTS.map(([n], i) => \`<div class="si" data-fi="\${i}"><span class="nm" style="font-family:\${FONTS[i][1]}">\${esc(n)}</span></div>\`).join('')}
        </div>
      </div>
      <div class="wmain">
        <div class="tbar" data-drag style="height:52px"><div class="fx-title" data-fname></div><div style="flex:1"></div>
          <div class="sfield" data-nodrag style="width:150px"><span>\${ic('g-search')}</span><input placeholder="Search"></div></div>
        <div class="scroll" style="flex:1;padding:26px 30px" data-fbody></div>
      </div></div>\`;
  },
  ready(w) {
    const render = i => {
      const [n, f, styles] = w.FONTS[i];
      $$('[data-fi]', w.node).forEach(b => b.classList.toggle('on', +b.dataset.fi === i));
      w.node.querySelector('[data-fname]').textContent = n;
      w.node.querySelector('[data-fbody]').innerHTML = \`
        <div style="font-family:\${f};font-size:64px;line-height:1.1;letter-spacing:-.03em">Aa Bb Cc</div>
        <div style="font-size:12px;color:var(--txt-2);margin:6px 0 22px">\${esc(styles)}</div>
        \${[42, 30, 22, 17, 13, 11].map(s => \`<div style="font-family:\${f};font-size:\${s}px;line-height:1.35;margin-bottom:9px;letter-spacing:-.01em">
          The quick brown fox jumps over the lazy dog. 0123456789</div>\`).join('')}\`;
    };
    on(w.node, 'click', '[data-fi]', (e, t) => render(+t.dataset.fi));
    render(0);
  }
};

APPS.voice = {
  name: 'Voice Memos', icon: 'app-voice', w: 720, h: 500, minW: 460, minH: 320,
  menus: () => stdMenus('voice'),
  mount(w) {
    const M = [['Standup notes', 'Today 4:02 PM', '1:12'], ['Dock easing idea', 'Today 11:40 AM', '0:38'],
    ['Call with Daniel', 'Yesterday', '14:26'], ['Guitar riff', 'Saturday', '2:04']];
    w.M = M;
    return \`<div class="wb">
      <div class="sbar" data-drag style="width:260px;padding-top:0">
        <div style="display:flex;align-items:center;height:38px;padding:0 12px"><div data-tl></div></div>
        <div style="padding:0 10px 8px"><div class="sfield" data-nodrag><span>\${ic('g-search')}</span><input placeholder="Search"></div></div>
        <div style="overflow:auto;padding:0 8px">
        \${M.map(([n, d, l], i) => \`<div class="si" data-vi="\${i}" style="height:44px;align-items:center">
          <span style="flex:1;min-width:0;display:flex;flex-direction:column"><b style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">\${esc(n)}</b>
          <span style="font-size:11px;color:var(--txt-2)">\${esc(d)}</span></span>
          <span style="font-size:11.5px;color:var(--txt-3);font-variant-numeric:tabular-nums">\${l}</span></div>\`).join('')}
        </div></div>
      <div class="wmain"><div class="tbar" data-drag style="height:52px"><div class="fx-title" data-vname></div></div>
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:20px 30px" data-vbody></div>
      </div></div>\`;
  },
  ready(w) {
    const bars = n => [...Array(n)].map((_, i) => {
      const h = 8 + Math.abs(Math.sin(i * .7) * 40) + Math.abs(Math.sin(i * .23) * 22);
      return \`<i style="height:\${h.toFixed(0)}%"></i>\`;
    }).join('');
    const secs = l => { const [m, s] = l.split(':').map(Number); return m * 60 + s; };
    const st = w.st = { i: 0, pos: 0, playing: false };
    const render = i => {
      if (i !== undefined && i !== st.i) { st.i = i; st.pos = 0; st.playing = false; }
      const [n, d, l] = w.M[st.i], dur = secs(l);
      $$('[data-vi]', w.node).forEach(b => b.classList.toggle('on', +b.dataset.vi === st.i));
      w.node.querySelector('[data-vname]').textContent = n;
      w.node.querySelector('[data-vbody]').innerHTML = \`
        <div style="font-size:19px;font-weight:600;letter-spacing:-.02em">\${esc(n)}</div>
        <div style="font-size:12px;color:var(--txt-2);margin-top:-12px">\${esc(d)}</div>
        <div class="wave" data-vwave>\${bars(78)}</div>
        <div style="display:flex;align-items:center;gap:10px;width:100%;max-width:420px;font-size:11px;color:var(--txt-2);font-variant-numeric:tabular-nums">
          <span data-vcur>0:00</span><div class="sl" data-vbar style="flex:1"><i style="width:0%"></i><b style="left:0%"></b></div><span>\${l}</span></div>
        <div style="display:flex;align-items:center;gap:26px;margin-top:4px">
          <button class="tbtn" data-vskip="-5" title="Back 5s">\${ic('g-bwd')}</button>
          <button class="btn pri" data-vplay style="width:46px;height:46px;border-radius:50%;padding:0;display:grid;place-items:center">\${ic(st.playing ? 'g-pause' : 'g-play')}</button>
          <button class="tbtn" data-vskip="5" title="Forward 5s">\${ic('g-fwd')}</button></div>\`;
      w.node.querySelector('.btn.pri svg').style.cssText = 'width:17px;height:17px';
      paint(dur);
    };
    /* The waveform dims ahead of the playhead, which is how you can tell it is
       actually playing rather than just animating a bar. */
    const paint = dur => {
      const f = clamp(st.pos / dur, 0, 1);
      const bar = w.node.querySelector('[data-vbar]');
      if (!bar) return;
      bar.querySelector('i').style.width = f * 100 + '%';
      bar.querySelector('b').style.left = f * 100 + '%';
      w.node.querySelector('[data-vcur]').textContent = mmss(Math.round(st.pos));
      const wave = w.node.querySelector('[data-vwave]');
      const n = wave.children.length;
      [...wave.children].forEach((b, k) => b.style.opacity = k / n <= f ? '1' : '.32');
    };
    on(w.node, 'click', '[data-vi]', (e, t) => render(+t.dataset.vi));
    on(w.node, 'click', '[data-vplay]', () => { st.playing = !st.playing; render(); });
    on(w.node, 'click', '[data-vskip]', (e, t) => {
      const dur = secs(w.M[st.i][2]);
      st.pos = clamp(st.pos + +t.dataset.vskip, 0, dur); paint(dur);
    });
    on(w.node, 'pointerdown', '[data-vbar]', (e, t) => {
      const dur = secs(w.M[st.i][2]), r = t.getBoundingClientRect();
      const move = ev => { st.pos = clamp((ev.clientX - r.left) / r.width, 0, 1) * dur; paint(dur); };
      move(e);
      const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
      addEventListener('pointermove', move); addEventListener('pointerup', up);
    });
    w.vTimer = setInterval(() => {
      if (w.dead || !st.playing) return;
      const dur = secs(w.M[st.i][2]);
      st.pos += .25;
      if (st.pos >= dur) { st.pos = dur; st.playing = false; render(); return; }
      paint(dur);
    }, 250);
    render(0);
  },
  onClose(w) { clearInterval(w.vTimer); }
};

APPS.launchpad = { name: 'Launchpad', icon: 'app-launchpad', overlay: true };
APPS.trash = { name: 'Trash', icon: 'app-trash', overlay: true };
`);
