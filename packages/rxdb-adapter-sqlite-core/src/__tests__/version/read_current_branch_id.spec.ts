import { getEntityMetadata, RxDBBranch } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { RxDBAdapterSqliteError } from '../../sqlite-core.utils.js';
import {
  readCurrentBranchId,
  resolveBranchColumns,
  type BranchQueryResult,
  type SqliteBranchRowReader
} from '../../version/read_current_branch_id.js';

const { idColumnName } = resolveBranchColumns(getEntityMetadata(RxDBBranch));

/** 按调用顺序依次作答的最小 reader 替身：第一次调用对应 activated 查询，第二次对应 main 回退查询。 */
const createSequencedReader = (...responses: BranchQueryResult[]): SqliteBranchRowReader => {
  let call = 0;
  return async () => responses[call++];
};

describe('readCurrentBranchId', () => {
  // `Math.max(0, columns.indexOf(idColumnName))` 在找不到列时把 -1 钳成 0，
  // 静默退回第 0 列——结果集里明明有行，却把别的列的值错当成 id 返回，且不报错。
  // 第 0 列取字符串值：旧实现 `typeof value === 'string'` 一关就会放行，把它当 id 直接返回
  // （而不是凑巧因类型不符退回 undefined、意外滚到「回退查 main」分支掩盖这条红测试要钉住的行为）。
  it('有行但结果集不含 id 列时应抛错，而不是静默退第 0 列', async () => {
    const reader = createSequencedReader({ columns: ['activated'], rows: [['SENTINEL-NOT-AN-ID']] });

    await expect(readCurrentBranchId(reader)).rejects.toThrow(RxDBAdapterSqliteError);
  });

  // 回归：部分驱动在「没有行」时连 columns 都给空数组（见 with_triggers_disabled.ts 的适配层）。
  // 此时必须仍判定为「没有 activated 分支」并回退查 main，而不是被误判成「结果集缺列」。
  it('activated 查询无行（columns 也为空）时应回退查 main', async () => {
    const reader = createSequencedReader({ columns: [], rows: [] }, { columns: [idColumnName], rows: [['main']] });

    await expect(readCurrentBranchId(reader)).resolves.toBe('main');
  });
});
