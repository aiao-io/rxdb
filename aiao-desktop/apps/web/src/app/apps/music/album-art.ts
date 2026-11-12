import { Component, computed, input } from '@angular/core';

import { ART } from './music-data';

/** 柱状封面里每根柱子的高度；第六根是被点亮的那根。 */
const BAR_HEIGHTS = [34, 58, 22, 74, 46, 88, 30, 62, 40];
const BARS = BAR_HEIGHTS.map((height, k) => ({ x: 10 + k * 9, y: 94 - height, height }));

/** 半色调封面：7 × 7 的圆点，离中心越远越小。 */
const HALFTONE = Array.from({ length: 49 }, (_, n) => {
  const row = Math.floor(n / 7);
  const col = n % 7;
  const distance = Math.sqrt((col - 3) ** 2 + (row - 3) ** 2);
  return { cx: 14 + col * 12, cy: 14 + row * 12, r: (5.4 - distance * 1.05).toFixed(2) };
});

const DIAGONALS = Array.from({ length: 8 }, (_, k) => `M${-30 + k * 22} 110L${20 + k * 22} -10`);

/** 程序生成的专辑封面：渐变底加一个构图；渐变 id 随序号固定为 `ag<序号>`。 */
@Component({
  selector: 'app-album-art',
  host: { style: 'display: contents' },
  template: `
    <svg preserveAspectRatio="none" style="width: 100%; height: 100%" viewBox="0 0 100 100">
      <defs>
        <linearGradient [attr.id]="gradientId()" x1="0" x2=".7" y1="0" y2="1">
          <stop [attr.stop-color]="art().gradient[0]" offset="0" />
          <stop [attr.stop-color]="art().gradient[1]" offset="1" />
        </linearGradient>
      </defs>
      <rect [attr.fill]="'url(#' + gradientId() + ')'" height="100" width="100" />
      @switch (art().shape) {
        @case ('circles') {
          <circle cx="50" cy="42" fill="rgba(255,255,255,.14)" r="26" />
          <circle cx="50" cy="42" fill="rgba(255,255,255,.18)" r="17" />
          <circle cx="50" cy="42" fill="rgba(255,255,255,.85)" r="8" />
          <rect fill="rgba(255,255,255,.5)" height="4" rx="2" width="46" x="18" y="80" />
        }
        @case ('waves') {
          <path d="M0 62c14 0 14-14 28-14s14 14 28 14 14-14 28-14 14 14 28 14v46H0z" fill="rgba(255,255,255,.16)" />
          <path d="M0 76c14 0 14-12 28-12s14 12 28 12 14-12 28-12 14 12 28 12v34H0z" fill="rgba(255,255,255,.22)" />
          <rect fill="rgba(255,255,255,.6)" height="4" rx="2" width="34" x="16" y="18" />
        }
        @case ('sun') {
          <circle cx="50" cy="56" fill="rgba(255,255,255,.9)" r="22" />
          <g stroke="rgba(255,255,255,.55)" stroke-linecap="round" stroke-width="3">
            <path d="M50 16v12M50 84v12M10 56h12M78 56h12M22 28l8 8M70 76l8 8M78 28l-8 8M30 76l-8 8" />
          </g>
        }
        @case ('bars') {
          <g fill="rgba(255,255,255,.26)">
            @for (bar of bars; track bar.x) {
              <rect [attr.height]="bar.height" [attr.x]="bar.x" [attr.y]="bar.y" rx="2.6" width="5.5" />
            }
          </g>
          <rect fill="rgba(255,255,255,.9)" height="88" rx="2.6" width="5.5" x="55" y="6" />
        }
        @case ('halftone') {
          <g fill="rgba(0,0,0,.18)">
            @for (dot of halftone; track $index) {
              <circle [attr.cx]="dot.cx" [attr.cy]="dot.cy" [attr.r]="dot.r" />
            }
          </g>
        }
        @case ('diag') {
          <g stroke="rgba(255,255,255,.2)" stroke-width="7">
            @for (line of diagonals; track line) {
              <path [attr.d]="line" />
            }
          </g>
          <circle cx="50" cy="50" fill="rgba(255,255,255,.9)" r="14" />
        }
        @case ('arch') {
          <path d="M26 92V44a24 24 0 0 1 48 0v48z" fill="rgba(255,255,255,.6)" />
          <path d="M38 92V46a12 12 0 0 1 24 0v46z" fill="rgba(0,0,0,.16)" />
          <rect fill="rgba(0,0,0,.2)" height="4" width="72" x="14" y="92" />
        }
        @case ('peaks') {
          <path d="M0 74 26 40l17 20 21-30 36 44v26H0z" fill="rgba(255,255,255,.2)" />
          <path d="M0 86 30 60l20 16 24-14 26 20v18H0z" fill="rgba(255,255,255,.34)" />
          <circle cx="74" cy="26" fill="rgba(255,255,255,.85)" r="10" />
        }
      }
    </svg>
  `
})
export class AlbumArt {
  protected readonly bars = BARS;
  protected readonly halftone = HALFTONE;
  protected readonly diagonals = DIAGONALS;
  protected readonly art = computed(() => ART[this.index() % ART.length]);
  protected readonly gradientId = computed(() => `ag${this.index()}`);
  readonly index = input.required<number>();
}
