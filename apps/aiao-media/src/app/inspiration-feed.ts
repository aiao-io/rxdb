const unregisteredRatio = 4 / 5;
// 原创构图示意的 viewBox 统一为 800×450。
const artRatio = 800 / 450;
// 社区参考图的像素尺寸；单测逐张对照 public/image-examples 下的文件，换图后须同步。
const referenceSizes = new Map<string, readonly [width: number, height: number]>([
  ['/image-examples/coffee.jpg', [675, 1200]],
  ['/image-examples/ceramic.jpg', [960, 1200]],
  ['/image-examples/map.jpg', [1080, 1080]],
  ['/image-examples/illustration.jpg', [720, 1080]],
  ['/image-examples/vr.jpg', [800, 1200]],
  ['/image-examples/portrait.jpg', [684, 1200]]
]);
// 与样式里的列间距、单列最小宽度保持一致；标题与作者行相对列宽的高度只用来估算各列高低。
const columnGap = 16;
const minColumnWidth = 190;
const captionRatio = 0.35;

/** 灵感封面的宽高比（宽 / 高）；首页卡片据此预留空间，图片加载前后高度不变。 */
export function coverRatio(image: string): number {
  if (image.startsWith('/prompt-art/')) return artRatio;
  const size = referenceSizes.get(image);
  return size ? size[0] / size[1] : unregisteredRatio;
}

/** 作者头像里显示的首个字符；按码点取，避免把表情符号劈成半个。 */
export function authorInitial(author: string): string {
  return Array.from(author.trim())[0] ?? '';
}

/**
 * 瀑布流在给定内容宽度下的列数，手机宽度也至少两列。
 * `minWidth` 是单列的最小宽度，`maxColumns` 是列数上限，都由用户选的卡片大小决定；窗口宽到放得下更多列时
 * 列数停在上限，卡片随之变大。不传时用默认的 190 px、不设上限。
 */
export function columnCount(width: number, minWidth = minColumnWidth, maxColumns = Infinity): number {
  return Math.max(2, Math.min(maxColumns, Math.floor((width + columnGap) / (minWidth + columnGap))));
}

/** 瀑布流分列：按封面比例估算高度，依次放进当前最矮的一列，同高靠左，使前几张排在第一排。 */
export function distribute<T extends { image: string }>(items: readonly T[], count: number): T[][] {
  const lanes = Array.from({ length: count }, () => ({ items: [] as T[], height: 0 }));
  for (const item of items) {
    const lane = lanes.reduce((shortest, next) => (next.height < shortest.height ? next : shortest));
    lane.items.push(item);
    lane.height += 1 / coverRatio(item.image) + captionRatio;
  }
  return lanes.map(lane => lane.items);
}
