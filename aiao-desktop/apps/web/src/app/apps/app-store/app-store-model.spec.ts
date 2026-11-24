import { describe, expect, it } from 'vitest';

import { filterCatalog } from './app-store-model';

interface Item {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly origin: string;
}

const ITEMS: readonly Item[] = [
  { id: 'chess', name: 'Chess', summary: 'Play chess against the computer', origin: 'https://chess.example' },
  { id: 'notes', name: 'Notes', summary: 'Write and sync notes', origin: 'https://notes.example' },
  { id: 'paint', name: 'Paint', summary: 'Draw on a canvas', origin: 'https://paint.example' }
];

const text = (item: Item): string => `${item.name} ${item.summary} ${item.origin}`;

describe('filterCatalog', () => {
  it('按条目文字过滤，忽略大小写', () => {
    expect(filterCatalog(ITEMS, text, 'CHESS').map(item => item.id)).toEqual(['chess']);
    expect(filterCatalog(ITEMS, text, 'canvas').map(item => item.id)).toEqual(['paint']);
    expect(filterCatalog(ITEMS, text, 'notes.example').map(item => item.id)).toEqual(['notes']);
  });

  it('查询为空时保留原列表', () => {
    expect(filterCatalog(ITEMS, text, '  ')).toBe(ITEMS);
  });

  it('没有匹配项时返回空列表', () => {
    expect(filterCatalog(ITEMS, text, 'unknown')).toEqual([]);
  });
});
