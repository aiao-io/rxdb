import { firstValueFrom, NEVER, Observable, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ENTITY_STATIC_TYPES, EntityType } from '../../entity/entity.interface.js';
import { SyncType } from '../../entity/metadata-options.interface.js';
import type { FindByCursorOptions, FindOneOptions, FindOptions } from '../../repository/query-options.interface.js';
import type { Rule, RuleGroup } from '../../repository/query.interface.js';
import type { QueryOptions } from '../../repository/QueryManager.interface.js';
import { Repository } from '../../repository/Repository.js';
import { deterministicStringify, getEntityStatus } from '../../rxdb-utils.js';
import type { RxDB } from '../../RxDB.js';
import { METADATA, STATUS } from '../../rxdb.private.js';
import { RxDBError } from '../../RxDBError.js';

class TestEntity {
  static [ENTITY_STATIC_TYPES] = { idType: '' as string };
  id!: string;
  createdAt!: Date;
  updatedAt!: Date;
  value?: number;
}

type TestEntityCtor = typeof TestEntity;

Object.assign(TestEntity, {
  [METADATA]: {
    name: 'TestEntity',
    namespace: 'public',
    sync: {
      type: SyncType.None,
      local: { adapter: 'local' }
    }
  }
});

class StubQueryManager<T extends EntityType> {
  lastQuery?: QueryOptions<T>;

  createTask<RT>(taskOptions: { options: QueryOptions<T>; runner: () => Observable<RT> }) {
    this.lastQuery = taskOptions.options;
    const result$ = taskOptions.runner();
    return { result$ } as { result$: Observable<RT> };
  }
}

class TestRepository extends Repository<TestEntityCtor> {
  constructor(rxdb: RxDB, local$: Observable<LocalRepo>, queryManager: StubQueryManager<TestEntityCtor>) {
    super(rxdb, TestEntity);
    Object.assign(this, { local$, queryManager });
  }
}

type LocalRepo = {
  find: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
};

type Setup = {
  repository: TestRepository;
  localRepo: LocalRepo;
  queryManager: StubQueryManager<TestEntityCtor>;
  rxdb: RxDB;
};

const createEntity = (id: string, extra: Partial<TestEntity> = {}): TestEntity => {
  const entity = new TestEntity();
  entity.id = id;
  entity.createdAt = extra.createdAt || new Date('2024-01-01T00:00:00Z');
  entity.updatedAt = extra.updatedAt || new Date('2024-01-01T00:00:00Z');
  entity.value = extra.value;
  Object.assign(entity, { [STATUS]: { local: false } });
  return entity;
};

const setupRepository = (): Setup => {
  const localRepo: LocalRepo = {
    find: vi.fn(),
    count: vi.fn(),
    create: vi.fn(async (entity: TestEntity) => entity),
    update: vi.fn(async (entity: TestEntity, patch: Partial<TestEntity>) => Object.assign(entity, patch)),
    remove: vi.fn(async (entity: TestEntity) => entity)
  } as LocalRepo;

  const localAdapter = {
    name: 'local',
    connect: vi.fn().mockResolvedValue(null),
    disconnect: vi.fn().mockResolvedValue(undefined),
    version: vi.fn().mockResolvedValue('1'),
    getRepository: vi.fn(() => localRepo),
    createTables: vi.fn().mockResolvedValue(true),
    saveMany: vi.fn(),
    removeMany: vi.fn(),
    isTableExisted: vi.fn().mockResolvedValue(true),
    transaction: vi.fn(),
    createBranch: vi.fn(),
    switchBranch: vi.fn(),
    restoreEntity: vi.fn()
  };

  const rxdb = {
    localAdapter$: of(localAdapter),
    remoteAdapter$: NEVER,
    options: {
      sync: {
        type: SyncType.None,
        local: { adapter: 'local' }
      }
    },
    getAdapter: vi.fn(async (adapterName: string) => {
      if (adapterName !== 'local') throw new Error('Unknown adapter');
      return localAdapter;
    }),
    addEventListener: vi.fn(),
    schemaManager: {
      getEntityType: vi.fn(() => TestEntity)
    },
    entityManager: {
      createEntityRef: vi.fn((_entityType: EntityType, entity: TestEntity) => entity)
    }
  } as unknown as RxDB;

  const queryManager = new StubQueryManager<TestEntityCtor>();
  const repository = new TestRepository(rxdb, of(localRepo), queryManager);

  return { repository, localRepo, queryManager, rxdb };
};

