import { PropertyType } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { EncryptedConfigurationError, EncryptedQueryError } from '../errors.js';
import {
  validateEncryptedPropertyMetadata,
  validateFTSRegistrationAgainstEncryptedColumns,
  validateQueryAgainstEncryptedColumns,
  type EncryptedAwareEntity
} from '../metadata-validation.js';

const baseEntity = (overrides: Partial<EncryptedAwareEntity> = {}): EncryptedAwareEntity => ({
  name: 'User',
  tableName: 'user',
  properties: [{ name: 'id', primary: true }, { name: 'name' }, { name: 'ssn', encrypted: true }],
  computedProperties: [],
  relations: [],
  indexes: [],
  foreignKeyNames: [],
  ...overrides
});

describe('validateEncryptedPropertyMetadata', () => {
  it('passes when no encrypted properties exist', () => {
    expect(() =>
      validateEncryptedPropertyMetadata({
        name: 'E',
        properties: [{ name: 'a' }, { name: 'b' }]
      })
    ).not.toThrow();
  });

  it('rejects encrypted primary key', () => {
    expect(() =>
      validateEncryptedPropertyMetadata({
        name: 'U',
        properties: [{ name: 'id', primary: true, encrypted: true }]
      })
    ).toThrow(
      expect.objectContaining({
        name: 'EncryptedConfigurationError',
        code: 'encrypted_pk_forbidden',
        entity: 'U',
        property: 'id'
      })
    );
  });

  it('rejects encrypted unique column', () => {
    expect(() =>
      validateEncryptedPropertyMetadata({
        name: 'U',
        properties: [{ name: 'email', unique: true, encrypted: true }]
      })
    ).toThrow(expect.objectContaining({ code: 'encrypted_unique_forbidden' }));
  });

  it('rejects encrypted sortable column', () => {
    expect(() =>
      validateEncryptedPropertyMetadata({
        name: 'U',
        properties: [{ name: 'rank', sortable: true, encrypted: true }]
      })
    ).toThrow(expect.objectContaining({ code: 'encrypted_sortable_forbidden' }));
  });

  // RXT-019 的 FTS 半边。`searchable: true` 会把该列的**明文**送进 FTS5 外部内容表 ——
  // 实体表加不加密都失去意义。此前守卫只写在
  // `validateFTSRegistrationAgainstEncryptedColumns` 里，而那个函数**没有任何生产调用方**
  // （见本文件下方那个 describe：它测的是一个死掉的入口），于是注册期一路放行。
  it('rejects encrypted searchable column', () => {
    expect(() =>
      validateEncryptedPropertyMetadata({
        name: 'U',
        properties: [{ name: 'creditCardInfo', searchable: true, encrypted: true }]
      })
    ).toThrow(expect.objectContaining({ code: 'encrypted_fts_forbidden' }));
  });

  it('rejects encrypted computed property', () => {
    expect(() =>
      validateEncryptedPropertyMetadata({
        name: 'U',
        properties: [{ name: 'name' }],
        computedProperties: [{ name: 'derived', encrypted: true }]
      })
    ).toThrow(expect.objectContaining({ code: 'encrypted_computed_forbidden' }));
  });

  it('rejects encrypted property used in index', () => {
    expect(() =>
      validateEncryptedPropertyMetadata({
        name: 'U',
        properties: [{ name: 'ssn', encrypted: true }],
        indexes: [{ name: 'idx_ssn', properties: ['ssn'] }]
      })
    ).toThrow(expect.objectContaining({ code: 'encrypted_index_forbidden' }));
  });

  it('rejects encrypted foreign key', () => {
    expect(() =>
      validateEncryptedPropertyMetadata({
        name: 'U',
        properties: [{ name: 'ownerId', encrypted: true }],
        foreignKeyNames: ['ownerId']
      })
    ).toThrow(expect.objectContaining({ code: 'encrypted_fk_forbidden' }));
  });

  it('accepts a benign encrypted column', () => {
    expect(() => validateEncryptedPropertyMetadata(baseEntity())).not.toThrow();
  });

  it.each([PropertyType.bigint, PropertyType.binary])(
    'keeps primary, index, and sortable restrictions for encrypted %s',
    type => {
      const property = { name: 'secret', type, encrypted: true };

      expect(() =>
        validateEncryptedPropertyMetadata({ name: 'U', properties: [{ ...property, primary: true }] })
      ).toThrow(expect.objectContaining({ code: 'encrypted_pk_forbidden' }));
      expect(() =>
        validateEncryptedPropertyMetadata({
          name: 'U',
          properties: [property],
          indexes: [{ properties: ['secret'] }]
        })
      ).toThrow(expect.objectContaining({ code: 'encrypted_index_forbidden' }));
      expect(() =>
        validateEncryptedPropertyMetadata({ name: 'U', properties: [{ ...property, sortable: true }] })
      ).toThrow(expect.objectContaining({ code: 'encrypted_sortable_forbidden' }));
    }
  );

  it('completes in well under 10 ms', () => {
    const e = baseEntity();
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) validateEncryptedPropertyMetadata(e);
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(10);
  });
});

