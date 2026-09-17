/**
 * @fileoverview T112 红测试：切换分支的 clean 检查由调用方**显式提供**（FR-017、R6、SC-014）。
 *
 * @remarks
 * 契约见 `spec.md` FR-017 末句与场景 4：「clean 检查以 `WorkingTreeSwitchBranchOptions.requireClean`
 * 显式提供，不带选项仍无条件切换」，以及 `contracts/core-api.md` §6——`switchBranch` 的签名扩成
 * `(branchId, options?)`，返回值仍是 `Promise<void>`。
 *
 * 实现目标是 `src/working-tree/switch-branch-options.ts`：选项类型与那道守卫。
 * `VersionManager.switchBranch` 那一侧的接线归 T118，本文件不碰它。
 *
 * **为什么守卫在本包而不在 `rxdb-plugin-history`**：判据是 `WorkingTreeState.entryCount`，
 * 那张表由本插件贡献。`rxdb-plugin-history` 反过来依赖本包会成环（nx 的图插件把静态 import
 * 直接映射成依赖边，`run-many` 当场拒跑），所以 T118 的接线只能走已有的系统贡献口子。
 *
 * 六组断言各自防一种不会编译报错、也不会立刻出错的退化：
 *
 * 1. **「显式提供」被做成「默认开启」。** 这是最自然的一步——「切分支前当然该确认工作树干净」。
 *    代价是**既有调用点全部改变行为**：`switchBranch(id)` 在任何有未提交改动的库上开始抛错，
 *    而 FR-017 要的是零行为变化。历史子系统自己也在调它（undo/redo 回放、redo 失效），
 *    那些路径上工作树恒非空，于是默认开启等于让 undo 在有改动时不可用。
 * 2. **不传选项时仍然去读了一次状态。** 行为上看不出来（读完什么也不做），但它把一次
 *    往返加进了每一次切换；更要紧的是，读到的东西迟早会被「顺手」用上——而那一步没有
 *    任何测试拦得住。「不传选项 = 不检查」必须是**一条语句都不发**，不是「发了但忽略」。
 * 3. **`requireClean: false` 与不传被当成同一件事。** 两者行为确实相同，但前者是调用方
 *    **看过并放弃**，后者是没表态。做成同一件事本身没错，错的是反过来——把 `false` 也当成
 *    「要检查」（`options.requireClean !== undefined` 之类的判定），那时显式关闭反而打开了检查。
 * 4. **判据自己重算一遍。** clean 的定义只有一个来源：`WorkingTreeState.entryCount === 0`
 *    （`status.ts` 的 `clean`，硬裁决 6：`remote_sync` 不豁免）。守卫改成扫一遍条目表的话，
 *    SC-001 要的常数时间没了，更糟的是两处判据从此可以漂移——而漂移的那一天，
 *    `status().clean` 说干净、切换说脏，用户没有任何出路。
 * 5. **拒绝之后留下了痕迹。** 守卫排在任何持久写入之前；写完再撤在事务边界之外
 *    （或者进程崩在中间）留下的是半棵切过去的工作树，而用户以为自己的操作被拒绝了。
 * 6. **新选项复用适配器的 `SwitchBranchOptions`。** 后者是 `{ branchId?, actions }`
 *    （`packages/rxdb/src/rxdb-adapter.ts:60`），是**另一层**的入参：把它漏进公开 API
 *    等于让用户看见适配器内部形状，还得自己造一份 `SwitchVersionActions` 才能调。
 *    SC-014 把这条列成命名门禁的一行，本文件是它的类型层对应物。
 */

import type { SwitchBranchOptions } from '@aiao/rxdb';
import { getEntityMetadata } from '@aiao/rxdb';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  assertSwitchBranchPreconditions,
  WorkingTreeDirtyError,
  type WorkingTreeSwitchBranchOptions
} from '../../working-tree/switch-branch-options.js';
import { WorkingTreeEntry } from '../../working-tree/working-tree-entry.entity.js';
import { WorkingTreeState } from '../../working-tree/working-tree-state.entity.js';
import { StaleActiveBranchError } from '../../working-tree/write-entry.js';
import {
  createWorkingTreeScene,
  entryRowsOf,
  SCENE_BRANCH_ID,
  stateRowOf,
  type WorkingTreeScene
} from '../working-tree/fixtures/working-tree-scene.js';

