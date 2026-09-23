/**
 * @fileoverview `SwitchBranchOptions.prepare` —— 前置校验搭上切换事务的唯一通道。
 *
 * @remarks
 * 在它之前，分支切换的前置条件（工作树是否干净、提交图是否损坏、代际凭据是否过期）跑在
 * **另一个只读事务**里，`adapter.switchBranch()` 自己的写事务在它之后才开。两个事务之间的
 * 那个窗口没有任何东西守着：校验说「干净」，切换开始前的一次写让它变脏，切换照样完成。
 * 原来的 TSDoc 说那个窗口「由 `expectedActivationRevision` 这类 CAS 字段自己兜住」——
 * 而那个字段恰恰也是在**只读**事务里比的，它不是 CAS，它只是一次读后比较。
 *
 * 现在校验由调用方以回调形式交给适配器，适配器在自己那个写事务里、动第一行之前调它。
 * 于是「校验通过」与「切换完成」之间没有窗口，因为它们是同一个事务。
 *
 * 三条断言各挡一种会让这条通道退回成装饰的退化：
 *
 * 1. **`prepare` 做成可选。** 那样漏传的调用方不会有任何症状——切换照常成功，只是没校验过。
 *    「不需要校验」与「忘了传」变成同一件事，而这正是 `RxDBSystemContribution` 七个贡献点
 *    一个都不带 `?` 的同一条理由。做成必填之后，漏传是编译错误；真不需要的调用点
 *    （历史回放那两处只套用 actions、从不改分支）写一个显式空实现，那是一句「我确实不需要」。
 * 2. **回调收不到执行器。** 收不到就只能自己开事务，于是又回到两个事务——这条通道的全部意义
 *    就是把校验放进**那一个**事务里。
 * 3. **回调收不到目标分支 id。** `branchId` 可省（省略表示「作用于当前激活分支」），
 *    真正的目标由适配器在事务内解析。回调若拿不到解析后的那个值，校验只能去读调用方那份
 *    可能是 `undefined` 的入参，于是「切到当前分支」这条路径上的校验对着 `undefined` 跑。
 */

import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import type { SwitchBranchOptions, SwitchBranchPrepareContext } from '../../rxdb-adapter.js';
import { SKIP_BRANCH_SWITCH_PREPARE } from '../../rxdb-adapter.js';
import type { TransactionExecutor } from '../../transaction/transaction-executor.interface.js';

describe('SwitchBranchOptions.prepare 的形状', () => {
  it('是必填的——漏传是编译错误，不是一次静默的无校验切换', () => {
    // `?` 让「不需要」与「忘了」变成同一种东西。
    expectTypeOf<SwitchBranchOptions>().toHaveProperty('prepare');
    expectTypeOf<SwitchBranchOptions['prepare']>().not.toEqualTypeOf<undefined>();
    expectTypeOf<Required<SwitchBranchOptions>['prepare']>().toEqualTypeOf<SwitchBranchOptions['prepare']>();
  });

  it('拿到的是切换事务的执行器与解析后的目标分支 id', () => {
    expectTypeOf<SwitchBranchPrepareContext>().toEqualTypeOf<{
      readonly executor: TransactionExecutor;
      readonly targetBranchId: string;
    }>();
  });

  it('返回 Promise：适配器要 await 它，而不是发出去就往下走', () => {
    expectTypeOf<SwitchBranchOptions['prepare']>().returns.toEqualTypeOf<Promise<void>>();
  });

  it('目标分支 id 不可省——适配器解析完才调它', async () => {
    const prepare = vi.fn<(context: SwitchBranchPrepareContext) => Promise<void>>(async () => undefined);
    const executor = {} as TransactionExecutor;

    await prepare({ executor, targetBranchId: 'feature' });

    // 入参里的 `branchId` 可省，回调里的 `targetBranchId` 不可省：省略那一支上，
    // 校验要看的是适配器在事务内读出来的那个分支，不是调用方那份 `undefined`。
    expect(prepare.mock.calls[0]?.[0].targetBranchId).toBe('feature');
    expectTypeOf<SwitchBranchPrepareContext['targetBranchId']>().toEqualTypeOf<string>();
  });
});

describe('SKIP_BRANCH_SWITCH_PREPARE：具名的豁免，而不是散落的匿名空箭头', () => {
  it('就是一个什么都不做的 prepare', async () => {
    await expect(
      SKIP_BRANCH_SWITCH_PREPARE({ executor: {} as TransactionExecutor, targetBranchId: 'main' })
    ).resolves.toBeUndefined();
    expectTypeOf(SKIP_BRANCH_SWITCH_PREPARE).toEqualTypeOf<SwitchBranchOptions['prepare']>();
  });

  it('豁免只对不改分支的调用点成立，所以它必须是可 grep 的具名导出', () => {
    // 匿名 `async () => {}` 散在各调用点时，「谁豁免了前置校验」只能靠读全文发现；
    // 具名导出让这张表一次 grep 就数得清。名字本身没有运行时行为可测，能测的是它确实被导出。
    expect(typeof SKIP_BRANCH_SWITCH_PREPARE).toBe('function');
  });
});