describe('validateQueryAgainstEncryptedColumns', () => {
  it('throws where_on_encrypted when WHERE references encrypted column', () => {
    expect(() =>
      validateQueryAgainstEncryptedColumns({
        entity: baseEntity(),
        where: { combinator: 'and', rules: [{ field: 'ssn' }] }
      })
    ).toThrow(expect.objectContaining({ name: 'EncryptedQueryError', code: 'where_on_encrypted' }));
  });

  it('walks nested WHERE groups', () => {
    expect(() =>
      validateQueryAgainstEncryptedColumns({
        entity: baseEntity(),
        where: {
          combinator: 'or',
          rules: [{ field: 'name' }, { combinator: 'and', rules: [{ field: 'ssn' }] }]
        }
      })
    ).toThrow(expect.objectContaining({ code: 'where_on_encrypted' }));
  });

  it('throws order_on_encrypted', () => {
    expect(() =>
      validateQueryAgainstEncryptedColumns({
        entity: baseEntity(),
        order: [{ name: 'ssn', direction: 'asc' }]
      })
    ).toThrow(expect.objectContaining({ code: 'order_on_encrypted' }));
  });

  it('throws group_on_encrypted', () => {
    expect(() => validateQueryAgainstEncryptedColumns({ entity: baseEntity(), group: ['ssn'] })).toThrow(
      expect.objectContaining({ code: 'group_on_encrypted' })
    );
  });

  it('throws projection_on_encrypted only when explicit', () => {
    expect(() => validateQueryAgainstEncryptedColumns({ entity: baseEntity(), projection: ['ssn'] })).toThrow(
      expect.objectContaining({ code: 'projection_on_encrypted' })
    );
    // projection 为空或省略 = "all" → 允许。
    expect(() => validateQueryAgainstEncryptedColumns({ entity: baseEntity(), projection: [] })).not.toThrow();
    expect(() => validateQueryAgainstEncryptedColumns({ entity: baseEntity() })).not.toThrow();
  });

  it('no-ops when entity has no encrypted columns', () => {
    expect(() =>
      validateQueryAgainstEncryptedColumns({
        entity: { name: 'E', properties: [{ name: 'a' }] },
        where: { combinator: 'and', rules: [{ field: 'a' }] }
      })
    ).not.toThrow();
  });

  it.each([
    ['where_on_encrypted', { where: { combinator: 'and', rules: [{ field: 'unknown.secret' }] } }],
    ['order_on_encrypted', { order: [{ name: 'unknown.secret', direction: 'asc' }] }],
    ['group_on_encrypted', { group: ['unknown.secret'] }],
    ['projection_on_encrypted', { projection: ['unknown.secret'] }]
  ] as const)('fails closed with %s when a cross-entity path cannot be resolved', (code, query) => {
    expect(() => validateQueryAgainstEncryptedColumns({ entity: baseEntity(), ...query })).toThrow(
      expect.objectContaining({ name: 'EncryptedQueryError', code, property: 'unknown.secret' })
    );
  });

  it('fails closed when relation metadata exists but its target resolver is missing', () => {
    const entity = baseEntity({
      relations: [{ name: 'account', mappedEntity: 'Account' }]
    });

    expect(() =>
      validateQueryAgainstEncryptedColumns({
        entity,
        where: { combinator: 'and', rules: [{ field: 'account.secret' }] }
      })
    ).toThrow(expect.objectContaining({ code: 'where_on_encrypted', property: 'account.secret' }));
  });

  it('resolves inherited relations from relationMap without weakening encrypted-field checks', () => {
    const relation = { name: 'children', mappedEntity: 'Menu' };
    const entity = baseEntity({
      name: 'Menu',
      relations: [],
      relationMap: new Map([['children', relation]])
    });
    const resolveEntity = (): EncryptedAwareEntity => entity;

    expect(() =>
      validateQueryAgainstEncryptedColumns({
        entity,
        resolveEntity,
        where: { combinator: 'and', rules: [{ field: 'children.name' }] }
      })
    ).not.toThrow();
    expect(() =>
      validateQueryAgainstEncryptedColumns({
        entity,
        resolveEntity,
        where: { combinator: 'and', rules: [{ field: 'children.ssn' }] }
      })
    ).toThrow(expect.objectContaining({ code: 'where_on_encrypted', property: 'children.ssn' }));
  });

  it('allows nested paths inside a known unencrypted JSON property', () => {
    expect(() =>
      validateQueryAgainstEncryptedColumns({
        entity: baseEntity({ properties: [...(baseEntity().properties ?? []), { name: 'profile', type: 'json' }] }),
        where: { combinator: 'and', rules: [{ field: 'profile.nickname' }] }
      })
    ).not.toThrow();
  });
});

