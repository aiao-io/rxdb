/**
 * @fileoverview T075 红测试：`discardWorkingTree()` 把当前分支工作树整体回到当前 HEAD；
 * 已 clean 时是 no-op；同样校验三个捕获位（FR-016/031、data-model.md §5、场景 21）。
 *
 * @remarks
 * 实现目标是 `src/working-tree/discard-command.ts` 与门面上的 `discard()`。
 *
 * 这一组防的是四件事：
 *
 * 1. **discard 长出 selection 入参。** 「只丢弃这几个单元」看起来比全量丢弃友好得多，
 *    而它正是硬裁决 1 在 discard 一侧的同一个口子：留下的那一半立刻成为残量，
 *    于是又需要 rebase 与依赖闭包。FR-016 把范围写死成「当前分支工作树**整体**」。
 * 2. **no-op 被实现成「照常走一遍」。** 干净工作树上 discard 若照样把 revision +1，
 *    另一个 realm 手里那份刚读到的 revision 就凭空作废了——它什么都没做，却让别人的
 *    commit 失败。data-model.md §5 脚注写死：**语义 no-op 一律不递增 revision，
 *    判定发生在写 2.6 之前**，不是写完再回滚。
 * 3. **no-op 顺带成了 CAS 的绕过口。** 「反正没东西可丢」听起来可以跳过校验，
 *    但「有没有东西可丢」这个判断本身读的就是可能已经被别人改过的那一行。
 *    所以本文件正面钉住顺序：**先比三个捕获位，再判 no-op**。
 * 4. **discard 顺手把 HEAD 也退一格。** discard 不是 reset --hard HEAD~1。
 *    FR-016 的落点是工作树，2.5 一列都不动，也不写任何提交历史。
 *
 * **US-320 之后 discard 连业务表一起退回 HEAD。** v1 的 discard 只回滚「逻辑工作树」（data-model.md §5 的
 * 三条簿记：revision +1、删条目、`entryCount` 归零），业务表停在丢弃前的值——列表与表单读到的数据与
 * `status()` 报的 clean 从此对不上。跨这条线照当初定下的规矩做：意图枚举加 `working_tree_projection`、
 * `TRUSTED_CALLSITE_REGISTRY` 与 epic-006「受信调用点登记表」加 #15（`discard-command.ts ·
 * rewriteProjectionToHead`）、漂移用例跟着改，而不是在这里随手补一句 `declareTrustedWrite()`。
 * 本文件「回写业务表」一组钉的是这次跨线的形状：一次 `executor.mergeChanges`、触发器照开、
 * 入口是投影重写（回写不再被捕获成单元），排在删条目与推 revision 之前；clean、冲突、
 * 认不出的实体三种情形下一次都不调。
 */

import type { SwitchVersionActions, SwitchVersionChange } from '@aiao/rxdb';
import {
  parseRxDBChangeKey,
  RXDB_CHANGE_CODEC_VERSION,
  RXDB_CHANGE_SCHEMA_VERSION,
  RXDB_CHANGE_VALUE_ENVELOPE_KEY,
  takeDeclaredWrite
} from '@aiao/rxdb';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { CommitCapabilityState } from '../../commit/commit-capability-state.entity.js';
import { CommitChangeSet } from '../../commit/commit-change-set.entity.js';
import type { CommitWriteContext } from '../../commit/commit-context.js';
import { CommitErrorCode } from '../../commit/commit-error-codes.js';
import { Commit } from '../../commit/commit.entity.js';
import type { CommitConflict } from '../../working-tree/commit-conflict.js';
import {
  discardWorkingTree,
  type WorkingTreeDiscardOptions,
  type WorkingTreeDiscardResult
} from '../../working-tree/discard-command.js';
import { readWorkingTreeStatus } from '../../working-tree/status.js';
import { WorkingTreeEntry } from '../../working-tree/working-tree-entry.entity.js';
import { UnknownWorkingTreePatchEntityError } from '../../working-tree/working-tree-patch-codec.js';
import {
  createWorkingTreeScene,
  entryRowsOf,
  refRowOf,
  SCENE_BRANCH_ID,
  SCENE_SECRET,
  seedCommit,
  stateRowOf,
  type WorkingTreeScene
} from './fixtures/working-tree-scene.js';

