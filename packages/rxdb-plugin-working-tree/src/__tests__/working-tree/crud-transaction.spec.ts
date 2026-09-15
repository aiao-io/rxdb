/**
 * @fileoverview T053 红测试：普通 CRUD 的同事务四步捕获（FR-039、data-model.md §5 首行）。
 *
 * @remarks
 * FR-039 把一次普通写入拆成同一事务里的四件事：**校验 active branch token → 写业务实体 →
 * 写入或合并完整 `WorkingTreeEntry` → 递增 `workingTreeRevision`**；任一步失败全部回滚。
 * 所以被测的是一个**包裹业务写入的壳**——它拿到的是还没被调用的业务写入，这样「token 没过
 * 就不该动业务表」才有可观测形式（T049 的批量门禁同形）。
 *
 * 端口（{@link WorkingTreeCapturePort}）是注入的：捕获自己不开事务、不选适配器，它只在调用方
 * 给的那个事务上下文里按顺序发这几笔。真实事务的原子性由适配器保证，conformance 套件在 6 个
 * 后端上核验；这里钉死的是**顺序、条件与副作用范围**——判定自己的责任边界。
 *
 * 为什么这些断言值得写：
 *
 * 1. **顺序是契约，不是实现细节。** token 校验挪到业务写入之后，就成了「先写进去再发现分支
 *    不对，然后靠回滚收拾」——而 raw 通道与批量写路径已经为「拒绝发生在执行前」付过代价，
 *    CRUD 这条最热的路上没有理由退让。用例断言的是**相对顺序**而不是完整调用序列：前者是契约，
 *    后者会把「多读了一次状态行」这类无害实现变化误判成回归。
 * 2. **递增必须排在落条目之后。** 反过来的话，条目写失败时 revision 已经 +1，而 revision 是
 *    commit 的 CAS 依据：一次失败的 save() 会让另一个 Tab 手里的 revision 凭空作废。
 * 3. **失败即不留痕。** 三个失败点各测一组，断言的是「后续步骤一步都没发生」。只断言
 *    「抛出了异常」的话，一个「先 +1 再写条目、失败了再补一次 -1」的实现完全能通过。
 * 4. **禁止只靠内存 dirty set 重建（FR-039 原文）。** 最能分辨的形态是**进程里没发生过第一次
 *    写入**：条目已经在库里（上一次会话留下的），本进程第一次 `save()` 必须读到它并折进去。
 *    内存 dirty set 的实现这时是空的，于是它会把 `inversePatch` 记成**刷新后**的值——discard
 *    从此退不回 HEAD，而且没有任何报错。用例因此断言：捕获**读过**已有条目，且折叠后的
 *    `inversePatch` 仍是库里那份。
 * 5. **整事务共享同一 `unitId`（data-model.md §2.7）。** 同一个事务里的多次写入属于一个逻辑
 *    变更单元；每次写入各发一个 `unitId` 会让 commit 之后的历史把一次业务操作拆成 N 条。
 * 6. **`entryCount` 的增量由折叠给出，不由捕获自己数。** 捕获把 `FoldOutcome` 的 delta 原样
 *    转交（T052 已经把 delta 规则钉死）。捕获再数一遍就是第二份真相，且是没有用例保护的那份。
 */

import { describe, expect, it } from 'vitest';
import { CommitErrorCode, isCommitErrorCode } from '../../commit/commit-error-codes.js';
import {
  captureCrudWrite,
  StaleActiveBranchError,
  type ActiveBranchToken,
  type CapturedWrite,
  type WorkingTreeCapturePort,
  type WorkingTreeEntryRow
} from '../../working-tree/write-entry.js';

const HEAD_TITLE = 'HEAD 里的标题';

const TOKEN: ActiveBranchToken = { branchId: 'branch-main', activationRevision: 7 };

const captured = (init: Partial<CapturedWrite> = {}): CapturedWrite => ({
  namespace: 'app',
  entity: 'Post',
  entityId: 'p1',
  operation: 'update',
  patch: { title: '改过的标题' },
  inversePatch: { title: HEAD_TITLE },
  fingerprint: 'fp-1',
  origin: 'local',
  unitId: 'unit-1',
  transactionId: 'tx-1',
  sourceChangeId: null,
  ...init
});

interface PortProbe {
  readonly port: WorkingTreeCapturePort;
  /** 端口被调用的方法名，按发生顺序 */
  readonly log: string[];
  /** 最后一次落条目时交给端口的东西 */
  persisted?: { row: WorkingTreeEntryRow | undefined; entryCountDelta: number };
  /** 最后一次递增时交给端口的 entryCount 增量 */
  bumpedWith?: number;
}

