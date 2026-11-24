import { describe, expect, it } from 'vitest';

import { suggestAddresses } from './safari-suggest';

const FAVOURITES = [
  { url: 'news.ycombinator.com', name: 'Hacker News' },
  { url: 'en.wikipedia.org/wiki/MacOS', name: 'Wikipedia' }
];

describe('suggestAddresses 地址栏自动补全', () => {
  it('查询为空时给出最近访问的地址', () => {
    const out = suggestAddresses(
      '',
      ['example.com', 'news.ycombinator.com', 'en.wikipedia.org/wiki/MacOS'],
      FAVOURITES
    );
    expect(out.map(s => s.url)).toEqual(['example.com', 'news.ycombinator.com', 'en.wikipedia.org/wiki/MacOS']);
  });

  it('地址包含查询时命中，历史排在前', () => {
    const out = suggestAddresses('news', ['example.com', 'news.ycombinator.com'], FAVOURITES);
    expect(out.map(s => s.url)).toEqual(['news.ycombinator.com']);
  });

  it('收藏名包含查询也能出建议', () => {
    const out = suggestAddresses('hacker', [], FAVOURITES);
    expect(out.map(s => s.url)).toEqual(['news.ycombinator.com']);
  });

  it('大小写不敏感，历史与收藏夹重复的地址只出一条', () => {
    const out = suggestAddresses('WIKI', ['en.wikipedia.org/wiki/MacOS'], FAVOURITES);
    expect(out.map(s => s.url)).toEqual(['en.wikipedia.org/wiki/MacOS']);
  });

  it('最多 limit 条；空地址与起始页不参与', () => {
    expect(suggestAddresses('', ['a.com', 'b.com', 'c.com', 'd.com'], FAVOURITES, 3).map(s => s.url)).toEqual([
      'a.com',
      'b.com',
      'c.com'
    ]);
    expect(suggestAddresses('', ['', 'example.com'], FAVOURITES).map(s => s.url)).toEqual(['example.com']);
  });

  it('建议带显示标题', () => {
    const [first] = suggestAddresses('hacker', [], FAVOURITES);
    expect(first?.label).toBe('news.ycombinator.com');
  });
});
