import { describe, expect, it } from 'vitest';
import { normalizeSingleStatementSql, shouldUsePreparedStatementPath } from '../execute-sql.utils.js';

describe('execute-sql.utils', () => {
  describe('normalizeSingleStatementSql', () => {
    it.each([
      ['select 1;', 'select 1'],
      ['select 1;;;', 'select 1'],
      ['  select 1 ;  ', 'select 1'],
      // 只剥末尾**连续**的分号：被空格隔开的分号不属于同一串，保持原语义
      ['select 1; ; ;', 'select 1; ;'],
      ['select 1', 'select 1'],
      ['', ''],
      [';;;', ''],
      ['select 1; select 2;', 'select 1; select 2']
    ])('归一化 %j → %j', (input, expected) => {
      expect(normalizeSingleStatementSql(input)).toBe(expected);
    });

    it('CS-004 中部的长分号串不触发回溯（ReDoS）', () => {
      // 原 `/;+\s*$/u`：分号串后面还有内容时，每个起点都要把整串吃完再逐个回退 → O(n²)。
      const hostile = `a${';'.repeat(30_000)}b`;
      const startedAt = performance.now();

      expect(normalizeSingleStatementSql(hostile)).toBe(hostile);
      expect(performance.now() - startedAt).toBeLessThan(200);
    });
  });

  describe('shouldUsePreparedStatementPath', () => {
    it.each([
      ['select 1;', true],
      ['EXPLAIN select 1', true],
      ['insert into t values (1) returning id', true],
      ['insert into t values (1)', false],
      ['select 1; select 2;', false],
      ['', false]
    ])('%j → %s', (sql, expected) => {
      expect(shouldUsePreparedStatementPath(sql)).toBe(expected);
    });
  });
});
