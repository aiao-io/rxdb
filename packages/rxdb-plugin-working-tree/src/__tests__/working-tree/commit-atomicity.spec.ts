/**
 * @fileoverview T076 红测试：commit 的四步在**同一个事务**里，崩溃时不留半状态
 * （FR-010、SC-007、conformance-suites.md §2.4）。
 *
 * @remarks
 * 实现目标是 `src/working-tree/commit-command.ts`。
 *
 * 先说清这一层能测什么、不能测什么，免得后面有人往这里加一条测不了的断言：
 * 探针**没有回滚**。它是一组 Map，写进去就在那儿了。所以「崩溃后重开库，要么全有
 * 要么全无」在这一层根本无从观测——那条断言属于 T085，由六个后端上真实的事务与
 * 真实的重启来验（§2.4 第一条）。
 *
 * 这一层能测的是**原子性的前提**，而那些前提恰恰是最容易在实现时被悄悄放弃的：
 *
 * 1. **四步落在同一个事务里**。分两次 `transaction()` 写完，单机上看不出任何区别，
 *    数据库却再也没有能力把它们一起回滚——「原子」这个词在那一刻就已经失效了，
 *    而症状要等到某次真崩溃才出现。
 * 2. **不绕开 executor 直接用适配器**。事务体内调 `adapter.saveMany()` 是外部调用，
 *    会重新排队并排在本事务**之后**（见 `TransactionExecutor.saveMany` 的 TSDoc）——
 *    于是这一笔写不在事务里，回滚回滚不到它。
 * 3. **崩溃原样往上抛**。把异常吞成 `{ ok: false, conflict }` 会让调用方以为这是
 *    一次正常的并发失败、以为重试就好；而崩溃与冲突的出路是相反的——冲突该重读重试，
 *    崩溃该保留现场。
 * 4. **崩溃之后不做补偿写**。手写一串「撤销刚才那几步」的语句在真事务里是多余的
 *    （回滚会把它们一起丢掉），在假事务里是危险的（它自己也可能崩在一半）。
 *    补偿写出现，等于实现根本没在依赖事务。
 * 5. **清空工作树排在写 commit 之后**。反过来的话，写 commit 那一步一崩，
 *    工作树已经空了而历史里什么都没有——用户的未提交变更凭空消失，这是本特性里
 *    唯一一种不可逆的数据丢失。
 * 6. **revision 与 entryCount 是同一次状态转移**。拆成两条语句就等于承认
 *    「中间那一刻它们可以不一致」，而 `status()` 的常数时间判据全建立在两者一致上
 *    （§2.4 第二条）。
 */

import type { TransactionExecutor } from '@aiao/rxdb';
import { getEntityColumnName, getEntityMetadata } from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import { CommitChangeSet } from '../../commit/commit-change-set.entity.js';
import { Commit } from '../../commit/commit.entity.js';
import { commitWorkingTree, type CommitOptions, type CommitResult } from '../../working-tree/commit-command.js';
import { WorkingTreeState } from '../../working-tree/working-tree-state.entity.js';
import { normalizeSql, setClauseOf } from '../commit/fixtures/commit-graph-probe.js';
import {
  createWorkingTreeScene,
  entryRowsOf,
  refRowOf,
  SCENE_BRANCH_ID,
  stateRowOf,
  type WorkingTreeScene
} from './fixtures/working-tree-scene.js';

/** 一组对得上场景初值的捕获型凭据。 */
const credentialsOf = (scene: WorkingTreeScene, overrides: Partial<CommitOptions> = {}): CommitOptions => ({
  authorId: 'alice',
  operationId: 'op-atomic',
  expectedBranch: { branchId: SCENE_BRANCH_ID, activationRevision: 0 },
  expectedHeadRevision: refRowOf(scene).headRevision,
  expectedWorkingTreeRevision: stateRowOf(scene).workingTreeRevision,
  ...overrides
});

/** 跑一次提交。 */
const commitOnce = (scene: WorkingTreeScene, message = '一次提交'): Promise<CommitResult> =>
  commitWorkingTree(scene.probe.executor, scene.context, message, credentialsOf(scene));

/** 取成功出口。 */
const expectOk = (result: CommitResult): Extract<CommitResult, { ok: true }> => {
  if (!result.ok) throw new Error(`期望这次提交成功，实际拿到冲突：${JSON.stringify(result.conflict)}`);
  return result;
};

/** 注入用的故障；用具名子类是为了断言「抛上来的就是它」，而不是形似的另一个。 */
class InjectedCrash extends Error {
  constructor(where: string) {
    super(`注入故障：${where}`);
    this.name = 'InjectedCrash';
  }
}

/**
 * 在 executor 的某个写方法上装一层「先照常写，写完就崩」。
 *
 * @remarks
 * 崩在**第几次调用**上由 `when` 按入参内容决定，而不是按调用序号——序号会把实现内部的
 * 调用顺序钉死进测试，改一次写入顺序就得改这里，而那跟原子性无关。
 */
