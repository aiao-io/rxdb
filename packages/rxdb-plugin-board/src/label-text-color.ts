import { BoardDomainError } from './errors.js';

/**
 * 标签文字色（US-539 AC#6 的对比度半边）：按 WCAG 相对亮度在黑白之间选择，
 * 保证任一侧对比度 ≥ 4.5:1。
 *
 * @remarks
 * 阈值 0.18 是解析交点：亮度恰好 0.18 时，黑字对比度 (0.18+0.05)/0.05 = 4.6，
 * 白字对比度 1.05/(0.18+0.05) ≈ 4.57，两侧都过 4.5:1。非法颜色格式直接拒绝
 * （不静默兜底，领域入口另有同码校验，见 label-service）。
 */

/** 黑白分界相对亮度阈值。 */
const CONTRAST_THRESHOLD = 0.18;

const HEX_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** 是否为合法标签颜色格式（#rgb / #rrggbb）。 */
export const isHexColor = (color: string): boolean => HEX_PATTERN.test(color.trim());

/** sRGB 通道线性化（WCAG 相对亮度公式的一部分）。 */
const linear = (channel: number): number => {
  const normalized = channel / 255;
  return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
};

/**
 * 按标签底色选择文字色（黑或白）。
 *
 * @param color - 标签颜色，`#rgb` 或 `#rrggbb`
 * @returns `#000000`（浅底黑字）或 `#ffffff`（深底白字）
 * @throws 颜色格式不合法时（`invalid_color`）
 */
export const labelTextColor = (color: string): '#000000' | '#ffffff' => {
  const matched = HEX_PATTERN.exec(color.trim());
  if (matched === null) {
    throw new BoardDomainError('invalid_color', `标签颜色必须是 #rgb 或 #rrggbb，收到 ${JSON.stringify(color)}`);
  }
  const hex = matched[1];
  const expanded = hex.length === 3 ? [...hex].map(digit => digit + digit).join('') : hex;
  const red = Number.parseInt(expanded.slice(0, 2), 16);
  const green = Number.parseInt(expanded.slice(2, 4), 16);
  const blue = Number.parseInt(expanded.slice(4, 6), 16);
  const luminance = 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
  return luminance >= CONTRAST_THRESHOLD ? '#000000' : '#ffffff';
};
