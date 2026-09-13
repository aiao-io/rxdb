/**
 * @fileoverview `RxDB.workingTree` 入口与它的能力门禁（契约见 contracts/core-api.md §1/§2）。
 *
 * @remarks
 * 这里只有两件事：**入口恒存在**，以及**未启用即拒绝**。工作树的实际语义
 * （`status()` / `diff()` / `commit()` / `discard()` / `restore()`）由后续阶段挂上来，
 * 它们一律经 {@link WorkingTreeManager.runEnabled} 进入，不自己开事务、不自己读能力行。
 *
 * 入口做成可选属性（`workingTree?: WorkingTreeManager`）省事得多，代价是全部调用点
 * 长出 `?.`，而 `database.workingTree?.commit(msg)` 在未启用的库上**静默求值为
 * `undefined`**——用户点了提交、什么也没发生、也没有错误。契约 §1 要的是相反的
 * 东西：入口恒在，调用即拒。同理，未启用时返回空结果（`entryCount: 0`）也不行：
 * 那是把「这个库没开这功能」伪装成「这个库没有未提交变更」。FR-046 的「零行为差异」
 * 说的是**不调用它就什么都没发生**，不是调用了要假装成功。
 */

import { firstValueFrom } from 'rxjs';
import type { CommitCapabilityInfo } from '../commit/commit-capability.js';
import {
  assertSupportedCommitCapability,
  enableCommitCapability,
  isCommitCapabilityEnabled,
  readCommitCapability
} from '../commit/commit-capability.js';
import { CommitErrorCode } from '../commit/commit-error-codes.js';
import { ENABLE_MIGRATION_OPERATION_ID, runEnableMigration } from '../commit/enable-migration.js';
import type { RxDB } from '../RxDB.js';
import { RxDBError } from '../RxDBError.js';
import type { TransactionExecutor } from '../transaction/transaction-executor.interface.js';

/**
 * 在未启用提交能力的数据库上调用了受管成员。
 *
 * @remarks
 * 判别位给了两个：`name` 供本进程内 `instanceof` 之外的兜底判断，`code` 供跨 realm
 * 场景（日志、上报、三框架绑定的错误分支）。只给 `name` 的话，跨 realm 的一端只能
 * 匹配错误文案；只给 `code` 的话，本进程内每次判断都得先 import 一个常量模块。
 *
 * 与「版本不兼容」（{@link assertSupportedCommitCapability} 抛的
 * `UnsupportedRxDBSystemVersionError`）是两件事：这里说的是**还没启用**，
 * 出路是调用 {@link WorkingTreeManager.enable}；那边说的是**启用了但号对不上**，
 * 出路是升客户端或跑迁移。
 */
export class WorkingTreeCapabilityDisabledError extends RxDBError {
  /** epic-006 指定的稳定错误码，取自 {@link CommitErrorCode} */
  readonly code = CommitErrorCode.commit_capability_disabled;

  constructor() {
    super(
      '这个数据库尚未启用提交能力：除 isEnabled() / enable() 之外的 workingTree 成员都不可用。' +
        '先调用 database.workingTree.enable()。'
    );
    this.name = 'WorkingTreeCapabilityDisabledError';
    Object.setPrototypeOf(this, WorkingTreeCapabilityDisabledError.prototype);
  }
}

/**
 * 工作树与提交历史的入口（契约见 contracts/core-api.md §1）。
 *
 * @remarks
 * 实例在 `RxDB` 构造时就建好，与库是否启用提交能力无关——「有没有这个入口」是
 * **进程内库版本**的属性，「能不能用」才是**这个数据库**的属性。两者混在一起的话，
 * 同一份代码在两个库上会长出不同的对象形状。
 */
export class WorkingTreeManager {
  readonly #rxdb: RxDB;

  constructor(rxdb: RxDB) {
    this.#rxdb = rxdb;
  }

  /**
   * 这个数据库启用提交能力了吗。
   *
   * @returns 已启用返回 `true`
   *
   * @remarks
   * 与 {@link enable} 同为未启用库上仅有的两个可用成员，因此**不经**
   * {@link runEnabled}——经了就成了「只有启用的库才能查自己启没启用」。
   */
  async isEnabled(): Promise<boolean> {
    return this.#runInTransaction(executor => isCommitCapabilityEnabled(executor));
  }

