/**
 * @fileoverview commit / ChangeSet / baseline 的加密列 at-rest 绑定（FR-038，契约见 data-model.md §4）
 *
 * @remarks
 * 这里有两个符号，守的是同一条边界的两端：
 *
 * - {@link assertCommitUnitsEncryptedAtRest}：**写入前**确认交给 commit 的每个加密列值
 *   已经是加密后的落库形态；
 * - {@link decodeCommitChangeSetUnit}：**读出去**时把行经既有 codec 解回变更单元，
 *   而加密列在这一步**不解密**。
 *
 * 本文件**不实现编解码**，也不提供任何 encode 入口，理由分别是：
 *
 * - 编解码只有一份，在 `../system/change-codec.ts`，由
 *   `../working-tree/working-tree-patch-codec.ts` 接到两张表的 `patch` / `inversePatch`
 *   两列上（data-model.md §4 第一条）。这里只是把 commit 侧的读路径接到同一份上——
 *   不接，`list-commits.ts` 的 `getCommitDetail` 就会各写一份，而"各写一份"在
 *   `bigint` 字段上表现为静默丢精度。
 * - commit 是一次**拷贝**：捕获阶段已经编码过一次，写入方再 encode 一遍就是二次包裹，
 *   而二次包裹不报错（`change-codec.ts` 对加密列是跳过的，它不知道那一列被包过几次）。
 *   所以本模块不给 encode——给了就一定有人调用。
 *
 * ## 加密列的落库形态是**信封字符串**
 *
 * 这是全文件的判定方向，按适配器的实际行为定案，不按注释：
 *
 * - `rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts` 把 `keyring.encrypt()` 的返回值
 *   直接写进列；同一文件的读端对非字符串的值抛
 *   `EncryptedDecryptError({ code: 'malformed_envelope' })`，措辞是「is not a string envelope」。
 * - `rxdb-adapter-pglite/src/table/trigger_sql.ts` 的捕获触发器取 `to_jsonb(NEW."col")`，
 *   即**已加密的那一列**，拿到的同样是那个字符串。
 *
 * 于是一段裸 `Uint8Array` 出现在加密列上一定是错的，而且是不会报错的那种错：
 * `patch` 是 `PropertyType.json` 列，字节数组进出一趟变成 `{"0":222,…}`，
 * 写得进、读得回，直到解密时才炸在另一次调用里。
 *
 * ## 判定器由调用方注入
 *
 * 一个 `PropertyType.string` 的加密列，明文与密文**都是字符串**——脱离具体加密方案，
 * 「这是不是已加密的形态」在形状上无法判定，自己猜一套规则等于给 FR-038 装一个会看走眼的
 * 门卫。权威判定器是 `@aiao/rxdb-adapter-encrypted` 的 `isEnvelope`，而 `@aiao/rxdb`
 * **不能**依赖它：后者 peer-depend 前者，依赖方向是反的（既有先例见
 * `../entity/metadata-transition.ts`）。所以判定器从
 * {@link CommitPatchCodecContext.isEncryptedAtRest} 注入，适配器侧把 `isEnvelope` 传进来即可。
 *
 * 缺判定器时 **fail-closed**：有加密列的值要判、却没有判定器，抛
 * {@link CommitEncryptedAtRestError}，而不是跳过检查。跳过的现象是全绿，代价是一次漏配
 * 把整条安全检查静默关掉。
 *
 * ## 调用顺序：断言必须跑在算指纹之前
 *
 * `computeCommitContentFingerprint` 会把每个单元的内容（含加密列的值）压进一个 SHA-256。
 * 若先算指纹再校验，一个明文落进加密列的错误提交会在 `rxdb_commit.contentFingerprint`
 * 上留下一个对该明文的确证——拿到库但没有密钥的人可以拿它做确认预言机。所以本断言收的是
 * {@link CommitChangeUnitContent}（**不含** `fingerprint`），从签名上就允许在指纹存在之前调用。
 *
 * ## 写路径带的是落库形态，读路径才解码
 *
 * `commit-graph-guard.ts` 的重算**不**经过本文件的 decode，这是对的：写入时的指纹算在
 * 落库形态上，重算也必须算在落库形态上，中间插一次 decode 会让两边分叉。
 * {@link decodeCommitChangeSetUnit} 只服务于「读出去给调用方看」（`list-commits.ts` 的
 * `getCommitDetail`、US-307 的恢复重放），不要拿去喂守卫。
 */

