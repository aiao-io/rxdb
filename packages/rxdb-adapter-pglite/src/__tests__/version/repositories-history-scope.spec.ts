import {
  ENTITY_STATIC_TYPES,
  Entity,
  EntityBase,
  type EntityType,
  PropertyType,
  RxDB,
  SyncType,
  type UUID
} from '@aiao/rxdb';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { Todo } from '@aiao/rxdb-test/entities';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { generateDbName } from '../test-utils.js';

/**
 * @fileoverview US-316：几个实体合起来的撤销作用域 —— 真实 PGlite 本地库。
 *
 * @remarks
 * 作用域怎么判定、怎么缓存由 `rxdb-plugin-history` 的单测守（`scope-selection`、`HistoryManager`）；
 * 这里在真实的本地库上验三件事：跨作用域里两个实体的一次写入整条撤销、整条重做；作用域外实体的写入不进计数、
 * 不被撤；作用域里最近一步被子分支继承时，与单仓库作用域一样停在分叉点（US-315）。
 *
 * 每条用例一个新库：撤销会话与重做栈是实例内存里的状态。
 */
@Entity({ name: 'Us316Customer', properties: [{ name: 'name', type: PropertyType.string }] })
class Us316Customer extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  declare name: string;
}

@Entity({ name: 'Us316Card', properties: [{ name: 'code', type: PropertyType.string }] })
class Us316Card extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  declare code: string;
}

describe('几个实体合起来的撤销作用域（US-316）', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;

  const rowsOf = (EntityClass: EntityType) =>
    adapter.getRepository(EntityClass).find({ where: { combinator: 'and', rules: [] } });

  /** 一次 saveMany：客户与证件同一个事务 */
  const createCustomerWithCard = () =>
    rxdb.entityManager.saveMany([new Us316Customer({ name: '张三' }), new Us316Card({ code: 'ID-1' })]);

  beforeEach(async () => {
    rxdb = new RxDB({
      dbName: generateDbName(),
      entities: [Us316Customer, Us316Card, Todo],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    adapter = await rxdb.getAdapter('pglite');
    rxdb.use(rxDBPluginHistory);
    await rxdb.connect('pglite');
  });

  afterEach(async () => {
    if (rxdb) await rxdb.disconnectAll();
  });

  it('AC#1：一次写入新建客户与证件，作用域列着这两个实体：撤销一次两行一起撤掉，重做一次一起回来', async () => {
    const scope = rxdb.versionManager.history([Us316Customer, Us316Card]);
    await createCustomerWithCard();
    await expect.poll(() => firstValueFrom(scope.undoCount$)).toBe(1);

    await scope.undo();
    expect(await rowsOf(Us316Customer)).toHaveLength(0);
    expect(await rowsOf(Us316Card)).toHaveLength(0);

    await expect.poll(() => firstValueFrom(scope.redoCount$)).toBe(1);
    await scope.redo();
    expect(await rowsOf(Us316Customer)).toHaveLength(1);
    expect(await rowsOf(Us316Card)).toHaveLength(1);
  });

  it('AC#2：之后在 Todo 上写了一条：作用域的计数不含它，撤的是作用域里最近的那次写入，Todo 不动', async () => {
    const scope = rxdb.versionManager.history([Us316Customer, Us316Card]);
    await createCustomerWithCard();
    const todo = new Todo();
    todo.title = '买牛奶';
    await todo.save();

    await expect.poll(() => firstValueFrom(rxdb.versionManager.history().undoCount$)).toBe(2);
    await expect.poll(() => firstValueFrom(scope.undoCount$)).toBe(1);
    await scope.undo();

    expect(await rowsOf(Us316Customer)).toHaveLength(0);
    expect(await rowsOf(Us316Card)).toHaveLength(0);
    expect(await rowsOf(Todo)).toHaveLength(1);
  });

  it('AC#7：作用域里最近一步已被子分支继承：与单仓库作用域一样停在分叉点，给出继承它的分支', async () => {
    const scope = rxdb.versionManager.history([Us316Customer, Us316Card]);
    await createCustomerWithCard();
    await rxdb.versionManager.createBranch('feature');

    await expect
      .poll(() => firstValueFrom(scope.undoBarrier$))
      .toEqual({ reason: 'inherited_by_branch', branchIds: ['feature'] });
    expect(await firstValueFrom(scope.undoCount$)).toBe(0);
    await scope.undo();
    expect(await rowsOf(Us316Customer)).toHaveLength(1);
    expect(await rowsOf(Us316Card)).toHaveLength(1);
  });
});