  /**
   * 启用这个数据库的提交能力（幂等）。
   *
   * @returns 启用后的能力状态
   * @throws {@link BranchNotMaterializableError} 任一本地分支沿 `rxdb_change` 链物化不了时
   *
   * @remarks
   * 「启用」是两件事，而且**必须在同一个事务里**：翻能力位，以及给每条本地分支补上根节点
   * （FR-021/049）。拆成两个事务的话，中间崩一次就停在「已启用、但分支没有根」——此后每次
   * `commit()` 都往一个无根分支上挂节点，而库自称一切正常。迁移抛错时整笔回滚，能力位一并
   * 退回未启用，于是重试面对的还是同一个起点。
   *
   * **迁移每次都跑，不是只跑在 CAS 命中的那一次。** 能力位的 CAS 只在 `false → true` 那一次
   * 命中（幂等与并发仲裁都由它负责），但 `enable()` 的语义是「把库收敛到已启用该有的形状」，
   * 而不是「翻一次位」：库启用之后才出现的本地分支——旧版本客户端建的、或上一次因某条分支
   * 损坏而整体回滚的——只能靠再调一次 `enable()` 补根。真跑过一遍之后重复调用是幂等的，
   * 全部分支都落进 `alreadyInitializedBranchIds`，一条语句都不发。
   *
   * **捕获运行时装在事务提交之后。** 装在事务里的话，捕获会立刻开始拦截这同一个事务余下的
   * 写——而 `runEnableMigration()` 往分支上补的根节点正是在那里面写的，于是「启用」这件事
   * 自己会被记成一批未提交变更。装在提交之后，本进程从下一次写开始捕获；这一笔启用本身
   * 属于 HEAD，不属于工作树。
   *
   * 迁移抛错时整笔回滚、能力位退回未启用，此时 `transaction()` 直接向上抛，装载那一行
   * 走不到——不会留下「没启用却在捕获」的形状。
   */
  async enable(): Promise<CommitCapabilityInfo> {
    const adapter = await firstValueFrom(this.#rxdb.localAdapter$);
    const info = await adapter.transaction(async executor => {
      const enabled = await enableCommitCapability(executor);
      await runEnableMigration(executor, this.#rxdb.entityManager, { operationId: ENABLE_MIGRATION_OPERATION_ID });
      return enabled;
    });
    this.#rxdb.installWorkingTreeCapture(adapter);
    return info;
  }

  /**
   * 受管成员的**唯一**入口：开写事务、过能力门禁、再跑命令体。
   *
   * @param run - 命令体；拿到的执行器与门禁读能力行用的是同一个
   * @returns 命令体的返回值
   * @throws {@link WorkingTreeCapabilityDisabledError} 未启用时
   * @throws {@link RxDBError} 能力行缺失时（`0004` 迁移没写入那一行）
   * @throws {@link UnsupportedRxDBSystemVersionError} 能力版本三元组与本进程不符时
   *
   * @remarks
   * 四步顺序都是有理由的：
   *
   * 1. **先开事务**。门禁读到的启用态与命令体的写入必须同进同出，否则两者之间隔着
   *    一个别人可以 `disable` 的窗口（v1 还没有 disable，但这个窗口不该靠「暂时没人
   *    能用它」来关闭）。
   * 2. **读能力行**，行缺失时让 `readCommitCapability()` 自己抛。缺行是「表建了但没有
   *    那一行」的损坏现场，不是关闭状态；按关闭处理等于让用户以为点一下 `enable()`
   *    就好了，而那条 CAS 会打在一张空表上、命中 0 行。
   * 3. **未启用先于版本比对**。一个还没启用的库，最该听到的是「去 enable()」，
   *    而不是「你的 codec 版本是 1、本进程要 2」——后者对它毫无可操作性。
   * 4. **版本比对复用 `assertSupportedCommitCapability()`**，不在这里另写一遍比较。
   *    两份比较逻辑迟早会在某次 bump 时分岔，而 fail-closed 恰恰依赖它们一致。
   *
   * 受管成员的**参数校验必须写在 `run` 里面**：写在调用 `runEnabled()` 之前的话，
   * 未启用的库会先回答「message 不能为空」——一个在这个库上根本无从谈起的问题。
   */
  protected async runEnabled<T>(run: (executor: TransactionExecutor) => Promise<T>): Promise<T> {
    return this.#runInTransaction(async executor => {
      const info = await readCommitCapability(executor);
      if (!info.enabled) throw new WorkingTreeCapabilityDisabledError();
      assertSupportedCommitCapability(info);
      return run(executor);
    });
  }

  /** 取本地适配器并开一个写事务。 */
  async #runInTransaction<T>(run: (executor: TransactionExecutor) => Promise<T>): Promise<T> {
    const adapter = await firstValueFrom(this.#rxdb.localAdapter$);
    return adapter.transaction(async executor => run(executor));
  }
}
