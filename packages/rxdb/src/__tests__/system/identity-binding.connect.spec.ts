/**
 * @fileoverview 身份绑定守卫在真实 `connect()` 路径上的行为（US-035）。
 *
 * @remarks
 * 纯函数面见 `identity-binding.spec.ts`。这里只回答「守卫确实挂在引导里、排在一切写入之前」：
 *
 * - 内存替身适配器**会持久化**：`createTables` 写进去的迁移行、`create` 追加的迁移行，下一次打开都读得到。
 *   这样「关闭后再次打开同一个库」是真的走了一遍既有库的引导，而不是手工喂一份行名；
 * - 守卫拒绝时，建表、写迁移行一次都不能发生（本地数据不动）；
 * - 没声明身份时与没有这个功能之前逐字一致，不读也不写任何身份行。
 */

import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import type { EntityType } from '../../entity/entity.interface.js';
import { PropertyType, SyncType } from '../../entity/metadata-options.interface.js';
import type { IRepository } from '../../repository/repository.interface.js';
import type { IRxDBAdapter } from '../../rxdb-adapter.js';
import { RxDB } from '../../RxDB.js';
import { RxDBError } from '../../RxDBError.js';
import {
  getRxDBIdentityKey,
  identityWatermarkName,
  RXDB_ANONYMOUS_SUBJECT,
  RXDB_IDENTITY_CLAIM_NAME,
  RXDB_IDENTITY_WATERMARK_PREFIX,
  RxDBIdentityMismatchError,
  type RxDBIdentity
} from '../../system/identity-binding.js';
import { RxDBMigration } from '../../system/migration.js';

/** 上一个身份留在库里的业务行：被拒之后绝不能经任何仓储读出来 */
const LEFTOVER_ROW = { id: 'row-left-by-the-previous-identity', title: 'secret' };

@Entity({ name: 'IdentityProbe', properties: [{ name: 'title', type: PropertyType.string }] })
class IdentityProbe extends EntityBase {
  title!: string;
}

const SCOPE = 'https://project-a.supabase.co';
const USER_A = '00000000-0000-4000-8000-0000000000a1';
const USER_B = '00000000-0000-4000-8000-0000000000b2';

const identityOf = (subject: string): RxDBIdentity => ({ scope: SCOPE, subject });
const nameOf = (subject: string): string => identityWatermarkName(getRxDBIdentityKey(identityOf(subject)));

/**
 * 会持久化迁移表的本地适配器替身。
 *
 * @remarks
 * 同一个实例在多次 `connect()` 之间共用 {@link MemoryLocalAdapter.names}，就是「同一个物理库」。
 * 其余仓库一律空：本文件只关心 `rxdb_migration`。
 */
class MemoryLocalAdapter implements IRxDBAdapter {
  readonly name = 'identity-binding-memory';
  readonly names: string[] = [];
  /** 迁移表是否已经建过：`isTableExisted(RxDBMigration)` 的答案 */
  tablesCreated = false;
  createTablesCalls = 0;
  /** 探针实体的仓储被读了几次：被拒之后仓储一次都不该碰到适配器 */
  probeFinds = 0;
  /** `create()` 追加进迁移表的行名（不含 `createTables` 随建表写下的） */
  readonly appended: string[] = [];
  /**
   * 写某个迁移行之前调用：模拟另一个标签页在本实例读完之后抢先提交了别的行。
   * 迁移表的行名有唯一索引，重名的写入按 `23505` 失败，与真实适配器一致。
   */
  beforeCreate: ((name: string) => void) | undefined;

  constructor(initialNames: readonly string[] = []) {
    if (initialNames.length > 0) {
      this.names.push(...initialNames);
      this.tablesCreated = true;
    }
  }

  migrateSystemSchema(): Promise<void> {
    return Promise.resolve();
  }

  completeBootstrap(): void {
    // no-op
  }

  async connect(): Promise<IRxDBAdapter> {
    return this;
  }

  async disconnect(): Promise<void> {
    // no-op
  }

  async version(): Promise<string> {
    return '1.0.0';
  }

  getRepository<T extends EntityType, RT extends IRepository<T> = IRepository<T>>(EntityType: T): RT {
    return this.#repositoryFor<T>(EntityType) as RT;
  }

  async saveMany<T extends EntityType>(entities: InstanceType<T>[]): Promise<InstanceType<T>[]> {
    return entities;
  }

  async removeMany<T extends EntityType>(entities: InstanceType<T>[]): Promise<InstanceType<T>[]> {
    return entities;
  }

