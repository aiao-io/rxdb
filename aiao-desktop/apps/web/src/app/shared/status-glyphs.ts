import { Component, computed, input } from '@angular/core';

import { clamp } from './format';

/** 电池图标：低电量变橙/红，充电时画闪电。 */
@Component({
  selector: 'app-battery-icon',
  host: { style: 'display: contents' },
  template: `
    <svg style="width: 26px; height: 12px" viewBox="0 0 28 13">
      <rect
        fill="none"
        height="11.8"
        rx="3.6"
        stroke="currentColor"
        stroke-opacity=".45"
        stroke-width="1.1"
        width="22.8"
        x=".6"
        y=".6"
      />
      <path d="M24.9 4.6a3.1 3.1 0 0 1 0 3.8z" fill="currentColor" fill-opacity=".45" />
      <rect [attr.fill]="color()" [attr.width]="width()" height="8.6" rx="2.1" x="2.2" y="2.2" />
      @if (charging()) {
        <path
          d="M13.6 1.6 8.4 7.4h3.4l-1.4 4.8 5.4-6h-3.4z"
          fill="#fff"
          stroke="#1d1d1f"
          stroke-linejoin="round"
          stroke-opacity=".25"
          stroke-width=".7"
        />
      }
    </svg>
  `
})
export class BatteryIcon {
  protected readonly width = computed(() => ((clamp(this.percent(), 0, 100) / 100) * 18.4).toFixed(1));
  protected readonly color = computed(() => {
    const pct = this.percent();
    if (this.charging()) return '#34c759';
    if (pct <= 10) return '#ff453a';
    return pct <= 20 ? '#ff9f0a' : 'currentColor';
  });
  readonly percent = input.required<number>();
  readonly charging = input(false);
}

/** Wi‑Fi 信号格：`strength` 为 1～3。 */
@Component({
  selector: 'app-wifi-bars',
  host: { style: 'display: contents' },
  template: `
    <svg style="width: 15px; height: 12px" viewBox="0 0 16 13">
      @for (dot of dots; track $index) {
        <path d="M2 9.4a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8" />
      }
      <path d="M8 9.3a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z" fill="currentColor" opacity="1" />
      <path
        [attr.opacity]="strength() >= 2 ? 1 : 0.3"
        d="M8 5.8c-1.2 0-2.3.45-3.1 1.2a.6.6 0 0 0 0 .9l.5.5c.24.24.6.25.86.03A2.6 2.6 0 0 1 8 7.8c.65 0 1.25.22 1.74.63.26.22.62.21.86-.03l.5-.5a.6.6 0 0 0 0-.9A4.55 4.55 0 0 0 8 5.8z"
        fill="currentColor"
      />
      <path
        [attr.opacity]="strength() >= 3 ? 1 : 0.3"
        d="M8 2.1a8 8 0 0 0-5.6 2.28.6.6 0 0 0 0 .87l.5.5c.24.24.62.25.87.02A6.2 6.2 0 0 1 8 4.1a6.2 6.2 0 0 1 4.23 1.67c.25.23.63.22.87-.02l.5-.5a.6.6 0 0 0 0-.87A8 8 0 0 0 8 2.1z"
        fill="currentColor"
      />
    </svg>
  `
})
export class WifiBars {
  protected readonly dots = [0, 1, 2];
  readonly strength = input.required<number>();
}

/** 股票走势线：`steps` 决定折线的颠簸程度，区间越长越平滑。 */
@Component({
  selector: 'app-sparkline',
  host: { style: 'display: contents' },
  template: `
    <svg
      [attr.viewBox]="'0 0 ' + width() + ' ' + height()"
      preserveAspectRatio="none"
      style="width: 100%; height: 100%"
    >
      <path
        [attr.d]="path()"
        [attr.stroke]="up() ? '#28c840' : '#ff453a'"
        fill="none"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.6"
        vector-effect="non-scaling-stroke"
      />
    </svg>
  `
})
export class Sparkline {
  protected readonly path = computed(() => {
    const [w, h, seed, steps, up] = [this.width(), this.height(), this.seed(), this.steps(), this.up()];
    let d = `M0 ${h * 0.6}`;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const noise = Math.sin(i * 1.9 + seed * 3) * 0.18 + Math.sin(i * 0.7 + seed) * 0.12;
      const y = h * (up ? 0.78 - t * 0.58 + noise * 0.3 : 0.24 + t * 0.56 + noise * 0.3);
      d += ` L${(t * w).toFixed(1)} ${clamp(y, 2, h - 2).toFixed(1)}`;
    }
    return d;
  });
  readonly up = input.required<boolean>();
  readonly width = input(90);
  readonly height = input(26);
  readonly seed = input(1);
  readonly steps = input(14);
}
