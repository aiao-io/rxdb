/**
 * @fileoverview 工作树 / 提交变更集的 patch 编解码绑定（data-model.md §4）
 *
 * @remarks
 * 本文件**不实现编解码**，只把 `rxdb_working_tree_entry` 与 `rxdb_commit_change_set`
 * 的 `patch` / `inversePatch` 两列接到 `../system/change-codec.ts` 的同一对
 * {@link encodeRxDBChangePatch} / {@link decodeRxDBChangePatch} 上。
 * data-model.md §4 第一条写的是「**复用** change-codec.ts 的同一份 encode / decode，
 * 不写第二份编解码器」——这里的存在理由正是给「同一份」一个物理落点。
 *
 * 它替调用方做的只有三件事，都是既有两处调用点
 * （`rxdb-adapter-pglite/src/system/change-row.ts`、
 * `rxdb-adapter-sqlite-core/src/transaction_sqlite_result.ts`）各抄了一遍的：
 *
 * 1. 从行上的 `namespace` / `entity` 两列解析**目标实体**元数据（codec 需要它才知道哪几列是特殊类型）；
 * 2. 目标元数据缺失时的策略（见下）；
 * 3. 读端的形状校验（存进 json 列的东西可能被任何人改过）。
 *
 * **编解码两端对元数据缺失的策略是不对称的，这是故意的**：
 *
 * - 编码只发生在捕获路径上，而捕获的前提就是这次写入打在一个**已注册**的实体上，
 *   因此解析不到元数据属于不变量被破坏 → 直接抛。若改成"原样落盘"，一个 `bigint`
 *   字段会以未编码形态进 json 列，全程零报错，故障要到冷重放（SC-009）少一个字段时才浮现。
 * - 解码可能发生在**没有注册该实体**的进程里（另一个 Tab / 另一个宿主只装了部分实体）。
 *   缺元数据就没有"哪几列是特殊类型"的依据，猜着解只会把值改坏，因此原样返回——
 *   与 `change-row.ts` 对 `rxdb_change` 的既有口径一致。
 *
 * 加密列（`PropertyType.encrypted === true`）由底层 codec 自己跳过，本文件不重复判定：
 * 重复一遍就等于多一处会漂的真相。
 */

import type { EntityMetadata } from '../entity/metadata.interface.js';
import {
  decodeRxDBChangePatch,
  encodeRxDBChangePatch,
  type RxDBChangeEntityMetadataResolver
} from '../system/change-codec.js';

/**
 * 一行工作树条目 / 提交变更集上用来定位目标实体的两列。
 *
 * @remarks
 * 收成结构类型而不是 `WorkingTreeEntry | CommitChangeSet` 的联合：两张表的这两列同名同义，
 * 而 codec 只需要这两列。收窄入参也让写路径可以在实体对象**建好之前**先编码 patch。
 */
export interface WorkingTreePatchTarget {
  /** 目标实体的命名空间 */
  readonly namespace: string;
  /** 目标实体名 */
  readonly entity: string;
}

/**
 * 编解码所需的两个元数据解析器。
 *
 * @remarks
 * 两者查的**不是**同一个东西，别合并：
 *
 * - {@link WorkingTreePatchCodecContext.resolveTargetMetadata} 查的是 patch 所属的那个实体
 *   （由行上的 `namespace` / `entity` 给出），通常直接给 `schemaManager.getEntityMetadata`；
 * - {@link WorkingTreePatchCodecContext.resolveEntityMetadata} 查的是**外键对端**实体，
 *   只在目标实体的 `propertyMap` 里找不到某个外键列时才被调用，给适配器的
 *   `encryptionContext.resolveEntityMetadata` 即可。
 */
export interface WorkingTreePatchCodecContext {
  /** 按 `(entity, namespace)` 解析 patch 所属实体的元数据 */
  readonly resolveTargetMetadata: (entity: string, namespace: string) => EntityMetadata | undefined;
  /** 外键列反查对端实体元数据；缺省时外键列按本实体已声明的类型处理 */
  readonly resolveEntityMetadata?: RxDBChangeEntityMetadataResolver;
}

/**
 * 目标实体未在本进程注册时，编码端抛出的错误。
 *
 * @remarks
 * 单独一个类而不是裸 `Error`，是为了让捕获路径能把它与"patch 形状不对"
 * （{@link TypeError}）分开处理：前者是注册表问题，后者是数据问题。
 */
export class UnknownWorkingTreePatchEntityError extends Error {
  override readonly name = 'UnknownWorkingTreePatchEntityError';

  constructor(target: WorkingTreePatchTarget) {
    super(`Unknown RxDB working tree patch entity: ${target.namespace}.${target.entity}`);
  }
}

const assertPatchShape = (patch: unknown): Readonly<Record<string, unknown>> => {
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
    throw new TypeError('Invalid RxDB working tree patch');
  }
  return patch as Readonly<Record<string, unknown>>;
};

/**
 * 把一份 patch 编码成可落进 `patch` / `inversePatch` json 列的形态。
 *
 * @param context - 元数据解析上下文
 * @param target - 行上的 `namespace` / `entity` 两列
 * @param patch - 字段级变更；`null` / `undefined` 归一成 `null`
 * @returns 浅拷贝后的编码结果；入参不被改动
 * @throws {@link UnknownWorkingTreePatchEntityError} 目标实体未在本进程注册
 *
 * @remarks
 * 实际编码全部由 {@link encodeRxDBChangePatch} 完成，包括「`encrypted: true` 的列一律跳过」
 * 这一条——加密包自带 envelope，再包一层会让读端解出一坨字节流且不报错。
 */
export const encodeWorkingTreePatch = (
  context: WorkingTreePatchCodecContext,
  target: WorkingTreePatchTarget,
  patch: Readonly<Record<string, unknown>> | null | undefined
): Record<string, unknown> | null => {
  if (patch == null) return null;
  const metadata = context.resolveTargetMetadata(target.entity, target.namespace);
  if (!metadata) throw new UnknownWorkingTreePatchEntityError(target);
  return encodeRxDBChangePatch(metadata, patch, context.resolveEntityMetadata);
};

/**
 * {@link encodeWorkingTreePatch} 的逆运算。
 *
 * @param context - 元数据解析上下文
 * @param target - 行上的 `namespace` / `entity` 两列
 * @param patch - 列里存的值；`null` / `undefined` 归一成 `null`
 * @returns 还原后的浅拷贝；目标实体未注册时**原样返回**
 * @throws {@link TypeError} 列里存的不是普通对象（数组 / 标量 / 字符串）
 *
 * @remarks
 * 入参收成 `unknown`：这一列的值来自数据库，可能被任何路径写坏，
 * 按 `Record` 声明只是把校验推给调用方，而调用方通常也不校验。
 */
export const decodeWorkingTreePatch = (
  context: WorkingTreePatchCodecContext,
  target: WorkingTreePatchTarget,
  patch: unknown
): Record<string, unknown> | null => {
  if (patch == null) return null;
  const shaped = assertPatchShape(patch);
  const metadata = context.resolveTargetMetadata(target.entity, target.namespace);
  if (!metadata) return { ...shaped };
  return decodeRxDBChangePatch(metadata, shaped, context.resolveEntityMetadata);
};