const baseWhere = (): RuleGroup<TestEntity> => ({ combinator: 'and', rules: [] });

describe('Repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('findByCursor 在游标后查询时合并游标规则', async () => {
    const { repository, localRepo } = setupRepository();
    const cursorEntity = createEntity('entity-2', { createdAt: new Date('2024-02-01T00:00:00Z') });
    localRepo.find.mockResolvedValue([]);

    const numericRule: Rule<TestEntity> = { field: 'value', operator: '>=', value: 0 };
    const where: RuleGroup<TestEntity> = { combinator: 'and', rules: [numericRule] };
    const options = {
      where,
      orderBy: [
        { field: 'createdAt', sort: 'asc' },
        { field: 'id', sort: 'asc' }
      ],
      after: cursorEntity
    } as FindByCursorOptions<TestEntityCtor>;

    await firstValueFrom(repository.findByCursor(options));

    expect(localRepo.find).toHaveBeenCalledTimes(1);
    const calledOptions = localRepo.find.mock.calls[0][0];
    // 归一化只能作用于本地副本。原实现是 `options.limit = options.limit || 100`，把默认值
    // 写回调用方对象 —— 调用方随后靠 `result.length >= (options.limit ?? DEFAULT)` 判断
    // 「是否还有下一页」（`rxdb-react/src/useInfiniteScroll.ts:120`），读到的却是自己从未
    // 设置过的值。这里原来断言 `options.limit === 100`，等于把「篡改入参」写成了预期行为。
    expect(options.limit).toBeUndefined();
    expect(calledOptions.limit).toBe(100);
    expect(calledOptions.where.rules).toHaveLength(2);
    const cursorGroup = calledOptions.where.rules[1];
    // 多字段游标查询使用 OR 条件: (createdAt > val) OR (createdAt = val AND id > val)
    expect(cursorGroup).toEqual({
      combinator: 'or',
      rules: [
        {
          combinator: 'and',
          rules: [{ field: 'createdAt', operator: '>', value: cursorEntity.createdAt }]
        },
        {
          combinator: 'and',
          rules: [
            { field: 'createdAt', operator: '=', value: cursorEntity.createdAt },
            { field: 'id', operator: '>', value: cursorEntity.id }
          ]
        }
      ]
    });
  });

  it('findByCursor 在游标前查询且组合器为 or 时包装原始 where', async () => {
    const { repository, localRepo } = setupRepository();
    const numericRule: Rule<TestEntity> = { field: 'value', operator: '>=', value: 10 };
    const where: RuleGroup<TestEntity> = {
      combinator: 'or',
      rules: [numericRule]
    };
    const cursorEntity = createEntity('entity-9', { createdAt: new Date('2024-05-01T00:00:00Z') });
    localRepo.find.mockResolvedValue([]);

    await firstValueFrom(
      repository.findByCursor({
        where,
        orderBy: [
          { field: 'createdAt', sort: 'desc' },
          { field: 'id', sort: 'desc' }
        ],
        before: cursorEntity
      } as FindByCursorOptions<TestEntityCtor>)
    );

    const calledOptions = localRepo.find.mock.calls[0][0];
    expect(calledOptions.where.combinator).toBe('and');
    expect(calledOptions.where.rules[0]).toEqual(where);
    const cursorGroup = calledOptions.where.rules[1];
    // 多字段游标查询使用 OR 条件: (createdAt > val) OR (createdAt = val AND id > val)
    expect(cursorGroup).toEqual({
      combinator: 'or',
      rules: [
        {
          combinator: 'and',
          rules: [{ field: 'createdAt', operator: '>', value: cursorEntity.createdAt }]
        },
        {
          combinator: 'and',
          rules: [
            { field: 'createdAt', operator: '=', value: cursorEntity.createdAt },
            { field: 'id', operator: '>', value: cursorEntity.id }
          ]
        }
      ]
    });
  });

  it('findByCursor 在缺少 orderBy 时抛出错误', () => {
    const { repository } = setupRepository();
    const where = baseWhere();
    expect(() =>
      repository.findByCursor({
        where,
        orderBy: []
      } as unknown as FindByCursorOptions<TestEntityCtor>)
    ).toThrow(RxDBError);
  });

  it('findByCursor 在 orderBy 未以 id 结尾时抛出错误', () => {
    const { repository } = setupRepository();
    const where = baseWhere();
    expect(() =>
      repository.findByCursor({
        where,
        orderBy: [{ field: 'createdAt', sort: 'asc' }]
      } as unknown as FindByCursorOptions<TestEntityCtor>)
    ).toThrow('orderBy must end with id field for cursor-based pagination');
  });

  it('findByCursor 在同时提供 before 和 after 时抛出错误', () => {
    const { repository } = setupRepository();
    const cursor = createEntity('entity-1');
    const where = baseWhere();
    expect(() =>
      repository.findByCursor({
        where,
        orderBy: [
          { field: 'createdAt', sort: 'asc' },
          { field: 'id', sort: 'asc' }
        ],
        before: cursor,
        after: cursor
      } as unknown as FindByCursorOptions<TestEntityCtor>)
    ).toThrow('before and after cannot be used together in cursor-based pagination');
  });

  it('findByCursor 首页（无游标）同样应用默认 limit', async () => {
    const { repository, localRepo } = setupRepository();
    localRepo.find.mockResolvedValue([]);

    await firstValueFrom(
      repository.findByCursor({
        where: baseWhere(),
        orderBy: [
          { field: 'createdAt', sort: 'asc' },
          { field: 'id', sort: 'asc' }
        ]
      } as FindByCursorOptions<TestEntityCtor>)
    );

    // limit 归一化原本写在 `_generate_cursor_rule_group` 里、且位于
    // `if (!cursor) return null` **之后**：首页根本走不到那一行，于是不带 limit 落到适配器 ——
    // 无限滚动的第一屏是一次全表读，表越大越慢，且与后续每页 100 条的行为自相矛盾
    expect(localRepo.find.mock.calls[0][0].limit).toBe(100);
  });

  it('findByCursor 保留调用方显式传入的 limit', async () => {
    const { repository, localRepo } = setupRepository();
    localRepo.find.mockResolvedValue([]);

    await firstValueFrom(
      repository.findByCursor({
        where: baseWhere(),
        orderBy: [
          { field: 'createdAt', sort: 'asc' },
          { field: 'id', sort: 'asc' }
        ],
        limit: 20
      } as FindByCursorOptions<TestEntityCtor>)
    );

    expect(localRepo.find.mock.calls[0][0].limit).toBe(20);
  });

  // RXD-016：`limit || 100` 把合法的 0 当成"没传"。`limit: 0` 的语义是"返回空集"，
  // 适配器层已明确支持（sqlite-core 的 `limit: 0 应生成 LIMIT 0` 用例），
  // React 绑定层也保留 0（useInfiniteScroll 的 `keeps zero as an explicit page limit`）——
  // 只有核心 Repository 在中间把它改写成 100，三层语义不一致。
  it('findByCursor 保留显式的 limit: 0，不当成"没传"', async () => {
    const { repository, localRepo } = setupRepository();
    localRepo.find.mockResolvedValue([]);

    await firstValueFrom(
      repository.findByCursor({
        where: baseWhere(),
        orderBy: [
          { field: 'createdAt', sort: 'asc' },
          { field: 'id', sort: 'asc' }
        ],
        limit: 0
      } as FindByCursorOptions<TestEntityCtor>)
    );

    expect(localRepo.find.mock.calls[0][0].limit).toBe(0);
  });

  // RAN-003：`limit: 0` 是合法的「返回空集」，但非负安全整数以外的值一直没有契约 ——
  // 负数在 SQLite 里是 `LIMIT -1`（不限），于是「限制读取」被静默翻译成全表读取；
  // 小数 / NaN / Infinity 各适配器行为各异。三个框架绑定层都只做 `?? 100`，
  // 唯一能一次覆盖所有调用方的位置是核心公开入口。
  describe.each([
    ['负数', -1],
    ['小数', 1.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['超出安全整数', Number.MAX_SAFE_INTEGER + 1]
  ])('limit 为%s时快速失败', (_label, limit) => {
    it('findByCursor 抛 RxDBError 且不下发适配器', () => {
      const { repository, localRepo } = setupRepository();
      localRepo.find.mockResolvedValue([]);

      expect(() =>
        repository.findByCursor({
          where: baseWhere(),
          orderBy: [
            { field: 'createdAt', sort: 'asc' },
            { field: 'id', sort: 'asc' }
          ],
          limit
        } as FindByCursorOptions<TestEntityCtor>)
      ).toThrow(RxDBError);
      expect(localRepo.find).not.toHaveBeenCalled();
    });

    it('find 抛 RxDBError 且不下发适配器', () => {
      const { repository, localRepo } = setupRepository();
      localRepo.find.mockResolvedValue([]);

      expect(() => repository.find({ where: baseWhere(), limit } as FindOptions<TestEntityCtor>)).toThrow(RxDBError);
      expect(localRepo.find).not.toHaveBeenCalled();
    });
  });

  it('find 在 offset 非法时同样快速失败', () => {
    const { repository, localRepo } = setupRepository();
    localRepo.find.mockResolvedValue([]);

    expect(() => repository.find({ where: baseWhere(), offset: -1 } as FindOptions<TestEntityCtor>)).toThrow(RxDBError);
    expect(localRepo.find).not.toHaveBeenCalled();
  });

  it('limit 报错信息点名字段与实际取值', () => {
    const { repository } = setupRepository();

    expect(() => repository.find({ where: baseWhere(), limit: -1 } as FindOptions<TestEntityCtor>)).toThrow(
      'limit must be a non-negative safe integer, received: -1'
    );
  });

  it('limit 缺省与显式非负安全整数照常放行', async () => {
    const { repository, localRepo } = setupRepository();
    localRepo.find.mockResolvedValue([]);

    await firstValueFrom(repository.find({ where: baseWhere(), limit: 0, offset: 0 } as FindOptions<TestEntityCtor>));
    await firstValueFrom(repository.find({ where: baseWhere() } as FindOptions<TestEntityCtor>));

    expect(localRepo.find).toHaveBeenCalledTimes(2);
  });

  it('findByCursor 反向翻页反转查询排序，并把结果还原成调用方的排序', async () => {
    const { repository, localRepo } = setupRepository();
    const cursor = createEntity('entity-5', { createdAt: new Date('2024-05-01T00:00:00Z') });
    // 适配器按反转后的 desc 返回：离游标最近的排在最前，limit 才截得到「紧挨游标之前」的那几条
    const near = createEntity('entity-4', { createdAt: new Date('2024-04-01T00:00:00Z') });
    const far = createEntity('entity-3', { createdAt: new Date('2024-03-01T00:00:00Z') });
    localRepo.find.mockResolvedValue([near, far]);

    const orderBy = [
      { field: 'createdAt', sort: 'asc' },
      { field: 'id', sort: 'asc' }
    ];
    const options = {
      where: baseWhere(),
      orderBy,
      before: cursor,
      limit: 2
    } as FindByCursorOptions<TestEntityCtor>;

    const result = await firstValueFrom(repository.findByCursor(options));

    // 原实现只翻转比较符（`<`）却保留 asc 排序，`limit` 于是从整个结果集的**开头**截取：
    // 返回的是最早的 2 条，而不是紧挨游标之前的 2 条 —— 向上翻页永远翻不动
    expect(localRepo.find.mock.calls[0][0].orderBy).toEqual([
      { field: 'createdAt', sort: 'desc' },
      { field: 'id', sort: 'desc' }
    ]);
    // 返回给调用方前必须还原成 asc：增量合并（`merge_create.ts:87` 的 findByCursor 分支）
    // 一律先按 `options.orderBy` 排序再按游标切片，收到 desc 数组会算错窗口
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(far);
    expect(result[1]).toBe(near);
    // 反转不能改到调用方的数组：`options.orderBy` 同时是缓存键与增量合并的排序依据
    expect(options.orderBy).toBe(orderBy);
    expect(orderBy).toEqual([
      { field: 'createdAt', sort: 'asc' },
      { field: 'id', sort: 'asc' }
    ]);
  });

  it('findByCursor 正向翻页不动排序、不反序结果', async () => {
    const { repository, localRepo } = setupRepository();
    const cursor = createEntity('entity-1', { createdAt: new Date('2024-01-01T00:00:00Z') });
    const first = createEntity('entity-2', { createdAt: new Date('2024-02-01T00:00:00Z') });
    const second = createEntity('entity-3', { createdAt: new Date('2024-03-01T00:00:00Z') });
    localRepo.find.mockResolvedValue([first, second]);

    const result = await firstValueFrom(
      repository.findByCursor({
        where: baseWhere(),
        orderBy: [
          { field: 'createdAt', sort: 'asc' },
          { field: 'id', sort: 'asc' }
        ],
        after: cursor
      } as FindByCursorOptions<TestEntityCtor>)
    );

    expect(localRepo.find.mock.calls[0][0].orderBy).toEqual([
      { field: 'createdAt', sort: 'asc' },
      { field: 'id', sort: 'asc' }
    ]);
    expect(result[0]).toBe(first);
    expect(result[1]).toBe(second);
  });

  it('get 在未找到实体时抛出错误', async () => {
    const { repository, localRepo } = setupRepository();
    localRepo.find.mockResolvedValue([]);

    await expect(firstValueFrom(repository.get('missing-id'))).rejects.toBeInstanceOf(RxDBError);
  });

  it('findOneOrFail 在未找到实体时抛出包含 where 条件的错误信息', async () => {
    const { repository, localRepo } = setupRepository();
    localRepo.find.mockResolvedValue([]);
    const where = baseWhere();

    await expect(firstValueFrom(repository.findOneOrFail({ where }))).rejects.toThrow(/query/);
    await expect(firstValueFrom(repository.findOneOrFail({ where }))).rejects.not.toThrow('[object Object]');
  });

  it('get 返回实体并标记为本地', async () => {
    const { repository, localRepo } = setupRepository();
    const entity = createEntity('entity-1');
    localRepo.find.mockResolvedValue([entity]);

    const result = await firstValueFrom(repository.get('entity-1'));

    expect(result).toBe(entity);
    expect(getEntityStatus(entity).local).toBe(true);
  });

  it('findOne 在无匹配实体时返回 null', async () => {
    const { repository, localRepo } = setupRepository();
    localRepo.find.mockResolvedValue([]);
    const where = baseWhere();

    const result = await firstValueFrom(repository.findOne({ where } as FindOneOptions<TestEntityCtor>));

    expect(result).toBeNull();
  });

  it('findOne 返回实体并在匹配时缓存本地状态', async () => {
    const { repository, localRepo } = setupRepository();
    const entity = createEntity('entity-2');
    localRepo.find.mockResolvedValue([entity]);
    const where = baseWhere();

    const result = await firstValueFrom(repository.findOne({ where } as FindOneOptions<TestEntityCtor>));

    expect(result).toBe(entity);
    expect(getEntityStatus(entity).local).toBe(true);
  });

  it('find 标记所有实体为本地并遵守默认值', async () => {
    const { repository, localRepo } = setupRepository();
    const entityA = createEntity('entity-a');
    const entityB = createEntity('entity-b');
    localRepo.find.mockResolvedValue([entityA, entityB]);
    const where = baseWhere();

    const result = await firstValueFrom(repository.find({ where }));

    expect(result).toEqual([entityA, entityB]);
    expect(getEntityStatus(entityA).local).toBe(true);
    expect(getEntityStatus(entityB).local).toBe(true);
    const calledOptions = localRepo.find.mock.calls[0][0];
    expect(calledOptions).toEqual({ where, limit: 100, offset: 0 });
  });

  // RXD-016 残留：缓存键就是 `deterministicStringify(createTask 收到的 options)`
  // （`QueryManager.createTask:127`），而 limit/offset 的缺省值是在 `find` 内部的 runner 里
  // 才补上的。于是 `find({where})` 与 `find({where, limit: 100, offset: 0})` 下发适配器的
  // 参数逐字相同、是同一条查询，却生成两个 task —— 各自跑一遍 SQL、各自维护一份结果集、
  // 各自接一遍增量事件。`findByCursor` 早就是先归一化再建 task，`find` 没跟上。
  it('find 的缓存键用归一化后的 options：缺省与显式默认值必须是同一个 key', async () => {
    const { repository, localRepo, queryManager } = setupRepository();
    localRepo.find.mockResolvedValue([]);
    const where = baseWhere();

    await firstValueFrom(repository.find({ where }));
    const implicitKey = deterministicStringify(queryManager.lastQuery);

    await firstValueFrom(repository.find({ where, limit: 100, offset: 0 }));
    const explicitKey = deterministicStringify(queryManager.lastQuery);

    // 两次下发适配器的参数逐字相同，坐实「是同一条查询」
    expect(localRepo.find.mock.calls[1][0]).toEqual(localRepo.find.mock.calls[0][0]);
    expect(implicitKey).toBe(explicitKey);
  });

  // 归一化必须只作用于本地副本。`findByCursor` 上踩过一次：原实现把默认 limit 写回调用方对象，
  // 调用方靠 `options.limit` 判断「是否还有下一页」时读到自己从未设置过的值。
  it('find 的归一化不写回调用方的 options', async () => {
    const { repository, localRepo } = setupRepository();
    localRepo.find.mockResolvedValue([]);
    const options = { where: baseWhere() };

    await firstValueFrom(repository.find(options));

    expect(options).toEqual({ where: baseWhere() });
  });

  it('findAll 标记所有实体为本地', async () => {
    const { repository, localRepo } = setupRepository();
    const entity = createEntity('entity-all');
    localRepo.find.mockResolvedValue([entity]);
    const where = baseWhere();

    const result = await firstValueFrom(repository.findAll({ where }));

    expect(result).toEqual([entity]);
    expect(getEntityStatus(entity).local).toBe(true);
    const calledOptions = localRepo.find.mock.calls[0][0];
    expect(calledOptions).toEqual({ where });
  });

  it('count 委托给本地仓储', async () => {
    const { repository, localRepo } = setupRepository();
    localRepo.count.mockResolvedValue(42);
    const where = baseWhere();

    const total = await firstValueFrom(repository.count({ where }));

    expect(total).toBe(42);
    expect(localRepo.count).toHaveBeenCalledWith({ where });
  });

  it('create 持久化实体并更新本地标志', async () => {
    const { repository, localRepo } = setupRepository();
    const entity = createEntity('entity-create');

    const result = await repository.create(entity);

    expect(result).toBe(entity);
    expect(getEntityStatus(entity).local).toBe(true);
    expect(localRepo.create).toHaveBeenCalledWith(entity);
  });

  it('update 转发补丁并标记实体为本地', async () => {
    const { repository, localRepo } = setupRepository();
    const entity = createEntity('entity-update', { value: 1 });

    const result = await repository.update(entity, { value: 2 });

    expect(result.value).toBe(2);
    expect(getEntityStatus(entity).local).toBe(true);
    expect(localRepo.update).toHaveBeenCalledWith(entity, { value: 2 });
  });

  it('remove 委托给本地仓储', async () => {
    const { repository, localRepo } = setupRepository();
    const entity = createEntity('entity-remove');
    localRepo.remove.mockResolvedValue(entity);

    const result = await repository.remove(entity);

    expect(result).toBe(entity);
    expect(localRepo.remove).toHaveBeenCalledWith(entity);
  });
});
