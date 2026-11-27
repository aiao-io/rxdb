// @vitest-environment node
import { describe, expect, it } from 'vitest';

import type { PdfTextItem } from './pdf-viewer';
import { findPageHits, hitRanges, layerSpans, searchPdf } from './preview-find';

const item = (text: string, x = 10, y = 20, height = 8): PdfTextItem => ({ text, x, y, width: 30, height });

describe('hitRanges 命中区间', () => {
  it('大小写不敏感，多处命中不重叠', () => {
    expect(hitRanges('Find the finder find', 'find')).toEqual([
      { start: 0, end: 4 },
      { start: 9, end: 13 },
      { start: 16, end: 20 }
    ]);
  });

  it('空查询没有命中', () => {
    expect(hitRanges('text', '')).toEqual([]);
  });
});

describe('findPageHits 一页内的命中', () => {
  it('跨条目统计并带回条目下标', () => {
    const items = [item('hello world'), item('say hello')];
    expect(findPageHits(items, 'hello')).toEqual([
      { item: 0, start: 0, end: 5 },
      { item: 1, start: 4, end: 9 }
    ]);
  });
});

describe('searchPdf 全文搜索', () => {
  it('统计命中总数与命中页码', () => {
    const pages = [[item('one two')], [item('two again')], [item('nothing')], [item('two two')]];
    expect(searchPdf(pages, 'two')).toEqual({ total: 4, pages: [1, 2, 4] });
  });

  it('没有命中时总数 0、页码为空', () => {
    expect(searchPdf([[item('abc')]], 'zzz')).toEqual({ total: 0, pages: [] });
  });
});

describe('layerSpans 高亮层分段', () => {
  it('命中段包 mark、非命中段保留，y 换算成盒子上沿', () => {
    const items = [item('aXb', 10, 20, 8)];
    const hits = findPageHits(items, 'x');
    expect(layerSpans(items, hits)).toEqual([
      {
        x: 10,
        y: 12,
        size: 8,
        segments: [
          { text: 'a', hit: false },
          { text: 'X', hit: true },
          { text: 'b', hit: false }
        ]
      }
    ]);
  });

  it('没有命中的条目整体是一段非命中文本', () => {
    const spans = layerSpans([item('plain')], []);
    expect(spans[0]?.segments).toEqual([{ text: 'plain', hit: false }]);
  });

  it('同一条目里多处命中切成多段', () => {
    const items = [item('x marks the x')];
    const hits = findPageHits(items, 'x');
    const [span] = layerSpans(items, hits);
    expect(span?.segments).toEqual([
      { text: 'x', hit: true },
      { text: ' marks the ', hit: false },
      { text: 'x', hit: true }
    ]);
  });
});