/** 与场景初值完全对得上的一组捕获型凭据。 */
const credentialsOf = (
  scene: WorkingTreeScene,
  overrides: Partial<WorkingTreeDiscardOptions> = {}
): WorkingTreeDiscardOptions => ({
  expectedBranch: { branchId: SCENE_BRANCH_ID, activationRevision: 0 },
  expectedHeadRevision: refRowOf(scene).headRevision,
  expectedWorkingTreeRevision: stateRowOf(scene).workingTreeRevision,
  ...overrides
});

/** 跑一次丢弃。 */
const discardOnce = (
  scene: WorkingTreeScene,
  overrides: Partial<WorkingTreeDiscardOptions> = {}
): Promise<WorkingTreeDiscardResult> =>
  discardWorkingTree(scene.probe.executor, scene.context, credentialsOf(scene, overrides));

/** 把一段 hex 包成 change-codec 的 `$rxdbChangeValue` 信封——不加密 binary 列在条目里的形态。 */
const binaryEnvelope = (hex: string): Record<string, unknown> => ({
  [RXDB_CHANGE_VALUE_ENVELOPE_KEY]: {
    codecVersion: RXDB_CHANGE_CODEC_VERSION,
    schemaVersion: RXDB_CHANGE_SCHEMA_VERSION,
    type: 'binary',
    value: hex
  }
});

/** 一个桶按身份摊开成 `namespace:entity:entityId` → 两份补丁，便于整桶 `toEqual`。 */
const bucketOf = (bucket: ReadonlyMap<string, SwitchVersionChange>): Record<string, unknown> =>
  Object.fromEntries(
    [...bucket].map(([key, change]) => {
      const [namespace, entity, entityId] = parseRxDBChangeKey(key);
      return [`${namespace}:${entity}:${String(entityId)}`, { patch: change.patch, inversePatch: change.inversePatch }];
    })
  );

/** 三个桶一起摊开；断言整份回写而不是挑一个桶看，漏掉的那一桶才会红。 */
const actionsShapeOf = (actions: SwitchVersionActions): Record<string, unknown> => ({
  deletes: bucketOf(actions.deletes),
  updates: bucketOf(actions.updates),
  inserts: bucketOf(actions.inserts)
});

/** 那次回写交给 `mergeChanges` 的三个实参；要求恰好调了一次。 */
const rewriteCallOf = (scene: WorkingTreeScene): Parameters<WorkingTreeScene['probe']['executor']['mergeChanges']> => {
  const calls = vi.mocked(scene.probe.executor.mergeChanges).mock.calls;
  expect(calls, '回写应当恰好一次 mergeChanges').toHaveLength(1);
  return calls[0];
};

/** 取成功出口，拿到别的就直接炸，免得后续断言在 undefined 上继续。 */
const expectOk = (result: WorkingTreeDiscardResult): Extract<WorkingTreeDiscardResult, { ok: true }> => {
  if (!result.ok) throw new Error(`期望这次丢弃成功，实际拿到冲突：${JSON.stringify(result.conflict)}`);
  return result;
};

/** 取冲突出口。 */
const expectConflict = (result: WorkingTreeDiscardResult): CommitConflict => {
  if (result.ok) throw new Error(`期望这次丢弃返回冲突，实际丢掉了 ${result.discardedCount} 个单元`);
  return result.conflict;
};

