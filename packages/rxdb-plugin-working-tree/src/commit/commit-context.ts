/**
 * @fileoverview 提交写/读路径要的那一份上下文（FR-038 的接线）
 *
 * @remarks
 * `commit/` 下的两条路径都不能只拿 {@link EntityManager}：
 *
 * - **写**（`write-commit.ts`）要在算 `contentFingerprint` 之前跑
 *   `assertCommitUnitsEncryptedAtRest()`，而那需要「实体元数据」与「at-rest 判定器」；
 * - **读**（`list-commits.ts` 的 `getCommitDetail`）要把落库行喂 `decodeCommitChangeSetUnits()`，
 *   而那需要同一份实体元数据解析。
 *
 * 把两样打成**一个**必填参数，而不是在 `writeCommit` 上挂一个可选的第四参：可选参数缺席时
 * 唯一能写的实现是「跳过校验」，那正是 FR-038 要排除的 fail-open 形态。收成必填之后，
 * 「有没有判定器」这个问题被推到 {@link CommitPatchCodecContext.isEncryptedAtRest} 上——
 * 它缺席是一次**声明出来的缺席**（该适配器不支持列加密），而不是调用方忘了传；
 * 真有加密列要判时 `assertCommitUnitsEncryptedAtRest()` 照样 fail-closed 地抛。
 *
 * 判定器不在这里就地推导，而是从适配器上取：`RxDB.localAdapterSync` 在**未连接**的库上抛错，
 * 而写路径的单元测试建的库从不 `connect()`；把推导塞进 `writeCommit` 会让它在那些库上不可用，
 * 也会让「这一次提交用的是哪个判定器」变成一个要顺着 `entityManager.rxdb` 猜的问题。
 * 门面本来就握着适配器（`WorkingTreeManager.#runInTransaction`），顺手建一次即可。
 */

import type { EntityManager, RxDBAdapterLocalBase } from '@aiao/rxdb';
import type { CommitPatchCodecContext } from './commit-codec.js';

/**
 * {@link createCommitWriteContext} 真正要用到的那两项，从适配器上 `Pick` 下来。
 *
 * @remarks
 * 收成结构类型而不是直接写 `RxDBAdapterLocalBase`，是因为那个类带 `#private` 字段，而
 * `RxDBAdapterBase.repository_map` 的值类型 `AdapterRepositoryConstructor<this>` 把 `this` 放在
 * **构造参数**位上——于是每一个子类实例在 `strictFunctionTypes` 下都不可赋给基类，包括测试里
 * 那个如假包换的 `MockLocalAdapter extends RxDBAdapterLocalBase`。基类注解在这里换来的不是
 * 类型安全，而是「只有基类本身能传进来」这条没人想要的约束。
 *
 * 仍然从类上 `Pick` 而不是手写两个字段：真实入参恒为一个适配器，两项的类型（尤其
 * `isEncryptedAtRest` 那个「声明出来的缺席」的可选性）必须跟着适配器一起演进，手抄一份会在
 * 签名变更的那天静默漂移。
 */
export type CommitWriteContextSource = Pick<RxDBAdapterLocalBase, 'rxdb' | 'isEncryptedAtRest'>;

/**
 * 一次提交（写或读）要的全部外部依赖。
 *
 * @remarks
 * 两项各自独立：`entityManager` 负责把行 `instantiate()` 出来（多个数据库共用同一个实体类时
 * `new Commit()` 判断不出目标库），`codec` 负责元数据解析与 at-rest 判定。合成一个对象是为了
 * 让「传了 entityManager 却没传 codec」在签名上就不可表达。
 */
export interface CommitWriteContext {
  /** 构造实体行用；必须来自目标数据库 */
  readonly entityManager: EntityManager;

  /** patch 编解码与 at-rest 判定上下文，见 {@link CommitPatchCodecContext} */
  readonly codec: CommitPatchCodecContext;
}

/**
 * 从本地适配器建出一次提交要的上下文。
 *
 * @param adapter - 当前库的本地适配器；`transaction()` 正是从它开的
 * @returns 见 {@link CommitWriteContext}
 *
 * @remarks
 * 两个元数据解析器指向**同一个**闭包，与两个适配器既有的 `encryptionContext` 同口径
 * （`RxDBAdapterPGlite.ts` / `RxDBAdapterSqliteBase.ts`）：`resolveTargetMetadata` 解析
 * 变更行自己的实体，`resolveEntityMetadata` 解析外键对端的实体，来源都是
 * `schemaManager.getEntityMetadata()`，分工写在 `working-tree-patch-codec.ts` 上。
 *
 * `isEncryptedAtRest` **要绑 `this`**：它在两个适配器上是普通实例方法，摘下来直接当函数传
 * 会丢掉接收者。不支持列加密的适配器上它本就不存在，取到 `undefined` 正是那条「声明出来的
 * 缺席」——见本文件 fileoverview。
 */
export const createCommitWriteContext = (adapter: CommitWriteContextSource): CommitWriteContext => {
  const { rxdb } = adapter;
  const resolve = (entity: string, namespace: string) => rxdb.schemaManager.getEntityMetadata(entity, namespace);
  return {
    entityManager: rxdb.entityManager,
    codec: {
      resolveTargetMetadata: resolve,
      resolveEntityMetadata: resolve,
      isEncryptedAtRest: adapter.isEncryptedAtRest?.bind(adapter)
    }
  };
};
