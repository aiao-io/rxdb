import { PdfDocument } from './formats/pdf';

/* 内置磁盘里文本文件的内容。代码文件用 String.raw 保留反斜杠，内容里不能出现反引号与 `${`。 */

export const PRASENX_TXT = String.raw`prasenx.txt

Scratchpad. Everything on this Mac is a real file now: this note lives in the
browser's origin private file system (OPFS), and Terminal sees the same disk.

Try it in Terminal:

  cd ~/Desktop
  cat prasenx.txt
  echo "hello from the shell" > hello.txt     # shows up on the desktop
  open hello.txt                             # opens in TextEdit
  mv hello.txt ~/Documents/

This week
- Finish the shadow pass for unfocused windows (Documents/Writing/shadow-notes.md).
- Record a cleaner aurora-synth demo and drop it in ~/Music.
- Review the motion audit before Friday (Documents/Specs/motion-audit.pdf).

Links
https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system
https://vivari.run
`;

export const TODO_MD = String.raw`# Todo

- [x] Window snapping to the menu bar edge
- [x] Dock magnification that does not jitter at the edges
- [ ] Unfocused windows: drop the two outer shadow layers
- [ ] cleantype: handle quotes nested inside parentheses
- [ ] aurora-synth: expose release time in the UI
- [ ] Write up the motion audit findings
`;

export const DESKTOP_WEB_README = String.raw`# desktop-web

A desktop that runs in a browser tab: menu bar, Dock, windows, Launchpad,
Spotlight and a set of built-in apps.

## Run it

    npx serve .

Then open http://localhost:3000 and give it a second to boot.

## Principles

- Chrome is a material. Every bar samples what sits behind it: blur, then
  saturate, then tint.
- Menus open in 130 ms and panels in 300 ms. Nothing animates past 350 ms.
- If an effect cannot hold sixty frames, it goes.

screenshot.png shows the current state of the desktop.
`;

