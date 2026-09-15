/**
 * @fileoverview T073 红测试：**普通 CRUD 走事务内读改写型 CAS，不得走调用方捕获型**
 * （R3、conformance-suites.md §2.3 第二条、FR-032）。
 *
 * @remarks
 * 这是一条**防回归**用例，不是防第一次写错：`captureCrudWrite()` 今天就是读改写型。
 * 它要拦的是未来某一天的这个念头——「commit 校验捕获的 `workingTreeRevision`，
 * 那 `save()` 是不是也该校验一下？」
 *
 * 不该。两类 CAS 的分界在 data-model.md §5，而它不是风格偏好：
 *
 * - **捕获型**（commit / restore / discard / switch）的语义是「我要改的是我看过的那个状态」。
 *   并发时失败**是正确结果**，用户重新看一眼再来。
 * - **读改写型**（普通 CRUD、remote apply）的语义是「把这次编辑记进工作树」。它没有
 *   「我看过的状态」这回事：用户按的是 Ctrl+S，不是提交。给它加上捕获型 CAS，高并发下
 *   的普通编辑会开始随机失败，而用户无从理解自己该「重新看一眼」什么——FR-032 点名
 *   禁止的正是这个。
 *
 * 所以这里同时钉**签名**（拿不到期望值就不可能校验）与**行为**（并发不失败）。
 * 另一侧的边界也要钉：active branch token 的校验**必须留着**。它不是 revision CAS，
 * 而是「这笔写该落到哪条分支上」的身份判定；顺手把它一起删掉，用户在 `feature-x` 上
 * 的编辑会静默写进 `main`。
 */

import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { CommitOptions } from '../../working-tree/commit-command.js';
import {
  captureCrudWrite,
  StaleActiveBranchError,
  type ActiveBranchToken,
  type CapturedWrite,
  type WorkingTreeCapturePort
} from '../../working-tree/write-entry.js';

/** 场景里那条 active 分支。 */
const TOKEN: ActiveBranchToken = { branchId: 'main', activationRevision: 3 };

/** 一次普通编辑。 */
const writeOf = (entityId: string): CapturedWrite => ({
  namespace: 'app',
  entity: 'Note',
  entityId,
  operation: 'update',
  patch: { title: '改后' },
  inversePatch: { title: '改前' },
  fingerprint: `fingerprint-${entityId}`,
  origin: 'local',
  unitId: `unit-${entityId}`,
  transactionId: null,
  sourceChangeId: null
});

/** 一个把 revision 当成事务内读改写的端口：每次调用读当前值 +1。 */
const createReadModifyWritePort = (
  overrides: Partial<WorkingTreeCapturePort> = {}
): WorkingTreeCapturePort & { revision: number; entryCount: number } => {
  const state = { revision: 10, entryCount: 0 };
  const port: WorkingTreeCapturePort = {
    readActiveBranchToken: vi.fn(async () => TOKEN),
    readEntry: vi.fn(async () => undefined),
    persistEntry: vi.fn(async () => undefined),
    bumpWorkingTreeRevision: vi.fn(async (entryCountDelta: number) => {
      state.revision += 1;
      state.entryCount += entryCountDelta;
      return state.revision;
    }),
    ...overrides
  };
  // `Object.assign` 会**调用**源对象的 getter 再把结果值拷过去，于是 `port.revision`
  // 会永远停在装配那一刻的 10——两次写之后它还是 10，看起来正像「读改写没生效」。
  // 要的是真访问器，所以用 defineProperties。
  return Object.defineProperties(port, {
    revision: { get: () => state.revision, enumerable: true },
    entryCount: { get: () => state.entryCount, enumerable: true }
  }) as WorkingTreeCapturePort & { revision: number; entryCount: number };
};

