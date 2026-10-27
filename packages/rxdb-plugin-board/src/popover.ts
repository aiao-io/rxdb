/**
 * @fileoverview 弹层定位（看板 v2 菜单 / 选择器）
 *
 * 菜单与选择器渲染在看板根层、`position: fixed`，避免被横向滚动的列容器裁切；
 * 三端在打开时量出触发器矩形，交给这里换算坐标。
 */

/** 触发器矩形（视口坐标）。 */
export interface PopoverAnchor {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

/** 定位选项：`end` 与触发器右边对齐（默认），`start` 左边对齐。 */
export interface PopoverOptions {
  readonly align?: 'start' | 'end';
  /** 与触发器的间距，默认 4px。 */
  readonly gap?: number;
  /** 与视口边缘的最小距离，默认 8px。 */
  readonly margin?: number;
}

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), Math.max(min, max));

/**
 * 弹层左上角坐标：默认放在触发器下方；下方放不下且上方更宽裕时翻到上方；
 * 横向与纵向最后都夹回视口内。
 */
export const placePopover = (
  anchor: PopoverAnchor,
  size: { readonly width: number; readonly height: number },
  viewport: { readonly width: number; readonly height: number },
  options: PopoverOptions = {}
): { readonly top: number; readonly left: number } => {
  const gap = options.gap ?? 4;
  const margin = options.margin ?? 8;
  const below = anchor.bottom + gap;
  const above = anchor.top - gap - size.height;
  const roomBelow = viewport.height - margin - below;
  const roomAbove = anchor.top - gap - margin;
  const fitsBelow = roomBelow >= size.height;
  const top = fitsBelow || roomBelow >= roomAbove ? below : above;
  const left = options.align === 'start' ? anchor.left : anchor.right - size.width;
  return {
    top: clamp(top, margin, viewport.height - size.height - margin),
    left: clamp(left, margin, viewport.width - size.width - margin)
  };
};
