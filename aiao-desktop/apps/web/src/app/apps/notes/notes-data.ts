/** 一条笔记；`body` 是可编辑区里的 HTML。 */
export interface Note {
  readonly id: number;
  readonly folder: string;
  readonly title: string;
  readonly date: Date;
  readonly body: string;
  readonly pin?: boolean;
}

const dt = (month: number, day: number, hour = 10, minute = 24): Date => new Date(2026, month - 1, day, hour, minute);

/** 待办勾选框里的勾，与图标精灵引用同一个 symbol。 */
export const CHECK_ICON = '<svg class="" aria-hidden="true"><use href="#g-check"/></svg>';

const todo = (text: string, done = false): string =>
  `<div class="todo${done ? ' done' : ''}"><i>${CHECK_ICON}</i><span>${text}</span></div>`;

export const NOTE_SEED: readonly Note[] = [
  {
    id: 1,
    folder: 'Notes',
    title: 'Interface rules',
    date: dt(7, 27, 16, 12),
    pin: true,
    body: `<h1>Interface rules</h1><div class="date">27 July 2026 at 4:12 PM</div>
<p>Collected from things that felt wrong and then didn't.</p>
<h2>Motion</h2>
${todo('Nothing animates longer than <b>350ms</b>. Past that it reads as lag, not polish.', true)}
${todo('Menus open instantly. Panels can take their time.', true)}
${todo("If a transition can't hold 60fps, cut the effect, not the duration.")}
${todo('Easing out beats easing in — arrivals matter more than departures.')}
<h2>Depth</h2><ul><li>One shadow reads as a sticker. Stack them.</li><li>Blur is not translucency. You need both.</li><li>An unfocused window should look asleep, not disabled.</li></ul>`
  },
  {
    id: 2,
    folder: 'Notes',
    title: 'Window shadow recipe',
    date: dt(7, 26, 21, 40),
    body: `<h1>Window shadow recipe</h1><div class="date">26 July 2026 at 9:40 PM</div>
<p>One shadow always looks fake. macOS stacks four.</p>
<table><tr><th>Layer</th><th>Purpose</th></tr>
<tr><td>0 0 0 .5px</td><td>the hairline that defines the edge</td></tr>
<tr><td>0 3px 8px</td><td>contact shadow, keeps it from floating</td></tr>
<tr><td>0 14px 28px</td><td>the body of the shadow</td></tr>
<tr><td>0 40px 80px</td><td>ambient spill — this is the expensive one</td></tr></table>
<p>Unfocused windows drop the last two and lighten the rest. That difference is why a stack of windows reads as a stack.</p>`
  },
  {
    id: 3,
    folder: 'Notes',
    title: 'Dock falloff',
    date: dt(7, 25, 11, 8),
    body: `<h1>Dock falloff</h1><div class="date">25 July 2026 at 11:08 AM</div>
<p>Linear distance → scale looks wrong. There's a visible crease where influence hits zero.</p>
<p>A raised cosine has zero slope at both ends, so the magnification eases in and out of the neighbouring icons instead of snapping:</p>
<p style="font-family:var(--font-mono);font-size:12.5px;background:var(--fill);padding:9px 12px;border-radius:7px">scale = 1 + (max−1) · (½ − ½cos(πu))<sup>0.86</sup></p>
<p>The 0.86 exponent narrows the peak slightly. Without it the whole row lifts and it feels mushy.</p>`
  },
  {
    id: 4,
    folder: 'Notes',
    title: 'Grocery',
    date: dt(7, 24, 19, 2),
    body: `<h1>Grocery</h1><div class="date">24 July 2026 at 7:02 PM</div>
${todo('Coffee — the good one', true)}
${todo('Oat milk', true)}
${todo('Paneer')}
${todo('Tomatoes, ginger, green chilli')}
${todo('Dark chocolate (85%)')}`
  },
  {
    id: 5,
    folder: 'Notes',
    title: 'Sprint planning',
    date: dt(7, 20, 9, 30),
    body: `<h1>Sprint planning</h1><div class="date">20 July 2026 at 9:30 AM</div>
<h2>Ship</h2><ul><li>Column view in Finder, with a working preview pane</li><li>Terminal tab completion (longest common prefix, then list)</li><li>Genie minimise — clip-path polygon, four points, don't cheat it</li></ul>
<h2>Park</h2><ul><li>Mission Control</li><li>Stage Manager</li></ul>
<p>Review PR #142 before Thursday.</p>`
  },
  {
    id: 6,
    folder: 'Recently Deleted',
    title: 'Old draft',
    date: dt(7, 12, 8, 0),
    body: `<h1>Old draft</h1><div class="date">12 July 2026 at 8:00 AM</div><p>Scrapped. The framing was wrong.</p>`
  }
];
