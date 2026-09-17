/**
 * @fileoverview T070 红测试：`diff()` 只有 `HEAD ↔ 工作树` **一条轴**，粒度可选
 * 实体或完整事务（FR-005、硬裁决 2）。
 *
 * @remarks
 * 实现目标是 `src/working-tree/diff.ts` 与门面上的 `diff()`。
 *
 * 「只有一条轴」这句话很容易被读成一句风格建议，于是实现里悄悄长出
 * `diff({ from: commitA, to: commitB })`。它不是多一个便利入参：一旦存在第二条轴，
 * `status()` 的 `clean` 与 `diff()` 的结果就不再指同一件事，而 v1 的全部 CAS
 * 都建立在「工作树只与当前 HEAD 比较」之上。所以本文件用**键集断言**而不是点名断言——
 * 点名断言只能挡住你想得到的那几个名字，键集断言把没想到的也一起挡住。
 *
 * 这里不测补丁内容本身：那是 `working-tree-patch-codec.spec.ts` 与
 * `cold-replay.spec.ts` 的事，diff 只负责把库里的单元按粒度摊出来。
 */

import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  readWorkingTreeDiff,
  type WorkingTreeDiff,
  type WorkingTreeDiffEntry,
  type WorkingTreeDiffOptions
} from '../../working-tree/diff.js';
import { createWorkingTreeScene, SCENE_BRANCH_ID } from './fixtures/working-tree-scene.js';

/** 一次默认粒度（实体）的 diff。 */
const diffOf = (
  scene: ReturnType<typeof createWorkingTreeScene>,
  options?: WorkingTreeDiffOptions
): Promise<WorkingTreeDiff> => readWorkingTreeDiff(scene.probe.executor, SCENE_BRANCH_ID, options);

describe('只有 HEAD ↔ 工作树 一条轴（FR-005、硬裁决 2）', () => {
  it('WorkingTreeDiffOptions 的键集是封闭的，不含任何指向第二个比较端的入参', () => {
    // 键集而不是点名：点名只能挡住 from / to / base / target 这几个想得到的名字。
    expectTypeOf<keyof WorkingTreeDiffOptions>().toEqualTypeOf<'granularity' | 'entities' | 'limit' | 'cursor'>();
  });

  it('运行期传入第二条轴的入参也不会被认领', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry();

    const polluted = { granularity: 'entity', from: 'commit-a', to: 'commit-b', ref: 'main' } as WorkingTreeDiffOptions;
    const result = await diffOf(scene, polluted);

    // 实现若把 options 整个 Object.assign 进查询条件，这里会少读到那一条单元。
    expect(result.entries).toHaveLength(1);
  });

  it('返回值自报比较的两端，且右端恒为当前工作树 revision', async () => {
    const scene = createWorkingTreeScene({ headCommitId: 'commit-head', workingTreeRevision: 4 });
    scene.addEntry();

    const result = await diffOf(scene);

    expect({
      branchId: result.branchId,
      baseHeadCommitId: result.baseHeadCommitId,
      workingTreeRevision: result.workingTreeRevision
    }).toEqual({ branchId: SCENE_BRANCH_ID, baseHeadCommitId: 'commit-head', workingTreeRevision: 4 });
  });

  it('空分支上左端是 null，而不是某个「初始 commit」', async () => {
    const scene = createWorkingTreeScene({ headCommitId: null });

    const result = await diffOf(scene);

    // 编一个起点出来会让「这个分支还没有任何提交」与「这个分支从某处分出来」
    // 在返回值上无法区分。
    expect(result.baseHeadCommitId).toBeNull();
  });
});

describe('两种粒度：实体与完整事务', () => {
  it('默认粒度是实体，一条单元一行', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry({ entityId: 'note-a', transactionId: 'tx-1' });
    scene.addEntry({ entityId: 'note-b', transactionId: 'tx-1' });

    const result = await diffOf(scene);

    expect(result.granularity).toBe('entity');
    expect(result.entries.map(entry => entry.entityId)).toEqual(['note-a', 'note-b']);
  });

  it('事务粒度把同一个 transactionId 的单元收进一组', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry({ entityId: 'note-a', transactionId: 'tx-1' });
    scene.addEntry({ entityId: 'note-b', transactionId: 'tx-1' });
    scene.addEntry({ entityId: 'note-c', transactionId: 'tx-2' });

    const result = await diffOf(scene, { granularity: 'transaction' });

    expect(
      result.transactions.map(group => ({
        transactionId: group.transactionId,
        entityIds: group.entries.map(entry => entry.entityId)
      }))
    ).toEqual([
      { transactionId: 'tx-1', entityIds: ['note-a', 'note-b'] },
      { transactionId: 'tx-2', entityIds: ['note-c'] }
    ]);
  });

  it('transactionId 为 null 的单元各自成组，不被并进同一个「无事务」桶', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry({ entityId: 'note-a', transactionId: null });
    scene.addEntry({ entityId: 'note-b', transactionId: null });

    const result = await diffOf(scene, { granularity: 'transaction' });

    // 并成一桶等于宣称这两次互不相干的 save() 属于同一个原子操作，
    // 而用户在界面上看到的是「撤销这一组」。
    expect(result.transactions.map(group => group.entries.length)).toEqual([1, 1]);
    expect(result.transactions.every(group => group.transactionId === null)).toBe(true);
  });

  it('实体粒度下 transactions 为空数组，事务粒度下 entries 为空数组', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry({ transactionId: 'tx-1' });

    const byEntity = await diffOf(scene, { granularity: 'entity' });
    const byTransaction = await diffOf(scene, { granularity: 'transaction' });

    // 两边都填等于同一份数据存两份，其中一份迟早在某次改动里没跟上。
    expect({ entries: byEntity.entries.length, transactions: byEntity.transactions.length }).toEqual({
      entries: 1,
      transactions: 0
    });
    expect({ entries: byTransaction.entries.length, transactions: byTransaction.transactions.length }).toEqual({
      entries: 0,
      transactions: 1
    });
  });
});

