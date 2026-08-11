/**
 * T021 [US1] — Result mapper 单测（先红）
 *
 * 覆盖：
 *  - SQL 行（含 rank、prefix_penalty、id、字段原文）→ `SearchResult`
 *  - BM25 rank 升序排序
 *  - FTS 命中（prefix_penalty=0）优先于 contains 兜底（prefix_penalty=2）
 *  - snippet 截断到 `snippetLength`（默认 120）
 *  - snippet 不含 HTML 标记（FR-003、FR-004）
 *  - matchedField 字段名映射正确
 *
 * @see specs/001-add-global-search/data-model.md §4.1, §4.2
 */
import { describe, expect, it } from 'vitest';

import { mapRowsToResults, SNIPPET_MATCH_END, SNIPPET_MATCH_START, type RawFtsRow } from '../core/result-mapper.js';

const TABLE_FIELDS = ['title', 'body'] as const;
const ENTITY = 'Article';
const COLLECTION = 'article';

describe('result-mapper.mapRowsToResults', () => {
  it('空数组 → 空数组', () => {
    expect(mapRowsToResults([], { entity: ENTITY, collection: COLLECTION, fields: TABLE_FIELDS })).toEqual([]);
  });

  it('rank 升序排序（值越小越相关 → 越靠前）', () => {
    const rows: RawFtsRow[] = [
      { id: 'b', rank: -0.5, prefix_penalty: 0, matched_field: 'title', snippet: 'b' },
      { id: 'a', rank: -1.0, prefix_penalty: 0, matched_field: 'title', snippet: 'a' },
      { id: 'c', rank: -0.2, prefix_penalty: 0, matched_field: 'title', snippet: 'c' }
    ];
    const out = mapRowsToResults(rows, { entity: ENTITY, collection: COLLECTION, fields: TABLE_FIELDS });
    expect(out.map(r => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('rank 相同时，prefix_penalty 升序（FTS 命中优先）', () => {
    const rows: RawFtsRow[] = [
      { id: 'contains', rank: -1.0, prefix_penalty: 2, matched_field: 'title', snippet: 'p' },
      { id: 'exact', rank: -1.0, prefix_penalty: 0, matched_field: 'title', snippet: 'e' }
    ];
    const out = mapRowsToResults(rows, { entity: ENTITY, collection: COLLECTION, fields: TABLE_FIELDS });
    expect(out.map(r => r.id)).toEqual(['exact', 'contains']);
  });

  it('snippet 不超过 snippetLength（默认 120）', () => {
    const longText = 'x'.repeat(500);
    const rows: RawFtsRow[] = [{ id: '1', rank: -1.0, prefix_penalty: 0, matched_field: 'body', snippet: longText }];
    const out = mapRowsToResults(rows, {
      entity: ENTITY,
      collection: COLLECTION,
      fields: TABLE_FIELDS,
      snippetLength: 120
    });
    expect(out[0].snippet.length).toBeLessThanOrEqual(120);
  });

  it('snippet 自定义长度生效', () => {
    const longText = 'x'.repeat(500);
    const rows: RawFtsRow[] = [{ id: '1', rank: -1.0, prefix_penalty: 0, matched_field: 'body', snippet: longText }];
    const out = mapRowsToResults(rows, {
      entity: ENTITY,
      collection: COLLECTION,
      fields: TABLE_FIELDS,
      snippetLength: 50
    });
    expect(out[0].snippet.length).toBeLessThanOrEqual(50);
  });

  it('按完整 emoji 字符簇截断，绝不留下孤立代理项', () => {
    const rows: RawFtsRow[] = [{ id: '1', rank: -1.0, prefix_penalty: 0, matched_field: 'body', snippet: 'a😀alpha' }];

    const out = mapRowsToResults(rows, {
      entity: ENTITY,
      collection: COLLECTION,
      fields: TABLE_FIELDS,
      snippetLength: 2
    });

    expect(out[0].snippet).toBe('a😀');
  });

  it('按完整组合字符簇截断', () => {
    const rows: RawFtsRow[] = [
      { id: '1', rank: -1.0, prefix_penalty: 0, matched_field: 'body', snippet: 'e\u0301clair' }
    ];

    const out = mapRowsToResults(rows, {
      entity: ENTITY,
      collection: COLLECTION,
      fields: TABLE_FIELDS,
      snippetLength: 1
    });

    expect(out[0].snippet).toBe('e\u0301');
  });

  it('围绕 FTS 匹配标记截断并移除内部标记', () => {
    const rows: RawFtsRow[] = [
      {
        id: '1',
        rank: -1.0,
        prefix_penalty: 0,
        matched_field: 'body',
        snippet: `prefix prefix ${SNIPPET_MATCH_START}needle${SNIPPET_MATCH_END} suffix suffix`
      }
    ];

    const out = mapRowsToResults(rows, {
      entity: ENTITY,
      collection: COLLECTION,
      fields: TABLE_FIELDS,
      snippetLength: 14
    });

    expect(out[0].snippet).toContain('needle');
    expect(out[0].snippet).not.toContain(SNIPPET_MATCH_START);
    expect(out[0].snippet).not.toContain(SNIPPET_MATCH_END);
  });

  it('snippet 不含 HTML 标签（无 highlight 标记）', () => {
    const rows: RawFtsRow[] = [
      { id: '1', rank: -1.0, prefix_penalty: 0, matched_field: 'title', snippet: 'plain text' }
    ];
    const out = mapRowsToResults(rows, { entity: ENTITY, collection: COLLECTION, fields: TABLE_FIELDS });
    expect(out[0].snippet).not.toMatch(/<[^>]+>/);
    expect(out[0].snippet).not.toContain('<mark>');
    expect(out[0].snippet).not.toContain('</mark>');
  });

  it('id 总是 string 化', () => {
    const rows: RawFtsRow[] = [
      { id: 42 as unknown as string, rank: -1.0, prefix_penalty: 0, matched_field: 'title', snippet: 'x' }
    ];
    const out = mapRowsToResults(rows, { entity: ENTITY, collection: COLLECTION, fields: TABLE_FIELDS });
    expect(out[0].id).toBe('42');
    expect(typeof out[0].id).toBe('string');
  });

  it('entity / collection 字段写入正确', () => {
    const rows: RawFtsRow[] = [{ id: '1', rank: -1.0, prefix_penalty: 0, matched_field: 'body', snippet: 'x' }];
    const out = mapRowsToResults(rows, { entity: 'Comment', collection: 'comment', fields: ['content'] });
    expect(out[0].entity).toBe('Comment');
    expect(out[0].collection).toBe('comment');
    expect(out[0].matchedField).toBe('body');
  });

  it('把 prefix_penalty 透传为内部 _prefixPenalty（供 engine/aggregator tie-break）', () => {
    const rows: RawFtsRow[] = [{ id: '1', rank: -1.0, prefix_penalty: 2, matched_field: 'body', snippet: 'x' }];
    const out = mapRowsToResults(rows, { entity: ENTITY, collection: COLLECTION, fields: TABLE_FIELDS });
    expect((out[0] as { _prefixPenalty?: number })._prefixPenalty).toBe(2);
  });
});