const ENTRY_ENTITY = getEntityMetadata(WorkingTreeEntry).name;
const STATE_ENTITY = getEntityMetadata(WorkingTreeState).name;

/** 造一个带 `dirtyCount` 条未提交改动的当前分支。 */
const sceneWith = (dirtyCount: number, activationRevision?: number): WorkingTreeScene => {
  const scene = createWorkingTreeScene(activationRevision === undefined ? {} : { activationRevision });
  for (let index = 0; index < dirtyCount; index += 1) scene.addEntry();
  return scene;
};

/** 跑一次守卫；形参与 T118 将要在 `switchBranch` 里写下的那一行同形。 */
const guard = (scene: WorkingTreeScene, options?: WorkingTreeSwitchBranchOptions): Promise<void> =>
  assertSwitchBranchPreconditions(scene.probe.executor, options);

describe('不带选项时无条件切换（FR-017）', () => {
  it('脏工作树上放行', async () => {
    const scene = sceneWith(3);

    await expect(guard(scene)).resolves.toBeUndefined();
  });

  it('一条语句、一次查询都不发——「不检查」不是「查了但忽略」', async () => {
    const scene = sceneWith(3);

    await guard(scene);

    // 查了再忽略在行为上看不出来，但那一次读迟早会被「顺手」用上，
    // 而那一步没有任何测试拦得住。
    expect(scene.probe.finds).toEqual([]);
    expect(scene.probe.statements).toEqual([]);
  });

  it('空选项对象与不传等价——缺省字段不是「显式 false」也不是「显式 true」', async () => {
    const scene = sceneWith(3);

    await expect(guard(scene, {})).resolves.toBeUndefined();
    expect(scene.probe.finds).toEqual([]);
  });
});

describe('requireClean 显式打开时拒绝脏工作树（FR-017）', () => {
  it('脏工作树上抛 WorkingTreeDirtyError，带得出分支与条目数', async () => {
    const scene = sceneWith(2);

    // 光抛一个裸 Error 的话，界面只能把消息原样贴给用户；带上这两项它才能说出
    // 「main 上还有 2 条未提交改动，先提交或丢弃」。
    await expect(guard(scene, { requireClean: true })).rejects.toThrowError(WorkingTreeDirtyError);
    await expect(guard(scene, { requireClean: true })).rejects.toMatchObject({
      branchId: SCENE_BRANCH_ID,
      entryCount: 2
    });
  });

  it('拒绝发生在任何写入之前：条目、状态行、语句全部原样', async () => {
    const scene = sceneWith(2);

    await expect(guard(scene, { requireClean: true })).rejects.toThrow();

    // 「写完再撤」在事务边界之外留下的是半棵切过去的工作树，而用户以为操作被拒绝了。
    expect(entryRowsOf(scene)).toHaveLength(2);
    expect(stateRowOf(scene).entryCount).toBe(2);
    expect(scene.probe.statements).toEqual([]);
    expect(scene.probe.saved).toEqual([]);
  });

  it('干净工作树上放行', async () => {
    const scene = sceneWith(0);

    await expect(guard(scene, { requireClean: true })).resolves.toBeUndefined();
  });

  it('判据是 entryCount 冗余列，不扫条目表', async () => {
    const scene = sceneWith(0);

    await guard(scene, { requireClean: true });

    // 扫表既丢掉 SC-001 要的常数时间，也让判据与 `status().clean` 从此可以漂移——
    // 漂移的那一天，摘要说干净、切换说脏，用户没有任何出路。
    expect(scene.probe.finds.map(call => call.entity)).toContain(STATE_ENTITY);
    expect(scene.probe.finds.map(call => call.entity)).not.toContain(ENTRY_ENTITY);
  });
});

describe('requireClean 显式关闭等同于不表态（FR-017）', () => {
  it('false 在脏工作树上放行', async () => {
    const scene = sceneWith(3);

    // 反过来把「字段存在」当成「要检查」（`options.requireClean !== undefined`）的话，
    // 显式关闭反而打开了检查——而那正是调用方刚刚拒绝的东西。
    await expect(guard(scene, { requireClean: false })).resolves.toBeUndefined();
  });
});

