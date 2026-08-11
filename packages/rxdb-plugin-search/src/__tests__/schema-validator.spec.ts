import type { EntityMetadata } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';

import {
  assertSearchableSchemaValid,
  collectInvalidSearchableFields,
  SEARCHABLE_PROPERTY_TYPES
} from '../core/schema-validator.js';

const makeMeta = (name: string, properties: ReadonlyArray<Record<string, unknown>>): EntityMetadata =>
  ({
    name,
    tableName: name.toLowerCase(),
    properties
  }) as unknown as EntityMetadata;

describe('schema-validator (T052 / T045 red)', () => {
  it('SEARCHABLE_PROPERTY_TYPES covers string, enum, stringArray exactly', () => {
    expect([...SEARCHABLE_PROPERTY_TYPES].sort()).toEqual(['enum', 'string', 'stringArray'].sort());
  });

  it('公开集合不可通过运行时 mutator 改写校验规则', () => {
    const types = SEARCHABLE_PROPERTY_TYPES as unknown as {
      readonly add?: (value: string) => unknown;
    };
    expect(types.add).toBeUndefined();
    const invalid = collectInvalidSearchableFields([
      makeMeta('Post', [{ name: 'views', type: 'integer', columnName: 'views', searchable: true }])
    ]);
    expect(invalid).toEqual([{ entity: 'Post', field: 'views', type: 'integer' }]);
  });

  it('returns empty for entities with only valid searchable fields', () => {
    const metas = [
      makeMeta('Article', [
        { name: 'title', type: 'string', columnName: 'title', searchable: true },
        { name: 'tags', type: 'stringArray', columnName: 'tags', searchable: true },
        { name: 'status', type: 'enum', columnName: 'status', searchable: true }
      ])
    ];
    expect(collectInvalidSearchableFields(metas)).toEqual([]);
    expect(() => assertSearchableSchemaValid(metas)).not.toThrow();
  });

  it('ignores fields without searchable: true', () => {
    const metas = [
      makeMeta('Article', [
        { name: 'views', type: 'integer', columnName: 'views' },
        { name: 'body', type: 'string', columnName: 'body', searchable: false }
      ])
    ];
    expect(collectInvalidSearchableFields(metas)).toEqual([]);
  });

  it('flags searchable on non-textual types supplied through untyped metadata', () => {
    const metas = [
      makeMeta('Post', [
        { name: 'views', type: 'integer', columnName: 'views', searchable: true },
        { name: 'createdAt', type: 'date', columnName: 'created_at', searchable: true },
        { name: 'isHot', type: 'boolean', columnName: 'is_hot', searchable: true }
      ])
    ];
    const invalid = collectInvalidSearchableFields(metas);
    expect(invalid).toHaveLength(3);
    expect(invalid.map(v => `${v.entity}.${v.field}:${v.type}`)).toEqual([
      'Post.views:integer',
      'Post.createdAt:date',
      'Post.isHot:boolean'
    ]);
  });

  it('assertSearchableSchemaValid throws with all offenders listed', () => {
    const metas = [
      makeMeta('Post', [{ name: 'views', type: 'integer', columnName: 'views', searchable: true }]),
      makeMeta('Author', [{ name: 'age', type: 'number', columnName: 'age', searchable: true }])
    ];
    let err: unknown;
    try {
      assertSearchableSchemaValid(metas);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(Error);
    const msg = (err as Error).message;
    expect(msg).toContain('Invalid "searchable"');
    expect(msg).toContain('Post.views');
    expect(msg).toContain('Author.age');
  });

  it('scans across multiple entities independently', () => {
    const metas = [
      makeMeta('A', [{ name: 'title', type: 'string', columnName: 'title', searchable: true }]),
      makeMeta('B', [{ name: 'count', type: 'integer', columnName: 'count', searchable: true }])
    ];
    const invalid = collectInvalidSearchableFields(metas);
    expect(invalid).toEqual([{ entity: 'B', field: 'count', type: 'integer' }]);
  });
});
