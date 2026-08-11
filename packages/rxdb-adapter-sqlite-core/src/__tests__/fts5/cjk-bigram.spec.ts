import { describe, expect, it } from 'vitest';
import { compileCjkToken, hasCjk, indexTextForFts } from '../../fts5/cjk-bigram.js';

describe('cjk-bigram', () => {
  describe('hasCjk', () => {
    it.each(['中文', 'rxdb 全文', 'ひらがな', '카카오', '漢字'])('识别 %s 含 CJK', value => {
      expect(hasCjk(value)).toBe(true);
    });

    it.each(['rxdb', 'local-first', '', '123', 'café'])('识别 %s 不含 CJK', value => {
      expect(hasCjk(value)).toBe(false);
    });
  });

  describe('indexTextForFts', () => {
    it('把连续 CJK 段切成空格分隔的 bigram', () => {
      expect(indexTextForFts('全文搜索引擎设计')).toBe('全 文 搜 索 引 擎 设 计 全文 文搜 搜索 索引 引擎 擎设 设计');
    });

    it('保留非 CJK 部分与其间隔', () => {
      expect(indexTextForFts('rxdb 全文搜索 guide')).toBe('rxdb 全 文 搜 索 全文 文搜 搜索 guide');
    });

    it('单个 CJK 字原样保留（无法构成 bigram）', () => {
      expect(indexTextForFts('中')).toBe('中');
      // SQLC-013：`a中b` 曾被原样保留 → unicode61 当成一个 token `a中b`，
      // 而查询侧 compileCjkToken 编成 `a AND 中 AND b`，三个 token 一个都不在索引里
      expect(indexTextForFts('a中b')).toBe('a 中 b');
    });

    // SQLC-013：CJK 与拉丁/数字紧邻时，unicode61 不会在脚本边界切词，
    // 索引侧必须自己补空格，否则查询侧分段编译出的 token 在索引里根本不存在
    describe('SQLC-013 脚本边界补空格', () => {
      it.each([
        ['rxdb搜索', 'rxdb 搜 索 搜索'],
        ['搜索guide', '搜 索 搜索 guide'],
        ['rxdb搜索guide', 'rxdb 搜 索 搜索 guide'],
        ['全文搜索引擎', '全 文 搜 索 引 擎 全文 文搜 搜索 索引 引擎'],
        ['v2全文搜索', 'v2 全 文 搜 索 全文 文搜 搜索'],
        ['第3章', '第 3 章'],
        ['中文abc日本語', '中 文 中文 abc 日 本 語 日本 本語']
      ])('%s → %s', (input, expected) => {
        expect(indexTextForFts(input)).toBe(expected);
      });

      it('已有空白的边界不再重复补空格', () => {
        expect(indexTextForFts('rxdb 全文搜索 guide')).toBe('rxdb 全 文 搜 索 全文 文搜 搜索 guide');
        expect(indexTextForFts('搜索\n引擎')).toBe('搜 索 搜索\n引 擎 引擎');
      });

      it('标点边界也补空格（unicode61 视标点为分隔符，多余空白无害）', () => {
        expect(indexTextForFts('搜索,guide')).toBe('搜 索 搜索 ,guide');
      });

      it('补空格后不产生首尾空白', () => {
        expect(indexTextForFts('搜索')).toBe('搜 索 搜索');
        expect(indexTextForFts('中')).toBe('中');
      });
    });

    it('纯 ASCII 文本完全不变', () => {
      expect(indexTextForFts('local-first search')).toBe('local-first search');
      expect(indexTextForFts('')).toBe('');
    });

    it('对同一输入是幂等可复现的（索引侧与查询侧必须一致）', () => {
      const once = indexTextForFts('数据库索引优化');
      expect(indexTextForFts('数据库索引优化')).toBe(once);
    });
  });

  describe('compileCjkToken', () => {
    it('非 CJK token 返回 undefined，交回原有编译规则', () => {
      expect(compileCjkToken('rxdb')).toBeUndefined();
    });

    // 中文词绝大多数是 2 字，这是最主要的场景
    it('2 字词编译为单个 bigram phrase', () => {
      expect(compileCjkToken('搜索')).toBe('"搜索"');
    });

    it('多字词编译为 bigram AND 链（近似连续子串语义）', () => {
      expect(compileCjkToken('引擎设计')).toBe('"引擎" AND "擎设" AND "设计"');
    });

    it('单字退化为前缀匹配，命中以该字开头的 bigram', () => {
      expect(compileCjkToken('全')).toBe('("全" OR "全"*)');
    });

    it('中英混排分段编译', () => {
      expect(compileCjkToken('rxdb搜索')).toBe('("rxdb" OR "rxdb"*) AND "搜索"');
      expect(compileCjkToken('搜索guide')).toBe('"搜索" AND ("guide" OR "guide"*)');
    });
  });

  // 端到端一致性：查询侧编译出的每个 phrase，都必须能在索引侧产物里找到
  describe('索引侧与查询侧一致性', () => {
    it.each([
      ['全文搜索引擎设计', '搜索'],
      ['全文搜索引擎设计', '引擎设计'],
      ['全文搜索引擎设计', '擎设'],
      ['数据库索引优化', '索引'],
      // SQLC-013：混排、数字、多段 CJK —— 补空格前这几条全部零召回
      ['rxdb搜索指南', 'rxdb搜索'],
      ['rxdb搜索指南', '搜索'],
      ['a中b', 'a中b'],
      ['v2全文搜索', 'v2全文'],
      ['中文abc日本語', '中文abc']
    ])('文档 %s 的索引产物包含查询 %s 的全部 bigram', (doc, query) => {
      const indexed = indexTextForFts(doc).split(' ');
      const phrases = (compileCjkToken(query) ?? '').match(/"([^"]+)"/g)?.map(p => p.slice(1, -1)) ?? [];

      expect(phrases.length).toBeGreaterThan(0);
      for (const phrase of phrases) expect(indexed).toContain(phrase);
    });

    it('不连续的查询不应全部命中（保持子串语义）', () => {
      const indexed = indexTextForFts('数据库索引优化').split(' ');
      const phrases = (compileCjkToken('数据库优化') ?? '').match(/"([^"]+)"/g)?.map(p => p.slice(1, -1)) ?? [];

      expect(phrases.every(p => indexed.includes(p))).toBe(false);
    });
  });
});