describe('diff 条目带齐重放所需的全部字段', () => {
  it('一条 entry 的键集与 CommitChangeSet 的九列对齐', () => {
    expectTypeOf<keyof WorkingTreeDiffEntry>().toEqualTypeOf<
      | 'unitId'
      | 'transactionId'
      | 'namespace'
      | 'entity'
      | 'entityId'
      | 'operation'
      | 'patch'
      | 'inversePatch'
      | 'origin'
    >();
  });

  it('不带 sourceChangeId——它只诊断，且指向会被清理的行', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry({ sourceChangeId: 42 });

    const [entry] = (await diffOf(scene)).entries;

    // `rxdb_change` 会被删分支级联 / 压缩合并 / 失效清理，把它摊进 diff 等于
    // 邀请调用方拿它当重放数据来源。
    expect(Object.keys(entry as object)).not.toContain('sourceChangeId');
  });

  it('remote_sync 来源的单元照样出现在 diff 里（硬裁决 6）', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry({ entityId: 'note-local', origin: 'local' });
    scene.addEntry({ entityId: 'note-remote', origin: 'remote_sync' });

    const result = await diffOf(scene);

    expect(result.entries.map(entry => entry.origin).sort()).toEqual(['local', 'remote_sync']);
  });
});

describe('按实体名过滤与分页', () => {
  it('entities 过滤只保留点名的实体', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry({ entity: 'Note', entityId: 'note-a' });
    scene.addEntry({ entity: 'Tag', entityId: 'tag-a' });

    const result = await diffOf(scene, { entities: ['Tag'] });

    expect(result.entries.map(entry => entry.entity)).toEqual(['Tag']);
  });

  it('limit 截断，并带回可续读的游标', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry({ id: 'entry-a', entityId: 'note-a' });
    scene.addEntry({ id: 'entry-b', entityId: 'note-b' });
    scene.addEntry({ id: 'entry-c', entityId: 'note-c' });

    const first = await diffOf(scene, { limit: 2 });

    expect(first.entries.map(entry => entry.entityId)).toEqual(['note-a', 'note-b']);
    expect(first.nextCursor).toBe('entry-b');
  });

  it('续读从游标之后接着给，读完时游标为 null', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry({ id: 'entry-a', entityId: 'note-a' });
    scene.addEntry({ id: 'entry-b', entityId: 'note-b' });
    scene.addEntry({ id: 'entry-c', entityId: 'note-c' });

    const second = await diffOf(scene, { limit: 2, cursor: 'entry-b' });

    // keyset 而不是 offset：offset 在两次读之间有人 save() 时会漏行或重复行，
    // 而工作树在用户浏览 diff 的同时仍然可写。
    expect(second.entries.map(entry => entry.entityId)).toEqual(['note-c']);
    expect(second.nextCursor).toBeNull();
  });

  it('limit: 0 给一页空的，而不是崩在游标上', async () => {
    // 游标按定义是「本页最后一行的 id」。`limit: 0` 时本页一行都没有，取
    // `page[page.length - 1].id` 就是在 `undefined` 上读属性——一次 TypeError，
    // 而它离真正的病因（调用方把一个算出来的 0 当 limit 传了进来）隔着整条调用栈。
    const scene = createWorkingTreeScene();
    scene.addEntry();
    scene.addEntry();

    const result = await diffOf(scene, { limit: 0 });

    // 也不给兜底游标：兜底出来的游标只会让调用方带着它翻回同一页，一页一页地翻不动。
    expect({ count: result.entries.length, nextCursor: result.nextCursor }).toEqual({ count: 0, nextCursor: null });
  });

  it('没有 limit 时一次给全，游标为 null', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry();
    scene.addEntry();

    const result = await diffOf(scene);

    expect({ count: result.entries.length, nextCursor: result.nextCursor }).toEqual({ count: 2, nextCursor: null });
  });
});

describe('门面上的 diff()（contracts/core-api.md §3）', () => {
  it('零参可调，默认给实体粒度的全量', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry();

    const result = await scene.manager.diff();

    expect(result.granularity).toBe('entity');
    expect(result.entries).toHaveLength(1);
  });

  it('只读当前分支的条目，另一条分支的未提交单元不进来', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry({ entityId: 'note-mine' });
    scene.addEntry({ id: 'entry-foreign', entityId: 'note-theirs', branchId: 'feature-x' });

    const result = await scene.manager.diff();

    // 不带 branchId 过滤的话，用户会在 main 上看到 feature-x 的未提交编辑，
    // 而 commit() 只会提交其中一半。
    expect(result.entries.map(entry => entry.entityId)).toEqual(['note-mine']);
  });
});