// T127 补：`expectedActivationRevision` 此前在本端**一条用例都没有**——覆盖率上它是
// `switch-branch-options.ts` 仅有的三个未覆盖分支。行为上更要紧：这个字段的失效方式是
// 「写错了也不报错、只是静默不生效」，正是 `RxDBBranchSwitchPreconditions` 的 TSDoc 点名
// 要靠类型挡住的那一类；而类型只挡得住拼写，挡不住判定本身被写反。
describe('expectedActivationRevision 是切换时的代际 CAS（FR-020）', () => {
  it('与库里对不上时抛 StaleActiveBranchError，两边的 token 都带得出', async () => {
    const scene = sceneWith(0, 7);

    // 判反（`===` 写成 `!==` 的反面）的症状是：对得上的反被拒、对不上的照切，
    // 而后者恰恰是这个字段唯一要拦的东西。
    await expect(guard(scene, { expectedActivationRevision: 6 })).rejects.toThrowError(StaleActiveBranchError);
    await expect(guard(scene, { expectedActivationRevision: 6 })).rejects.toMatchObject({
      expected: { branchId: SCENE_BRANCH_ID, activationRevision: 6 },
      actual: { branchId: SCENE_BRANCH_ID, activationRevision: 7 }
    });
  });

  it('对得上时放行；没提 requireClean 就不读工作树状态行', async () => {
    const scene = sceneWith(3, 7);

    // 脏工作树上照样放行：两个字段各判各的。顺带钉住「只查该查的那一张表」——
    // 代际对上之后接着去读一次 entryCount 的话，脏工作树会在没人要求 clean 时被拒。
    await expect(guard(scene, { expectedActivationRevision: 7 })).resolves.toBeUndefined();
    expect(scene.probe.finds.map(call => call.entity)).not.toContain(STATE_ENTITY);
    expect(scene.probe.finds.map(call => call.entity)).not.toContain(ENTRY_ENTITY);
  });

  it('两个字段同时提时两道都判：代际对上、工作树脏，仍然被拒', async () => {
    const scene = sceneWith(2, 7);

    await expect(guard(scene, { expectedActivationRevision: 7, requireClean: true })).rejects.toThrowError(
      WorkingTreeDirtyError
    );
  });

  it('代际那道排在 clean 之前：两道都不满足时报的是代际', async () => {
    const scene = sceneWith(2, 7);

    // 顺序反过来的话，用户先被告知「先提交或丢弃」，照做之后才发现分支早就被别处切走了——
    // 而那两条未提交改动此刻已经没了。
    await expect(guard(scene, { expectedActivationRevision: 6, requireClean: true })).rejects.toThrowError(
      StaleActiveBranchError
    );
    expect(scene.probe.statements).toEqual([]);
  });

  it('拒绝之后一行都没动', async () => {
    const scene = sceneWith(2, 7);

    await expect(guard(scene, { expectedActivationRevision: 6 })).rejects.toThrow();

    expect(entryRowsOf(scene)).toHaveLength(2);
    expect(stateRowOf(scene).entryCount).toBe(2);
    expect(scene.probe.saved).toEqual([]);
  });
});

describe('新选项不复用适配器入参（SC-014、R6）', () => {
  it('WorkingTreeSwitchBranchOptions 就是这两个可选字段，不多不少', () => {
    expectTypeOf<WorkingTreeSwitchBranchOptions>().toEqualTypeOf<{
      readonly requireClean?: boolean;
      readonly expectedActivationRevision?: number;
    }>();
  });

  it('适配器那两个成员一个都不在新选项上', () => {
    // `actions` 要调用方自己造一份 `SwitchVersionActions` 才填得出来——那是适配器
    // 内部的重放指令，不是用户该看见的东西。
    expectTypeOf<WorkingTreeSwitchBranchOptions>().not.toHaveProperty('actions');
    expectTypeOf<WorkingTreeSwitchBranchOptions>().not.toHaveProperty('branchId');
  });

  it('适配器入参顶替不了新选项', () => {
    // 单向即可：`SwitchBranchOptions` 的字段全是新选项没有的，反向则因为新选项
    // 两个字段都可选而**恒成立**，断言不了任何东西。
    expectTypeOf<SwitchBranchOptions>().not.toEqualTypeOf<WorkingTreeSwitchBranchOptions>();
    expectTypeOf<SwitchBranchOptions>().toHaveProperty('actions');
  });
});