import type { EntityMetadata } from '@aiao/rxdb';
import { RxDBError } from '@aiao/rxdb';
import type { WorkingTreePatchCodecContext, WorkingTreePatchTarget } from '../working-tree/working-tree-patch-codec.js';
import {
  UnknownWorkingTreePatchEntityError,
  decodeWorkingTreePatch
} from '../working-tree/working-tree-patch-codec.js';
import type { CommitChangeUnitContent } from './change-unit.js';
import type { CommitChangeSet } from './commit-change-set.entity.js';

/**
 * 判定一个值是否已处于「加密后的落库形态」。
 *
 * @param value - 落库列里的值；调用方保证它既非 `null` 也非 `undefined`
 * @returns 是落库形态返回 `true`
 *
 * @remarks
 * 真实实现是 `@aiao/rxdb-adapter-encrypted` 的 `isEnvelope`。收成回调而不是在本包里
 * 认形状的理由见本文件 fileoverview「判定器由调用方注入」。
 */
export type CommitEncryptedAtRestRecognizer = (value: unknown) => boolean;

/**
 * commit 侧 patch 编解码与 at-rest 校验所需的上下文。
 *
 * @remarks
 * 在 {@link WorkingTreePatchCodecContext} 上只加一项
 * {@link CommitPatchCodecContext.isEncryptedAtRest}；两个元数据解析器的分工不变，见那边的说明。
 */
export interface CommitPatchCodecContext extends WorkingTreePatchCodecContext {
  /**
   * at-rest 形态判定器；**缺省不等于放行**。
   *
   * @remarks
   * 只有「这一批 patch 里压根没有加密列的值要判」时才可以不给。一旦有值要判而它缺席，
   * {@link assertCommitUnitsEncryptedAtRest} 抛 {@link CommitEncryptedAtRestError}。
   */
  readonly isEncryptedAtRest?: CommitEncryptedAtRestRecognizer;
}

/** 承载变更内容的两列，两者同权：反向数据泄漏与正向数据泄漏是同一件事。 */
export type CommitPatchColumn = 'patch' | 'inversePatch';

/** 一次 at-rest 命中的成因。 */
export type CommitEncryptedAtRestReason =
  /** 值不是加密后的落库形态——明文，或裸密文字节 */
  | 'not_at_rest'
  /** 有加密列的值要判，但上下文没有提供判定器 */
  | 'missing_recognizer';

/**
 * 一行 `rxdb_commit_change_set` 中参与还原的那九列。
 *
 * @remarks
 * 收成 `Pick` 而不是整个 {@link CommitChangeSet}：还原只需要这九列，收窄入参让
 * {@link decodeCommitChangeSetUnit} 也能直接吃裸行对象（跨进程传过来的、测试里拼的），
 * 而不必先构造一个实体实例。九列的取值与 {@link CommitChangeUnitContent} 一一对应。
 */
export type CommitChangeSetRow = Pick<
  CommitChangeSet,
  'unitId' | 'transactionId' | 'namespace' | 'entity' | 'entityId' | 'operation' | 'patch' | 'inversePatch' | 'origin'
>;