interface PortProbeInit {
  /** 库里已经存在的未提交条目（模拟「上一次会话留下的」） */
  readonly existingEntry?: WorkingTreeEntryRow;
  /** 持久化的 activation 状态；与调用方 token 不一致即视为过期 */
  readonly storedToken?: ActiveBranchToken;
  /** 在这个端口方法上抛错 */
  readonly failOn?: string;
}

function portProbe(init: PortProbeInit = {}): PortProbe {
  const log: string[] = [];
  const record = (method: string): void => {
    log.push(method);
    if (init.failOn === method) throw new Error(`端口故障注入：${method}`);
  };

  const probe: PortProbe = {
    log,
    port: {
      readActiveBranchToken: async () => {
        record('readActiveBranchToken');
        return init.storedToken ?? TOKEN;
      },
      readEntry: async () => {
        record('readEntry');
        return init.existingEntry;
      },
      persistEntry: async (row, entryCountDelta) => {
        record('persistEntry');
        probe.persisted = { row, entryCountDelta };
      },
      bumpWorkingTreeRevision: async entryCountDelta => {
        record('bumpWorkingTreeRevision');
        probe.bumpedWith = entryCountDelta;
        return 42;
      }
    }
  };
  return probe;
}

/** 业务写入探针：拿到的是**还没被调用**的那一笔，`calls` 因此是「业务表动没动」的替身。 */
function businessWriteProbe() {
  const probe = {
    calls: 0,
    run: async () => {
      probe.calls += 1;
      return 'written' as const;
    }
  };
  return probe;
}

const indexOf = (log: readonly string[], method: string): number => log.indexOf(method);

describe('四步顺序', () => {
  it('token 校验在业务写入之前', async () => {
    const probe = portProbe();
    const business = businessWriteProbe();

    await captureCrudWrite(probe.port, TOKEN, captured(), business.run);

    expect(indexOf(probe.log, 'readActiveBranchToken')).toBeGreaterThanOrEqual(0);
    expect(probe.log.indexOf('persistEntry')).toBeGreaterThan(indexOf(probe.log, 'readActiveBranchToken'));
  });

  it('落条目在业务写入之后', async () => {
    const probe = portProbe();
    const business = businessWriteProbe();
    let callsAtPersist = -1;

    await captureCrudWrite(
      {
        ...probe.port,
        persistEntry: async (row, delta) => {
          callsAtPersist = business.calls;
          await probe.port.persistEntry(row, delta);
        }
      },
      TOKEN,
      captured(),
      business.run
    );

    expect(callsAtPersist).toBe(1);
  });

  it('读已有条目在落条目之前', async () => {
    const probe = portProbe();

    await captureCrudWrite(probe.port, TOKEN, captured(), businessWriteProbe().run);

    expect(indexOf(probe.log, 'readEntry')).toBeLessThan(indexOf(probe.log, 'persistEntry'));
  });

  it('递增 revision 排在落条目之后', async () => {
    // 反过来的话，条目写失败时 revision 已经 +1——而它是 commit 的 CAS 依据，
    // 于是一次失败的 save() 让另一个 Tab 手里的 revision 凭空作废。
    const probe = portProbe();

    await captureCrudWrite(probe.port, TOKEN, captured(), businessWriteProbe().run);

    expect(indexOf(probe.log, 'bumpWorkingTreeRevision')).toBeGreaterThan(indexOf(probe.log, 'persistEntry'));
  });

  it('成功时四步齐全，且原样返回业务写入的结果', async () => {
    const probe = portProbe();

    const result = await captureCrudWrite(probe.port, TOKEN, captured(), businessWriteProbe().run);

    expect(result).toBe('written');
    for (const method of ['readActiveBranchToken', 'readEntry', 'persistEntry', 'bumpWorkingTreeRevision']) {
      expect(probe.log, method).toContain(method);
    }
  });
});

