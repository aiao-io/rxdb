/**
 * @fileoverview US-031 阶段 A — 批内按组追加的拆分与尾键读取。
 *
 * 1. 组键：分组取值按类型区分（`null` / `'1'` / `1` / `true` / `1n` / Date），同值归同组，组按首次出现的批内顺序处理；
 * 2. 分组外键指向本批新建的行时，该组在库里必然为空，不读尾键，锚点只取同组预留的显式键；
 * 3. 外键指向本批未新建的行、或指向别的实体类型时，照常读尾键；门面单行写入（不传判据）行为不变。
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import { ENTITY_STATIC_TYPES, type UUID } from '../../entity/entity.interface.js';
import { PropertyType } from '../../entity/metadata-options.interface.js';
import { RelationKind } from '../../entity/relation-types.interface.js';
import type { FindOptions } from '../../repository/query-options.interface.js';
import type { IRepository } from '../../repository/repository.interface.js';
import { uuid } from '../../rxdb-utils.js';
import type { RxDB } from '../../RxDB.js';
import { appendToGroupTails, type AppendRow } from '../../sortable/sortable.utils.js';
import { createTestDB, stubAdapterRepository, type MockLocalAdapter } from '../fixtures/test-db-setup.js';
import { memoryRepository, type MemoryRepository, type Sortable } from './fixtures/sortable-test-utils.js';

@Entity({
  name: 'AppendFolder',
  manualOrder: { groupBy: ['parentId'] },
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'sortOrder', type: PropertyType.string }
  ],
  relations: [
    {
      name: 'parent',
      columnName: 'parentId',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'AppendFolder',
      mappedProperty: 'children',
      nullable: true
    },
    { name: 'children', kind: RelationKind.ONE_TO_MANY, mappedEntity: 'AppendFolder', mappedProperty: 'parent' }
  ]
})
class AppendFolder extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  title!: string;
  sortOrder!: string;
  parentId!: string | null;
}

@Entity({ name: 'AppendList', properties: [{ name: 'title', type: PropertyType.string }] })
class AppendList extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  title!: string;
}

@Entity({
  name: 'AppendItem',
  manualOrder: { groupBy: ['listId'] },
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'sortOrder', type: PropertyType.string }
  ],
  relations: [
    {
      name: 'list',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'AppendList',
      mappedProperty: 'items',
      nullable: true
    }
  ]
})
class AppendItem extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  title!: string;
  sortOrder!: string;
  listId!: string | null;
}

type Row = Sortable & { parentId?: string | null; listId?: string | null };

interface Context {
  rxdb: RxDB;
  adapter: MockLocalAdapter;
  cleanup: () => Promise<void>;
}

describe('US-031 批内追加：同批新建父行的组不读尾键', () => {
  let ctx: Context;
  let repository: MemoryRepository<Row>;

  const stored = (EntityType: typeof AppendFolder | typeof AppendItem, values: Partial<Row>): Row =>
    ctx.rxdb.entityManager.createEntityRef(EntityType, { title: 'stored', ...values } as never, {
      local: true,
      modified: false
    }) as Row;

  const fresh = <T extends Row>(EntityType: new () => unknown, values: Partial<T>): T => {
    const entity = ctx.rxdb.entityManager.createEntityRef(
      EntityType as typeof AppendFolder,
      {
        id: uuid()
      } as never
    ) as T;
    Object.assign(entity, { title: 'fresh', ...values });
    return entity;
  };

  /** 每次 `find` 的 where 规则 */
  const findRules = () => repository.find.mock.calls.map(([options]) => (options as FindOptions).where);

  beforeEach(async () => {
    ctx = await createTestDB({ entities: [AppendFolder, AppendList, AppendItem] });
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('父节点与子节点同批新建：只为根组读一次尾键，子节点从首键起', async () => {
    const root = stored(AppendFolder, { id: uuid(), parentId: null, sortOrder: 'a3' });
    repository = memoryRepository<Row>([root]);
    stubAdapterRepository(ctx.adapter, repository);
    const parent = fresh<Row>(AppendFolder, { parentId: null });
    const children = [
      fresh<Row>(AppendFolder, { parentId: parent.id }),
      fresh<Row>(AppendFolder, { parentId: parent.id })
    ];
    await ctx.rxdb.entityManager.saveMany([parent, ...children] as never[]);
    expect(parent.sortOrder).toBe('a4');
    expect(children.map(child => child.sortOrder)).toEqual(['a0', 'a1']);
    expect(findRules()).toEqual([{ combinator: 'and', rules: [{ field: 'parentId', operator: 'null' }] }]);
  });

  it('同批新建父节点的组里有显式键：缺键行接在最大预留键之后', async () => {
    repository = memoryRepository<Row>([]);
    stubAdapterRepository(ctx.adapter, repository);
    const parent = fresh<Row>(AppendFolder, { parentId: null });
    const explicit = fresh<Row>(AppendFolder, { parentId: parent.id, sortOrder: 'a5' });
    const appended = fresh<Row>(AppendFolder, { parentId: parent.id });
    await ctx.rxdb.entityManager.saveMany([parent, appended, explicit] as never[]);
    expect(explicit.sortOrder).toBe('a5');
    expect(appended.sortOrder).toBe('a6');
    expect(repository.find).toHaveBeenCalledTimes(1);
  });

  it('外键指向本批未新建的既有父行：照常读该组尾键', async () => {
    const existing = stored(AppendFolder, { id: uuid(), parentId: null, sortOrder: 'a0' });
    const child = stored(AppendFolder, { id: uuid(), parentId: existing.id, sortOrder: 'a2' });
    repository = memoryRepository<Row>([existing, child]);
    stubAdapterRepository(ctx.adapter, repository);
    const appended = fresh<Row>(AppendFolder, { parentId: existing.id });
    await ctx.rxdb.entityManager.saveMany([appended] as never[]);
    expect(appended.sortOrder).toBe('a3');
    expect(repository.find).toHaveBeenCalledTimes(1);
  });

  it('外键指向别的实体类型：本批新建的列表让它的条目组不读尾键，同 id 的别类行不算数', async () => {
    const existingList = ctx.rxdb.entityManager.createEntityRef(AppendList, { id: uuid(), title: 'L0' } as never, {
      local: true,
      modified: false
    });
    const kept = stored(AppendItem, { id: uuid(), listId: existingList.id, sortOrder: 'a1' });
    repository = memoryRepository<Row>([kept]);
    stubAdapterRepository(ctx.adapter, repository);
    const list = fresh<Row>(AppendList, {});
    const folder = fresh<Row>(AppendFolder, { parentId: null });
    const intoNewList = fresh<Row>(AppendItem, { listId: list.id });
    const intoExistingList = fresh<Row>(AppendItem, { listId: existingList.id });
    const pointingAtFolder = fresh<Row>(AppendItem, { listId: folder.id });
    await ctx.rxdb.entityManager.saveMany([list, folder, intoNewList, intoExistingList, pointingAtFolder] as never[]);
    expect(intoNewList.sortOrder).toBe('a0');
    expect(intoExistingList.sortOrder).toBe('a2');
    expect(pointingAtFolder.sortOrder).toBe('a0');
    const readGroups = findRules().map(where => (where as { rules: { value?: unknown }[] }).rules[0].value);
    expect(readGroups).toEqual([undefined, existingList.id, folder.id]);
  });
});

describe('US-031 批内追加：组键按类型区分', () => {
  const metadata: Parameters<typeof appendToGroupTails>[1] = { name: 'Grouped', manualOrder: { groupBy: ['g'] } };

  it('null / "1" / 1 / true / 1n / Date 各成一组，同值同组，组按首次出现顺序读尾键', async () => {
    const find = async () => [];
    const calls: unknown[] = [];
    const repository = {
      find: async (options: FindOptions) => {
        calls.push((options.where as { rules: { value?: unknown; operator: string }[] }).rules[0]);
        return find();
      }
    } as unknown as IRepository<never>;
    const values: unknown[] = [null, '1', 1, true, 1n, new Date(0), '1', new Date(0)];
    const rows: AppendRow[] = values.map((g, index) => ({ row: { id: index, g } as never, persisted: false }));
    await appendToGroupTails(repository, metadata, rows, []);
    expect(calls).toHaveLength(6);
    expect(rows.map(({ row }) => row.sortOrder)).toEqual(['a0', 'a0', 'a0', 'a0', 'a0', 'a0', 'a1', 'a1']);
  });
});