describe('validateFTSRegistrationAgainstEncryptedColumns', () => {
  it('throws encrypted_fts_forbidden when FTS includes encrypted column', () => {
    let error: unknown;
    try {
      validateFTSRegistrationAgainstEncryptedColumns({
        entity: baseEntity(),
        ftsColumns: ['name', 'ssn']
      });
    } catch (cause) {
      error = cause;
    }

    expect(error).toBeInstanceOf(EncryptedConfigurationError);
    expect(error).toMatchObject({
      name: 'EncryptedConfigurationError',
      code: 'encrypted_fts_forbidden',
      property: 'ssn'
    });
  });

  it('passes when FTS columns are not encrypted', () => {
    expect(() =>
      validateFTSRegistrationAgainstEncryptedColumns({
        entity: baseEntity(),
        ftsColumns: ['name']
      })
    ).not.toThrow();
  });
});

describe('error class instanceof', () => {
  it('configuration errors are instances of EncryptedConfigurationError', () => {
    try {
      validateEncryptedPropertyMetadata({
        name: 'U',
        properties: [{ name: 'id', primary: true, encrypted: true }]
      });
    } catch (e) {
      expect(e).toBeInstanceOf(EncryptedConfigurationError);
    }
  });
  it('query errors are instances of EncryptedQueryError', () => {
    try {
      validateQueryAgainstEncryptedColumns({
        entity: baseEntity(),
        where: { combinator: 'and', rules: [{ field: 'ssn' }] }
      });
    } catch (e) {
      expect(e).toBeInstanceOf(EncryptedQueryError);
    }
  });

  it('uses precomputed encryptedPropertyMap when supplied', () => {
    const entity: EncryptedAwareEntity = {
      name: 'U',
      properties: [{ name: 'ssn', encrypted: true, primary: true }],
      encryptedPropertyMap: new Map([['ssn', { name: 'ssn', encrypted: true, primary: true }]])
    };
    expect(() => validateEncryptedPropertyMetadata(entity)).toThrow(
      expect.objectContaining({ code: 'encrypted_pk_forbidden' })
    );
  });

  it('ignores malformed where nodes without field or rules', () => {
    expect(() =>
      validateQueryAgainstEncryptedColumns({
        entity: baseEntity(),
        where: { combinator: 'and', rules: [{} as never, { field: 'name' }] }
      })
    ).not.toThrow();
  });

  it('ignores where group with non-array rules', () => {
    expect(() =>
      validateQueryAgainstEncryptedColumns({
        entity: baseEntity(),
        where: { combinator: 'and', rules: undefined as unknown as never[] }
      })
    ).not.toThrow();
  });

  it('returns early when no encrypted columns and no args supplied', () => {
    expect(() =>
      validateQueryAgainstEncryptedColumns({
        entity: { name: 'X', properties: [{ name: 'a' }] }
      })
    ).not.toThrow();
  });

  it('skips order/group/projection when no encrypted columns', () => {
    expect(() =>
      validateQueryAgainstEncryptedColumns({
        entity: { name: 'X', properties: [{ name: 'a' }] },
        order: [{ name: 'a', direction: 'asc' }],
        group: ['a'],
        projection: ['a']
      })
    ).not.toThrow();
  });

  it('FTS validator no-ops on entity with no encrypted columns', () => {
    expect(() =>
      validateFTSRegistrationAgainstEncryptedColumns({
        entity: { name: 'X', properties: [{ name: 'a' }] },
        ftsColumns: ['a']
      })
    ).not.toThrow();
  });

  it('no-ops when args has no where/order/group/projection but encrypted exists', () => {
    expect(() => validateQueryAgainstEncryptedColumns({ entity: baseEntity() })).not.toThrow();
  });

  it('allows WHERE referencing only non-encrypted fields', () => {
    expect(() =>
      validateQueryAgainstEncryptedColumns({
        entity: baseEntity(),
        where: { combinator: 'and', rules: [{ field: 'name' }] }
      })
    ).not.toThrow();
  });

  it('allows order/group/projection referencing only non-encrypted fields', () => {
    expect(() =>
      validateQueryAgainstEncryptedColumns({
        entity: baseEntity(),
        order: [{ name: 'name', direction: 'asc' }],
        group: ['name'],
        projection: ['name']
      })
    ).not.toThrow();
  });

  it('falls back to tableName when name is missing', () => {
    expect(() =>
      validateEncryptedPropertyMetadata({
        tableName: 'tbl_only',
        properties: [{ name: 'id', primary: true, encrypted: true }]
      })
    ).toThrow(expect.objectContaining({ entity: 'tbl_only' }));
  });

  it('uses ? in message when entity has no name or tableName', () => {
    try {
      validateEncryptedPropertyMetadata({
        properties: [{ name: 'id', primary: true, encrypted: true }]
      });
    } catch (e) {
      expect((e as Error).message).toContain('entity: ?');
    }
  });
});
