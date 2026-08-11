/**
 * T020 [US1] — Query compiler 单测（先红）
 *
 * 覆盖：
 *  - 空白切分（Unicode 空白）
 *  - 单 token → `("kw" OR "kw"*)`
 *  - 多 token → `(...) AND (...)`
 *  - FTS5 保留字符作为分隔符，不得粘连索引侧 token
 *  - 空字符串 / 纯空白 / 全保留字符 / 归一化后为空 → 返回 `null`，
 *    上层不触发 SQL，状态机回 `idle`（research.md §3、FR-014、FR-018、spec Edge Cases）
 *
 * @see specs/001-add-global-search/research.md §3
 */
import { describe, expect, it } from 'vitest';

import { MAX_QUERY_LENGTH, MAX_QUERY_TOKENS, MAX_TOKEN_LENGTH, compile } from '../core/query-compiler.js';
import { SearchQueryLimitError } from '../types.js';

describe('query-compiler.compile', () => {
  describe('null / empty 短路', () => {
    it('空字符串 → null', () => {
      expect(compile('')).toBeNull();
    });

    it('纯空白 → null', () => {
      expect(compile('   ')).toBeNull();
      expect(compile('\t\n  \t')).toBeNull();
    });

    it('Unicode 空白（全角空格）→ null', () => {
      expect(compile('\u3000\u3000')).toBeNull();
    });

    it('全 FTS5 保留字符（无可索引内容）→ null', () => {
      // " ( ) * : 全部为非索引字符，归一化后为空
      expect(compile('()()*"')).toBeNull();
      expect(compile('"""')).toBeNull();
      expect(compile('::*')).toBeNull();
    });

    // 保留字符集只有 " ( ) * :，`-` `!` `。` `#` 等全都成了合法 token。
    // FTS5 对这类「空 phrase」返回 0 行且不报错，于是查询顺利落到 contains fallback，
    // `instr(lower(body), lower('-')) > 0` 几乎匹配全表 —— 用户敲一个标点就拉回整库噪音。
    it('纯标点 / 符号 → null（不得落到 contains fallback）', () => {
      expect(compile('-')).toBeNull();
      expect(compile('!!!')).toBeNull();
      expect(compile('。。。')).toBeNull();
      expect(compile('#$%')).toBeNull();
      expect(compile('、')).toBeNull();
      expect(compile('---  ...')).toBeNull();
      expect(compile(' '.repeat(MAX_QUERY_LENGTH + 1))).toBeNull();
    });

    it('零宽字符 → null', () => {
      expect(compile('​‌')).toBeNull();
    });

    it('标点与有效字符混排时只保留有效部分', () => {
      expect(compile('foo!')?.tokens).toEqual(['foo']);
      expect(compile('-foo-')?.tokens).toEqual(['foo']);
      expect(compile('foo, bar.')?.tokens).toEqual(['foo', 'bar']);
    });

    // 标点必须当**分隔符**而不是删掉：unicode61 在索引侧同样按标点切词，
    // 删掉会把 local-first 粘成 localfirst，与索引里的 local / first 两个 token 全都对不上。
    it('词内标点切分为多个 token，而不是粘连', () => {
      expect(compile('local-first')?.tokens).toEqual(['local', 'first']);
      expect(compile('local-first')?.match).toBe('("local" OR "local"*) AND ("first" OR "first"*)');
      expect(compile('e-mail')?.tokens).toEqual(['e', 'mail']);
      expect(compile('foo:bar')?.tokens).toEqual(['foo', 'bar']);
      expect(compile('a(b)c')?.tokens).toEqual(['a', 'b', 'c']);
      expect(compile('a*b')?.tokens).toEqual(['a', 'b']);
    });
  });

  describe('单 token', () => {
    it('普通英文 → ("kw" OR "kw"*)', () => {
      const c = compile('hello');
      expect(c).not.toBeNull();
      expect(c?.match).toBe('("hello" OR "hello"*)');
      expect(c?.tokens).toEqual(['hello']);
    });

    it('中文单字 → ("中" OR "中"*)', () => {
      const c = compile('中');
      expect(c?.match).toBe('("中" OR "中"*)');
    });

    it('两端空白被 trim', () => {
      const c = compile('  hello  ');
      expect(c?.match).toBe('("hello" OR "hello"*)');
    });
  });

  describe('多 token', () => {
    it('两个 token → AND 组合', () => {
      const c = compile('foo bar');
      expect(c?.match).toBe('("foo" OR "foo"*) AND ("bar" OR "bar"*)');
      expect(c?.tokens).toEqual(['foo', 'bar']);
    });

    it('三个 token + 多空格 → 全部 AND', () => {
      const c = compile('a   b\tc');
      expect(c?.match).toBe('("a" OR "a"*) AND ("b" OR "b"*) AND ("c" OR "c"*)');
    });

    // CJK token 走 bigram 编译（索引侧同样以 bigram 写入），ASCII token 维持「精确 OR 前缀」
    it('中英混合 → AND 组合', () => {
      const c = compile('rxdb 全文');
      expect(c?.match).toBe('("rxdb" OR "rxdb"*) AND "全文"');
    });

    // unicode61 把整段中文切成一个 token，中缀查询 100% 零召回并退化为全表扫描；
    // trigram 实测对 <3 字查询同样零召回，而中文词绝大多数是 2 字 —— 故改用 bigram。
    it('中文多字词编译为 bigram AND 链', () => {
      expect(compile('搜索引擎')?.match).toBe('"搜索" AND "索引" AND "引擎"');
    });

    it('中文单字退化为前缀匹配', () => {
      expect(compile('全')?.match).toBe('("全" OR "全"*)');
    });
  });

  describe('FTS5 特殊字符转义', () => {
    it('双引号在 token 内部形成分词边界', () => {
      const c = compile('he"llo');
      expect(c).not.toBeNull();
      // 双引号不会进入 phrase，而是把两侧可索引字符分开
      expect(c?.match).not.toMatch(/he"llo/);
      expect(c?.tokens).toEqual(['he', 'llo']);
      expect(c?.match).toBe('("he" OR "he"*) AND ("llo" OR "llo"*)');
    });

    it('括号形成分词边界', () => {
      const c = compile('(foo)');
      expect(c?.match).toBe('("foo" OR "foo"*)');
    });

    it('星号形成分词边界（前缀语义由编译器自加）', () => {
      const c = compile('foo*');
      expect(c?.match).toBe('("foo" OR "foo"*)');
    });

    it('冒号形成分词边界且不会注入 column filter', () => {
      const c = compile('title:foo');
      expect(c?.tokens).toEqual(['title', 'foo']);
      expect(c?.match).not.toContain(':');
      expect(c).not.toBeNull();
    });

    it('混合保留字符 + 有效字符 → 保留 token 边界', () => {
      const c = compile('"foo" (bar)');
      expect(c?.match).toBe('("foo" OR "foo"*) AND ("bar" OR "bar"*)');
    });
  });

  describe('matchMode', () => {
    it('matchMode 仅支持 and，默认即 and', () => {
      const c = compile('foo bar');
      expect(c?.match).toContain(' AND ');
    });
  });

  describe('查询预算', () => {
    const queryWithLength = (length: number): string => {
      const tokens: string[] = [];
      let remaining = length;
      while (remaining > MAX_TOKEN_LENGTH) {
        tokens.push('a'.repeat(MAX_TOKEN_LENGTH));
        remaining -= MAX_TOKEN_LENGTH + 1;
      }
      tokens.push('a'.repeat(remaining));
      return tokens.join(' ');
    };

    it('原始长度恰好上限可编译，上限 + 1 fail-fast', () => {
      expect(queryWithLength(MAX_QUERY_LENGTH)).toHaveLength(MAX_QUERY_LENGTH);
      expect(() => compile(queryWithLength(MAX_QUERY_LENGTH))).not.toThrow();

      expect(() => compile(queryWithLength(MAX_QUERY_LENGTH + 1))).toThrow(
        expect.objectContaining<SearchQueryLimitError>({
          name: 'SearchQueryLimitError',
          message: expect.any(String),
          kind: 'queryLength',
          max: MAX_QUERY_LENGTH,
          actual: MAX_QUERY_LENGTH + 1
        })
      );
    });

    it('token 数恰好上限可编译，上限 + 1 fail-fast', () => {
      expect(() => compile(Array.from({ length: MAX_QUERY_TOKENS }, () => 'a').join(' '))).not.toThrow();

      expect(() => compile(Array.from({ length: MAX_QUERY_TOKENS + 1 }, () => 'a').join(' '))).toThrow(
        expect.objectContaining<SearchQueryLimitError>({
          name: 'SearchQueryLimitError',
          message: expect.any(String),
          kind: 'tokenCount',
          max: MAX_QUERY_TOKENS,
          actual: MAX_QUERY_TOKENS + 1
        })
      );
    });

    it('单 token 长度恰好上限可编译，上限 + 1 fail-fast', () => {
      expect(() => compile('a'.repeat(MAX_TOKEN_LENGTH))).not.toThrow();

      expect(() => compile('a'.repeat(MAX_TOKEN_LENGTH + 1))).toThrow(
        expect.objectContaining<SearchQueryLimitError>({
          name: 'SearchQueryLimitError',
          message: expect.any(String),
          kind: 'tokenLength',
          max: MAX_TOKEN_LENGTH,
          actual: MAX_TOKEN_LENGTH + 1
        })
      );
    });
  });
});
