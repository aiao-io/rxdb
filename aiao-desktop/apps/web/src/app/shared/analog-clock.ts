import { Component, computed, input } from '@angular/core';

interface Hand {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

const hand = (deg: number, r1: number, r2: number): Hand => {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x1: 50 + Math.cos(a) * r1, y1: 50 + Math.sin(a) * r1, x2: 50 + Math.cos(a) * r2, y2: 50 + Math.sin(a) * r2 };
};

const TICKS = Array.from({ length: 60 }, (_, i) => {
  const big = i % 5 === 0;
  return { ...hand(i * 6, big ? 38 : 40.5, 43.5), big };
});

/** 指针表盘（时钟小组件与时钟应用共用）。 */
@Component({
  selector: 'app-analog-clock',
  host: { style: 'display: contents' },
  template: `
    <svg [style.height.px]="size()" [style.width.px]="size()" style="color: var(--txt)" viewBox="0 0 100 100">
      <circle cx="50" cy="50" fill="var(--win)" r="47" stroke="var(--line)" stroke-width="1" />
      @for (tick of ticks; track $index) {
        <line
          [attr.stroke-opacity]="tick.big ? 0.78 : 0.28"
          [attr.stroke-width]="tick.big ? 2 : 1"
          [attr.x1]="tick.x1"
          [attr.x2]="tick.x2"
          [attr.y1]="tick.y1"
          [attr.y2]="tick.y2"
          stroke="currentColor"
          stroke-linecap="round"
        />
      }
      @let h = hands();
      <line
        [attr.x1]="h.hour.x1"
        [attr.x2]="h.hour.x2"
        [attr.y1]="h.hour.y1"
        [attr.y2]="h.hour.y2"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-width="4.4"
      />
      <line
        [attr.x1]="h.minute.x1"
        [attr.x2]="h.minute.x2"
        [attr.y1]="h.minute.y1"
        [attr.y2]="h.minute.y2"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-width="3"
      />
      <line
        [attr.x1]="h.second.x1"
        [attr.x2]="h.second.x2"
        [attr.y1]="h.second.y1"
        [attr.y2]="h.second.y2"
        stroke="#ff453a"
        stroke-linecap="round"
        stroke-width="1.2"
      />
      <circle cx="50" cy="50" fill="currentColor" r="2.6" />
      <circle cx="50" cy="50" fill="#ff453a" r="1.2" />
    </svg>
  `
})
export class AnalogClock {
  protected readonly ticks = TICKS;
  protected readonly hands = computed(() => {
    const d = this.time();
    const s = d.getSeconds();
    const m = d.getMinutes() + s / 60;
    const h = (d.getHours() % 12) + m / 60;
    return { hour: hand(h * 30, -4, 25), minute: hand(m * 6, -6, 36), second: hand(s * 6, -9, 38) };
  });
  readonly time = input.required<Date>();
  readonly size = input(130);
}
