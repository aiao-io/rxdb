/**
 * @fileoverview PGL-010：undo/redo 的 upsert 必须恢复外键列
 *
 * `generateOnConflictClause` 只遍历 `propertyMap`，而外键物理列只存在于 `relationMap`。
 * 冲突行的 `DO UPDATE SET` 里没有 FK 列 → 普通字段被恢复，关联身份仍停在当前值。
 */
import { Entity, EntityBase, PropertyType, RelationKind, RxDB, SyncType } from '@aiao/rxdb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { generateDbName } from '../test-utils.js';

@Entity({
  name: 'FkOwner',
  properties: [{ name: 'name', type: PropertyType.string }],
  relations: [{ name: 'items', kind: RelationKind.ONE_TO_MANY, mappedEntity: 'FkItem', mappedProperty: 'owner' }]
})
class FkOwner extends EntityBase {
  name!: string;
}

@Entity({
  name: 'FkItem',
  properties: [{ name: 'title', type: PropertyType.string }],
  relations: [
    {
      name: 'owner',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'FkOwner',
      mappedProperty: 'items',
      nullable: true
    }
  ]
})
class FkItem extends EntityBase {
  title!: string;
  owner?: FkOwner;
  ownerId?: string;
}

describe('PGL-010 undo/redo 恢复外键', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: generateDbName(),
      entities: [FkOwner, FkItem],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    adapter = await rxdb.getAdapter('pglite');
    await rxdb.connect('pglite');
  });

  afterAll(async () => {
    if (rxdb) await rxdb.disconnectAll();
  });

  it('改掉外键后 undo，外键必须回到原值', async () => {
    const itemRepository = adapter.getRepository(FkItem);

    const ownerA = new FkOwner();
    ownerA.name = 'A';
    await ownerA.save();

    const ownerB = new FkOwner();
    ownerB.name = 'B';
    await ownerB.save();

    const item = new FkItem();
    item.title = 'item';
    item.ownerId = ownerA.id as string;
    await item.save();

    // 把归属改到 B
    item.ownerId = ownerB.id as string;
    item.title = 'item-moved';
    await item.save();

    await rxdb.versionManager.history().undo();

    const items = await itemRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(items).toHaveLength(1);
    expect(items[0].title).toEqual('item');
    // 普通字段回来了，外键也必须回来
    expect(items[0].ownerId).toEqual(ownerA.id);
  });
});
