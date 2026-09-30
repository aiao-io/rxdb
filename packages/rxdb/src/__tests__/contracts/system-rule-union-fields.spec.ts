import { describe, expect, it } from 'vitest';

import { getEntityColumnName } from '../../entity/entity-field.utils.js';
import { transitionMetadata } from '../../entity/metadata-transition.js';
import { getEntityMetadata } from '../../rxdb-utils.js';
import { RxDBBranch } from '../../system/branch.js';
import { RxDBChange } from '../../system/change.js';
import { RxDBSync } from '../../system/sync.js';
import type { RxDBBranchRuleGroup, RxDBChangeRuleGroup, RxDBSyncRuleGroup } from '../../system/types.js';

/**
 * 四张系统表的规则联合（`system/types.ts` 的 `RxDBSyncRule` / `RxDBChangeRule` /
 * `RxDBBranchRule`）是**手写**的，不是从实体元数据推出来的。手写就会串行：
 * 每个关系块（`branch.*` / `branch.changes.*` / `syncs.*` …）末尾那一列
 * 都曾误用裸的 `StringRules<关系实体, '列名'>` 而不是 `RelationStringRules<'路径.列名', 值>`。
 *
 * 两者的 `field` 不是一回事：裸版把 `'parentId'` 原样放进 `field`，于是
 * `RxDBSync.find({ where: { rules: [{ field: 'parentId', … }] } })` 编译通过、
 * 运行时去 `RxDBSync` 表上找一列根本不存在的 `parentId`。
 *
 * 本文件是**编译期**红线：vitest 不做类型检查，`@ts-expect-error` 只在
 * `nx typecheck rxdb`（`tsc -p tsconfig.spec.json --noEmit`）那道门禁里转红——
 * 一旦某条 `@ts-expect-error` 下面的代码重新编译得过，`tsc` 会报
 * 「Unused '@ts-expect-error' directive」，正是回归发生的信号。
 */
describe('系统表规则联合不得混入他表列名', () => {
  it('他表列名在运行期确实不是本表的列（编译期红线的前提）', () => {
    // 走 `getEntityColumnName()` 而不是数 `properties`：FK 列（`parentId` / `branchId`）
    // 是 MANY_TO_ONE 关系隐式生成的物理列，压根不在 `properties` 里，
    // 只有 `foreignKeyRelationMap` 认得它们。这里借系统自己的判据，不复述命名约定。
    const isColumn = (entityType: Parameters<typeof getEntityMetadata>[0], field: string): boolean =>
      getEntityColumnName(transitionMetadata(getEntityMetadata(entityType)), field) !== undefined;

    // `parentId` 只长在 RxDBBranch 上；RxDBSync / RxDBChange 没有这一列
    expect(isColumn(RxDBBranch, 'parentId')).toBe(true);
    expect(isColumn(RxDBSync, 'parentId')).toBe(false);
    expect(isColumn(RxDBChange, 'parentId')).toBe(false);

    // `branchId` 长在 RxDBChange 与 RxDBSync 上；RxDBBranch 没有
    expect(isColumn(RxDBChange, 'branchId')).toBe(true);
    expect(isColumn(RxDBSync, 'branchId')).toBe(true);
    expect(isColumn(RxDBBranch, 'branchId')).toBe(false);
  });

  it('编译期：裸列名被拒、关系路径被接受', () => {
    const syncRejectsForeignColumns: RxDBSyncRuleGroup = {
      combinator: 'and',
      rules: [
        // @ts-expect-error `parentId` 是 RxDBBranch 的列，要经 `branch.parentId` 这条关系路径
        { field: 'parentId', operator: '=', value: 'b1' },
        // `branchId` 是 RxDBSync 自己的列，这条必须留着编译得过
        { field: 'branchId', operator: '=', value: 'b1' },
        { field: 'branch.parentId', operator: '=', value: 'b1' },
        { field: 'branch.changes.branchId', operator: '=', value: 'b1' }
      ]
    };

    const changeRejectsForeignColumns: RxDBChangeRuleGroup = {
      combinator: 'and',
      rules: [
        // @ts-expect-error `parentId` 是 RxDBBranch 的列，要经 `branch.parentId`
        { field: 'parentId', operator: '=', value: 'b1' },
        // `branchId` 是 RxDBChange 自己的列，这条必须留着编译得过
        { field: 'branchId', operator: '=', value: 'b1' },
        { field: 'branch.parentId', operator: '=', value: 'b1' },
        { field: 'branch.syncs.branchId', operator: '=', value: 'b1' }
      ]
    };

    const branchRejectsForeignColumns: RxDBBranchRuleGroup = {
      combinator: 'and',
      rules: [
        // @ts-expect-error `branchId` 是 RxDBChange / RxDBSync 的列，要经 `changes.` / `syncs.` 路径
        { field: 'branchId', operator: '=', value: 'b1' },
        // `parentId` 是 RxDBBranch 自己的列，这条必须留着编译得过
        { field: 'parentId', operator: '=', value: 'b1' },
        { field: 'changes.branchId', operator: '=', value: 'b1' },
        { field: 'syncs.branchId', operator: '=', value: 'b1' }
      ]
    };

    // 运行期只核对规则条数，类型断言本身由 tsc 那道门禁执行
    expect(syncRejectsForeignColumns.rules).toHaveLength(4);
    expect(changeRejectsForeignColumns.rules).toHaveLength(4);
    expect(branchRejectsForeignColumns.rules).toHaveLength(4);
  });
});
