import { EntityMetadata, EntityPropertyMetadataOptions, PropertyType, transitionMetadata } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import generate_entity_insert_sql from '../../entity/insert_sql.js';
import generate_entity_inserts_sql, { generate_entity_upserts_sql } from '../../entity/inserts_sql.js';

const createMetadata = (properties: Array<[string, PropertyType]>): EntityMetadata =>
  transitionMetadata({
    name: 'InsertResidual',
    namespace: 'test',
    properties: properties.map(([name, type]) => ({ name, type })) as EntityPropertyMetadataOptions[]
  });

describe('insert/inserts residual primaryKey null', () => {
  it('insert_sql uses empty primaryKey when id is null/undefined', async () => {
    const metadata = createMetadata([
      ['id', PropertyType.uuid],
      ['name', PropertyType.string]
    ]);

    const nullId = await generate_entity_insert_sql(metadata, { id: null, name: 'n1' } as never);
    expect(nullId.sql).toContain('INSERT INTO');
    expect(nullId.params).toContain('n1');

    const missingId = await generate_entity_insert_sql(metadata, { name: 'n2' } as never);
    expect(missingId.sql).toContain('INSERT INTO');
    expect(missingId.params).toContain('n2');
  });

  it('inserts_sql generates multi-row SQL and DEFAULT for missing columns', async () => {
    const metadata = createMetadata([
      ['id', PropertyType.uuid],
      ['name', PropertyType.string],
      ['age', PropertyType.integer]
    ]);

    const sql = await generate_entity_upserts_sql(metadata, [
      { id: null, name: 'a' } as never,
      { id: 'id-2', name: 'b', age: 3 } as never
    ]);

    expect(sql).toContain('INSERT INTO');
    expect(sql).toContain('VALUES');
    expect(sql).toContain('DEFAULT');
    expect(sql).toContain("'a'");
    expect(sql).toContain("'b'");
    expect(sql).toContain('ON CONFLICT ("id") DO UPDATE SET');
    expect(sql).toContain('"name" = EXCLUDED."name"');
    expect(sql).not.toContain('"id" = EXCLUDED."id"');
  });

  it('inserts_sql sets createdBy/updatedBy from context when present', async () => {
    const metadata = createMetadata([
      ['id', PropertyType.uuid],
      ['name', PropertyType.string],
      ['createdBy', PropertyType.uuid],
      ['updatedBy', PropertyType.uuid]
    ]);

    const sql = await generate_entity_inserts_sql(metadata, [{ id: 'id-1', name: 'with-user' } as never], {
      userId: 'user-residual'
    });

    expect(sql).toContain('"createdBy"');
    expect(sql).toContain('"updatedBy"');
    expect(sql).toContain("'user-residual'");
  });

  it('upserts_sql preserves creation fields while updating mutable fields', async () => {
    const metadata = createMetadata([
      ['id', PropertyType.uuid],
      ['name', PropertyType.string],
      ['createdAt', PropertyType.date],
      ['updatedAt', PropertyType.date],
      ['createdBy', PropertyType.uuid],
      ['updatedBy', PropertyType.uuid]
    ]);

    const sql = await generate_entity_upserts_sql(
      metadata,
      [
        {
          id: '00000000-0000-4000-8000-000000000015',
          name: 'upsert',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-02T00:00:00.000Z')
        } as never
      ],
      { userId: 'audit-user' }
    );

    expect(sql).not.toContain('"createdAt" = EXCLUDED."createdAt"');
    expect(sql).not.toContain('"createdBy" = EXCLUDED."createdBy"');
    expect(sql).toContain('"updatedAt" = EXCLUDED."updatedAt"');
    expect(sql).toContain('"updatedBy" = EXCLUDED."updatedBy"');
    expect(sql).toContain('"name" = EXCLUDED."name"');
  });

  it('inserts_sql omits null sequence primary keys and uses DEFAULT in mixed batches', async () => {
    const metadata = transitionMetadata({
      name: 'MigrationWatermark',
      namespace: 'test',
      properties: [
        { name: 'id', type: PropertyType.integer, primary: true },
        { name: 'name', type: PropertyType.string, required: true }
      ]
    });

    const generatedOnly = await generate_entity_inserts_sql(metadata, [
      { id: null, name: 'first' } as never,
      { id: undefined, name: 'second' } as never
    ]);
    const mixed = await generate_entity_inserts_sql(metadata, [
      { id: null, name: 'generated' } as never,
      { id: 7, name: 'explicit' } as never
    ]);

    expect(generatedOnly).toContain('("name") VALUES');
    expect(generatedOnly).not.toContain('"id"');
    expect(mixed).toContain('"id"');
    expect(mixed).toContain("(E'generated',DEFAULT)");
    expect(mixed).toContain("(E'explicit',7)");
    expect(mixed).not.toContain('NULL');
  });
});