/**
 * 一个加密列的值没有以落库形态进入 commit（FR-038）。
 *
 * @remarks
 * 携带的全部是**身份与位置**：命名空间、实体名、实体主键、单元 id、列名、属性名、成因。
 * **不带那个值本身**——`errorSurfaceOf` 之类的诊断会把错误的自有属性整体序列化，
 * 而这里被拒的值恰好有很大概率就是明文，带上它等于把明文写进日志。
 *
 * 实体主键可以带：`@aiao/rxdb-adapter-encrypted` 的 `validateEncryptedPropertyMetadata`
 * 禁止把主键声明成加密列，所以 `entityId` 永远不是加密字段值。
 *
 * 没有对应的 {@link CommitErrorCode}：那张码表由 `commit-error-codes.spec.ts` 钉成
 * 「恰好八条，不多不少」，而本错误是写入前的入参校验，不是调用方需要分支处理的库状态。
 */
export class CommitEncryptedAtRestError extends RxDBError {
  /**
   * 只由本文件的 `assertColumnEncryptedAtRest` 在逐列扫描时构造。
   *
   * @remarks
   * 七项全部走参数属性，于是「错误的自有属性恰好是身份与位置、且只有身份与位置」这条不变量
   * 在签名上就能核对完。想往错误里补上下文的人必须动这份签名，而不是在抛出点 `Object.assign`
   * 一个字段上去——后者不产生任何编译错误，却足以让被拒的那个值（很可能正是明文）
   * 随诊断序列化流出去，而不让它流出去正是本类存在的理由（见类注释）。
   */
  constructor(
    /** 目标实体的命名空间 */
    readonly namespace: string,
    /** 目标实体名 */
    readonly entity: string,
    /** 目标实体主键 */
    readonly entityId: string,
    /** 命中处所属的变更单元 */
    readonly unitId: string,
    /** 命中处所在的列 */
    readonly column: CommitPatchColumn,
    /** 命中处的加密属性名 */
    readonly property: string,
    /** 见 {@link CommitEncryptedAtRestReason} */
    readonly reason: CommitEncryptedAtRestReason
  ) {
    super(
      `Encrypted column '${namespace}.${entity}.${property}' of change unit '${unitId}' ` +
        `(entityId '${entityId}', column '${column}') is not verified at rest (${reason}).`
    );
    this.name = 'CommitEncryptedAtRestError';
    Object.setPrototypeOf(this, CommitEncryptedAtRestError.prototype);
  }
}

/** 校验单个单元的一列；`patch` 为空或该实体没有加密属性时直接返回。 */
const assertColumnEncryptedAtRest = (
  context: CommitPatchCodecContext,
  metadata: EntityMetadata,
  unit: CommitChangeUnitContent,
  column: CommitPatchColumn,
  patch: Readonly<Record<string, unknown>> | null
): void => {
  if (patch === null || metadata.encryptedPropertyMap.size === 0) return;
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined || !metadata.encryptedPropertyMap.has(key)) continue;
    const recognize = context.isEncryptedAtRest;
    const reason: CommitEncryptedAtRestReason | undefined =
      !recognize ? 'missing_recognizer'
      : recognize(value) ? undefined
      : 'not_at_rest';
    if (reason) {
      throw new CommitEncryptedAtRestError(
        unit.namespace,
        unit.entity,
        unit.entityId,
        unit.unitId,
        column,
        key,
        reason
      );
    }
  }
};

