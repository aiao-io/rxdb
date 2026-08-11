import {
  PropertyType,
  RelationKind,
  transitionMetadata,
  type EntityMetadata,
  type EntityPropertyMetadataOptions
} from '@aiao/rxdb';
import { createKeyring, type KeyringRow, type KeyringStorageBinding } from '@aiao/rxdb-adapter-encrypted';
import { describe, expect, it } from 'vitest';
import { update_sql } from '../../entity/update_sql.js';
import type { EncryptionContext } from '../../sqlite-core.utils.js';

class TestEntity {
  name?: string;
  code?: string;
  parentId?: bigint;
  secret?: string;
  updatedAt?: Date;

  constructor(public id: string) {}
}

class MemoryKeyringStorage implements KeyringStorageBinding {
  private row: KeyringRow | null = null;

  async readSingleton(): Promise<KeyringRow | null> {
    return this.row;
  }

  async writeSingleton(row: KeyringRow): Promise<void> {
    this.row = row;
  }
}

const createMetadata = (properties: EntityPropertyMetadataOptions[]): EntityMetadata =>
  transitionMetadata({
    name: 'TestEntity',
    namespace: 'test',
    properties
  });

const encryptionContext: EncryptionContext = {
  keyring: createKeyring({ namespace: 'test', storage: new MemoryKeyringStorage() }),
  namespace: 'test'
};

const entities = (...ids: string[]): TestEntity[] => ids.map(id => new TestEntity(id));

describe('update_sql', () => {
  it('应该生成基本的 UPDATE SQL', async () => {
    const metadata = createMetadata([
      { name: 'id', type: PropertyType.uuid },
      { name: 'name', type: PropertyType.string }
    ]);

    const result = await update_sql(metadata, new TestEntity('e-1'), { name: 'new' });

    expect(result.sql).toContain('UPDATE "test$TestEntity" SET "name" = ? WHERE "id" = ?');
    expect(result.params).toEqual(['new', 'e-1']);
  });

  it('空 patch 应 fail-fast，而不是生成只有 updatedAt 的假 UPDATE', async () => {
    const metadata = createMetadata([
      { name: 'id', type: PropertyType.uuid },
      { name: 'name', type: PropertyType.string },
      { name: 'updatedAt', type: PropertyType.date }
    ]);

    await expect(update_sql(metadata, new TestEntity('e-1'), {})).rejects.toThrow(/Empty patch/);
  });

  it('patch 只含 readonly 字段时同样视为空 patch', async () => {
    const metadata = createMetadata([
      { name: 'id', type: PropertyType.uuid },
      { name: 'code', type: PropertyType.string, readonly: true }
    ]);

    await expect(update_sql(metadata, new TestEntity('e-1'), { code: 'x' })).rejects.toThrow(/Empty patch/);
  });

  it('加密字段使用默认 columnName 时，数组更新应抛错', async () => {
    const metadata = createMetadata([
      { name: 'id', type: PropertyType.uuid },
      { name: 'secret', type: PropertyType.string, encrypted: true }
    ]);

    await expect(
      update_sql(metadata, entities('e-1', 'e-2'), { secret: 'x' }, { encryption: encryptionContext })
    ).rejects.toThrow(/Batch UPDATE with encrypted columns/);
  });

  it('加密字段配置自定义 columnName 时，数组更新保护不得被绕过', async () => {
    const metadata = createMetadata([
      { name: 'id', type: PropertyType.uuid },
      { name: 'secret', type: PropertyType.string, columnName: 'secret_col', encrypted: true }
    ]);

    await expect(
      update_sql(metadata, entities('e-1', 'e-2'), { secret: 'x' }, { encryption: encryptionContext })
    ).rejects.toThrow(/Batch UPDATE with encrypted columns/);
  });

  it('非加密字段的数组更新应正常生成 IN 条件', async () => {
    const metadata = createMetadata([
      { name: 'id', type: PropertyType.uuid },
      { name: 'name', type: PropertyType.string }
    ]);

    const result = await update_sql(metadata, entities('e-1', 'e-2'), { name: 'new' });

    expect(result.sql).toContain('WHERE "id" in (?,?)');
    expect(result.params).toEqual(['new', 'e-1', 'e-2']);
  });

  it('bigint 外键 UPDATE 应拒绝 number 值', async () => {
    const parentMetadata = transitionMetadata({
      name: 'BigIntParent',
      namespace: 'test',
      properties: [{ name: 'id', type: PropertyType.bigint, primary: true }]
    });
    const metadata = transitionMetadata({
      name: 'BigIntChild',
      namespace: 'test',
      properties: [{ name: 'id', type: PropertyType.uuid, primary: true }],
      relations: [
        {
          name: 'parent',
          kind: RelationKind.MANY_TO_ONE,
          mappedEntity: 'BigIntParent',
          mappedProperty: 'children'
        }
      ]
    });
    const encryption: EncryptionContext = {
      keyring: null,
      namespace: 'test',
      resolveEntityMetadata: entity => (entity === parentMetadata.name ? parentMetadata : undefined)
    };

    await expect(
      update_sql(metadata, new TestEntity('e-1'), { parentId: 1 as unknown as bigint }, { encryption })
    ).rejects.toThrow('id must be a signed 64-bit bigint');
  });
});