describe('范围是整棵工作树，签名里没有 selection（FR-016）', () => {
  it('WorkingTreeDiscardOptions 的键集恰好是三个捕获位', () => {
    // 键集而不是点名：点名只挡得住 units / entities / only 这几个想得到的名字。
    // 这三个之外的任何一个字段，要么是选择范围（硬裁决 1 的口子），要么是
    // authorId / operationId——而 discard **不写 commit**，给它作者与幂等键
    // 等于暗示库里会留下一条「某人丢弃过什么」的记录，那条记录不存在。
    expectTypeOf<keyof WorkingTreeDiscardOptions>().toEqualTypeOf<
      'expectedBranch' | 'expectedHeadRevision' | 'expectedWorkingTreeRevision'
    >();
  });

  it('凭据是必填的末位参，不是可选的便利入参', () => {
    // 元组长度恰好是 3：可选末参会让它变成 `2 | 3`，而「可选」等于允许
    // 「缺省时由本次调用内部读取 revision」——内部读到的值恒等于当前值，
    // CAS 于是永远命中，FR-031 对 discard 的那半句当场失效。
    expectTypeOf<Parameters<typeof discardWorkingTree>['length']>().toEqualTypeOf<3>();
    expectTypeOf<Parameters<typeof discardWorkingTree>[2]>().toEqualTypeOf<WorkingTreeDiscardOptions>();
  });

  it('第二参是写上下文：回写要解码条目补丁，与 commit / restore 同形（US-320）', () => {
    // 条目里的 bigint / binary 列是 `$rxdbChangeValue` 信封，不解开就交给 mergeChanges 会在适配器的
    // 类型转换上炸掉；解码要实体元数据，而元数据只在门面握着的那个适配器上——与 commit() / restore()
    // 同一个来源、同一个形参位置。
    expectTypeOf<Parameters<typeof discardWorkingTree>[1]>().toEqualTypeOf<CommitWriteContext>();
  });

  it('门面上的 discard() 恰好收一个位置参数', () => {
    const scene = createWorkingTreeScene();

    expect(scene.manager.discard).toHaveLength(1);
  });

  it('三个单元一次全丢，不留残量', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry({ entityId: 'note-a' });
    scene.addEntry({ entityId: 'note-b' });
    scene.addEntry({ entityId: 'note-c' });

    const result = expectOk(await discardOnce(scene));

    // 留下任何一条都意味着此后需要回答「剩下的那条相对谁」——而 v1 只有
    // `HEAD ↔ 工作树` 一条 diff 轴，没有第二个参照物可以描述残量。
    expect({ discarded: result.discardedCount, left: entryRowsOf(scene).length }).toEqual({ discarded: 3, left: 0 });
  });

  it('WorkingTreeDiscardResult 的成功出口只有三个键', async () => {
    const scene = createWorkingTreeScene({ workingTreeRevision: 4 });
    scene.addEntry();

    const result = expectOk(await discardOnce(scene));

    // 没有 `noop: boolean`：`discardedCount === 0` 就是 no-op，多一个布尔位
    // 就是第二份真相，而两份真相里迟早有一份是旧的。
    expect(Object.keys(result).sort()).toEqual(['discardedCount', 'ok', 'workingTreeRevision']);
  });
});

