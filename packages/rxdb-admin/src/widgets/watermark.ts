/** 水印平铺单元的参数。 */
export interface WatermarkOptions {
  /** 旋转角度（度）。 */
  readonly rotate: number;
  /** 透明度。 */
  readonly alpha: number;
  /** 单元宽度（px）。 */
  readonly width: number;
  /** 单元高度（px）。 */
  readonly height: number;
}

/** 默认水印参数。 */
export const DEFAULT_WATERMARK_OPTIONS: WatermarkOptions = { rotate: 30, alpha: 0.12, width: 240, height: 200 };

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/**
 * 水印文案：显式内容优先，空白则使用宿主提供的默认文案。
 * @param content - 偏好里的水印内容。
 * @param fallback - 默认文案（用户名、应用名）。
 * @returns 最终文案，可能为空串。
 */
export function resolveWatermarkContent(content: string, fallback: string): string {
  const trimmed = content.trim();
  return trimmed === '' ? fallback.trim() : trimmed;
}

/**
 * 生成一个平铺单元的 SVG（内嵌旋转文本）。纯函数，不触碰 DOM；文本经 XML 转义。
 * @param content - 水印文案。
 * @param options - 单元参数。
 * @returns SVG 文本。
 */
export function buildWatermarkSvg(content: string, options: WatermarkOptions = DEFAULT_WATERMARK_OPTIONS): string {
  const cx = options.width / 2;
  const cy = options.height / 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${options.width}" height="${options.height}">` +
    `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" ` +
    `transform="rotate(${options.rotate} ${cx} ${cy})" font-family="sans-serif" font-size="16" ` +
    `fill="rgba(120,120,120,${options.alpha})">${escapeXml(content)}</text></svg>`
  );
}

/**
 * 生成可直接用作 `background-image` 的 CSS `url(...)`。
 * @param content - 水印文案。
 * @returns CSS 值；文案为空返回空串。
 */
export function watermarkBackground(content: string): string {
  if (content === '') return '';
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(buildWatermarkSvg(content))}")`;
}
