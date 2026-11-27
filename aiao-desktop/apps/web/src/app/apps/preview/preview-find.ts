import type { PdfTextItem } from './pdf-viewer';

const HIGHLIGHT = 'background:#fff2a8;color:inherit;border-radius:2px';

/** 把一个文本节点里的每处匹配拆出来包进 `<mark>`，返回命中数。 */
function wrapMatches(node: Text, pattern: RegExp, query: string): number {
  let count = 0;
  const fragment = document.createDocumentFragment();
  for (const part of (node.nodeValue ?? '').split(pattern)) {
    if (part.toLowerCase() !== query) {
      fragment.append(document.createTextNode(part));
      continue;
    }
    const mark = document.createElement('mark');
    mark.setAttribute('style', HIGHLIGHT);
    mark.textContent = part;
    fragment.append(mark);
    count++;
  }
  node.replaceWith(fragment);
  return count;
}

/**
 * 在已渲染的内容里高亮查找词：先还原旧的高亮，再把匹配文字包进 `<mark>`。
 * `query` 须为小写；短于 2 个字符只清除高亮。返回命中次数。
 */
export function markMatches(root: HTMLElement, query: string): number {
  root.querySelectorAll('mark').forEach(mark => mark.replaceWith(document.createTextNode(mark.textContent ?? '')));
  root.normalize();
  if (query.length < 2) return 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const hits: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if ((node.nodeValue ?? '').toLowerCase().includes(query)) hits.push(node);
  }
  const pattern = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig');
  return hits.reduce((total, node) => total + wrapMatches(node, pattern, query), 0);
}

/** 一条文本里的一处命中：字符区间（半开）。 */
export interface TextRange {
  readonly start: number;
  readonly end: number;
}

/** 一页里的一处命中：条目下标加上字符区间。 */
export interface PdfTextHit {
  readonly item: number;
  readonly start: number;
  readonly end: number;
}

/** 一条文本里的全部命中区间（大小写不敏感，不重叠）；查询须已小写。 */
export function hitRanges(text: string, query: string): readonly TextRange[] {
  if (!query) return [];
  const lower = text.toLowerCase();
  const ranges: TextRange[] = [];
  let at = 0;
  for (;;) {
    const start = lower.indexOf(query, at);
    if (start < 0) return ranges;
    ranges.push({ start, end: start + query.length });
    at = start + query.length;
  }
}

/** 一页文本条目里的全部命中。 */
export function findPageHits(items: readonly PdfTextItem[], query: string): readonly PdfTextHit[] {
  return items.flatMap((item, itemIndex) =>
    hitRanges(item.text, query).map(range => ({ item: itemIndex, start: range.start, end: range.end }))
  );
}

/** 全文搜索结果：命中总数与有命中的页码（从 1 起，升序）。 */
export interface PdfSearchResult {
  readonly total: number;
  readonly pages: readonly number[];
}

/** 在所有页面上统计命中，供提示与「跳到命中页」导航。 */
export function searchPdf(pages: readonly (readonly PdfTextItem[])[], query: string): PdfSearchResult {
  const hitPages: number[] = [];
  let total = 0;
  pages.forEach((items, index) => {
    const hits = findPageHits(items, query);
    if (hits.length) {
      hitPages.push(index + 1);
      total += hits.length;
    }
  });
  return { total, pages: hitPages };
}

/** 高亮层的一段文字：命中段包 `<mark>`。 */
export interface PdfLayerSegment {
  readonly text: string;
  readonly hit: boolean;
}

/** 高亮层的一行：按视口坐标绝对定位，`size` 是字号。 */
export interface PdfLayerSpan {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly segments: readonly PdfLayerSegment[];
}

/** 把一页的文本条目与命中切成高亮层 span：`y` 已按文本基线换算成盒子上沿。 */
export function layerSpans(items: readonly PdfTextItem[], hits: readonly PdfTextHit[]): readonly PdfLayerSpan[] {
  const byItem = new Map<number, readonly TextRange[]>();
  for (const hit of hits) byItem.set(hit.item, [...(byItem.get(hit.item) ?? []), { start: hit.start, end: hit.end }]);
  const spans: PdfLayerSpan[] = [];
  items.forEach((item, index) => {
    if (!item.text) return;
    const segments: PdfLayerSegment[] = [];
    let at = 0;
    for (const range of byItem.get(index) ?? []) {
      if (range.start > at) segments.push({ text: item.text.slice(at, range.start), hit: false });
      segments.push({ text: item.text.slice(range.start, range.end), hit: true });
      at = range.end;
    }
    if (at < item.text.length) segments.push({ text: item.text.slice(at), hit: false });
    spans.push({ x: item.x, y: item.y - item.height, size: item.height, segments });
  });
  return spans;
}