describe('脏工作树：条目清空、entryCount 归零、revision +1（data-model.md §5）', () => {
  it('条目行与冗余列一起归零', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry();
    scene.addEntry();

    expectOk(await discardOnce(scene));

    // 两者分家的那一刻，`status()` 的常数时间判据就开始撒谎：冗余列说还有两条，
    // 表里一条都没有，而 `status()` 只读冗余列。
    expect({ rows: entryRowsOf(scene).length, entryCount: stateRowOf(scene).entryCount }).toEqual({
      rows: 0,
      entryCount: 0
    });
  });

  it('workingTreeRevision 恰好推进一格，返回值与库里那一行一致', async () => {
    const scene = createWorkingTreeScene({ workingTreeRevision: 5 });
    scene.addEntry();

    const result = expectOk(await discardOnce(scene));

    expect({ returned: result.workingTreeRevision, row: stateRowOf(scene).workingTreeRevision }).toEqual({
      returned: 6,
      row: 6
    });
  });

  it('丢弃之后 status() 报 clean', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry({ origin: 'local' });
    scene.addEntry({ origin: 'remote_sync' });

    expectOk(await discardOnce(scene));
    const status = await readWorkingTreeStatus(scene.probe.executor);

    // 远端同步写进来的单元照样被丢掉：`remote_sync` 不豁免（硬裁决 6）。
    // 按来源留一半的话，「整体回到 HEAD」就成了「回到 HEAD 加上远端那部分」。
    expect({ clean: status.clean, entryCount: status.entryCount, byOrigin: status.byOrigin }).toEqual({
      clean: true,
      entryCount: 0,
      byOrigin: { local: 0, remote_sync: 0 }
    });
  });

  it('HEAD 一列都不动——discard 不是 reset 到 HEAD~1', async () => {
    const scene = createWorkingTreeScene({ headRevision: 3, headCommitId: 'commit-head' });
    // HEAD 得真有一条 commit 行：discard 在动工前要过一遍提交图守卫（T084），
    // 只在 ref 上写个 id、历史里没有对应节点的场景会以 `commit_graph_corrupted` 拒绝，
    // 于是这条用例想盯的「HEAD 一列都不动」根本没跑到。
    seedCommit(scene, 'commit-head');
    scene.addEntry();

    expectOk(await discardOnce(scene));

    expect({
      headRevision: refRowOf(scene).headRevision,
      headCommitId: refRowOf(scene).headCommitId,
      baseHeadCommitId: stateRowOf(scene).baseHeadCommitId
    }).toEqual({ headRevision: 3, headCommitId: 'commit-head', baseHeadCommitId: 'commit-head' });
  });

  it('不写任何提交历史', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry();

    expectOk(await discardOnce(scene));

    // 「丢弃前先偷偷存一份」是最容易被当成贴心的那个设计：它让历史里出现用户
    // 从未提交过的节点，而每一个都推进了 headRevision。
    expect({ commits: scene.probe.rowsOf(Commit), changeSets: scene.probe.rowsOf(CommitChangeSet) }).toEqual({
      commits: [],
      changeSets: []
    });
  });

  it('只丢当前分支的条目，隔壁分支的未提交变更原样留着', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry({ entityId: 'note-mine' });
    scene.addEntry({ id: 'entry-foreign', branchId: 'feature-x', entityId: 'note-theirs' });

    const result = expectOk(await discardOnce(scene));

    // 不带 branchId 的 DELETE 在单分支的库上永远绿，在真实用户的库上一次就把
    // 另一条分支的工作成果抹掉——而那条分支此刻甚至不是 active，没人在看。
    const left = entryRowsOf(scene);
    expect({ discarded: result.discardedCount, leftIds: left.map(row => row.id) }).toEqual({
      discarded: 1,
      leftIds: ['entry-foreign']
    });
  });
});

describe('clean 时是 no-op：一格 revision 都不涨（data-model.md §5 脚注）', () => {
  it('干净工作树上返回 ok，discardedCount 为 0', async () => {
    const scene = createWorkingTreeScene({ workingTreeRevision: 4 });

    const result = expectOk(await discardOnce(scene));

    // no-op 不是失败：调用方「让工作树回到 HEAD」这个诉求已经满足了。
    expect(result.discardedCount).toBe(0);
  });

  it('revision 不递增，返回的也是原值', async () => {
    const scene = createWorkingTreeScene({ workingTreeRevision: 4 });

    const result = expectOk(await discardOnce(scene));

    // 平白 +1 会让另一个 realm 手里那份刚读到的 revision 凭空作废：
    // 这次 discard 什么都没做，却让别人的 commit 失败一次。
    expect({ returned: result.workingTreeRevision, row: stateRowOf(scene).workingTreeRevision }).toEqual({
      returned: 4,
      row: 4
    });
  });

  it('判定发生在写之前，不是写完再回滚：一条写语句都没发出去', async () => {
    const scene = createWorkingTreeScene({ workingTreeRevision: 4 });

    expectOk(await discardOnce(scene));

    // 「先 +1 再发现没东西可丢、于是回滚」在单机上看不出区别，在一个把
    // revision 序列当水位线读的订阅端上是一次实打实的抖动。
    expect(scene.probe.saved).toEqual([]);
    expect(scene.probe.statements.filter(sql => /\b(update|delete)\b/i.test(sql))).toEqual([]);
  });

  it('连着丢两次：第二次是 no-op，revision 只涨了一格', async () => {
    const scene = createWorkingTreeScene({ workingTreeRevision: 4 });
    scene.addEntry();

    expectOk(await discardOnce(scene));
    const second = expectOk(await discardOnce(scene));

    // 幂等性正来自「no-op 不递增」：否则重试一次失败的调用会让 revision
    // 走得比实际发生过的变更还快。
    expect({ discarded: second.discardedCount, revision: stateRowOf(scene).workingTreeRevision }).toEqual({
      discarded: 0,
      revision: 5
    });
  });
});

