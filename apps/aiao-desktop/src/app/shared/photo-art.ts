import { Component, computed, input } from '@angular/core';

const PALETTES = [
  ['#0f2b4a', '#2d7ea8', '#9fdcef', '#ffd9a0'],
  ['#1b1030', '#5b2a7a', '#c65fa0', '#ffd1a9'],
  ['#0a2f22', '#2f7a4f', '#98d17f', '#f3f0c8'],
  ['#2b1408', '#8a4a1e', '#e0913f', '#ffe1b0'],
  ['#101418', '#3a4652', '#8b9aa8', '#dfe6ec'],
  ['#25082a', '#7a1c58', '#e0417f', '#ffd0e0'],
  ['#04202b', '#0a6f7a', '#57ccbf', '#e8fbf5'],
  ['#301a04', '#a05a12', '#f0a83c', '#fff0cf']
] as const;

interface Sun {
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  readonly o: number;
}

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** 由序号生成的一张「照片」：同一个序号永远画出同一张图（Finder、媒体书架等共用）。 */
export function photoScene(index: number, kindOverride?: number) {
  /* 一次 32 位打散同时决定配色、构图和细节，排满一墙也不会每八格重复一次。 */
  let h = Math.imul(index + 1, 2654435761) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  const t = (shift: number, n: number): number => (((h >>> shift) & 255) / 255) * n;
  const p = PALETTES[(h >>> 3) % PALETTES.length];
  const kind = kindOverride ?? (h >>> 11) % 5;
  const sun = (cx: number, cy: number, r: number, o = 0.9): Sun => ({ cx, cy, r, o });
  const bokeh = { cx: 42 + t(3, 16), cy: 42 + t(6, 16) };
  const shoreX = 24 + t(4, 40);
  const shoreY = 64 + t(8, 8);
  return {
    id: `ph${index}_${kindOverride ?? 'x'}`,
    p,
    kind,
    ridge: {
      sun: sun(58 + t(2, 30), 20 + t(5, 14), 8 + t(9, 5)),
      back: `M0 ${70 + t(6, 8)} ${20 + t(7, 12)} ${46 + t(4, 10)}l18 16 20-24 38 30v34H0z`,
      front: `M0 84 ${26 + t(8, 12)} ${62 + t(3, 10)}l22 14 26-16 22 14v30H0z`
    },
    hills: {
      sun: sun(18 + t(4, 26), 18 + t(6, 12), 7 + t(2, 4), 0.85),
      back: `M0 ${58 + t(5, 8)}c16 0 16-10 32-10s16 10 32 10 16-10 36-10v50H0z`,
      front: `M0 ${72 + t(7, 6)}c16 0 16-8 32-8s16 8 32 8 16-8 36-8v40H0z`
    },
    bokeh: { ...bokeh, r: 28 + t(9, 10), inner: 14 + t(4, 8), sun: sun(bokeh.cx, bokeh.cy, 6 + t(8, 4)) },
    skyline: {
      towers: Array.from({ length: 7 }, (_, k): Box => {
        const height = 22 + t(k * 3 + 1, 46);
        return { x: 2 + k * 14.6, y: 100 - height, width: 9 + t(k * 2, 4), height };
      }),
      sun: sun(70 + t(5, 22), 16 + t(7, 12), 7 + t(2, 4))
    },
    water: {
      sun: sun(30 + t(4, 40), 26 + t(6, 10), 8 + t(3, 4)),
      surface: 58 + t(8, 8),
      glints: Array.from({ length: 5 }, (_, k): Box => ({
        x: shoreX - (5 + k * 1.6),
        y: shoreY + k * 6,
        width: 12 + k * 4,
        height: 2.4
      })),
      shore: `M0 ${74 + t(9, 10)}h100v40H0z`
    }
  };
}