/**
 * 校验一批变更单元的加密列都已处于落库形态（FR-038）。
 *
 * @param context - 元数据解析与 at-rest 判定上下文
 * @param units - 待提交的变更单元，**按写入顺序**；baseline 提交传空数组
 * @throws {@link CommitEncryptedAtRestError} 某个加密列的值不是落库形态，或没有判定器可判
 * @throws {@link UnknownWorkingTreePatchEntityError} 某个单元的目标实体未在本进程注册
 *
 * @remarks
 * **必须在算 `contentFingerprint` 之前调用**，理由见本文件 fileoverview「调用顺序」。
 *
 * 只看 `metadata.encryptedPropertyMap` 里的那些键：非加密列里的明文本来就该是明文，
 * 把它们也拖进判定只会让调用方为了过检查去加密不需要加密的列。
 *
 * 目标实体解析不到时抛，与 `encodeWorkingTreePatch` 同一口径——这条路径只在写入侧跑，
 * 而写入的前提就是实体已注册；原样放行等于「查不到就不查」，正是 fail-open。
 *
 * baseline 提交（`kind: 'baseline'`）不带任何变更单元，因此没有加密暴露面；
 * 传空数组是 no-op，也不需要判定器。将来若有人想「顺手给 baseline 存一份实体快照」，
 * 会先在这里撞上——那份快照必须同样受本断言约束。
 */
export const assertCommitUnitsEncryptedAtRest = (
  context: CommitPatchCodecContext,
  units: readonly CommitChangeUnitContent[]
): void => {
  for (const unit of units) {
    const metadata = context.resolveTargetMetadata(unit.entity, unit.namespace);
    if (!metadata) throw new UnknownWorkingTreePatchEntityError({ namespace: unit.namespace, entity: unit.entity });
    assertColumnEncryptedAtRest(context, metadata, unit, 'patch', unit.patch);
    assertColumnEncryptedAtRest(context, metadata, unit, 'inversePatch', unit.inversePatch);
  }
};

/**
 * 把一行 `rxdb_commit_change_set` 还原成变更单元内容。
 *
 * @param context - 元数据解析上下文；本函数不判定 at-rest，因此不需要判定器
 * @param row - 落库行的九列
 * @returns 进摘要的那九列；`patch` / `inversePatch` 已过 codec 解码
 * @throws {@link TypeError} 列里存的不是普通对象
 *
 * @remarks
 * 解码全部交给 {@link decodeWorkingTreePatch}，包括「目标实体未注册就原样返回」这一条——
 * 另一个 Tab / 另一个宿主可能只注册了部分实体，猜着解只会把值改坏。
 *
 * 加密列由底层 codec 跳过，因此**保持落库形态**：核心不解密。把密文解回明文是 US-307
 * 恢复时在调用方的加密上下文里发生的事，放在这里等于让每一次读历史都把明文带进内存。
 *
 * 返回值不含 `fingerprint` / `baseFingerprint`：前者由 {@link computeChangeUnitFingerprint}
 * 从内容算出，这里凭空造一个就等于多一份口径；后者压根没有落库（见 `change-unit.ts`）。
 */
export const decodeCommitChangeSetUnit = (
  context: WorkingTreePatchCodecContext,
  row: CommitChangeSetRow
): CommitChangeUnitContent => {
  const target: WorkingTreePatchTarget = { namespace: row.namespace, entity: row.entity };
  return {
    unitId: row.unitId,
    transactionId: row.transactionId,
    namespace: row.namespace,
    entity: row.entity,
    entityId: row.entityId,
    operation: row.operation,
    patch: decodeWorkingTreePatch(context, target, row.patch),
    inversePatch: decodeWorkingTreePatch(context, target, row.inversePatch),
    origin: row.origin
  };
};

/**
 * {@link decodeCommitChangeSetUnit} 的批量版本，**保持入参顺序**。
 *
 * @param context - 元数据解析上下文
 * @param rows - 落库行，调用方按 `sequence` 排好序
 * @returns 与入参等长同序的变更单元内容
 *
 * @remarks
 * 顺序即语义：`sequence` 按这个顺序发放，恢复也按这个顺序重放。这里不重新排序，
 * 排序是读路径（`list-commits.ts`）的职责——两处都排会在一处改了 ORDER BY 时静默分叉。
 */
export const decodeCommitChangeSetUnits = (
  context: WorkingTreePatchCodecContext,
  rows: readonly CommitChangeSetRow[]
): readonly CommitChangeUnitContent[] => rows.map(row => decodeCommitChangeSetUnit(context, row));