describe('签名里就拿不到期望值（R3）', () => {
  it('bumpWorkingTreeRevision 只收 entryCountDelta，没有 expected 参数', () => {
    // 多一个 `expectedRevision` 参数，读改写就当场变成捕获型；这里用元组类型钉死，
    // 因为可选参数在调用点看不出区别。
    expectTypeOf<Parameters<WorkingTreeCapturePort['bumpWorkingTreeRevision']>>().toEqualTypeOf<[number]>();
  });

  it('CapturedWrite 的键集里没有任何 revision 期望位', () => {
    expectTypeOf<keyof CapturedWrite>().toEqualTypeOf<
      | 'namespace'
      | 'entity'
      | 'entityId'
      | 'operation'
      | 'patch'
      | 'inversePatch'
      | 'fingerprint'
      | 'origin'
      | 'unitId'
      | 'transactionId'
      | 'sourceChangeId'
    >();
  });

  it('captureCrudWrite 收四个参数，没有一个是期望 revision', () => {
    expectTypeOf<Parameters<typeof captureCrudWrite>['length']>().toEqualTypeOf<4>();
  });

  it('两类 CAS 的分界是真的：commit 有 expectedWorkingTreeRevision，普通写没有', () => {
    // 同一个字段名在两侧同时出现，就说明有人把两类 CAS 合并了。
    expectTypeOf<CommitOptions>().toHaveProperty('expectedWorkingTreeRevision');
    expectTypeOf<CapturedWrite>().not.toHaveProperty('expectedWorkingTreeRevision');
  });
});

describe('高并发普通 CRUD 不因并发失败（FR-032）', () => {
  it('连续两次写都成功，第二次不因「revision 已经不是我读到的那个」被拒', async () => {
    const port = createReadModifyWritePort();

    await captureCrudWrite(port, TOKEN, writeOf('note-a'), async () => 'a');
    await captureCrudWrite(port, TOKEN, writeOf('note-b'), async () => 'b');

    // 捕获型实现会在第二次上失败：它读到的起点是 10，而第一次已经把它推到 11。
    expect(port.revision).toBe(12);
  });

  it('十次交错的写全部落地，revision 逐次递增', async () => {
    const port = createReadModifyWritePort();

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        captureCrudWrite(port, TOKEN, writeOf(`note-${index}`), async () => index)
      )
    );

    expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(port.revision).toBe(20);
  });

  it('revision 由端口在事务内读改写地给出，调用方不参与仲裁', async () => {
    const port = createReadModifyWritePort();

    await captureCrudWrite(port, TOKEN, writeOf('note-a'), async () => 'a');

    // 递增只发生一次，且拿到的实参只有 entryCountDelta。
    expect(port.bumpWorkingTreeRevision).toHaveBeenCalledTimes(1);
    expect(vi.mocked(port.bumpWorkingTreeRevision).mock.calls).toEqual([[1]]);
  });
});

describe('另一侧的边界：active branch token 的校验必须留着（FR-020/039）', () => {
  it('库里的 token 变了，这笔写被拒', async () => {
    const port = createReadModifyWritePort({
      readActiveBranchToken: vi.fn(async () => ({ branchId: 'feature-x', activationRevision: 4 }))
    });

    await expect(captureCrudWrite(port, TOKEN, writeOf('note-a'), async () => 'a')).rejects.toBeInstanceOf(
      StaleActiveBranchError
    );
  });

  it('拒绝发生在业务写入之前：业务写回调一次都没被调用', async () => {
    const businessWrite = vi.fn(async () => 'a');
    const port = createReadModifyWritePort({
      readActiveBranchToken: vi.fn(async () => ({ branchId: 'feature-x', activationRevision: 4 }))
    });

    await captureCrudWrite(port, TOKEN, writeOf('note-a'), businessWrite).catch(() => undefined);

    // 「写完再回滚」与「拒绝在写之前」在成功路径上无法区分，只有在这里能区分。
    expect(businessWrite).not.toHaveBeenCalled();
    expect(port.bumpWorkingTreeRevision).not.toHaveBeenCalled();
  });

  it('token 过期抛的是 stale_active_branch，不是 CommitConflict', async () => {
    const port = createReadModifyWritePort({
      readActiveBranchToken: vi.fn(async () => ({ branchId: 'main', activationRevision: 4 }))
    });

    const error = await captureCrudWrite(port, TOKEN, writeOf('note-a'), async () => 'a').then(
      () => null,
      (caught: unknown) => caught
    );

    // 普通写路径上的失败**是异常**：调用方按的是 Ctrl+S，没有「返回一个诊断值让他复核」
    // 这个交互。返回值形态的 CommitConflict 只属于 commit / discard 那四条命令。
    expect((error as { code?: unknown }).code).toBe('stale_active_branch');
  });
});
