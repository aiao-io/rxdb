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

const SVG_NS = 'http://www.w3.org/2000/svg' as const;

/**
 * 校验图标数据中的属性名：只接受普通 SVG 呈现属性，
 * 拒绝事件处理（on*）、URL（href）与样式属性，以及含注入字符的非法名称。
 */
function isSafeAttrName(name: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9-]*$/.test(name) && !/^on/i.test(name) && name !== 'href' && name !== 'style';
}

/**
 * 将 `LucideIconData` 转为内联 SVG 元素（DOM API 构造，免疫标记注入）
 *
 * @param icon - lucide 图标数据
 * @param color - stroke 颜色（不合法时回退 currentColor）
 * @param size - 宽高像素，默认 13
 * @returns 内联 SVG 元素
 */
export function lucideToSvgElement(icon: IconData, color: string, size = 13): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', SAFE_COLOR.test(color) ? color : 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('style', 'flex-shrink:0;display:block');
  for (const [tag, attrs] of icon) {
    if (!SAFE_SVG_TAGS.has(tag)) continue;
    const child = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'key') continue;
      const name = camelToKebab(k);
      if (!isSafeAttrName(name)) continue;
      child.setAttribute(name, String(v));
    }
    svg.appendChild(child);
  }
  return svg;
}