describe('三个捕获位同样要比，且比在 no-op 判定之前（FR-031/034）', () => {
  it('工作树 revision 不匹配 → working_tree_revision', async () => {
    const scene = createWorkingTreeScene({ headRevision: 2, workingTreeRevision: 5 });
    scene.addEntry();

    const conflict = expectConflict(await discardOnce(scene, { expectedWorkingTreeRevision: 4 }));

    expect(conflict).toEqual({
      kind: 'working_tree_revision',
      expected: 4,
      actual: 5,
      branchId: SCENE_BRANCH_ID
    });
  });

  it('head revision 不匹配 → head_revision', async () => {
    const scene = createWorkingTreeScene({ headRevision: 2 });
    scene.addEntry();

    const conflict = expectConflict(await discardOnce(scene, { expectedHeadRevision: 1 }));

    // discard 不动 HEAD，所以「只比工作树那一个就够了」很像成立。它不成立：
    // 用户按下丢弃时看到的是「相对 HEAD 有这些改动」，HEAD 变了，
    // 他要丢的那份 diff 已经不是眼前这份了。
    expect(conflict).toEqual({ kind: 'head_revision', expected: 1, actual: 2, branchId: SCENE_BRANCH_ID });
  });

  it('activation revision 不匹配 → activation_revision', async () => {
    const scene = createWorkingTreeScene({ activationRevision: 7 });
    scene.addEntry();

    const conflict = expectConflict(
      await discardOnce(scene, { expectedBranch: { branchId: SCENE_BRANCH_ID, activationRevision: 6 } })
    );

    expect(conflict).toEqual({ kind: 'activation_revision', expected: 6, actual: 7, branchId: SCENE_BRANCH_ID });
  });

  it('捕获的分支不是当前 active 分支 → activation_revision，且不落到那条分支上', async () => {
    const scene = createWorkingTreeScene({ activationRevision: 3 });
    scene.addEntry();

    const conflict = expectConflict(
      await discardOnce(scene, { expectedBranch: { branchId: 'feature-x', activationRevision: 3 } })
    );

    // 事务内重新读一次 active 分支再把这次丢弃归过去，等于在用户以为自己站在
    // feature-x 上时抹掉 main 的工作树。
    expect(conflict.kind).toBe('activation_revision');
    expect(entryRowsOf(scene)).toHaveLength(1);
  });

  it('干净工作树上凭据过期，仍然是冲突而不是 no-op', async () => {
    const scene = createWorkingTreeScene({ workingTreeRevision: 5 });

    const conflict = expectConflict(await discardOnce(scene, { expectedWorkingTreeRevision: 4 }));

    // 这条是本组的重点：「反正没东西可丢」听起来可以跳过校验，可「有没有东西可丢」
    // 读的正是那一行可能已经被别人改过的状态——别人刚 commit 完，工作树确实空了，
    // 而调用方手里那份 revision 早就过期。先判 no-op 的实现在这里会返回成功，
    // 并让调用方以为自己丢掉的是他看过的那些改动。
    expect(conflict.kind).toBe('working_tree_revision');
  });

  it('冲突是返回值不是异常，且一个字节都不落地', async () => {
    const scene = createWorkingTreeScene({ workingTreeRevision: 5 });
    scene.addEntry();
    scene.addEntry();

    const result = await discardOnce(scene, { expectedWorkingTreeRevision: 4 });

    expect(result.ok).toBe(false);
    expect({
      rows: entryRowsOf(scene).length,
      entryCount: stateRowOf(scene).entryCount,
      revision: stateRowOf(scene).workingTreeRevision,
      saved: scene.probe.saved
    }).toEqual({ rows: 2, entryCount: 2, revision: 5, saved: [] });
  });

  it('不自动重试：CAS 失败后不再发第二次写语句', async () => {
    const scene = createWorkingTreeScene({ workingTreeRevision: 5 });
    scene.addEntry();

    expectConflict(await discardOnce(scene, { expectedWorkingTreeRevision: 4 }));

    // 自动重试第二次读到的是**新**的 revision，于是必然成功——用户丢掉的
    // 是他没看过的那份工作树，而且不可撤销。
    expect(scene.probe.statements.filter(sql => /\b(update|delete)\b/i.test(sql))).toEqual([]);
  });
});

