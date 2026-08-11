/**
 * T047 — Exclusion regression (pure logic)
 *
 * 三层排除：
 *  1. 字段级：非 `searchable: true` 的字段不进入 FTS5 plan（不出现在 `_fts_` 表）。
 *  2. 插件级：`SearchPluginOptions.excludedCollections` 硬排除 collection。
 *  3. 单次调用级：`SearchOptions.collections` allowlist 与插件级排除求交集。
 */
import type { EntityMetadata } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';

import { extractFtsPlanFromMetadata } from '../core/fts5-installer.js';
import { resolveSearchScope } from '../core/scope-resolver.js';

const meta = (tableName: string, properties: ReadonlyArray<Record<string, unknown>>): EntityMetadata =>
  ({
    name: tableName,
    tableName,
    properties: [{ name: 'id', type: 'string', columnName: 'id', primary: true }, ...properties]
  }) as unknown as EntityMetadata;

describe('Exclusion regression (T047)', () => {
  describe('field-level: only searchable=true string/enum/stringArray enter FTS plan', () => {
    it('excludes non-searchable string / enum / stringArray fields', () => {
      const plan = extractFtsPlanFromMetadata(
        meta('article', [
          { name: 'title', type: 'string', columnName: 'title', searchable: true },
          // non-searchable（false 或缺失）必须忽略。
          { name: 'slug', type: 'string', columnName: 'slug' },
          { name: 'note', type: 'string', columnName: 'note', searchable: false },
          { name: 'category', type: 'enum', columnName: 'category' }
        ])
      );
      expect(plan?.fields.map(f => f.name)).toEqual(['title']);
    });

    it('excludes non-textual fields even if searchable=true (integer/date/boolean)', () => {
      const plan = extractFtsPlanFromMetadata(
        meta('post', [
          { name: 'title', type: 'string', columnName: 'title', searchable: true },
          // extractFtsPlanFromMetadata 按 SEARCHABLE_TYPES 过滤；非文本类型会被排除。
          { name: 'views', type: 'integer', columnName: 'views', searchable: true },
          { name: 'publishedAt', type: 'date', columnName: 'published_at', searchable: true }
        ])
      );
      expect(plan?.fields.map(f => f.name)).toEqual(['title']);
    });

    it('returns plan only when ≥1 searchable textual field present', () => {
      const plan = extractFtsPlanFromMetadata(
        meta('article', [
          { name: 'title', type: 'string', columnName: 'title', searchable: true },
          { name: 'tags', type: 'stringArray', columnName: 'tags', searchable: true }
        ])
      );
      expect(plan?.fields.map(f => `${f.name}:${f.isArray}`).sort()).toEqual(['tags:true', 'title:false'].sort());
    });
  });

  describe('plugin-level: excludedCollections hard-excludes (FR-005)', () => {
    it('drops excluded names from final scope', () => {
      expect(
        resolveSearchScope({
          candidates: ['article', 'comment', 'draft'],
          excludedCollections: ['draft']
        })
      ).toEqual(['article', 'comment']);
    });
  });

  describe('call-level: SearchOptions.collections intersects with plugin exclusion', () => {
    it('allowlist intersected with exclusion (exclusion wins)', () => {
      expect(
        resolveSearchScope({
          candidates: ['article', 'comment', 'draft'],
          excludedCollections: ['draft'],
          requested: ['article', 'draft'] // draft 已请求但被排除 → 丢弃
        })
      ).toEqual(['article']);
    });

    it('unknown names in requested fail fast (typo must not read as "no results")', () => {
      expect(() =>
        resolveSearchScope({
          candidates: ['article', 'comment'],
          requested: ['article', 'unknown']
        })
      ).toThrow(/unknown collection\(s\).*unknown/);
    });
  });
});