/** 程序生成的照片 SVG，铺满父容器。 */
@Component({
  selector: 'app-photo-art',
  host: { style: 'display: contents' },
  template: `
    @let s = scene();
    <svg preserveAspectRatio="xMidYMid slice" style="width: 100%; height: 100%" viewBox="0 0 100 100">
      <defs>
        <linearGradient [attr.id]="s.id" x1="0" x2="0" y1="0" y2="1">
          <stop [attr.stop-color]="s.p[1]" offset="0" />
          <stop [attr.stop-color]="s.p[2]" offset=".55" />
          <stop [attr.stop-color]="s.p[3]" offset="1" />
        </linearGradient>
      </defs>
      @if (s.kind === 0) {
        <rect [attr.fill]="fill()" height="100" width="100" />
        <circle
          [attr.cx]="s.ridge.sun.cx"
          [attr.cy]="s.ridge.sun.cy"
          [attr.fill]="s.p[3]"
          [attr.opacity]="s.ridge.sun.o"
          [attr.r]="s.ridge.sun.r"
        />
        <path [attr.d]="s.ridge.back" [attr.fill]="s.p[0]" opacity=".55" />
        <path [attr.d]="s.ridge.front" [attr.fill]="s.p[0]" />
      } @else if (s.kind === 1) {
        <rect [attr.fill]="fill()" height="100" width="100" />
        <circle
          [attr.cx]="s.hills.sun.cx"
          [attr.cy]="s.hills.sun.cy"
          [attr.fill]="s.p[3]"
          [attr.opacity]="s.hills.sun.o"
          [attr.r]="s.hills.sun.r"
        />
        <path [attr.d]="s.hills.back" [attr.fill]="s.p[0]" opacity=".45" />
        <path [attr.d]="s.hills.front" [attr.fill]="s.p[0]" />
      } @else if (s.kind === 2) {
        <rect [attr.fill]="s.p[0]" height="100" width="100" />
        <circle [attr.cx]="s.bokeh.cx" [attr.cy]="s.bokeh.cy" [attr.fill]="fill()" [attr.r]="s.bokeh.r" opacity=".92" />
        <circle
          [attr.cx]="s.bokeh.cx"
          [attr.cy]="s.bokeh.cy"
          [attr.fill]="s.p[3]"
          [attr.r]="s.bokeh.inner"
          opacity=".3"
        />
        <circle
          [attr.cx]="s.bokeh.sun.cx"
          [attr.cy]="s.bokeh.sun.cy"
          [attr.fill]="s.p[3]"
          [attr.opacity]="s.bokeh.sun.o"
          [attr.r]="s.bokeh.sun.r"
        />
      } @else if (s.kind === 3) {
        <rect [attr.fill]="fill()" height="100" width="100" />
        <g [attr.fill]="s.p[0]" opacity=".85">
          @for (tower of s.skyline.towers; track $index) {
            <rect [attr.height]="tower.height" [attr.width]="tower.width" [attr.x]="tower.x" [attr.y]="tower.y" />
          }
        </g>
        <circle
          [attr.cx]="s.skyline.sun.cx"
          [attr.cy]="s.skyline.sun.cy"
          [attr.fill]="s.p[3]"
          [attr.opacity]="s.skyline.sun.o"
          [attr.r]="s.skyline.sun.r"
        />
      } @else {
        <rect [attr.fill]="fill()" height="100" width="100" />
        <circle
          [attr.cx]="s.water.sun.cx"
          [attr.cy]="s.water.sun.cy"
          [attr.fill]="s.p[3]"
          [attr.opacity]="s.water.sun.o"
          [attr.r]="s.water.sun.r"
        />
        <rect [attr.fill]="s.p[1]" [attr.y]="s.water.surface" height="50" opacity=".55" width="100" />
        <g [attr.fill]="s.p[3]" opacity=".5">
          @for (glint of s.water.glints; track $index) {
            <rect
              [attr.height]="glint.height"
              [attr.width]="glint.width"
              [attr.x]="glint.x"
              [attr.y]="glint.y"
              rx="1.2"
            />
          }
        </g>
        <path [attr.d]="s.water.shore" [attr.fill]="s.p[0]" opacity=".8" />
      }
    </svg>
  `
})
export class PhotoArt {
  protected readonly scene = computed(() => photoScene(this.index(), this.kind()));
  protected readonly fill = computed(() => `url(#${this.scene().id})`);
  readonly index = input.required<number>();
  readonly kind = input<number>();
}