export const DESKTOP_WEB_INDEX = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>desktop-web</title>
    <style>
      :root {
        color-scheme: light dark;
        font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: linear-gradient(160deg, #2d7ea8, #9fdcef 55%, #ffd9a0);
      }
      .window {
        width: min(640px, 90vw);
        border-radius: 12px;
        overflow: hidden;
        background: rgb(250 250 252 / 0.82);
        backdrop-filter: blur(30px) saturate(1.6);
        box-shadow:
          0 0 0 0.5px rgb(0 0 0 / 0.22),
          0 1px 2px rgb(0 0 0 / 0.12),
          0 12px 32px rgb(0 0 0 / 0.18),
          0 40px 80px rgb(0 0 0 / 0.12);
      }
      .titlebar {
        display: flex;
        gap: 8px;
        align-items: center;
        height: 28px;
        padding: 0 12px;
      }
      .titlebar i {
        width: 12px;
        height: 12px;
        border-radius: 50%;
      }
      main {
        padding: 8px 28px 28px;
      }
    </style>
  </head>
  <body>
    <div class="window">
      <div class="titlebar">
        <i style="background: #ff5f57"></i><i style="background: #febc2e"></i><i style="background: #28c840"></i>
      </div>
      <main>
        <h1>desktop-web</h1>
        <p>A desktop that runs in a browser tab.</p>
      </main>
    </div>
  </body>
</html>
`;

export const CLEANTYPE_MAIN = String.raw`// cleantype — straightens out the typography of plain-text files.
//
//   swift run cleantype notes.md
//
// Straight quotes become curly ones, double and triple hyphens become en and
// em dashes, and three dots become an ellipsis. Files are rewritten in place.

import Foundation

struct Rule {
    let pattern: String
    let replacement: String
}

let rules: [Rule] = [
    Rule(pattern: #"(^|[\s(\[{])""#, replacement: "$1\u{201C}"),
    Rule(pattern: #"""#, replacement: "\u{201D}"),
    Rule(pattern: #"(^|[\s(\[{])'"#, replacement: "$1\u{2018}"),
    Rule(pattern: #"'"#, replacement: "\u{2019}"),
    Rule(pattern: #"---"#, replacement: "\u{2014}"),
    Rule(pattern: #"--"#, replacement: "\u{2013}"),
    Rule(pattern: #"\.\.\."#, replacement: "\u{2026}"),
]

func clean(_ text: String) -> String {
    rules.reduce(text) { result, rule in
        result.replacingOccurrences(of: rule.pattern, with: rule.replacement, options: .regularExpression)
    }
}

let paths = CommandLine.arguments.dropFirst()
guard !paths.isEmpty else {
    FileHandle.standardError.write(Data("usage: cleantype <file>...\n".utf8))
    exit(64)
}

for path in paths {
    let url = URL(fileURLWithPath: path)
    do {
        let original = try String(contentsOf: url, encoding: .utf8)
        try clean(original).write(to: url, atomically: true, encoding: .utf8)
        print("cleaned \(path)")
    } catch {
        FileHandle.standardError.write(Data("cleantype: \(path): \(error.localizedDescription)\n".utf8))
        exit(1)
    }
}
`;

export const CLEANTYPE_PACKAGE = String.raw`// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "cleantype",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(name: "cleantype", path: ".", sources: ["main.swift"])
    ]
)
`;

export const AURORA_SYNTH_TS = String.raw`/**
 * aurora-synth — a small polyphonic pad for the Web Audio API.
 *
 * Every voice is two slightly detuned sawtooth oscillators through a low-pass
 * filter, with a slow attack and a long release.
 */

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Frequency of a note in equal temperament, A4 = 440 Hz. */
export function frequency(name: string, octave: number): number {
  const semitone = NOTE_NAMES.indexOf(name);
  if (semitone < 0) throw new Error('unknown note ' + name);
  return 440 * Math.pow(2, (semitone - 9) / 12 + (octave - 4));
}

export interface Voice {
  stop(): void;
}

export class AuroraSynth {
  private readonly context = new AudioContext();
  private readonly output = this.context.createGain();

  constructor(
    private readonly attack = 0.4,
    private readonly release = 1.8
  ) {
    this.output.gain.value = 0.18;
    this.output.connect(this.context.destination);
  }

  play(hz: number): Voice {
    const now = this.context.currentTime;
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1800;
    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(1, now + this.attack);
    filter.connect(envelope).connect(this.output);

    const oscillators = [-7, 7].map(detune => {
      const osc = this.context.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = hz;
      osc.detune.value = detune;
      osc.connect(filter);
      osc.start(now);
      return osc;
    });

    return {
      stop: () => {
        const end = this.context.currentTime + this.release;
        envelope.gain.cancelScheduledValues(this.context.currentTime);
        envelope.gain.setTargetAtTime(0, this.context.currentTime, this.release / 4);
        for (const osc of oscillators) osc.stop(end);
      }
    };
  }
}
`;

export const AURORA_INDEX = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>aurora-synth</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #101418; color: #dfe6ec; }
      .keys { display: flex; gap: 6px; }
      button { width: 48px; height: 140px; border: 0; border-radius: 6px; background: #3a4652; color: inherit; }
      button:active { background: #57ccbf; }
    </style>
  </head>
  <body>
    <div class="keys">
      <button data-note="C">C</button>
      <button data-note="E">E</button>
      <button data-note="G">G</button>
      <button data-note="B">B</button>
    </div>
    <script type="module">
      import { AuroraSynth, frequency } from './synth.js';

      const synth = new AuroraSynth();
      for (const key of document.querySelectorAll('button')) {
        let voice = null;
        key.addEventListener('pointerdown', () => (voice = synth.play(frequency(key.dataset.note, 4))));
        key.addEventListener('pointerup', () => voice?.stop());
      }
    </script>
  </body>
</html>
`;

export const ON_RESTRAINT_MD = String.raw`# On restraint

Most interface problems are solved by taking something away.

A gradient that cannot hold sixty frames is worse than no gradient, because a
dropped frame is louder than any colour. A shadow with six layers reads as
mud; four layers, each with one job, read as depth. A menu that animates for
half a second feels slow even when the machine is fast.

The test I keep coming back to: if the effect were removed tomorrow, would
anyone file a bug? If not, it was decoration, and decoration has a cost that
is paid on every frame.

Restraint is not minimalism. It is deciding, for every element, what it is
for, and letting it do only that.
`;

export const SHADOW_NOTES_MD = String.raw`# Shadow notes

Four layers, each with one job:

1. Hairline — 0.5px, 20% black. Defines the edge against any wallpaper.
2. Contact — 1px blur, 12%. Stops the window from floating.
3. Body — 12px offset, 32px blur, 18%. This is the shadow people notice.
4. Ambient — 40px offset, 80px blur, 12%. Spill onto the desktop.

Unfocused windows keep the hairline and the contact shadow, drop the ambient
spill, and halve the body. The change should be felt, not seen.

Open questions
- Does the Dock need its own contact shadow, or is the hairline enough?
- Sheets slide out of the title bar: shadow above them or not?
`;

export const OLD_DRAFT_MD = String.raw`# Menu timing (draft)

Menus should open in 200 ms with a spring.

(Abandoned: 200 ms felt sluggish next to the real thing, and springs on menus
draw attention to themselves. Went with 130 ms ease-out instead — see the
Interface Guidelines.)
`;

/** 桌面上那份界面指南；预览把它当作一页文档显示。 */
export const INTERFACE_GUIDELINES: PdfDocument = {
  title: 'Interface Guidelines',
  subtitle: 'Revision 4 · July 2026',
  sections: [
    {
      title: '1 · Materials',
      text: 'Chrome is a material, not a colour. Every bar, sidebar and tray samples what sits behind it — blur, then saturate, then tint. Opacity alone always reads as a sticker pasted on the window.'
    },
    {
      title: '2 · Depth',
      text: "Four shadow layers: a hairline for the edge, a contact shadow so it doesn't float, a body, and an ambient spill. Unfocused windows drop the outer two and lighten the rest."
    },
    {
      title: '3 · Motion',
      text: 'Menus in 130ms, panels in 300ms, nothing past 350ms. Ease out harder than you ease in — the arrival is what the eye judges.'
    },
    {
      title: '4 · Pointer',
      text: 'The arrow is the default state and it stays the arrow over buttons. A hand means "this navigates". A hand on everything means nothing.'
    },
    {
      title: '5 · Restraint',
      text: 'If an effect cannot hold sixty frames, remove the effect. A dropped frame is more visible than any gradient you were trying to render.'
    }
  ]
};

export const MATERIALS_SPEC: PdfDocument = {
  title: 'Materials',
  subtitle: 'Specification · July 2026',
  sections: [
    {
      title: 'Menu bar',
      text: 'Blur 30px, saturate 180%, white tint at 55% in light mode and 35% in dark mode. The bar never goes fully opaque unless a window is zoomed to fill the screen.'
    },
    {
      title: 'Sidebar',
      text: 'Blur 40px, saturate 160%, tint 45%. Selection uses the accent colour at 22% so the material stays visible underneath.'
    },
    {
      title: 'Popovers and menus',
      text: 'Blur 24px, saturate 200%, tint 70%, plus a 0.5px hairline. Menus are the most opaque material because text inside them has to stay legible over anything.'
    }
  ]
};

export const MOTION_AUDIT: PdfDocument = {
  title: 'Motion audit',
  subtitle: 'Findings · July 2026',
  sections: [
    {
      title: 'Within budget',
      text: 'Menus 130ms, popovers 180ms, Launchpad 300ms, window minimise 340ms. All ease out with a stronger curve than they ease in.'
    },
    {
      title: 'Over budget',
      text: 'Notification Centre slides for 420ms and the Spotlight results list re-layouts on every keystroke. Both should come in under 300ms.'
    },
    {
      title: 'Next steps',
      text: 'Cap every transition at 350ms, remove the spring from the Dock bounce, and measure dropped frames on the slowest supported machine before shipping.'
    }
  ]
};
