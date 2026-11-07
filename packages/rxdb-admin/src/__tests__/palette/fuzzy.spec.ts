import { describe, expect, it } from 'vitest';
import { matchText, rankItems, splitHighlight } from '../../palette/fuzzy.js';

describe('matchText', () => {
  it('空查询或未命中返回 null', () => {
    expect(matchText('', '资产')).toBeNull();
    expect(matchText('   ', '资产')).toBeNull();
    expect(matchText('zzz', 'Asset')).toBeNull();
  });

  it('大小写不敏感，返回命中区间', () => {
    expect(matchText('ASS', 'Asset')?.ranges).toEqual([[0, 3]]);
  });

  it('连续子串优于离散子序列', () => {
    const contiguous = matchText('ast', 'Asset ast')?.score ?? 0;
    const scattered = matchText('ast', 'A s xx t')?.score ?? 0;
    expect(contiguous).toBeGreaterThan(scattered);
  });

  it('开头命中优于中间命中，词边界命中优于词中间命中', () => {
    expect(matchText('as', 'Asset')?.score).toBeGreaterThan(matchText('as', 'Base')?.score ?? 0);
    expect(matchText('log', 'Open log')?.score).toBeGreaterThan(matchText('log', 'Catalogue')?.score ?? 0);
  });

  it('子序列命中并合并相邻区间', () => {
    expect(matchText('ast', 'A s xx t')?.ranges).toEqual([
      [0, 1],
      [2, 3],
      [7, 8]
    ]);
    expect(matchText('abd', 'abcd')?.ranges).toEqual([
      [0, 2],
      [3, 4]
    ]);
  });

  it('多个词都必须命中，区间合并排序', () => {
    expect(matchText('资产 分类', '资产分类')?.ranges).toEqual([[0, 4]]);
    expect(matchText('分类 资产', '资产 分类')?.ranges).toEqual([
      [0, 2],
      [3, 5]
    ]);
    expect(matchText('资产 事件', '资产分类')).toBeNull();
  });

  it('中文逐字匹配', () => {
    expect(matchText('备份', '备份 / 恢复')?.ranges).toEqual([[0, 2]]);
    expect(matchText('备复', '备份 / 恢复')).not.toBeNull();
  });

  it('中英文交界处视为词边界', () => {
    expect(matchText('log', '打开log')?.score).toBeGreaterThan(matchText('log', 'xlog')?.score ?? 0);
  });
});

describe('splitHighlight', () => {
  it('按区间切分命中与未命中片段', () => {
    expect(splitHighlight('Asset list', [[0, 3]])).toEqual([
      { text: 'Ass', match: true },
      { text: 'et list', match: false }
    ]);
    expect(
      splitHighlight('abcd', [
        [0, 1],
        [2, 3]
      ])
    ).toEqual([
      { text: 'a', match: true },
      { text: 'b', match: false },
      { text: 'c', match: true },
      { text: 'd', match: false }
    ]);
  });

  it('无区间时整段为未命中；空文本返回单个空片段', () => {
    expect(splitHighlight('abc', [])).toEqual([{ text: 'abc', match: false }]);
    expect(splitHighlight('', [])).toEqual([{ text: '', match: false }]);
  });
});

describe('rankItems', () => {
  const items = [
    { label: '资产分类', sublabel: '实体', keywords: ['/entities/assets/AssetCategory'] },
    { label: '资产', sublabel: '实体', keywords: ['/entities/assets/Asset'] },
    { label: '搜索', sublabel: '数据', keywords: ['/search'] },
    { label: '备份 / 恢复', sublabel: '数据', keywords: ['/backup'] }
  ];

  it('按分数排序，主文本命中优先于次要文本', () => {
    expect(rankItems('资产', items, 10).map(r => r.item.label)).toEqual(['资产', '资产分类']);
  });

  it('次要文本与关键词命中也能找到，但没有标签高亮', () => {
    const result = rankItems('backup', items, 10);
    expect(result.map(r => r.item.label)).toEqual(['备份 / 恢复']);
    expect(result[0].labelRanges).toEqual([]);
    expect(rankItems('数据', items, 10).map(r => r.item.label)).toEqual(['搜索', '备份 / 恢复']);
  });

  it('同分保持原顺序，并遵守 limit', () => {
    const same = [{ label: 'alp-1' }, { label: 'alp-2' }, { label: 'alp-3' }];
    expect(rankItems('alp', same, 10).map(r => r.item.label)).toEqual(['alp-1', 'alp-2', 'alp-3']);
    expect(rankItems('alp', same, 2)).toHaveLength(2);
  });

  it('同样的命中位置下，更短的文本（覆盖率更高）排在前面', () => {
    const items = [{ label: 'alpine' }, { label: 'alps' }];
    expect(rankItems('alp', items, 10).map(r => r.item.label)).toEqual(['alps', 'alpine']);
  });

  it('没有命中返回空数组', () => {
    expect(rankItems('zzz', items, 10)).toEqual([]);
  });
});
