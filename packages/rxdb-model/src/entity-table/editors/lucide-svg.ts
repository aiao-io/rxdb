/** Lucide 图标数据 — [tagName, attributes] 元组数组 */
export type IconData = readonly (readonly [string, Record<string, unknown>])[];

/** 将 camelCase 属性名转为 kebab-case */
function camelToKebab(s: string): string {
  return s.replace(/([A-Z])/g, m => `-${m.toLowerCase()}`);
}

const SAFE_COLOR = /^[#\w(),.\-\s/%]+$/;

const SAFE_SVG_TAGS = new Set([
  'circle',
  'ellipse',
  'line',
  'path',
  'polygon',
  'polyline',
  'rect',
  'g',
  'defs',
  'clipPath',
  'mask',
  'use',
  'text',
  'tspan',
  'linearGradient',
  'radialGradient',
  'stop',
  'filter',
  'feBlend',
  'feColorMatrix',
  'feFlood',
  'feGaussianBlur',
  'feOffset'
]);

/** 转义 HTML 属性值，防止注入 */
function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 将 `LucideIconData` 转为内联 SVG HTML 字符串
 *
 * @param icon - lucide 图标数据
 * @param color - stroke 颜色（不合法时回退 currentColor）
 * @param size - 宽高像素，默认 13
 * @returns 内联 SVG HTML 字符串
 */
export function lucideToSvgHtml(icon: IconData, color: string, size = 13): string {
  const safeColor = SAFE_COLOR.test(color) ? color : 'currentColor';
  const children = icon
    .map(([tag, attrs]) => {
      if (!SAFE_SVG_TAGS.has(tag)) return '';
      const attrStr = Object.entries(attrs)
        .filter(([k]) => k !== 'key')
        .map(([k, v]) => `${camelToKebab(k)}="${escapeAttr(String(v))}"`)
        .join(' ');
      return `<${tag} ${attrStr}/>`;
    })
    .join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" ` +
    `fill="none" stroke="${safeColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ` +
    `style="flex-shrink:0;display:block">${children}</svg>`
  );
}
