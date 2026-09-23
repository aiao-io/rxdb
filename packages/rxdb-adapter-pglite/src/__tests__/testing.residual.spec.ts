import { ACTIVE_BRANCH_KEY } from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import type { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';
import { cleanup_db } from '../testing.js';

/** 假贡献只需交出 `cleanup_db` 会调的那一个方法。 */
type SystemContributionLike = {
  createInitialRows: (entityManager: unknown, context: { branchIds: readonly string[] }) => { id: string }[];
};

/**
 * 造一个只认 `cleanup_db` 用得着的那几个成员的假适配器，并把每一路调用都录下来。
 *
 * 表清单固定为空：本文件盯的是 `cleanup_db` 的两条**残余分支**——没有 trigger sql 时不发语句、
 * 没有表时不发 TRUNCATE，两者都要求查询结果为空。
 *
 * `systemContributions` 默认给空数组而不是不写：真实 `RxDB` 上它是个**必然存在**的 getter，
 * 没装插件时返回 `[]`。写成缺省不存在会让「没装插件就不补行」变成 `undefined` 兜出来的巧合，
 * 而它应当是「贡献列表为空」直接得出的结论。
 */
const createCleanupAdapter = (systemContributions: readonly SystemContributionLike[] = []) => {
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
      // `instantiate` 返回裸对象：真实实体类的构造器带 `need init rxdb` 门禁，而初始行工厂
      // 只往返回值上赋字段，所以假的 entityManager 交出一个空壳就够贡献函数用。
      entityManager: { cleanAllCache, instantiate: () => ({}) },
      config: { entities: [] },
      systemContributions
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

  // 没装插件的库里没有工作树/提交侧那十张表，也就没有初始行可补。这条**不是**「本功能默认关闭」，
  // 而是「贡献列表为空」的直接结果：一行都不用写时连事务都不该开，否则每套 shared suite 的
  // 每次清理都白多一次事务往返。
  it('没有系统贡献的库：一行不补，一次事务都不开', async () => {
    const { adapter, saveMany, transaction } = createCleanupAdapter();

    await cleanup_db(adapter);

    expect(saveMany).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  // 清库要回到的是新库形态，而「新库形态」是 `RxDB` 建库时定下的：`main` 分支行 **加上**
  // 每个系统能力贡献的初始行（`RxDB.ts` 的 `createTables()` 就是这么拼的）。TRUNCATE 把后半截
  // 一并清掉却不补，装了 `@aiao/rxdb-plugin-working-tree` 的库在清库后第一次 `createBranch()`
  // 就会在发放分支代际时读不到激活态行直接抛错。
  //
  // 补法是回头调**同一个** `createInitialRows`，不是让调用方把行再写一遍：行的内容归贡献方定义，
  // 这里再抄一份就等于给它开了第二个定义处，两边迟早分岔。本文件也因此不必 import 任何插件包。
  it('有系统贡献的库：按贡献重建初始行，且不写进变更日志', async () => {
    const { adapter, saveMany, transaction, query } = createCleanupAdapter([
      {
        createInitialRows: (_entityManager, context) => context.branchIds.map(branchId => ({ id: `wt-${branchId}` }))
      },
      { createInitialRows: () => [{ id: 'commit-singleton' }] }
    ]);

    await cleanup_db(adapter);

    // 一次 saveMany 写全部贡献：分两次写就有了一个「工作树行在、提交行不在」的中间状态。
    expect(saveMany).toHaveBeenCalledWith([{ id: 'wt-main' }, { id: 'commit-singleton' }]);
    // `false` = 不进变更日志。清理动作本身不是用户编辑，落进去会让下一个用例的 undo 栈多一格。
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), false);

    // 排在 main 分支行之后：那十张表的伴生行按分支挂靠，main 还不存在时补它们是悬空外键。
    const branchInsertOrder = query.mock.calls.findIndex(
      ([sql]) => String(sql).includes('rxdb_branch') && String(sql).includes('INSERT')
    );
    expect(branchInsertOrder).toBeGreaterThanOrEqual(0);
    expect(transaction.mock.invocationCallOrder[0]).toBeGreaterThan(query.mock.invocationCallOrder[branchInsertOrder]);
  });
});
