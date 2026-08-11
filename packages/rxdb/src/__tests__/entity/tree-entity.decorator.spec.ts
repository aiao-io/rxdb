import { beforeAll, describe, expect, it } from 'vitest';
import { PropertyType, SyncType } from '../../entity/metadata-options.interface.js';
import { TreeAdjacencyListEntityBase } from '../../entity/tree-entity-base.js';
import { TreeEntity } from '../../entity/tree-entity.decorator.js';
import type { IRxDBAdapter } from '../../rxdb-adapter.js';
import { getEntityMetadata, uuid } from '../../rxdb-utils.js';
import { RxDB } from '../../RxDB.js';

describe('@TreeEntity', () => {
  @TreeEntity({
    name: 'Menu',
    properties: [
      {
        name: 'title',
        type: PropertyType.string
      }
    ]
  })
  class Menu extends TreeAdjacencyListEntityBase {}

  beforeAll(async () => {
    const rxdb = new RxDB({
      dbName: 'Menu',
      entities: [Menu],
      sync: {
        local: {
          adapter: 'sqlite'
        },
        type: SyncType.None
      }
    });
    rxdb.adapter(
      'sqlite',
      () =>
        ({
          init: () => {
            // 模拟。
          },
          create: () => {
            // 模拟。
          },
          destroy: () => {
            // 模拟。
          },
          internalQuery: () => {
            // 模拟。
          },
          getRepository: () => ({
            find: async () => [],
            count: async () => 0,
            create: async () => {
              // 模拟。
            },
            update: async () => {
              // 模拟。
            },
            remove: async () => {
              // 模拟。
            }
          })
        }) as unknown as IRxDBAdapter
    );
    rxdb.init();
  });

  it('通过类获取 metadata 正确', async () => {
    const meta = getEntityMetadata(Menu);
    expect(meta).toMatchInlineSnapshot(`
      {
        "computedProperties": [],
        "displayName": "Menu",
        "extends": [
          "TreeAdjacencyListEntityBase",
          "EntityBase",
        ],
        "features": {
          "tree": {
            "hasChildren": false,
            "type": "adjacency-list",
          },
        },
        "foreignKeys": [],
        "indexes": [],
        "name": "Menu",
        "namespace": "public",
        "properties": [
          {
            "columnName": "title",
            "name": "title",
            "type": "string",
          },
        ],
        "relations": [],
        "repository": "TreeRepository",
        "tableName": "Menu",
      }
    `);
  });

  it('通过实例获取 metadata 正确', async () => {
    const menu = new Menu({ id: uuid(), title: 'title' });
    const meta = getEntityMetadata(menu);
    expect(meta).toMatchInlineSnapshot(`
      {
        "computedProperties": [],
        "displayName": "Menu",
        "extends": [
          "TreeAdjacencyListEntityBase",
          "EntityBase",
        ],
        "features": {
          "tree": {
            "hasChildren": false,
            "type": "adjacency-list",
          },
        },
        "foreignKeys": [],
        "indexes": [],
        "name": "Menu",
        "namespace": "public",
        "properties": [
          {
            "columnName": "title",
            "name": "title",
            "type": "string",
          },
        ],
        "relations": [],
        "repository": "TreeRepository",
        "tableName": "Menu",
      }
    `);
  });

  it('new Todo()', async () => {
    const menu = new Menu({ id: uuid(), title: 'title' });
    expect(menu).instanceOf(Menu);
  });
});
