/**
 * T046 —— FTS5 schema 漂移检测（纯逻辑）。
 *
 * 未 mock 数据库；验证 `computeFtsSchemaSignature` + `extractFtsPlanFromMetadata`
 * 能在字段增删/类型翻转（string ↔ stringArray）时产出不同签名，配合 `ftsMigrationName`
 * 给出恢复路径指引；插件启动侧以此比对与已存 install migration 的签名，不一致即抛错。
 */
import type { EntityMetadata } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';

import { computeFtsSchemaSignature, extractFtsPlanFromMetadata, ftsMigrationName } from '../core/fts5-installer.js';
import { SearchSchemaMismatchError } from '../types.js';

const meta = (properties: ReadonlyArray<Record<string, unknown>>): EntityMetadata =>
  ({
    name: 'Article',
    tableName: 'article',
    properties: [{ name: 'id', type: 'string', columnName: 'id', primary: true }, ...properties]
  }) as unknown as EntityMetadata;

describe('FTS5 schema drift (T046)', () => {
  it('returns different signature when a searchable field is added/removed', () => {
    const a = extractFtsPlanFromMetadata(
      meta([{ name: 'title', type: 'string', columnName: 'title', searchable: true }])
    );
    const b = extractFtsPlanFromMetadata(
      meta([
        { name: 'title', type: 'string', columnName: 'title', searchable: true },
        { name: 'body', type: 'string', columnName: 'body', searchable: true }
      ])
    );
    expect(a?.signature).toBeDefined();
    expect(b?.signature).toBeDefined();
    expect(a?.signature).not.toBe(b?.signature);
  });

  it('signature is stable under field-order permutation', () => {
    const a = extractFtsPlanFromMetadata(
      meta([
        { name: 'title', type: 'string', columnName: 'title', searchable: true },
        { name: 'body', type: 'string', columnName: 'body', searchable: true }
      ])
    );
    const b = extractFtsPlanFromMetadata(
      meta([
        { name: 'body', type: 'string', columnName: 'body', searchable: true },
        { name: 'title', type: 'string', columnName: 'title', searchable: true }
      ])
    );
    expect(a?.signature).toBe(b?.signature);
  });

  it('signature changes when a field flips string ↔ stringArray', () => {
    const a = computeFtsSchemaSignature([{ name: 'tags', isArray: false }]);
    const b = computeFtsSchemaSignature([{ name: 'tags', isArray: true }]);
    expect(a).not.toBe(b);
  });

  it('SearchSchemaMismatchError exposes table/expected/actual for recovery guidance', () => {
    const expected = computeFtsSchemaSignature([{ name: 'title', isArray: false }]);
    const actual = computeFtsSchemaSignature([
      { name: 'title', isArray: false },
      { name: 'body', isArray: false }
    ]);
    const err = new SearchSchemaMismatchError('article', expected, actual);
    expect(err).toBeInstanceOf(SearchSchemaMismatchError);
    expect(err.table).toBe('article');
    expect(err.expected).toBe(expected);
    expect(err.actual).toBe(actual);
    expect(err.message).toContain('article');
    expect(err.message).toContain(expected);
    expect(err.message).toContain(actual);
  });

  it('ftsMigrationName generates stable install/backfill ids (recovery drop target)', () => {
    expect(ftsMigrationName('article', 'install')).toBe('fts5__article__v1__install');
    expect(ftsMigrationName('article', 'backfill')).toBe('fts5__article__v1__backfill');
    expect(ftsMigrationName('article', 'install', 2)).toBe('fts5__article__v2__install');
  });
});
