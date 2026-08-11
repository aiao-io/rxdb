import { PropertyType, RelationKind, transitionMetadata } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { validateEncryptedQuery } from '../validate-encrypted-query.js';

const secret = transitionMetadata({
  name: 'Secret',
  namespace: 'public',
  properties: [
    { name: 'id', type: PropertyType.string, primary: true },
    { name: 'value', columnName: 'secret_value', type: PropertyType.string, encrypted: true }
  ]
});

const post = transitionMetadata({
  name: 'Post',
  namespace: 'public',
  properties: [{ name: 'id', type: PropertyType.string, primary: true }],
  relations: [
    {
      name: 'secret',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'Secret',
      mappedProperty: 'posts'
    }
  ]
});

describe('validateEncryptedQuery', () => {
  it('rejects an encrypted database column without unsafe casts', () => {
    expect(() =>
      validateEncryptedQuery(secret, {
        where: { combinator: 'and', rules: [{ field: 'secret_value', operator: '=', value: 'x' }] }
      })
    ).toThrow(expect.objectContaining({ code: 'where_on_encrypted' }));
  });

  it('uses the adapter resolver for relation paths', () => {
    expect(() =>
      validateEncryptedQuery(
        post,
        { where: { combinator: 'and', rules: [{ field: 'secret.value', operator: '=', value: 'x' }] } },
        (name, namespace) => (name === 'Secret' && namespace === 'public' ? secret : undefined)
      )
    ).toThrow(expect.objectContaining({ code: 'where_on_encrypted' }));
  });

  it('validates adapter field aliases against their logical property', () => {
    expect(() =>
      validateEncryptedQuery(
        secret,
        { where: { combinator: 'and', rules: [{ field: 'children.value', operator: '=', value: 'x' }] } },
        undefined,
        field => field.replace(/^children\./, '')
      )
    ).toThrow(expect.objectContaining({ code: 'where_on_encrypted', property: 'value' }));
  });

  it.each([PropertyType.bigint, PropertyType.binary])('rejects queries and sorting over encrypted %s', type => {
    const metadata = transitionMetadata({
      name: 'SecretValue',
      properties: [
        { name: 'id', type: PropertyType.string, primary: true },
        ...(type === PropertyType.bigint ?
          [{ name: 'value', type: PropertyType.bigint, encrypted: true } as const]
        : [{ name: 'value', type: PropertyType.binary, encrypted: true } as const])
      ]
    });

    expect(() =>
      validateEncryptedQuery(metadata, {
        where: { combinator: 'and', rules: [{ field: 'value', operator: '=', value: null }] }
      })
    ).toThrow(expect.objectContaining({ code: 'where_on_encrypted' }));
    expect(() => validateEncryptedQuery(metadata, { orderBy: [{ field: 'value', sort: 'asc' }] })).toThrow(
      expect.objectContaining({ code: 'order_on_encrypted' })
    );
  });
});
