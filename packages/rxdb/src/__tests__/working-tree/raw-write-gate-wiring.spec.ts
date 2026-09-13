/**
 * @fileoverview T064 红测试：适配器把 raw 写接进共享 5 步判定的那根管子（adapter-contract.md §2）。
 *
 * @remarks
 * T050 已经测过判定本身（给一条语句，落第几步）。这里测的是**判定怎么被接上**：
 * `rawQuery?()` 是可选方法，核心包拦不住它，只能由各适配器自己的实现调用 `gateRawWrite`。
 * 而 `gateRawWrite` 要一个 {@link RawWriteContext}——能力位 + 版本化域。两样东西适配器自己都没有：
 * 域只有捕获运行时知道，能力位只有「运行时装没装上」知道。所以基类得把它们合成一个上下文交出来，
 * 而这个 getter 就是六个适配器唯一需要写对的那一句。
 *
 * 为什么这些断言值得写：
 *
 * 1. **能力位由「运行时装没装上」直接决定，不另存一个布尔。** 捕获运行时只在能力位为真时被装上
 *    （`RxDB.connect()` 读到真、或 `workingTree.enable()` 刚翻开）。再存一份 `#capabilityEnabled`
 *    就是第二份真相，而两份不同步的后果是单向的：门禁以为没开，raw 写全部放行。
 * 2. **未启用时 `domain` 必须抛，不能给空集合。** 判定第 1 步在读 `domain` 之前就返回，所以正确实现
 *    下这个成员永远不被求值。给空集合的话，「能力未启用」和「一张版本化表都没有」在判定眼里完全一样
 *    ——第 1 步哪天被挪到第 4 步之后，整条 raw 防线会静默放行而不是报错。这是 fail-closed 在类型
 *    之外唯一能落实的地方。
 * 3. **启用时交出的是运行时**手上那一份**域，不是拷贝。** 域是 T056 的单一清单；拷贝一份出来，
 *    插件后续登记的派生索引列就只会落进其中一份，raw 通道与捕获对同一张表给出不同结论。
 * 4. **卸载后必须退回未启用形态。** `setWorkingTreeCaptureHook(undefined)` 是能力被关掉的唯一路径；
 *    getter 若缓存了上一次的域，关掉能力之后 raw 写仍然会被拦，而那是一次没人能自查的故障。
 * 5. **末尾两条把 getter 和判定接起来跑一遍**：同一条写版本化表的语句，未启用时执行器被调用、
 *    启用时执行器一次都没被调用。适配器侧真正要的就是这两个行为，中间少接一环都在这里现形。
 */

import type { Observable } from 'rxjs';
import { describe, expect, it } from 'vitest';
import type { EntityType } from '../../entity/entity.interface.js';
import type { IRepository } from '../../repository/repository.interface.js';
import { RxDBAdapterLocalBase, type TransactionFun } from '../../rxdb-adapter.js';
import type { RxDB } from '../../RxDB.js';
import type { WorkingTreeCaptureHook } from '../../working-tree/capture-interceptor.js';
import { gateRawWrite } from '../../working-tree/raw-write-judgment.js';
import type { VersionedDomain, VersionedDomainView } from '../../working-tree/versioned-domain.js';
import { WorkingTreeWriteRejectedError } from '../../working-tree/write-entry-matrix.js';

/** 只有 `post` 一张版本化表的域；这个文件不测判定内容，只测它有没有被接上。 */
const domainStub = (): VersionedDomain => ({
  versionedTables: new Set(['post']),
  untrackedFieldsOf: () => new Set(['remote_id']),
  classifyEntity: () => 'tracked',
  isUntrackedField: () => false,
  createTransactionGuard: () => ({ record: () => undefined })
});

/**
 * 只实现捕获钩子契约的运行时替身。
 *
 * @remarks
 * 用替身而不是真的 `WorkingTreeCaptureRuntime`：这里要断言的是「基类把钩子身上的域原样交出来」，
 * 换成真运行时就还得先备好 `EntityManager`，而那一串依赖与本文件要钉的行为毫无关系。
 */
