import { describe, expect, it } from 'vitest';
import { PG_MAX_PARAMS, chunkByPgParamLimit } from '../pglite.utils.js';

describe('chunkByPgParamLimit', () => {
  it('空数组返回空数组', () => {
    expect(chunkByPgParamLimit([], 5)).toEqual([]);
  });

  it('未超限时返回单片', () => {
    const rows = [1, 2, 3, 4];
    expect(chunkByPgParamLimit(rows, 5)).toEqual([rows]);
  });

  it('paramsPerRow <= 0 时退化为单片', () => {
    const rows = [1, 2];
    expect(chunkByPgParamLimit(rows, 0)).toEqual([rows]);
  });

  it('超过 PG_MAX_PARAMS 时正确分片', () => {
    const paramsPerRow = 10;
    const maxRowsPerChunk = Math.floor(PG_MAX_PARAMS / paramsPerRow); // 6553
    const rows = Array.from({ length: maxRowsPerChunk + 100 }, (_, i) => i);
    const chunks = chunkByPgParamLimit(rows, paramsPerRow);
    expect(chunks.length).toBe(2);
    expect(chunks[0].length).toBe(maxRowsPerChunk);
    expect(chunks[1].length).toBe(100);
    expect(chunks.flat()).toEqual(rows);
  });

  it('PG_MAX_PARAMS 应为 PostgreSQL int16 上限 65535', () => {
    expect(PG_MAX_PARAMS).toBe(65535);
  });
});