describe('回写业务表：条目的 inversePatch 把业务行退回 HEAD（US-320 AC1）', () => {
  it('跨实体的插入、修改与删除各自撤回：一次 mergeChanges，触发器照开', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry({ entityId: 'note-new', operation: 'insert', patch: { title: '新建' }, inversePatch: null });
    scene.addEntry({
      entityId: 'note-edit',
      operation: 'update',
      patch: { title: '改后' },
      inversePatch: { title: '改前' }
    });
    scene.addEntry({ entityId: 'note-gone', operation: 'delete', patch: null, inversePatch: { title: '删前' } });
    scene.addEntry({
      namespace: SCENE_SECRET.namespace,
      entity: SCENE_SECRET.name,
      entityId: 'secret-1',
      operation: 'update',
      patch: { label: '改后', secret: 'enc:v1:after', thumbnail: binaryEnvelope('deadbeef') },
      inversePatch: { label: '改前', secret: 'enc:v1:before', thumbnail: binaryEnvelope('cafebabe') }
    });

    expectOk(await discardOnce(scene));
    const [actions, localChanges, disableTriggers] = rewriteCallOf(scene);

    // 插入撤成删除、删除撤成插入（整行取 inversePatch，那是 HEAD 上的那一行）、修改把 inversePatch 写回去。
    // 不加密的 binary 列解开信封交给适配器，加密列保持信封原样——密文由适配器解锁后重新加密，
    // 这一层碰不到明文。
    expect(actionsShapeOf(actions)).toEqual({
      deletes: { 'app:Note:note-new': { patch: null, inversePatch: { title: '新建' } } },
      updates: {
        'app:Note:note-edit': { patch: { title: '改前' }, inversePatch: { title: '改后' } },
        'app:Secret:secret-1': {
          patch: { label: '改前', secret: 'enc:v1:before', thumbnail: Uint8Array.of(0xca, 0xfe, 0xba, 0xbe) },
          inversePatch: { label: '改后', secret: 'enc:v1:after', thumbnail: Uint8Array.of(0xde, 0xad, 0xbe, 0xef) }
        }
      },
      inserts: { 'app:Note:note-gone': { patch: { title: '删前' }, inversePatch: null } }
    });
    // 触发器开着写（`disableTriggers = false`）：回写是当前分支上的一次新写入，变更日志要跟着它走——
    // 切分支按变更日志撤投影、同步按它推送、撤销栈也读它。关掉的话日志里只剩被丢弃的那批编辑，
    // 切走再切回来它们会被重放回业务表，而工作树报 clean。
    expect({ localChanges, disableTriggers }).toEqual({ localChanges: undefined, disableTriggers: false });
  });

  it('声明在 mergeChanges 被调到的那一刻挂在执行器上：登记表 #15，入口是投影重写', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry();
    const executor = scene.probe.executor;
    let declared: ReturnType<typeof takeDeclaredWrite>;
    vi.mocked(executor.mergeChanges).mockImplementation(async () => {
      declared = takeDeclaredWrite(executor);
    });

    expectOk(await discardOnce(scene));

    // 投影重写（projection_rewrite）而不是领域重算（domain_recompute）：条目由命令自己删，回写要是
    // 被挂载点 2 当成一次新编辑捕获下来，刚丢掉的工作树立刻又多出一批条目。
    expect(declared).toEqual({
      file: 'discard-command.ts',
      symbol: 'rewriteProjectionToHead',
      intent: 'working_tree_projection',
      entrance: 'projection_rewrite'
    });
  });

  it('先回写业务表，再删条目、推 revision：同一笔事务里两件事一起成败', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry();

    expectOk(await discardOnce(scene));

    // 顺序本身不是原子性的来源（那是调用方的事务），但它决定了回写抛错时手上还剩什么：排在前面的话，
    // 一条簿记语句都还没发；排在后面的话，失败前条目已经删了、revision 已经推了，全靠回滚兜着。
    const writes = scene.probe.trace.filter(step => ['mergeChanges', 'removeMany', 'query'].includes(step));
    expect(writes).toEqual(['mergeChanges', 'removeMany', 'query']);
  });

  it('簿记字段不跟着回写：UPDATE 撤回时 remoteId 与审计时间保持现值', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry({
      entityId: 'note-synced',
      operation: 'update',
      patch: { title: '改后', remoteId: 'remote-1', updatedAt: '2026-11-17T02:00:00.000Z' },
      inversePatch: { title: '改前', remoteId: null, updatedAt: '2026-11-17T01:00:00.000Z' }
    });

    expectOk(await discardOnce(scene));
    const [actions] = rewriteCallOf(scene);

    // 簿记字段不进版本控制（epic-006「版本化域」第 2 类）：把 remoteId 退回旧值会断开本地行与远端行的对应，
    // 审计时间则本来就由适配器按「此刻」重写。回写只退 tracked 字段。
    expect(bucketOf(actions.updates)).toEqual({
      'app:Note:note-synced': { patch: { title: '改前' }, inversePatch: { title: '改后' } }
    });
  });

  it('只剩簿记字段可撤的 UPDATE 不发写；条目照样清掉', async () => {
    const scene = createWorkingTreeScene({ workingTreeRevision: 2 });
    scene.addEntry({
      operation: 'update',
      patch: { updatedAt: '2026-11-17T02:00:00.000Z' },
      inversePatch: { updatedAt: '2026-11-17T01:00:00.000Z' }
    });

    const result = expectOk(await discardOnce(scene));

    // 没有可写的 tracked 字段就没有回写：照样调一次空的 mergeChanges 会白白取走一张声明、什么都不落。
    expect(scene.probe.executor.mergeChanges).not.toHaveBeenCalled();
    expect({ result, rows: entryRowsOf(scene).length }).toEqual({
      result: { ok: true, discardedCount: 1, workingTreeRevision: 3 },
      rows: 0
    });
  });

  it('clean 时一次 mergeChanges 都不调（AC2）', async () => {
    const scene = createWorkingTreeScene({ workingTreeRevision: 4 });

    expectOk(await discardOnce(scene));

    expect(scene.probe.executor.mergeChanges).not.toHaveBeenCalled();
  });

  it('凭据过期时一次 mergeChanges 都不调', async () => {
    const scene = createWorkingTreeScene({ workingTreeRevision: 5 });
    scene.addEntry();

    expectConflict(await discardOnce(scene, { expectedWorkingTreeRevision: 4 }));

    // 冲突出口排在任何写之前：业务表若先被退回 HEAD，用户拿到的是「冲突」，库里却已经丢了一半。
    expect(scene.probe.executor.mergeChanges).not.toHaveBeenCalled();
  });

  it('条目指向本客户端认不出的实体：回写之前就抛，条目与 revision 一格不动', async () => {
    const scene = createWorkingTreeScene({ workingTreeRevision: 3 });
    scene.addEntry({ entityId: 'note-known' });
    scene.addEntry({ namespace: 'app', entity: 'Ghost', entityId: 'ghost-1' });

    const error = await discardOnce(scene).then(
      () => null,
      (caught: unknown) => caught
    );

    // 没有元数据就写不了那张表。只退认得的那一半再报成功，等于把「回到 HEAD」悄悄降级成「大部分回到 HEAD」——
    // 而 status() 会报 clean。宁可整次拒绝。
    expect(error).toBeInstanceOf(UnknownWorkingTreePatchEntityError);
    expect(scene.probe.executor.mergeChanges).not.toHaveBeenCalled();
    expect({ rows: entryRowsOf(scene).length, revision: stateRowOf(scene).workingTreeRevision }).toEqual({
      rows: 2,
      revision: 3
    });
  });

  it('回写抛错原样上抛，后面的簿记一条都不发（AC4 的命令侧半边）', async () => {
    const scene = createWorkingTreeScene({ workingTreeRevision: 6 });
    scene.addEntry();
    const injected = new Error('注入：回写失败');
    vi.mocked(scene.probe.executor.mergeChanges).mockRejectedValueOnce(injected);

    const error = await discardOnce(scene).then(
      () => null,
      (caught: unknown) => caught
    );

    // 真实后端上整笔回滚由一致性套件在六个后端上证（worktree.suite.ts「回写中途失败」）；这里证的是
    // 命令没有吞掉它、也没有在失败之后接着删条目。
    expect(error).toBe(injected);
    expect({ rows: entryRowsOf(scene).length, revision: stateRowOf(scene).workingTreeRevision }).toEqual({
      rows: 1,
      revision: 6
    });
  });

  it('删的是工作树条目表；业务表只经那一次受信回写', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry();

    expectOk(await discardOnce(scene));

    const entryReads = scene.probe.finds.filter(call => call.entity === 'WorkingTreeEntry');
    expect(entryReads.length).toBeGreaterThan(0);
    expect(scene.probe.rowsOf(WorkingTreeEntry)).toEqual([]);
    // 业务实体一次 save / remove 都没有：回写不走仓库，走的是登记过的那一个写原语。
    expect(scene.probe.saved).toEqual([]);
  });
});

