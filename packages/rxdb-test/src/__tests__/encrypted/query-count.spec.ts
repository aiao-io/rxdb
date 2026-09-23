import { describe, expect, it } from 'vitest';

import { queryCountOf, registerQueryCount } from '../../encrypted/query-count.js';

describe('registerQueryCount / queryCountOf', () => {
  // 读的是**函数**而不是当场取一次数：登记发生在 `createAdapter()` 里，套件调
  // `getQueryCount()` 是之后的事，中间隔着被测的那些查询。存快照等于永远读到 0。
  it('读实时计数，不是登记时的快照', () => {
    const adapter = { queryCount: 0 };
    registerQueryCount(adapter, () => adapter.queryCount);

    expect(queryCountOf(adapter)).toBe(0);
    adapter.queryCount = 3;
    expect(queryCountOf(adapter)).toBe(3);
  });

  // 原样返回登记的那个对象，于是调用点只能写成 `return registerQueryCount(x, ...)` ——
  // 「登记 A 却返回 B」这种接线错误在语法上就写不出来。这正是各工厂此前
  // `set(a, ...); return a;` 两行分开时留的口子。
  it('原样返回被登记的对象', () => {
    const adapter = { queryCount: 0 };
    expect(registerQueryCount(adapter, () => adapter.queryCount)).toBe(adapter);
  });

  // 这条是本模块存在的理由。各工厂此前写的是 `counts.get(adapter)?.() ?? 0`：
  // 登记表打空时返回 0，而加密查询校验套件的断言是「调用前后计数**不变**」
  // （`crud.suite.ts` 的 `expectRejectedBeforeQuery`），0 === 0 恒成立 ——
  // 一条接线断掉的工厂会让那批「泄漏必须拦在 SQL 之前」的用例整片变成空断言。
  // 未登记是接线 bug，不是「跑了 0 条查询」，必须炸。
  it('未登记的对象抛错，不兜底成 0', () => {
    expect(() => queryCountOf({})).toThrow(/registerQueryCount/);
  });
});
