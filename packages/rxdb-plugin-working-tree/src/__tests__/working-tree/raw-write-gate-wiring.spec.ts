/**
 * @fileoverview T064 红测试：适配器把 raw 写接进共享 5 步判定的那根管子（adapter-contract.md §2）。
 *
 * @remarks
 * T050 已经测过判定本身（给一条语句，落第几步）。这里测的是**判定怎么被接上**：
 * `rawQuery?()` 是可选方法，核心包拦不住它，只能由各适配器自己的实现调用 `gateRawWrite`。
 * 而 `gateRawWrite` 要一个 {@link RawWriteContext}——适配器与核心之间的那道接缝。适配器自己造不出它：
 * 能力位只有「捕获运行时装没装上」知道，判定实现只有运行时手上有。所以基类把这两样合成一个上下文
 * 交出来，而这个 getter 就是六个适配器唯一需要写对的那一句。
 *
 * 为什么这些断言值得写：
 *
 * 1. **能力位由「运行时装没装上」直接决定，不另存一个布尔。** 捕获运行时只在能力位为真时被装上
 *    （`RxDB.connect()` 读到真、或 `workingTree.enable()` 刚翻开）。再存一份 `#capabilityEnabled`
 *    就是第二份真相，而两份不同步的后果是单向的：门禁以为没开，raw 写全部放行。
 * 2. **未启用形态上根本没有转交入口。** {@link RawWriteContext} 是个判别联合，
 *    `capabilityEnabled: false` 那一支在类型上就不带 `gate`——「先看能力位，再谈判定」因此由编译器
 *    执行，而不是靠「第 1 步一定排在读域之前」这条人工约定。本文件把这件事在**运行期**也钉一遍：
 *    未启用的上下文上 `'gate' in ctx` 为假。留个会抛的成员是退而求其次的老写法，退回去就等于
 *    把 fail-closed 重新交还给调用顺序。
 * 3. **启用时 `gate` 原样转交给运行时**，不在核心侧改写语句、也不包一层自己的结论。核心一个捕获
 *    语义都不认识；哪天它顺手在这里加一句「这条看着无害就放行」，判定就有了第二份真相。
 * 4. **卸载后必须退回未启用形态。** `setWorkingTreeCaptureHook(undefined)` 是能力被关掉的唯一路径；
 *    getter 若缓存了上一次的 `gate`，关掉能力之后 raw 写仍然会被拦，而那是一次没人能自查的故障。
 * 5. **末尾两条把 getter 和判定接起来跑一遍**：同一条写版本化表的语句，未启用时执行器被调用、
 *    启用时执行器一次都没被调用。适配器侧真正要的就是这两个行为，中间少接一环都在这里现形。
 */

import type { EntityType, IRepository, RxDB, WorkingTreeCaptureHook } from '@aiao/rxdb';
import { gateRawWrite, RxDBAdapterLocalBase, type TransactionFun } from '@aiao/rxdb';
import type { Observable } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { applyRawWriteJudgment } from '../../working-tree/raw-write-judgment.js';
import type { VersionedDomain } from '../../working-tree/versioned-domain.js';
import { WorkingTreeWriteRejectedError } from '../../working-tree/write-entry-matrix.js';

/** 只有 `post` 一张版本化表的域；这个文件不测判定内容，只测它有没有被接上。 */
const domainStub = (): VersionedDomain => ({
  versionedTables: new Set(['post']),
  untrackedFieldsOf: () => new Set(['remote_id']),
  hasEntity: () => true,
  classifyEntity: () => 'tracked',
  isUntrackedField: () => false,
  createTransactionGuard: () => ({ record: () => undefined })
});

/**
 * 只实现捕获钩子契约的运行时替身。
 *
 * @remarks
 * 用替身而不是真的 `WorkingTreeCaptureRuntime`：这里要断言的是「基类把钩子的转交门原样接出来」，
 * 换成真运行时就还得先备好 `EntityManager`，而那一串依赖与本文件要钉的行为毫无关系。
 *
 * `gateRawWrite` 照真运行时那一句写，**不返回预设结论**：末尾两条要跑通的是「getter → 接缝 →
 * 判定」整条路，替身自己编个结论的话，断的就只剩替身自己。
 */