describe('损坏分支上拒绝丢弃（FR-051、T084 的 discard 半边）', () => {
  it('分支已被标记 corrupted_read_only 时以 commit_graph_corrupted 拒绝', async () => {
    const scene = createWorkingTreeScene({ headCommitId: 'commit-head', headRevision: 1 });
    scene.addEntry();
    refRowOf(scene).status = 'corrupted_read_only';
    refRowOf(scene).corruptedAt = new Date('2026-01-02T00:00:00.000Z');

    const error = await discardOnce(scene).then(
      () => null,
      (caught: unknown) => caught
    );

    // 守卫用 T038 那一份，不在 discard 里另写判定：三入口拒绝码相同才让
    // 调用方有一个稳定的 catch 分支。
    expect((error as { code?: unknown }).code).toBe(CommitErrorCode.commit_graph_corrupted);
  });

  it('拒绝时保留原 ref、不删任何条目', async () => {
    const scene = createWorkingTreeScene({ headCommitId: 'commit-head', headRevision: 1 });
    scene.addEntry();
    scene.addEntry();
    refRowOf(scene).status = 'corrupted_read_only';
    refRowOf(scene).corruptedAt = new Date('2026-01-02T00:00:00.000Z');

    await discardOnce(scene).catch(() => undefined);

    // 「反正这个分支坏了，顺手清干净」会让用户在唯一还能导出诊断的时刻失去
    // 未提交的那部分数据。
    expect({
      rows: entryRowsOf(scene).length,
      headCommitId: refRowOf(scene).headCommitId,
      status: refRowOf(scene).status
    }).toEqual({ rows: 2, headCommitId: 'commit-head', status: 'corrupted_read_only' });
  });
});

describe('门面上的 discard()（contracts/core-api.md §3）', () => {
  it('返回值与直接调 discardWorkingTree() 一致', async () => {
    const scene = createWorkingTreeScene({ headRevision: 2, workingTreeRevision: 4 });
    scene.addEntry();

    const viaFacade = await scene.manager.discard(credentialsOf(scene));

    expect(viaFacade).toEqual({ ok: true, discardedCount: 1, workingTreeRevision: 5 });
  });

  it('未启用的库上零参调用被门禁拒绝，而不是先抱怨缺参数', async () => {
    const scene = createWorkingTreeScene();
    (scene.probe.rowsOf(CommitCapabilityState)[0] as CommitCapabilityState).enabled = false;

    const error = await (scene.manager.discard as () => Promise<unknown>)().then(
      () => null,
      (caught: unknown) => caught
    );

    // 参数校验必须写在 runEnabled() 的 run 回调里：写在外面的话，未启用的库
    // 会先回答「expectedBranch 不能为空」——一个在这个库上根本无从谈起的问题。
    expect((error as { code?: unknown }).code).toBe(CommitErrorCode.commit_capability_disabled);
  });
});
