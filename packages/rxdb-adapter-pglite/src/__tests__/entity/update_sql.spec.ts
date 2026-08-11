import { PropertyType, transitionMetadata, type EntityMetadata, type EntityPropertyMetadataOptions } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import generate_entity_update_sql from '../../entity/update_sql.js';

class TestEntity {
  name?: string;
  secret?: string;
  updatedAt?: Date;
  updatedBy?: string;
  constructor(public id: string) {}
}

const createMetadata = (properties: EntityPropertyMetadataOptions[]): EntityMetadata =>
  transitionMetadata({
    name: 'TestEntity',
    namespace: 'test',
    properties
  });

describe('update_sql (PGlite)', () => {
  it('generates single-entity update with $ placeholders and RETURNING', async () => {
    const metadata = createMetadata([
      { name: 'id', type: PropertyType.uuid },
      { name: 'name', type: PropertyType.string }
    ]);
    const result = await generate_entity_update_sql(metadata, new TestEntity('e-1'), { name: 'new' });
    expect(result.sql).toContain('UPDATE "test"."TestEntity" SET "name" = $1 WHERE id = $2 RETURNING *');
    expect(result.params).toEqual(['new', 'e-1']);
  });

  it('sets updatedAt and updatedBy from context', async () => {
    const metadata = createMetadata([
      { name: 'id', type: PropertyType.uuid },
      { name: 'name', type: PropertyType.string },
      { name: 'updatedAt', type: PropertyType.date },
      { name: 'updatedBy', type: PropertyType.uuid }
    ]);
    const when = new Date('2024-01-01T00:00:00.000Z');
    const result = await generate_entity_update_sql(
      metadata,
      new TestEntity('e-1'),
      { name: 'x' },
      { userId: 'u-1', updatedAt: when }
    );
    expect(result.sql).toContain('"updatedAt"');
    expect(result.sql).toContain('"updatedBy"');
    // Date 可能会被 transformEntityValueToSql 序列化。
    expect(result.params.some(v => String(v).includes('2024-01-01'))).toBe(true);
    expect(result.params).toContain('u-1');
  });

  it('uses ANY for multi-entity updates and can omit RETURNING', async () => {
    const metadata = createMetadata([
      { name: 'id', type: PropertyType.uuid },
      { name: 'name', type: PropertyType.string }
    ]);
    const result = await generate_entity_update_sql(
      metadata,
      [new TestEntity('e-1'), new TestEntity('e-2')],
      { name: 'batch' },
      { returning: false }
    );
    expect(result.sql).toContain('WHERE id = ANY($2)');
    expect(result.sql).not.toContain('RETURNING');
    expect(result.params).toEqual(['batch', ['e-1', 'e-2']]);
  });

  it('rejects batch update when encrypted columns are patched', async () => {
    const metadata = createMetadata([
      { name: 'id', type: PropertyType.uuid },
      { name: 'secret', type: PropertyType.string, encrypted: true }
    ]);
    const encryption = {
      keyring: {} as never,
      namespace: 'test'
    };
    await expect(
      generate_entity_update_sql(
        metadata,
        [new TestEntity('e-1'), new TestEntity('e-2')],
        { secret: 'x' },
        { encryption }
      )
    ).rejects.toThrow(/Batch UPDATE with encrypted columns/);
  });

  it('single-entity path still works when encryption map is present but unused', async () => {
    const metadata = createMetadata([
      { name: 'id', type: PropertyType.uuid },
      { name: 'name', type: PropertyType.string },
      { name: 'secret', type: PropertyType.string, encrypted: true }
    ]);
    expect(metadata.encryptedPropertyMap?.size ?? 0).toBeGreaterThan(0);
    // 补丁只包含未加密列 → hasEncryptedPatch 为 false。
    const result = await generate_entity_update_sql(metadata, new TestEntity('e-9'), { name: 'plain' });
    expect(result.sql).toContain('WHERE id = $2');
    expect(result.params).toEqual(['plain', 'e-9']);
  });
});
