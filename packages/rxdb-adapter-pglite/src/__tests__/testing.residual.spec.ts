import { ACTIVE_BRANCH_KEY, type EntityType } from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import type { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';
import { cleanup_db, cloneEntityClasses } from '../testing.js';

/**
 * 造一个只认 `cleanup_db` 用得着的那几个成员的假适配器，并把每一路调用都录下来。
 *
 * 表清单固定为空：本文件盯的是 `cleanup_db` 的两条**残余分支**——没有 trigger sql 时不发语句、
 * 没有表时不发 TRUNCATE，两者都要求查询结果为空。
 */
const createCleanupAdapter = () => {
  const cleanAllCache = vi.fn();
  // 声明形参是为了让 mock.calls 带上 sql 元素类型，供下方断言解构
  const query = vi.fn(async (...args: unknown[]) => {
    void args;
    return { rows: [], fields: [], affectedRows: 0 };
  });
  const internalQuery = vi.fn(async () => ({ rows: [], fields: [], affectedRows: 0 }));
  const saveMany = vi.fn(async (rows: { id: string }[]) => rows);
  const transaction = vi.fn(async (fun: (executor: unknown) => Promise<unknown>, transactionLog?: boolean) => {
    void transactionLog;
    return fun({ saveMany });
  });

  const adapter = {
    rxdb: {
      // `instantiate` 今天没有调用点（初始行随插件走了），留着是为了让回归**以断言的形式**
      // 显形：谁再把 `createWorkingTreeCommitsInitialRows` 接回来，下面那条 `saveMany` 断言
      // 会给出一份行 id 的 diff；删掉它则只剩一句 `instantiate is not a function`。
      // 返回裸对象是因为真实实体类的构造器带 `need init rxdb` 门禁，而初始行工厂只往返回值上赋字段。
      entityManager: { cleanAllCache, instantiate: () => ({}) },
      config: { entities: [] }
    },
    query,
    internalQuery,
    transaction
  } as unknown as RxDBAdapterPGlite;

  return { adapter, cleanAllCache, query, internalQuery, saveMany, transaction };
};

describe('testing residual branches', () => {
  it('cleanup_db skips empty trigger sql and empty table truncate', async () => {
    const { adapter, cleanAllCache, query, internalQuery } = createCleanupAdapter();

    await expect(cleanup_db(adapter)).resolves.toBeUndefined();

    expect(cleanAllCache).toHaveBeenCalled();
    expect(internalQuery).toHaveBeenCalled();
    // 空表：不执行 TRUNCATE。
    expect(query.mock.calls.some(([sql]) => String(sql).includes('TRUNCATE'))).toBe(false);
  });

  // 清库要回到的是**新库形态**。对一个没装 `@aiao/rxdb-plugin-working-tree` 的库而言，
  // 新库形态就是「main 分支行 + 它的激活态哨兵」，一行不多。两者必须同进同出：
  // 只补 `id='main'` 会留下一条谁也没激活的分支，`resolveCurrentBranch()` 当场读不到激活行。
  it('把 main 分支行连同激活态哨兵一并补回', async () => {
    const { adapter, query } = createCleanupAdapter();

    await cleanup_db(adapter);

    const branchInsert = query.mock.calls
      .map(([sql]) => String(sql))
      .find(sql => sql.includes('rxdb_branch') && sql.includes('INSERT'));
    expect(branchInsert).toContain(`'main'`);
    expect(branchInsert).toContain(ACTIVE_BRANCH_KEY);
  });

  // 工作树/提交侧那十张表只存在于 `use(rxDBPluginWorkingTree)` 过的库里，而 `cleanup_db` 的
  // 调用点一个都没装插件。在这里补它们的初始行不是「多写几行」而是**当场抛错**：实体没注册，
  // `instantiate()` 找不到元数据。顺带也就没有事务可开了——原先那次 `transaction(fun, false)`
  // 存在的唯一理由就是写这批行，`false` 是「清理不进变更日志」。现在一次事务都不开，
  // 那条约束自然成立，这里连同事务一起钉住。
  it('不补工作树/提交侧的初始行：那十张表不在未装插件的库里', async () => {
    const { adapter, saveMany, transaction } = createCleanupAdapter();

    await cleanup_db(adapter);

    expect(saveMany).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('cloneEntityClasses handles classes without ɵMetadata', () => {
    class Plain {}
    const [Clone] = cloneEntityClasses([Plain as unknown as EntityType]);
    expect(Clone).not.toBe(Plain);
    expect(new Clone()).toBeInstanceOf(Object);
  });
});
