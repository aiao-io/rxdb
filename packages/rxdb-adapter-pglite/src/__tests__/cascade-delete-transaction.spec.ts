/**
 * @fileoverview 级联写入与源删除记成一个事务（US-318）—— PGlite 本地库。
 *
 * @remarks
 * 删除被引用的实体时，本地外键级联删除或置空引用它的行；源删除与级联写入要记在同一个事务里，
 * 撤销一次整组恢复、重做一次整组删掉。SQLite 一族的同一组断言在 `rxdb-adapter-sqlite-core` 的级联一致性套件里。
 */
import {
  ENTITY_STATIC_TYPES,
  Entity,
  EntityBase,
  OnDeleteAction,
  PropertyType,
  RelationKind,
  RxDB,
  RxDBChange,
  SyncType,
  type UUID,
  getRxDBChangeEntityIdQueryValues
} from '@aiao/rxdb';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';
import { generateDbName } from './test-utils.js';

@Entity({
  name: 'Us318Parent',
  properties: [{ name: 'name', type: PropertyType.string }],
  relations: [{ name: 'children', kind: RelationKind.ONE_TO_MANY, mappedEntity: 'Us318Child', mappedProperty: 'parent' }]
})
class Us318Parent extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  declare name: string;
}

@Entity({
  name: 'Us318Child',
  properties: [{ name: 'name', type: PropertyType.string }],
  relations: [
    {
      name: 'parent',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'Us318Parent',
      mappedProperty: 'children',
      nullable: false,
      onDelete: OnDeleteAction.CASCADE
    }
  ]
})
class Us318Child extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  declare name: string;
  declare parentId: UUID;
}

@Entity({
  name: 'Us318Category',
  properties: [{ name: 'name', type: PropertyType.string }],
  relations: [
    { name: 'products', kind: RelationKind.ONE_TO_MANY, mappedEntity: 'Us318Product', mappedProperty: 'category' }
  ]
})
class Us318Category extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  declare name: string;
}

@Entity({
  name: 'Us318Product',
  properties: [{ name: 'name', type: PropertyType.string }],
  relations: [
    {
      name: 'category',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'Us318Category',
      mappedProperty: 'products',
      nullable: true
    }
  ]
})
class Us318Product extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  declare name: string;
  declare categoryId: UUID | null;
}

describe('级联写入与源删除记成一个事务（US-318）', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: generateDbName(),
      context: { userId: 'us318' },
      entities: [Us318Parent, Us318Child, Us318Category, Us318Product],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    rxdb.use(rxDBPluginHistory);
    rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    adapter = await rxdb.getAdapter('pglite');
    await rxdb.connect('pglite');
  });

  afterAll(async () => {
    if (rxdb) await rxdb.disconnectAll();
  });

  const changesOf = (entityIds: string[]) =>
    adapter.getRepository(RxDBChange).find({
      where: {
        combinator: 'and',
        rules: [{ field: 'entityId', operator: 'in', value: getRxDBChangeEntityIdQueryValues(entityIds) }]
      }
    });
  const byId = <T extends typeof Us318Parent | typeof Us318Category | typeof Us318Product>(EntityType: T, id: string) =>
    adapter.getRepository(EntityType).find({
      where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: id }] }
    });
  const childrenOf = (parentId: string) =>
    adapter.getRepository(Us318Child).find({
      where: { combinator: 'and', rules: [{ field: 'parentId', operator: '=', value: parentId }] }
    });

  it('删除父记录：级联删掉的子记录与源删除同一个事务号，撤销一次全部回来，重做一次全部删掉', async () => {
    const parent = new Us318Parent({ name: 'parent' });
    await parent.save();
    const children = ['a', 'b'].map(name => new Us318Child({ name: `child ${name}`, parentId: parent.id }));
    for (const child of children) await child.save();

    await parent.remove();

    const deletes = (await changesOf([parent.id, ...children.map(child => child.id)])).filter(
      change => change.type === 'DELETE'
    );
    expect(deletes).toHaveLength(3);
    expect(new Set(deletes.map(change => change.transactionId)).size).toBe(1);
    expect(deletes[0].transactionId).not.toBeNull();

    const history = rxdb.versionManager.history();
    await history.undo();
    expect(await byId(Us318Parent, parent.id)).toHaveLength(1);
    expect(await childrenOf(parent.id)).toHaveLength(2);

    await history.redo();
    expect(await byId(Us318Parent, parent.id)).toHaveLength(0);
    expect(await childrenOf(parent.id)).toHaveLength(0);
  });

  it('删除被可空外键引用的记录：置空与源删除同一个事务号，撤销一次两边都回来', async () => {
    const category = new Us318Category({ name: 'category' });
    await category.save();
    const product = new Us318Product({ name: 'product', categoryId: category.id });
    await product.save();

    await category.remove();

    const writes = (await changesOf([category.id, product.id])).filter(change => change.type !== 'INSERT');
    expect(writes.map(change => change.type).sort()).toEqual(['DELETE', 'UPDATE']);
    expect(new Set(writes.map(change => change.transactionId)).size).toBe(1);
    expect(writes[0].transactionId).not.toBeNull();

    await rxdb.versionManager.history().undo();
    expect(await byId(Us318Category, category.id)).toHaveLength(1);
    const [restored] = await byId(Us318Product, product.id);
    expect(restored.categoryId).toBe(category.id);
  });
});
