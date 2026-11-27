import type { OrbitDragRegion, OrbitRect } from '@aiao/orbit/window';

const box = (left: number, top: number, width: number, height: number): string =>
  `M${left} ${top}H${left + width}V${top + height}H${left}Z`;

/**
 * 拖动层的形状：拖动区矩形按 evenodd 挖掉应用里的按钮、输入框，挖空处的指针直达应用。
 * 坐标换算成相对拖动区左上角。
 */
export function dragClipPath(region: OrbitDragRegion): string {
  const holes = region.holes.map((hole: OrbitRect) =>
    box(hole.x - region.x, hole.y - region.y, hole.width, hole.height)
  );
  return `path(evenodd, '${[box(0, 0, region.width, region.height), ...holes].join(' ')}')`;
}
