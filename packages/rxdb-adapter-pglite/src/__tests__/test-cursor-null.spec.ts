import { type FindByCursorOptions, RxDB, SyncType } from '@aiao/rxdb';
import { TypeDemo } from '@aiao/rxdb-test/entities';
import { firstValueFrom } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../index.js';
import { generateDbName } from './test-utils.js';

/**
 * 可空列做游标排序。约定 NULL 是最小值（asc 靠前、desc 靠后），与 JS 比较器和 SQLite 一致；
 * PostgreSQL 默认相反（asc 时 NULL 靠后）。原实现下游标落在 NULL 行时 `> NULL` 恒假，
 * 后续页为空，行被静默丢掉。SQLite 侧的同一命题在 sqlite-core 的 `shared-crud.suite.ts`。
 */
describe('findByCursor 跨过 NULL 键', () => {
  type CursorOrderBy = FindByCursorOptions<typeof TypeDemo>['orderBy'];
  const where = { combinator: 'and', rules: [] } as FindByCursorOptions<typeof TypeDemo>['where'];
  let rxdb: RxDB;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: generateDbName(),
      entities: [TypeDemo],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    await rxdb.connect('pglite');
    const rows = ['s1', 's2', null, null].map(value => {
      const row = new TypeDemo();
      row.string = value as string;
      return row;
    });
    await rxdb.entityManager.saveMany(rows);
  });

  afterAll(async () => {
    await rxdb.disconnectAll();
  });

  // limit 1 逐行翻页，游标必然逐一落在每一行（含两条 NULL 行）上
  const walk = async (orderBy: CursorOrderBy, direction: 'after' | 'before', start?: TypeDemo) => {
    const seen: TypeDemo[] = [];
    let cursor = start;
    for (let i = 0; i < 10; i++) {
      const page = await firstValueFrom(
        TypeDemo.findByCursor({ where, orderBy, limit: 1, ...(cursor ? { [direction]: cursor } : {}) })
      );
      if (!page.length) return seen;
      cursor = page[0];
      seen.push(page[0]);
    }
    throw new Error('翻页未收敛');
  };

  it.each([
    ['asc', [null, null, 's1', 's2']],
    ['desc', ['s2', 's1', null, null]]
  ] as const)('%s：正反两个方向逐行翻完与一次查全量逐行一致', async (sort, expected) => {
    const orderBy: CursorOrderBy = [
      { field: 'string', sort },
      { field: 'id', sort }
    ];
    const all = await firstValueFrom(TypeDemo.find({ where, orderBy }));
    expect(all.map(row => row.string)).toEqual(expected);
    const ids = all.map(row => row.id);

    expect((await walk(orderBy, 'after')).map(row => row.id)).toEqual(ids);
    const backward = await walk(orderBy, 'before', all[all.length - 1]);
    expect(backward.map(row => row.id).reverse()).toEqual(ids.slice(0, -1));
  });
});