const hookStub = (domain: VersionedDomain): WorkingTreeCaptureHook => ({
  domain,
  bindMountTarget: () => undefined,
  interceptTransaction: (_host, next, fun, transactionLog) => next(fun, transactionLog),
  interceptMergeChanges: (host, next, actions, localChanges, disableTriggers) =>
    next(host, actions, localChanges, disableTriggers),
  interceptSwitchBranch: (_host, next, options) => next(options),
  interceptBulkWrite: (_host, next) => next()
});

/** 测试里够不着的抽象成员；被调到就说明用例走错了路，所以抛而不是返回空值。 */
const unused = (member: string): never => {
  throw new Error(`raw-write-gate-wiring 用例不该调用 ${member}()`);
};

/** 能被装上捕获挂载点的最小本地适配器：五个写原语是真函数，其余抽象成员一律抛。 */
class WiringAdapter extends RxDBAdapterLocalBase {
  constructor() {
    super(undefined as unknown as RxDB);
  }

  override getRepository<T extends EntityType, RT extends IRepository<T>>(): RT {
    return unused('getRepository');
  }

  override isTableExisted(): Promise<boolean> {
    return unused('isTableExisted');
  }

  override transaction(fun: TransactionFun): Promise<unknown> {
    return Promise.resolve(fun(unused('executor')));
  }

  override createTables(): Promise<boolean> {
    return unused('createTables');
  }

  override switchBranch(): Promise<void> {
    return Promise.resolve();
  }

  override getRxDBChangeSequence(): Promise<number> {
    return unused('getRxDBChangeSequence');
  }

  override mergeChanges(): Promise<number | void> {
    return Promise.resolve();
  }

  override getMetadataByIds(): Observable<Map<string, string>> {
    return unused('getMetadataByIds');
  }

  override upsertMany(): Observable<void> {
    return unused('upsertMany');
  }

  override deleteByIds(): Observable<void> {
    return unused('deleteByIds');
  }
}

describe('T064 适配器 raw 写判定上下文', () => {
  it('没装捕获运行时时能力位为假', () => {
    expect(new WiringAdapter().workingTreeRawWriteContext.capabilityEnabled).toBe(false);
  });

  it('能力未启用时读 domain 抛错，而不是退化成空集合', () => {
    // 空集合与「一张版本化表都没有」不可区分；第 1 步一旦被挪走，那条路会静默放行。
    expect(() => new WiringAdapter().workingTreeRawWriteContext.domain).toThrow(/未启用/);
  });

  it('装上捕获运行时后能力位为真', () => {
    const adapter = new WiringAdapter();
    adapter.setWorkingTreeCaptureHook(hookStub(domainStub()));
    expect(adapter.workingTreeRawWriteContext.capabilityEnabled).toBe(true);
  });

  it('交出的是运行时手上那一份域本身，不是拷贝', () => {
    const adapter = new WiringAdapter();
    const domain = domainStub();
    adapter.setWorkingTreeCaptureHook(hookStub(domain));
    expect(adapter.workingTreeRawWriteContext.domain).toBe<VersionedDomainView>(domain);
  });

  it('卸下捕获运行时后退回未启用形态', () => {
    const adapter = new WiringAdapter();
    adapter.setWorkingTreeCaptureHook(hookStub(domainStub()));
    adapter.setWorkingTreeCaptureHook(undefined);
    expect(adapter.workingTreeRawWriteContext.capabilityEnabled).toBe(false);
    expect(() => adapter.workingTreeRawWriteContext.domain).toThrow(/未启用/);
  });

  it('未启用时经这个上下文的 raw 写照常下发', async () => {
    const adapter = new WiringAdapter();
    let executed = 0;
    await gateRawWrite("UPDATE post SET title = 'x'", adapter.workingTreeRawWriteContext, () => {
      executed += 1;
      return Promise.resolve();
    });
    expect(executed).toBe(1);
  });

  it('启用后同一条语句被拒，且执行器一次都没被调用', async () => {
    const adapter = new WiringAdapter();
    adapter.setWorkingTreeCaptureHook(hookStub(domainStub()));
    let executed = 0;
    await expect(
      gateRawWrite("UPDATE post SET title = 'x'", adapter.workingTreeRawWriteContext, () => {
        executed += 1;
        return Promise.resolve();
      })
    ).rejects.toBeInstanceOf(WorkingTreeWriteRejectedError);
    expect(executed).toBe(0);
  });
});