describe('active branch token 校验', () => {
  const staleToken = (): PortProbe => portProbe({ storedToken: { branchId: 'branch-main', activationRevision: 8 } });

  it('revision 对不上时抛 StaleActiveBranchError', async () => {
    await expect(
      captureCrudWrite(staleToken().port, TOKEN, captured(), businessWriteProbe().run)
    ).rejects.toBeInstanceOf(StaleActiveBranchError);
  });

  it('branchId 对不上时同样抛', async () => {
    const probe = portProbe({ storedToken: { branchId: 'branch-feature', activationRevision: 7 } });

    await expect(captureCrudWrite(probe.port, TOKEN, captured(), businessWriteProbe().run)).rejects.toBeInstanceOf(
      StaleActiveBranchError
    );
  });

  it('业务表零变化：拒绝发生在业务写入之前', async () => {
    const business = businessWriteProbe();

    await captureCrudWrite(staleToken().port, TOKEN, captured(), business.run).catch(() => undefined);

    expect(business.calls).toBe(0);
  });

  it('条目与 revision 一步都不动', async () => {
    const probe = staleToken();

    await captureCrudWrite(probe.port, TOKEN, captured(), businessWriteProbe().run).catch(() => undefined);

    expect(probe.log).not.toContain('persistEntry');
    expect(probe.log).not.toContain('bumpWorkingTreeRevision');
  });

  it('错误码先在共享模块登记，写路径用常量而不是字面量', async () => {
    // `commit-error-codes.ts` 的模块说明写着：`stale_active_branch` 由 US-308 的 activation
    // 维度定义，「落地时应追加到本模块并补测试，**不要**在写路径里直接写字面量」。FR-039 把这
    // 道校验排进了阶段 A，于是落地时刻就是现在——登记它，而不是在这条最热的写路径上开先例。
    //
    // 连带项：`__tests__/commit/commit-error-codes.spec.ts` 把码集钉成了八条，并单独断言
    // `isCommitErrorCode('stale_active_branch') === false`。实现这条时这两处要一起改成九条，
    // 那正是模块说明里「补测试」指的东西。
    const error = await captureCrudWrite(staleToken().port, TOKEN, captured(), businessWriteProbe().run).catch(
      (caught: unknown) => caught
    );

    expect(isCommitErrorCode('stale_active_branch')).toBe(true);
    expect((error as StaleActiveBranchError).code).toBe(CommitErrorCode.stale_active_branch);
  });

  it('校验的是调用方捕获的 token，不是事务里重新读到的 active 分支', async () => {
    // 「重新读一次然后把旧实体归到新分支」是 spec.md 场景 5 明令禁止的形态，它的可观测差别
    // 就在这里：库里的 token 与调用方手里的不一致时，正确实现拒绝，重读实现照常写入。
    const probe = portProbe({ storedToken: { branchId: 'branch-feature', activationRevision: 99 } });
    const business = businessWriteProbe();

    await captureCrudWrite(probe.port, TOKEN, captured(), business.run).catch(() => undefined);

    expect(business.calls).toBe(0);
  });
});

describe('任一步失败全部回滚', () => {
  it('业务写入抛错时不落条目、不递增', async () => {
    const probe = portProbe();
    const failing = async (): Promise<never> => {
      throw new Error('业务写入失败');
    };

    await expect(captureCrudWrite(probe.port, TOKEN, captured(), failing)).rejects.toThrow('业务写入失败');
    expect(probe.log).not.toContain('persistEntry');
    expect(probe.log).not.toContain('bumpWorkingTreeRevision');
  });

  it('落条目抛错时不递增 revision', async () => {
    const probe = portProbe({ failOn: 'persistEntry' });

    await expect(captureCrudWrite(probe.port, TOKEN, captured(), businessWriteProbe().run)).rejects.toThrow(
      '端口故障注入：persistEntry'
    );
    expect(probe.log).not.toContain('bumpWorkingTreeRevision');
  });

  it('递增抛错时错误照常向外传，不被吞掉', async () => {
    // 吞掉它等于「业务数据和条目都落了，但 revision 没动」——此后 commit 的 CAS 会认为
    // 工作树没变过，于是提交一批调用方没看过的变更。
    const probe = portProbe({ failOn: 'bumpWorkingTreeRevision' });

    await expect(captureCrudWrite(probe.port, TOKEN, captured(), businessWriteProbe().run)).rejects.toThrow(
      '端口故障注入：bumpWorkingTreeRevision'
    );
  });

  it('读已有条目抛错时业务写入已发生，但条目与 revision 都不动', async () => {
    const probe = portProbe({ failOn: 'readEntry' });

    await expect(captureCrudWrite(probe.port, TOKEN, captured(), businessWriteProbe().run)).rejects.toThrow(
      '端口故障注入：readEntry'
    );
    expect(probe.log).not.toContain('persistEntry');
    expect(probe.log).not.toContain('bumpWorkingTreeRevision');
  });
});