  async mutations<T extends EntityType>(): Promise<InstanceType<T>[]> {
    return [];
  }

  async isTableExisted(): Promise<boolean> {
    return this.tablesCreated;
  }

  async createTables(_types: EntityType[], entities: InstanceType<EntityType>[] = []): Promise<boolean> {
    this.createTablesCalls += 1;
    this.tablesCreated = true;
    for (const entity of entities) {
      if (entity instanceof RxDBMigration) this.names.push(entity.name);
    }
    return true;
  }

  async transaction<T extends () => Promise<unknown>>(fun: T): Promise<Awaited<ReturnType<T>>> {
    return (await fun()) as Awaited<ReturnType<T>>;
  }

  async bootstrapTransaction<T extends (executor: unknown) => Promise<unknown>>(
    fun: T
  ): Promise<Awaited<ReturnType<T>>> {
    const executor = {
      id: 'identity-binding-bootstrap',
      state: 'active',
      query: async () => ({ rowsAffected: 0, rows: [], columns: [] }),
      mutations: async () => [],
      getRepository: (EntityType: unknown) => this.#repositoryFor(EntityType),
      saveMany: async (entities: InstanceType<EntityType>[]) => entities,
      removeMany: async (entities: InstanceType<EntityType>[]) => entities,
      mergeChanges: async () => undefined,
      run: (inner: (nested: unknown) => Promise<unknown>) => inner(executor)
    };
    return (await fun(executor)) as Awaited<ReturnType<T>>;
  }

  #repositoryFor<T extends EntityType>(EntityType: unknown): IRepository<T> {
    if (EntityType === RxDBMigration) {
      return {
        find: async () => this.names.map(name => ({ name })) as InstanceType<T>[],
        count: async () => this.names.length,
        create: async entity => {
          const name = (entity as unknown as RxDBMigration).name;
          this.beforeCreate?.(name);
          if (this.names.includes(name)) {
            throw Object.assign(new Error(`UNIQUE constraint failed: rxdb_migration.name (${name})`), {
              code: '23505'
            });
          }
          this.appended.push(name);
          this.names.push(name);
          return entity;
        },
        update: async entity => entity,
        remove: async entity => entity
      };
    }
    return {
      find: async () => {
        if (EntityType !== IdentityProbe) return [];
        this.probeFinds += 1;
        return [LEFTOVER_ROW as InstanceType<T>];
      },
      count: async () => 0,
      create: async entity => entity,
      update: async entity => entity,
      remove: async entity => entity
    };
  }
}

const databases = new Set<RxDB>();
let databaseIndex = 0;

const open = (adapter: MemoryLocalAdapter, identity?: RxDBIdentity, entities: EntityType[] = []): RxDB => {
  databaseIndex += 1;
  const database = new RxDB({
    dbName: `identity-binding-${databaseIndex}`,
    entities,
    sync: { local: { adapter: adapter.name }, type: SyncType.None },
    ...(identity ? { identity } : {})
  });
  database.adapter(adapter.name, () => adapter);
  databases.add(database);
  return database;
};

const identityRows = (names: readonly string[]): string[] =>
  names.filter(name => name.startsWith(RXDB_IDENTITY_WATERMARK_PREFIX));

afterEach(async () => {
  await Promise.all(Array.from(databases, database => database.disconnectAll()));
  databases.clear();
});

describe('新库：建库时记下身份', () => {
  it('绑定行随建表同一批写入，而不是建好之后另写', async () => {
    const adapter = new MemoryLocalAdapter();
    await open(adapter, identityOf(USER_A)).connect(adapter.name);

    expect(adapter.createTablesCalls).toBe(1);
    expect(identityRows(adapter.names)).toEqual([nameOf(USER_A)]);
    // 随建表写下的行不经 create()：绑定行没有「建好之后另写」的那一步
    expect(adapter.appended).toEqual([]);
  });

  it('不声明身份：不写任何身份行', async () => {
    const adapter = new MemoryLocalAdapter();
    await open(adapter).connect(adapter.name);

    expect(identityRows(adapter.names)).toEqual([]);
  });
});

describe('既有库：同一个身份再次打开', () => {
  it('关闭后以同一个身份再打开：正常连接，不再写绑定行', async () => {
    const adapter = new MemoryLocalAdapter();
    const first = open(adapter, identityOf(USER_A));
    await first.connect(adapter.name);
    await first.disconnectAll();
    const rowsAfterFirstOpen = [...adapter.names];

    await expect(open(adapter, identityOf(USER_A)).connect(adapter.name)).resolves.toBe(adapter);

    expect(adapter.names).toEqual(rowsAfterFirstOpen);
    expect(identityRows(adapter.names)).toHaveLength(1);
  });
});

