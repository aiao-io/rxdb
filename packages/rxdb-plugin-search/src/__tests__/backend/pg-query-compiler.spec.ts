import { describe, expect, it } from 'vitest';

import { compilePgQuery } from '../../backend/pg/pg-query-compiler.js';
import { MAX_QUERY_LENGTH, MAX_QUERY_TOKENS, MAX_TOKEN_LENGTH } from '../../core/query-compiler.js';
import { SearchQueryLimitError } from '../../types.js';

describe('compilePgQuery', () => {
  it('把单个 token 编译成「精确 OR 前缀」的 tsquery', () => {
    expect(compilePgQuery('local')).toEqual({ match: `('local' | 'local':*)`, tokens: ['local'] });
  });

  it('多个 token 之间用 & 连接', () => {
    expect(compilePgQuery('local first')).toEqual({
      match: `('local' | 'local':*) & ('first' | 'first':*)`,
      tokens: ['local', 'first']
    });
  });

  it('按非索引字符切分而不是删除（local-first → 两个 token）', () => {
    expect(compilePgQuery('local-first')?.tokens).toEqual(['local', 'first']);
  });

  it('空输入与纯标点输入返回 null（不视为错误）', () => {
    const zeroWidthSpace = String.fromCodePoint(0x200b);
    for (const input of ['', '   ', '---', '。！？', zeroWidthSpace]) {
      expect(compilePgQuery(input), JSON.stringify(input)).toBeNull();
    }
  });

  it('token 内的单引号被转义，无法闭合 tsquery 字面量', () => {
    // 撇号属于 \p{P}，本身就是分隔符；这里断言即使分隔失效也不会产生可注入的 SQL 片段
    const compiled = compilePgQuery("o'reilly");
    expect(compiled?.tokens).toEqual(['o', 'reilly']);
    expect(compiled?.match).not.toContain(`''`);
  });

  it('沿用与 FTS5 编译器完全相同的预算上限', () => {
    expect(() => compilePgQuery(`${'a'.repeat(MAX_QUERY_LENGTH)} b`)).toThrow(SearchQueryLimitError);
    expect(() => compilePgQuery(Array.from({ length: MAX_QUERY_TOKENS + 1 }, (_, i) => `t${i}`).join(' '))).toThrow(
      SearchQueryLimitError
    );
    expect(() => compilePgQuery('a'.repeat(MAX_TOKEN_LENGTH + 1))).toThrow(SearchQueryLimitError);
  });

  it('CJK token 不做 bigram 拆分（PG 侧由 regconfig 决定分词，属已知方言差异）', () => {
    const compiled = compilePgQuery('全文搜索');
    expect(compiled?.tokens).toEqual(['全文搜索']);
    expect(compiled?.match).toBe(`('全文搜索' | '全文搜索':*)`);
  });
});
