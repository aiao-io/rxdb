import { describe, expect, it } from 'vitest';

import {
  TICKER_SEEDS,
  filterTickers,
  moveIndex,
  nextWatchPosition,
  normalizeSymbol,
  reorderPositions,
  tickerOf
} from './stocks-data';

describe('filterTickers', () => {
  it('按代码和公司名筛选演示自选股', () => {
    expect(filterTickers(TICKER_SEEDS, 'nvda').map(ticker => ticker.s)).toEqual(['NVDA']);
    expect(filterTickers(TICKER_SEEDS, 'amazon').map(ticker => ticker.s)).toEqual(['AMZN']);
  });

  it('查询为空时保留原列表', () => {
    expect(filterTickers(TICKER_SEEDS, '  ')).toBe(TICKER_SEEDS);
  });

  it('没有匹配项时返回空列表', () => {
    expect(filterTickers(TICKER_SEEDS, 'unknown')).toEqual([]);
  });
});

describe('normalizeSymbol / tickerOf / nextWatchPosition', () => {
  it('代码整理成大写，空白输入得到空串', () => {
    expect(normalizeSymbol(' aapl ')).toBe('AAPL');
    expect(normalizeSymbol('   ')).toBe('');
  });

  it('只在演示目录里找得到代码', () => {
    expect(tickerOf('NVDA')?.n).toBe('NVIDIA Corp.');
    expect(tickerOf('ZZZZ')).toBeUndefined();
  });

  it('新自选排到最前；空列表从 0 开始', () => {
    expect(nextWatchPosition([0, 1, 2])).toBe(-1);
    expect(nextWatchPosition([])).toBe(0);
  });
});

describe('reorderPositions', () => {
  const rows = [
    { symbol: 'AAPL', position: 0 },
    { symbol: 'MSFT', position: 1 },
    { symbol: 'NVDA', position: 2 }
  ];

  it('把一支拖到新位置，其余保持相对次序', () => {
    expect(Object.fromEntries(reorderPositions(rows, 2, 0))).toEqual({ AAPL: 1, MSFT: 2, NVDA: 0 });
    expect(Object.fromEntries(reorderPositions(rows, 0, 2))).toEqual({ AAPL: 2, MSFT: 0, NVDA: 1 });
  });

  it('位置不变时返回原次序；越界位置夹住', () => {
    expect(Object.fromEntries(reorderPositions(rows, 1, 1))).toEqual({ AAPL: 0, MSFT: 1, NVDA: 2 });
    expect(Object.fromEntries(reorderPositions(rows, 0, 99))).toEqual({ AAPL: 2, MSFT: 0, NVDA: 1 });
  });
});

describe('moveIndex', () => {
  it('方向键移动选中，列表循环', () => {
    expect(moveIndex(0, -1, 3)).toBe(2);
    expect(moveIndex(2, 1, 3)).toBe(0);
    expect(moveIndex(1, 1, 3)).toBe(2);
  });

  it('空列表原地不动', () => {
    expect(moveIndex(0, 1, 0)).toBe(0);
  });
});
