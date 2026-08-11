import { beforeAll, describe, expect, it } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import { PropertyType, SyncType } from '../../entity/metadata-options.interface.js';
import type { IRxDBAdapter } from '../../rxdb-adapter.js';
import { getEntityMetadata, uuid } from '../../rxdb-utils.js';
import { RxDB } from '../../RxDB.js';
import { RxDBError } from '../../RxDBError.js';

describe('@Entity', () => {
  @Entity({
    name: 'Todo',
    properties: [
      { name: 'title', type: PropertyType.string },
      { name: 'completed', type: PropertyType.boolean, default: false }
    ]
  })
  class Todo extends EntityBase {}

  beforeAll(async () => {
    const rxdb = new RxDB({
      dbName: 'Todo',
      entities: [Todo],
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
    const meta = getEntityMetadata(Todo);
    expect(meta).toMatchInlineSnapshot(`
      {
        "computedProperties": [],
        "displayName": "Todo",
        "extends": [
          "EntityBase",
        ],
        "foreignKeys": [],
        "indexes": [],
        "name": "Todo",
        "namespace": "public",
        "properties": [
          {
            "columnName": "title",
            "name": "title",
            "type": "string",
          },
          {
            "columnName": "completed",
            "default": false,
            "name": "completed",
            "type": "boolean",
          },
        ],
        "relations": [],
        "repository": "Repository",
        "tableName": "Todo",
      }
    `);
  });

  it('通过实例获取 metadata 正确', async () => {
    const todo = new Todo({ id: uuid(), title: 'title' });
    const meta = getEntityMetadata(todo);
    expect(meta).toMatchInlineSnapshot(`
      {
        "computedProperties": [],
        "displayName": "Todo",
        "extends": [
          "EntityBase",
        ],
        "foreignKeys": [],
        "indexes": [],
        "name": "Todo",
        "namespace": "public",
        "properties": [
          {
            "columnName": "title",
            "name": "title",
            "type": "string",
          },
          {
            "columnName": "completed",
            "default": false,
            "name": "completed",
            "type": "boolean",
          },
        ],
        "relations": [],
        "repository": "Repository",
        "tableName": "Todo",
      }
    `);
  });

  it('new Todo()', async () => {
    const todo = new Todo({ id: uuid(), title: 'title' });
    expect(todo).instanceOf(Todo);
  });

  it('创建未在 rxdb 中的实体会报错', async () => {
    @Entity({
      name: 'Todo2',
      properties: []
    })
    class Todo2 extends EntityBase {}

    expect(() => new Todo2()).toThrow(RxDBError);
    expect(() => new Todo2()).toThrow('need init rxdb');
  });
});
