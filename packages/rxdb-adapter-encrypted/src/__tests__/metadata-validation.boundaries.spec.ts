import { describe, expect, it } from 'vitest';
import {
  validateEncryptedPropertyMetadata,
  validateFTSRegistrationAgainstEncryptedColumns,
  validateQueryAgainstEncryptedColumns,
  type EncryptedAwareEntity
} from '../metadata-validation.js';

const encryptedEntity = (): EncryptedAwareEntity => ({
  name: 'Secret',
  namespace: 'public',
  properties: [
    { name: 'id', columnName: 'secret_id', primary: true },
    { name: 'secret', columnName: 'secret_ciphertext', encrypted: true },
    { name: 'name', columnName: 'display_name' }
  ],
  indexes: [],
  relations: [],
  foreignKeyNames: [],
  foreignKeyColumnNames: []
});

describe('encrypted metadata boundary validation', () => {
  it('rejects indexes and foreign keys that use an encrypted database column name', () => {
    expect(() =>
      validateEncryptedPropertyMetadata({
        ...encryptedEntity(),
        indexes: [{ name: 'idx_secret', properties: ['secret_ciphertext'] }]
      })
    ).toThrow(expect.objectContaining({ code: 'encrypted_index_forbidden' }));

    expect(() =>
      validateEncryptedPropertyMetadata({
        ...encryptedEntity(),
        foreignKeyColumnNames: ['secret_ciphertext']
      })
    ).toThrow(expect.objectContaining({ code: 'encrypted_fk_forbidden' }));
  });

  it('rejects FTS registration by property name or database column name', () => {
    for (const field of ['secret', 'secret_ciphertext']) {
      expect(() =>
        validateFTSRegistrationAgainstEncryptedColumns({ entity: encryptedEntity(), ftsColumns: [field] })
      ).toThrow(expect.objectContaining({ code: 'encrypted_fts_forbidden' }));
    }
  });
});

describe('encrypted query boundary validation', () => {
  it.each([
    ['where', { where: { combinator: 'and' as const, rules: [{ field: 'secret_ciphertext' }] } }],
    ['order', { order: [{ name: 'secret_ciphertext', direction: 'asc' as const }] }],
    ['group', { group: ['secret_ciphertext'] }],
    ['projection', { projection: ['secret_ciphertext'] }]
  ])('rejects %s clauses that use the database column name', (_, clause) => {
    expect(() => validateQueryAgainstEncryptedColumns({ entity: encryptedEntity(), ...clause })).toThrow();
  });

  it('rejects a dotted path rooted at an encrypted property', () => {
    expect(() =>
      validateQueryAgainstEncryptedColumns({
        entity: encryptedEntity(),
        where: { combinator: 'and', rules: [{ field: 'secret.nested' }] }
      })
    ).toThrow(expect.objectContaining({ code: 'where_on_encrypted' }));
  });

  it('rejects encrypted fields reached through a relation path', () => {
    const relation = {
      name: 'author',
      columnName: 'author_id',
      kind: 'many-to-one',
      mappedEntity: 'Secret',
      mappedNamespace: 'public'
    };
    const root: EncryptedAwareEntity = { name: 'Post', properties: [], relations: [relation] };
    const args = {
      entity: root,
      where: { combinator: 'and' as const, rules: [{ field: 'author.secret' }] },
      resolveEntity: (name: string, namespace?: string): EncryptedAwareEntity | undefined =>
        name === 'Secret' && namespace === 'public' ? encryptedEntity() : undefined
    };

    expect(() => validateQueryAgainstEncryptedColumns(args)).toThrow(
      expect.objectContaining({ code: 'where_on_encrypted' })
    );
  });

  it.each(['exists', 'notExists'] as const)('validates nested %s relation predicates', operator => {
    const relation = {
      name: 'author',
      kind: 'many-to-one',
      mappedEntity: 'Secret',
      mappedNamespace: 'public'
    };
    const root: EncryptedAwareEntity = { name: 'Post', properties: [], relations: [relation] };
    const args = {
      entity: root,
      where: {
        combinator: 'and' as const,
        rules: [
          {
            field: 'author',
            operator,
            where: { combinator: 'and' as const, rules: [{ field: 'secret' }] }
          }
        ]
      },
      resolveEntity: (): EncryptedAwareEntity => encryptedEntity()
    };

    expect(() => validateQueryAgainstEncryptedColumns(args)).toThrow(
      expect.objectContaining({ code: 'where_on_encrypted' })
    );
  });
});