const hookStub = (domain: VersionedDomain): WorkingTreeCaptureHook => ({
  gateRawWrite: (sql, execute) => applyRawWriteJudgment(sql, { capabilityEnabled: true, domain }, execute),
  gateExternalNotify: (_entityName, _namespace, notify) => notify(),
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

  it('未启用形态上根本没有转交入口，而不是有个会抛的成员', () => {
    // 类型上这一支就不带 `gate`；这一条把它在运行期也钉住。有个会抛的成员的话，
    // 「先看能力位」会重新变成调用顺序的事，而调用顺序不产生编译错误。
    expect('gate' in new WiringAdapter().workingTreeRawWriteContext).toBe(false);
  });

  it('装上捕获运行时后能力位为真', () => {
    const adapter = new WiringAdapter();
    adapter.setWorkingTreeCaptureHook(hookStub(domainStub()));
    expect(adapter.workingTreeRawWriteContext.capabilityEnabled).toBe(true);
  });

  it('转交是原样转交：语句与执行器不经核心改写，返回值原样带回', async () => {
    const adapter = new WiringAdapter();
    const seen: string[] = [];
    const execute = (): string => 'executed';
    let receivedExecute: unknown;
    adapter.setWorkingTreeCaptureHook({
      ...hookStub(domainStub()),
      gateRawWrite: async (sql, incoming) => {
        seen.push(sql);
        receivedExecute = incoming;
        return await incoming();
      }
    });

    const context = adapter.workingTreeRawWriteContext;
    if (!context.capabilityEnabled) throw new Error('装上运行时之后能力位仍为假');
    // `SELECT 1; UPDATE …` 是个语句批：核心若顺手拆一刀或做点归一化，这里会看见不是原句的东西。
    await expect(context.gate("SELECT 1; UPDATE post SET title = 'x'", execute)).resolves.toBe('executed');
    expect(seen, '核心改写了交给判定的语句').toEqual(["SELECT 1; UPDATE post SET title = 'x'"]);
    expect(receivedExecute, '核心把执行器包了一层再转交').toBe(execute);
  });

  it('启用态上下文是按运行时缓存的同一个对象，不是每次取值新建', () => {
    // 这个取值器在**每一条 raw 语句**上被调用（六个适配器的 `rawQuery` 都要先取它）。
    // 每次新建意味着每条语句多分配一个对象加一个闭包，而它不持有任何 per-call 状态。
    // 用身份相等钉住：换成每次新建时这一条立刻红。
    const adapter = new WiringAdapter();
    adapter.setWorkingTreeCaptureHook(hookStub(domainStub()));
    expect(adapter.workingTreeRawWriteContext).toBe(adapter.workingTreeRawWriteContext);
  });

  it('换一个运行时就换一个上下文，旧上下文不会被继续交出去', () => {
    // 缓存的代价是失效点：装第二个运行时之后仍交出绑着第一个的闭包，raw 写就判到了
    // 已经卸下的那份域清单上，而症状是静默放行。
    const adapter = new WiringAdapter();
    adapter.setWorkingTreeCaptureHook(hookStub(domainStub()));
    const first = adapter.workingTreeRawWriteContext;
    adapter.setWorkingTreeCaptureHook(hookStub(domainStub()));
    expect(adapter.workingTreeRawWriteContext).not.toBe(first);
  });

  it('卸下捕获运行时后退回未启用形态', () => {
    const adapter = new WiringAdapter();
    adapter.setWorkingTreeCaptureHook(hookStub(domainStub()));
    adapter.setWorkingTreeCaptureHook(undefined);
    expect(adapter.workingTreeRawWriteContext.capabilityEnabled).toBe(false);
    expect('gate' in adapter.workingTreeRawWriteContext, '卸下之后转交入口还留在上下文里').toBe(false);
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