describe('既有库：换了身份', () => {
  it('库已绑定 A，以 B 打开：拒绝连接，建表与写迁移行一次都不发生', async () => {
    const adapter = new MemoryLocalAdapter(['0001-init', nameOf(USER_A)]);
    const database = open(adapter, identityOf(USER_B));

    const error = await database.connect(adapter.name).catch((rejection: unknown) => rejection);

    expect(error).toBeInstanceOf(RxDBIdentityMismatchError);
    expect(error).toMatchObject({
      source: 'database',
      clientKey: getRxDBIdentityKey(identityOf(USER_B)),
      foundKeys: [getRxDBIdentityKey(identityOf(USER_A))]
    });
    expect(adapter.createTablesCalls).toBe(0);
    expect(adapter.appended).toEqual([]);
    expect(adapter.names).toEqual(['0001-init', nameOf(USER_A)]);
    expect(database.localAdapterIfConnected).toBeUndefined();
  });

  // AC#4 的后半句：连接被拒不只是抛了个错，仓储也读不到上一个身份留下的行。
  it('被拒之后查询任意仓储：读不到上一个身份留下的行', async () => {
    const adapter = new MemoryLocalAdapter([nameOf(USER_A)]);
    const database = open(adapter, identityOf(USER_B), [IdentityProbe]);
    await expect(database.connect(adapter.name)).rejects.toBeInstanceOf(RxDBIdentityMismatchError);

    const find = firstValueFrom(
      database.entityManager.getRepository(IdentityProbe).find({ where: { combinator: 'and', rules: [] } })
    ).then(
      rows => ({ rows }),
      (error: unknown) => ({ error })
    );
    const outcome = await Promise.race([
      find,
      new Promise<'still-waiting'>(resolve => setTimeout(() => resolve('still-waiting'), 100))
    ]);

    expect(outcome).not.toHaveProperty('rows');
    expect(adapter.probeFinds).toBe(0);
  });

  it('对照：同一个身份打开，同一个仓储的读会到达适配器（上一条不是读不到而已）', async () => {
    const adapter = new MemoryLocalAdapter([nameOf(USER_A)]);
    const database = open(adapter, identityOf(USER_A), [IdentityProbe]);
    await database.connect(adapter.name);

    // 替身返回的是普通对象，仓储装不成实体；这里只关心读有没有到达适配器
    await firstValueFrom(
      database.entityManager.getRepository(IdentityProbe).find({ where: { combinator: 'and', rules: [] } })
    ).catch(() => undefined);

    expect(adapter.probeFinds).toBeGreaterThan(0);
  });

  it('被拒之后不会因为重试而放行：再连一次仍然拒绝', async () => {
    const adapter = new MemoryLocalAdapter([nameOf(USER_A)]);
    const database = open(adapter, identityOf(USER_B));

    await expect(database.connect(adapter.name)).rejects.toBeInstanceOf(RxDBIdentityMismatchError);
    await expect(database.connect(adapter.name)).rejects.toBeInstanceOf(RxDBIdentityMismatchError);
    expect(adapter.appended).toEqual([]);
  });

  it('库已绑定 anon，登录后仍用这个库：同样拒绝', async () => {
    const adapter = new MemoryLocalAdapter([nameOf(RXDB_ANONYMOUS_SUBJECT)]);

    await expect(open(adapter, identityOf(USER_A)).connect(adapter.name)).rejects.toBeInstanceOf(
      RxDBIdentityMismatchError
    );
    expect(adapter.appended).toEqual([]);
  });

  it('同一个用户在另一个后端：也是另一个身份，拒绝', async () => {
    const adapter = new MemoryLocalAdapter([nameOf(USER_A)]);
    const otherBackend: RxDBIdentity = { scope: 'https://project-b.supabase.co', subject: USER_A };

    await expect(open(adapter, otherBackend).connect(adapter.name)).rejects.toBeInstanceOf(RxDBIdentityMismatchError);
  });
});

