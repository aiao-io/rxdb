import { describe, expect, it } from 'vitest';

import { filterTickers, TICKER_SEEDS } from './stocks-data';

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