describe('禁止只靠内存 dirty set 重建', () => {
  /** 上一次会话留在库里的条目：本进程没有捕获过它。 */
  const priorSessionEntry = (): WorkingTreeEntryRow =>
    ({
      namespace: 'app',
      entity: 'Post',
      entityId: 'p1',
      operation: 'update',
      patch: { title: '上次会话改的' },
      inversePatch: { title: HEAD_TITLE },
      fingerprint: 'fp-prior',
      origin: 'local',
      unitId: 'unit-prior',
      transactionId: 'tx-prior',
      sourceChangeId: null
    }) as WorkingTreeEntryRow;

  it('本进程第一次写入就要去库里读已有条目', async () => {
    const probe = portProbe({ existingEntry: priorSessionEntry() });

    await captureCrudWrite(probe.port, TOKEN, captured(), businessWriteProbe().run);

    expect(probe.log).toContain('readEntry');
  });

  it('折进已有条目，inversePatch 仍是库里那份', async () => {
    // 这是刷新一次页面就会踩到的形态：内存 dirty set 是空的，于是 `inversePatch` 被记成
    // **刷新后**的值，discard 从此退不回 HEAD，而且全程没有任何报错。
    const probe = portProbe({ existingEntry: priorSessionEntry() });

    await captureCrudWrite(
      probe.port,
      TOKEN,
      captured({ patch: { title: '本次改的' }, inversePatch: { title: '上次会话改的' } }),
      businessWriteProbe().run
    );

    expect(probe.persisted?.row?.inversePatch).toEqual({ title: HEAD_TITLE });
  });

  it('折进已有条目时 entryCount 增量为 0', async () => {
    const probe = portProbe({ existingEntry: priorSessionEntry() });

    await captureCrudWrite(probe.port, TOKEN, captured(), businessWriteProbe().run);

    expect(probe.persisted?.entryCountDelta).toBe(0);
    expect(probe.bumpedWith).toBe(0);
  });

  it('库里没有条目时增量为 1', async () => {
    const probe = portProbe();

    await captureCrudWrite(probe.port, TOKEN, captured(), businessWriteProbe().run);

    expect(probe.persisted?.entryCountDelta).toBe(1);
    expect(probe.bumpedWith).toBe(1);
  });

  it('净无变化时把删除意图交给端口，增量为 -1', async () => {
    const inserted = { ...priorSessionEntry(), operation: 'insert', inversePatch: null } as WorkingTreeEntryRow;
    const probe = portProbe({ existingEntry: inserted });

    await captureCrudWrite(probe.port, TOKEN, captured({ operation: 'delete', patch: null }), businessWriteProbe().run);

    expect(probe.persisted?.row).toBeUndefined();
    expect(probe.persisted?.entryCountDelta).toBe(-1);
    expect(probe.bumpedWith).toBe(-1);
  });

  it('交给端口的 entryCount 增量与落条目那一笔完全一致', async () => {
    // 捕获自己再数一遍就是第二份真相，而且是没有用例保护的那份（T052 的规则只覆盖折叠）。
    for (const existingEntry of [undefined, priorSessionEntry()]) {
      const probe = portProbe({ existingEntry });
      await captureCrudWrite(probe.port, TOKEN, captured(), businessWriteProbe().run);
      expect(probe.bumpedWith).toBe(probe.persisted?.entryCountDelta);
    }
  });
});

describe('整事务共享同一 unitId', () => {
  it('同一事务里的多次写入落成同一个 unit', async () => {
    const probe = portProbe();
    const units: (string | undefined)[] = [];
    const port: WorkingTreeCapturePort = {
      ...probe.port,
      persistEntry: async (row, delta) => {
        units.push(row?.unitId);
        await probe.port.persistEntry(row, delta);
      }
    };

    await captureCrudWrite(port, TOKEN, captured({ entityId: 'p1', unitId: 'unit-1' }), businessWriteProbe().run);
    await captureCrudWrite(port, TOKEN, captured({ entityId: 'p2', unitId: 'unit-1' }), businessWriteProbe().run);

    expect(units).toEqual(['unit-1', 'unit-1']);
  });

  it('不同事务的写入落成不同 unit', async () => {
    const probe = portProbe();
    const units: (string | undefined)[] = [];
    const port: WorkingTreeCapturePort = {
      ...probe.port,
      persistEntry: async (row, delta) => {
        units.push(row?.unitId);
        await probe.port.persistEntry(row, delta);
      }
    };

    await captureCrudWrite(port, TOKEN, captured({ entityId: 'p1', unitId: 'unit-1' }), businessWriteProbe().run);
    await captureCrudWrite(port, TOKEN, captured({ entityId: 'p2', unitId: 'unit-2' }), businessWriteProbe().run);

    expect(new Set(units).size).toBe(2);
  });
});