// 评审 #7：竞争行在、绑定行不在，正常路径写不出（两行同一个事务写下），只有手工改库才出现。
// 库属于谁说不清，与身份对不上同样处理：连接失败，读路径也撤回
describe('既有库：身份认领残缺', () => {
  it('竞争行在、绑定行不在：拒绝连接，不补写绑定，仓储读不到库里的行', async () => {
    const adapter = new MemoryLocalAdapter(['0001-init', RXDB_IDENTITY_CLAIM_NAME]);
    const database = open(adapter, identityOf(USER_B), [IdentityProbe]);

    await expect(database.connect(adapter.name)).rejects.toThrow('identity claim is incomplete');

    const find = firstValueFrom(
      database.entityManager.getRepository(IdentityProbe).find({ where: { combinator: 'and', rules: [] } })
    ).then(
      rows => ({ rows }),
      (error: unknown) => ({ error })
    );
    const outcome = await Promise.race([
      find,
      new Promise<'still-waiting'>(resolve => setTimeout(() => resolve('still-waiting'), 100))
    ]);

    expect(outcome).not.toHaveProperty('rows');
    expect(adapter.probeFinds).toBe(0);
    expect(adapter.appended).toEqual([]);
    expect(database.localAdapterIfConnected).toBeUndefined();
  });
});

describe('本功能之前建的库：没有绑定', () => {
  it('第一次带身份打开：就地绑定，之后以别的身份打开被拒', async () => {
    const adapter = new MemoryLocalAdapter(['0001-init']);

    await open(adapter, identityOf(USER_A)).connect(adapter.name);
    expect(identityRows(adapter.appended)).toEqual([nameOf(USER_A)]);

    await expect(open(adapter, identityOf(USER_B)).connect(adapter.name)).rejects.toBeInstanceOf(
      RxDBIdentityMismatchError
    );
    expect(identityRows(adapter.names)).toEqual([nameOf(USER_A)]);
  });
});

describe('两个身份同时第一次打开本功能之前建的库', () => {
  // 另一个标签页以 A 的身份打开同一个库，在本实例（B）读完「还没绑定」之后、写下绑定之前抢先提交。
  // 两边竞争同一个固定名的竞争行：B 的写入撞唯一键，重读之后看到 A 的绑定，拒绝连接
  it('后到的一方撞上竞争行的唯一键：重读后拒绝连接，库里只留先到的那一个身份', async () => {
    const adapter = new MemoryLocalAdapter(['0001-init']);
    let raced = false;
    adapter.beforeCreate = name => {
      if (raced || name !== RXDB_IDENTITY_CLAIM_NAME) return;
      raced = true;
      adapter.names.push(RXDB_IDENTITY_CLAIM_NAME, nameOf(USER_A));
    };

    await expect(open(adapter, identityOf(USER_B)).connect(adapter.name)).rejects.toBeInstanceOf(
      RxDBIdentityMismatchError
    );

    expect(raced).toBe(true);
    expect(identityRows(adapter.names)).toEqual([nameOf(USER_A)]);
    // B 自己一条身份行、一条竞争行都没写下
    expect(
      adapter.appended.filter(name => name === RXDB_IDENTITY_CLAIM_NAME || identityRows([name]).length > 0)
    ).toEqual([]);
    await expect(open(adapter, identityOf(USER_A)).connect(adapter.name)).resolves.toBe(adapter);
  });

  it('同一个身份的两个标签页同时绑定：后到的一方撞唯一键后重读，看到的正是自己的绑定，照常连接', async () => {
    const adapter = new MemoryLocalAdapter(['0001-init']);
    let raced = false;
    adapter.beforeCreate = name => {
      if (raced || name !== RXDB_IDENTITY_CLAIM_NAME) return;
      raced = true;
      adapter.names.push(RXDB_IDENTITY_CLAIM_NAME, nameOf(USER_A));
    };

    await expect(open(adapter, identityOf(USER_A)).connect(adapter.name)).resolves.toBe(adapter);

    expect(raced).toBe(true);
    expect(identityRows(adapter.names)).toEqual([nameOf(USER_A)]);
  });
});