const crashAfterWriting = (
  scene: WorkingTreeScene,
  method: 'saveMany' | 'removeMany',
  when: (entities: readonly object[]) => boolean,
  crash: InjectedCrash
): void => {
  const executor = scene.probe.executor as unknown as Record<string, unknown>;
  const original = executor[method] as (entities: object[]) => Promise<object[]>;
  // 必须仍是一个 vi.fn：后面有断言直接数 `removeMany` 的调用次数，换成裸函数之后
  // 那条断言会在一个**已经正确**的实现上失败。
  executor[method] = vi.fn(async (entities: object[]) => {
    const written = await original(entities);
    if (when(entities)) throw crash;
    return written;
  }) as unknown as TransactionExecutor['saveMany'];
};

/** 取某个实体某个字段的真实列名；写死 `entry_count` 会在列名被改的那天骗人。 */
const columnOf = (EntityClass: typeof WorkingTreeState, field: string): string => {
  const columnName = getEntityColumnName(getEntityMetadata(EntityClass), field);
  if (!columnName) throw new Error(`${EntityClass.name} 元数据里没有 '${field}' 对应的列`);
  return columnName;
};

/** 挑出打在某张表上的 UPDATE 语句。 */
const updatesAgainst = (scene: WorkingTreeScene, tableName: string): string[] =>
  scene.probe.statements
    .map(normalizeSql)
    .filter(sql => sql.startsWith('update') && new RegExp(`\\b${tableName}\\b`).test(sql));

/** 把待处理的微任务放完，用于识别「返回之后还有异步尾巴」。 */
const flushMicrotasks = async (): Promise<void> => {
  for (let round = 0; round < 5; round += 1) await Promise.resolve();
};

describe('四步同一个事务（FR-010）', () => {
  it('门面 commit() 恰好开一次事务', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry();

    await scene.manager.commit('一次提交', credentialsOf(scene));

    // 「读一次、写一次」分两个事务是最自然的拆法，也正是它让回滚失去对象：
    // 第二个事务崩掉时第一个早已提交，库里留下一个没有工作树变化的 commit。
    expect(scene.adapter.transaction).toHaveBeenCalledTimes(1);
  });

  it('崩溃时也不会另开一个事务补救', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry();
    crashAfterWriting(
      scene,
      'saveMany',
      entities => entities.some(entity => entity instanceof CommitChangeSet),
      new InjectedCrash('写完 changeSet')
    );

    await scene.manager.commit('一次提交', credentialsOf(scene)).catch(() => undefined);

    // 「失败了就开个新事务把刚才那些清掉」听起来像负责任的收尾，实际是把一次
    // 可回滚的失败变成两次各自可能失败的写。
    expect(scene.adapter.transaction).toHaveBeenCalledTimes(1);
  });

  it('写全部经 executor，不碰适配器', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry();

    expectOk(await commitOnce(scene));

    // 事务体内调 adapter.saveMany() 会重新排队并排在本事务**之后**——那一笔写
    // 不在事务里，回滚够不着它。同一个符号名让这个错误在代码里几乎看不出来。
    expect(scene.adapter.saveMany).not.toHaveBeenCalled();
    expect(scene.adapter.removeMany).not.toHaveBeenCalled();
  });
});

describe('崩溃原样冒泡，不被降级成返回值（FR-010）', () => {
  it('写 commit 行时崩溃 → 抛出的就是注入的那个错误', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry();
    const crash = new InjectedCrash('写 commit 行');
    crashAfterWriting(scene, 'saveMany', entities => entities.some(entity => entity instanceof Commit), crash);

    const caught = await commitOnce(scene).then(
      () => null,
      (error: unknown) => error
    );

    // 包一层自己的错误类型会丢掉原始栈，而崩溃现场的栈是这类问题唯一的线索。
    expect(caught).toBe(crash);
  });

  it('清空工作树时崩溃 → 同样抛出，不返回成功', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry();
    const crash = new InjectedCrash('清空工作树');
    crashAfterWriting(scene, 'removeMany', () => true, crash);

    const caught = await commitOnce(scene).then(
      result => result,
      (error: unknown) => error
    );

    // 「commit 行已经写进去了，就算成功吧」是最诱人的那种宽容：它让调用方拿到
    // 一个 commitId，而工作树里那些本该被清掉的条目还在，下一次提交会把它们再提交一遍。
    expect(caught).toBe(crash);
  });

  it('崩溃不被当成 CommitConflict', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry();
    crashAfterWriting(scene, 'removeMany', () => true, new InjectedCrash('清空工作树'));

    const settled = await commitOnce(scene).then(
      result => ({ kind: 'resolved' as const, result }),
      () => ({ kind: 'rejected' as const })
    );

    // 冲突与崩溃的出路是相反的：冲突该重读重试，崩溃该保留现场等人来看。
    // 把后者伪装成前者，调用方会在一个坏掉的库上不停重试。
    expect(settled.kind).toBe('rejected');
  });
});

