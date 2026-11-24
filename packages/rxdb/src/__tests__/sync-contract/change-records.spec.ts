/**
 * @fileoverview 变更日志的「记录」计数（`sync-contract/change-records.ts`）
 *
 * @remarks
 * 一个事务里的变更是一条记录，不在事务里的变更各是一条：批量添加 10 条，待推数是 1，
 * 与操作历史里那一条「事务: 创建10条」对得上。
 */

import { describe, expect, it, vi } from 'vitest';
import type { CountOptions } from '../../repository/query-options.interface.js';
import { countRxDBChangeRecords } from '../../sync-contract/change-records.js';
import type { RxDBChange } from '../../system/change.js';
import type { RxDBChangeRuleGroup } from '../../system/types.js';

type ChangeCountOptions = CountOptions<typeof RxDBChange, RxDBChangeRuleGroup>;

const PENDING: RxDBChangeRuleGroup = {
  combinator: 'and',
  rules: [{ field: 'remoteId', operator: '=', value: null }]
};

describe('countRxDBChangeRecords', () => {
  it('不在事务里的变更各算一条，事务内的变更按 transactionId 分组、一组算一条', async () => {
    const count = vi.fn(async (options: ChangeCountOptions) => (options.groupBy ? 2 : 3));

    await expect(countRxDBChangeRecords(count, PENDING)).resolves.toBe(5);
    expect(count).toHaveBeenCalledTimes(2);
    expect(count).toHaveBeenCalledWith({
      where: { combinator: 'and', rules: [PENDING, { field: 'transactionId', operator: '=', value: null }] }
    });
    expect(count).toHaveBeenCalledWith({
      where: { combinator: 'and', rules: [PENDING, { field: 'transactionId', operator: '!=', value: null }] },
      groupBy: ['transactionId']
    });
  });

  it('一个事务里写了 10 条变更（saveMany 批量添加）只算 1 条记录', async () => {
    const count = vi.fn(async (options: ChangeCountOptions) => (options.groupBy ? 1 : 0));

    await expect(countRxDBChangeRecords(count, PENDING)).resolves.toBe(1);
  });

  it('计数失败原样抛出，不当成 0', async () => {
    const failure = new Error('count failed');
    const count = vi.fn(async (options: ChangeCountOptions) => {
      if (options.groupBy) throw failure;
      return 3;
    });

    await expect(countRxDBChangeRecords(count, PENDING)).rejects.toBe(failure);
  });
});