// RV-01a2118227d9715ab33e8ef2556bb4b6：没声明身份时，同步插件按第一次同步的会话绑定本地库。
// 只写插件自己那一行的话，应用之后改为声明身份打开同一个库，核心看不到绑定，会把装着上一个身份数据的库
// 就地绑给打开它的那个身份：原主人从此打不开，新身份读得到原主人的数据
describe('没声明身份时按会话写下的绑定（bindIdentity）', () => {
  const bindAs = (database: RxDB, adapter: MemoryLocalAdapter, subject: string) =>
    adapter.bootstrapTransaction(executor => database.bindIdentity(executor as never, identityOf(subject)));

  it('之后以别的身份声明打开被拒，以这个身份声明打开照常连接', async () => {
    const adapter = new MemoryLocalAdapter();
    const undeclared = open(adapter);
    await undeclared.connect(adapter.name);
    await bindAs(undeclared, adapter, USER_A);
    await undeclared.disconnectAll();

    expect(identityRows(adapter.names)).toEqual([nameOf(USER_A)]);
    expect(adapter.names).toContain(RXDB_IDENTITY_CLAIM_NAME);
    await expect(open(adapter, identityOf(USER_B)).connect(adapter.name)).rejects.toBeInstanceOf(
      RxDBIdentityMismatchError
    );
    await expect(open(adapter, identityOf(USER_A)).connect(adapter.name)).resolves.toBe(adapter);
    expect(identityRows(adapter.names)).toEqual([nameOf(USER_A)]);
  });

  it('库已绑定这个身份（声明身份打开时写下的）：不重复写，以它结尾的水位行只有一条', async () => {
    const adapter = new MemoryLocalAdapter();
    const declared = open(adapter, identityOf(USER_A));
    await declared.connect(adapter.name);
    const rowsAfterOpen = [...adapter.names];

    await bindAs(declared, adapter, USER_A);

    expect(adapter.names).toEqual(rowsAfterOpen);
    expect(adapter.appended).toEqual([]);
  });

  it('库已绑定别的身份：抛身份不匹配，一行不写', async () => {
    const adapter = new MemoryLocalAdapter([RXDB_IDENTITY_CLAIM_NAME, nameOf(USER_A)]);
    const undeclared = open(adapter);
    await undeclared.connect(adapter.name);
    // 打开既有库时引导会补写指纹行；这里只看绑定本身写了什么
    const appendedBeforeBind = [...adapter.appended];

    const error = await bindAs(undeclared, adapter, USER_B).catch((rejection: unknown) => rejection);

    expect(error).toBeInstanceOf(RxDBIdentityMismatchError);
    expect(error).toMatchObject({
      source: 'database',
      clientKey: getRxDBIdentityKey(identityOf(USER_B)),
      foundKeys: [getRxDBIdentityKey(identityOf(USER_A))]
    });
    expect(adapter.appended).toEqual(appendedBeforeBind);
  });

  it('会话身份不合法（空 subject）：拒绝，不当作 anon，一行不写', async () => {
    const adapter = new MemoryLocalAdapter();
    const undeclared = open(adapter);
    await undeclared.connect(adapter.name);

    await expect(
      adapter.bootstrapTransaction(executor =>
        undeclared.bindIdentity(executor as never, { scope: SCOPE, subject: '' })
      )
    ).rejects.toBeInstanceOf(RxDBError);
    expect(identityRows(adapter.names)).toEqual([]);
  });
});

describe('不声明身份：与没有这个功能时一致', () => {
  it('没有绑定的既有库：不写任何行', async () => {
    const adapter = new MemoryLocalAdapter(['0001-init']);

    await expect(open(adapter).connect(adapter.name)).resolves.toBe(adapter);
    expect(identityRows(adapter.appended)).toEqual([]);
  });

  it('已绑定 A 的库不带身份打开：照常连接，不核对也不改绑', async () => {
    const adapter = new MemoryLocalAdapter([nameOf(USER_A)]);

    await expect(open(adapter).connect(adapter.name)).resolves.toBe(adapter);
    expect(identityRows(adapter.appended)).toEqual([]);
    expect(identityRows(adapter.names)).toEqual([nameOf(USER_A)]);
  });
});

describe('身份声明本身', () => {
  it('形状不对在构造时就拒绝，不等到连接', () => {
    expect(
      () =>
        new RxDB({
          dbName: 'identity-binding-invalid',
          entities: [],
          sync: { type: SyncType.None },
          identity: { scope: '', subject: USER_A }
        })
    ).toThrow(RxDBError);
  });

  it('构造时取自有副本：之后改动调用方的对象，不影响本实例', () => {
    const declared = { scope: SCOPE, subject: USER_A };
    const database = new RxDB({
      dbName: 'identity-binding-copy',
      entities: [],
      sync: { type: SyncType.None },
      identity: declared
    });

    declared.subject = USER_B;

    expect(database.config.identity).toEqual({ scope: SCOPE, subject: USER_A });
    expect(database.config.identity).not.toBe(declared);
    expect(Object.isFrozen(declared)).toBe(false);
  });
});
