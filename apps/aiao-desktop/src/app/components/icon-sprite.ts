import { Component, ViewEncapsulation } from '@angular/core';

import { DAYS3 } from '../shared/format';

/**
 * Apple 式连续曲率圆角（|x|^n + |y|^n = 1，n = 5），转成 Catmull-Rom 等价的三次贝塞尔路径。
 * 在首帧前就画好，图标不会先闪一下错误的轮廓。
 */
function squircle(size: number, precision: number): string {
  const steps = 64;
  const points = Array.from({ length: steps + 1 }, (_, i): [number, number] => {
    const t = (2 * Math.PI * i) / steps;
    const x = Math.sign(Math.cos(t)) * Math.pow(Math.abs(Math.cos(t)), 0.4);
    const y = Math.sign(Math.sin(t)) * Math.pow(Math.abs(Math.sin(t)), 0.4);
    return [(size / 2) * (1 + x), (size / 2) * (1 + y)];
  });
  const n = points.length - 1;
  const f = (v: number): string => v.toFixed(precision);
  let d = `M${f(points[0][0])} ${f(points[0][1])}`;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [points[(i - 1 + n) % n], points[i], points[(i + 1) % n], points[(i + 2) % n]];
    d +=
      `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ` +
      `${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return `${d}Z`;
}

/** 图标精灵：所有 `appIcon` 引用的 symbol，以及图标共用的圆角裁剪路径。 */
@Component({
  selector: 'app-icon-sprite',
  templateUrl: './icon-sprite.html',
  styleUrl: './icon-sprite.scss',
  encapsulation: ViewEncapsulation.None,
  host: {
    '[style.display]': '"contents"'
  }
})
export class IconSprite {
  protected readonly squircle100 = squircle(100, 2);
  protected readonly squircle1 = squircle(1, 4);
  /** Dock 里的日历图标显示当天日期，和真机一样。 */
  protected readonly calendarWeekday = DAYS3[new Date().getDay()].toUpperCase();
  protected readonly calendarDay = new Date().getDate();
}