describe('崩溃之后不做补偿写（FR-010）', () => {
  it('不再发第二批语句，也不重试', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry();
    crashAfterWriting(scene, 'removeMany', () => true, new InjectedCrash('清空工作树'));

    await commitOnce(scene).catch(() => undefined);
    const statementsAtCrash = scene.probe.statements.length;
    await flushMicrotasks();

    // 崩溃之后语句数不再变：既没有补偿写，也没有「再试一次」。
    expect(scene.probe.statements).toHaveLength(statementsAtCrash);
    expect(scene.probe.executor.removeMany).toHaveBeenCalledTimes(1);
  });

  it('不手工把已写入的 commit 行删回去', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry();
    crashAfterWriting(scene, 'removeMany', () => true, new InjectedCrash('清空工作树'));

    await commitOnce(scene).catch(() => undefined);

    // 探针没有回滚，所以这里**应该**看到那行 commit 还躺着——它由事务负责撤销。
    // 实现自己动手删的话，真库上就是在一个即将整体回滚的事务里做无用功，
    // 而在事务被误配成自动提交的那些后端上，这一删会先于回滚生效并留下更乱的现场。
    expect(scene.probe.rowsOf(Commit)).toHaveLength(1);
  });
});

describe('清空工作树排在写 commit 之后（T081、SC-007）', () => {
  it('写完 changeSet 就崩 → 工作树一条都没被清掉', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry();
    scene.addEntry();
    scene.addEntry();
    crashAfterWriting(
      scene,
      'saveMany',
      entities => entities.some(entity => entity instanceof CommitChangeSet),
      new InjectedCrash('写完 changeSet')
    );

    await commitOnce(scene).catch(() => undefined);

    // §2.4 的「绝不出现半清空的工作树」在这一层的落点：顺序反过来（先清空再写 commit）
    // 的实现会在这里只剩 0 条，而历史里什么都没有。
    expect(entryRowsOf(scene)).toHaveLength(3);
  });

  it('清空到一半崩溃时，冗余列没有先一步归零', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry();
    scene.addEntry();
    crashAfterWriting(
      scene,
      'saveMany',
      entities => entities.some(entity => entity instanceof CommitChangeSet),
      new InjectedCrash('写完 changeSet')
    );

    await commitOnce(scene).catch(() => undefined);

    // entryCount 先归零、条目后删，两步之间崩掉就留下「说没有、其实有两条」的状态。
    // 探针不回滚，所以这条断言看的正是实现自己的顺序。
    expect({ rows: entryRowsOf(scene).length, entryCount: stateRowOf(scene).entryCount }).toEqual({
      rows: 2,
      entryCount: 2
    });
  });
});

describe('revision 与 entryCount 是同一次状态转移（§2.4 第二条）', () => {
  it('打在 2.6 上的 UPDATE 恰好一条', async () => {
    const scene = createWorkingTreeScene({ workingTreeRevision: 3 });
    scene.addEntry();

    expectOk(await commitOnce(scene));

    // 两条语句就等于承认「中间那一刻它们可以不一致」。真事务里这一刻外人看不见，
    // 但只要有一天这两条被人挪进不同的分支或不同的函数，它就会变成看得见的。
    expect(updatesAgainst(scene, getEntityMetadata(WorkingTreeState).tableName)).toHaveLength(1);
  });

  it('那一条 UPDATE 的 SET 同时改 revision 与 entryCount', async () => {
    const scene = createWorkingTreeScene({ workingTreeRevision: 3 });
    scene.addEntry();

    expectOk(await commitOnce(scene));

    const [update] = updatesAgainst(scene, getEntityMetadata(WorkingTreeState).tableName);
    const setClause = setClauseOf(update ?? '');
    expect({
      revision: setClause.includes(columnOf(WorkingTreeState, 'workingTreeRevision').toLowerCase()),
      entryCount: setClause.includes(columnOf(WorkingTreeState, 'entryCount').toLowerCase())
    }).toEqual({ revision: true, entryCount: true });
  });
});

describe('清空不是异步尾巴（T081）', () => {
  it('commit() 返回的那一刻工作树已经空了', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry();
    scene.addEntry();

    expectOk(await commitOnce(scene));

    // 「先返回，清空排到下一个 tick」能让 commit 看起来更快，代价是这段时间里
    // `status()` 会报出一批已经提交过的变更，而用户此刻多半正盯着它。
    expect(entryRowsOf(scene)).toHaveLength(0);
  });

  it('返回之后不再有任何写发生', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry();

    expectOk(await commitOnce(scene));
    const settled = { statements: scene.probe.statements.length, saved: scene.probe.saved.length };
    await flushMicrotasks();

    // 事务体一旦返回，executor 就该被视为已关闭；延迟到微任务里的写要么打在一个
    // 已提交的事务上，要么静默失败——两种都不会报错，也都不会留下痕迹。
    expect({ statements: scene.probe.statements.length, saved: scene.probe.saved.length }).toEqual(settled);
  });
});
