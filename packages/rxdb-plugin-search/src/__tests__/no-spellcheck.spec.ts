/**
 * T084 [P] [US1] — FR-015 拼写纠错回归测（先红）
 *
 * 断言：
 *  (a) 全文搜索不引入任何拼写纠错；`search('rxdb')` 的编译产物只命中精确 + 前缀，
 *      不会扩展到 'rxdb123' 这类无关变体（前缀匹配与拼写纠错的边界）。
 *  (b) FTS5 tokenizer 配置中未开启 `spellfix`、`spellfix1` 或任何外部纠错模块。
 *
 * @see specs/001-add-global-search/spec.md FR-015
 */
import { describe, expect, it } from 'vitest';

import { buildCreateFtsTableSql } from '@aiao/rxdb-adapter-sqlite-core';

import { compile } from '../core/query-compiler.js';

describe('FR-015: 不启用拼写纠错', () => {
  describe('(a) query-compiler 不扩展为拼写纠错语法', () => {
    it('"rxdb" 编译产物只含精确 + 前缀，不命中 "rxdb123" 之外的非前缀变体', () => {
      const c = compile('rxdb');
      expect(c).not.toBeNull();
      // FTS5 前缀匹配语义：rxdb* 会命中 rxdb / rxdb1 / rxdb123 等以 rxdb 开头者，
      // 但 spec 关心的是“拼写纠错（如 rxbd → rxdb）”不应被启用 —— 编译产物不能含
      // NEAR / fuzzy / editdist3 等纠错算子。
      expect(c?.match).not.toMatch(/NEAR/i);
      expect(c?.match).not.toMatch(/editdist3/i);
      expect(c?.match).not.toMatch(/spellfix/i);
      expect(c?.match).not.toMatch(/fuzzy/i);
      // 必须严格是 ("rxdb" OR "rxdb"*) 形态
      expect(c?.match).toBe('("rxdb" OR "rxdb"*)');
    });

    it('查询不引入相似度阈值参数', () => {
      const c = compile('hello');
      expect(c).not.toBeNull();
      // 无 distance 限定符
      expect(c?.match).not.toMatch(/distance\s*[:=]/i);
      expect(c?.match).not.toMatch(/threshold/i);
    });
  });

  describe('(b) FTS5 tokenizer 配置不包含 spellfix / 外部纠错', () => {
    it('CREATE VIRTUAL TABLE 的 tokenize 选项是 unicode61，不含 spellfix', () => {
      const sql = buildCreateFtsTableSql('article', [
        { name: 'title', isArray: false },
        { name: 'body', isArray: false }
      ]);
      // 必须使用 unicode61 + remove_diacritics 2
      expect(sql).toMatch(/tokenize\s*=\s*'unicode61\s+remove_diacritics\s+2'/);
      // 不得包含任何纠错关键字
      expect(sql).not.toMatch(/spellfix/i);
      expect(sql).not.toMatch(/spellfix1/i);
      expect(sql).not.toMatch(/editdist3/i);
      expect(sql).not.toMatch(/fuzzy/i);
    });

    it('FTS5 表 SQL 中不创建 spellfix1 虚拟表', () => {
      const sql = buildCreateFtsTableSql('comment', [{ name: 'content', isArray: false }]);
      // 仅创建 fts5 虚拟表，不创建 spellfix1
      expect(sql).not.toMatch(/USING\s+spellfix1/i);
      expect(sql).toMatch(/USING\s+fts5/);
    });
  });
});
