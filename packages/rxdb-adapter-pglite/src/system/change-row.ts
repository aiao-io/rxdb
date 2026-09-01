/**
 * `rxdb_change` 行的读端解码：把列里存的编码形式还原成运行时值。
 *
 * @remarks
 * 变更日志的 `entityId` / `patch` / `inversePatch` 三列存的都是**编码后**的形态
 * （`entityId` 带 {@link https://github.com/aiao-io/rxdb | codec} 信封，两个 patch 里
 * bigint / binary 等特殊类型另有编码）。任何把这三列 hydrate 成 `RxDBChange` 实体的
 * 路径都必须先过这里，否则实体上留下的是字符串信封而不是原值。
 *
 * 抽成独立模块而不是留在 Repository 里，是因为 PGlite 侧有**两条**hydrate 路径：
 * 仓储查询（`PGliteRepositoryBase.addQueryCache`）与事务结果映射
 * （`transaction_pglite_result`）。后者漏掉解码时不会立刻报错——它是
 * `UPDATE ... RETURNING *` 的写回路径，会把缓存里**已经解码好**的实体重新覆盖成
 * 原始列值，故障要等到下一次 undo/redo 读这个实体才浮现（表现为
 * `Cannot convert __rxdb_change_id__:{...} to a BigInt`）。sqlite-core 侧的
 * `transaction_sqlite_result` 一直是两条路径都解码的，这里补齐对称性。
 *
 * @module system/change-row
 */

import {
  decodeRxDBChangeEntityId,
  decodeRxDBChangePatch,
  getEntityMetadata,
  RxDBChange,
  type EntityMetadata
} from '@aiao/rxdb';
import { transformEntityValuePGliteToJs } from '../pglite.utils.js';
import type { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';

/**
 * 判断一份实体元数据是否就是 `RxDBChange` 的。
 *
 * @param metadata - 待判定的实体元数据
 * @returns 是 `RxDBChange` 时为 `true`
 *
 * @remarks
 * 用元数据对象**同一性**而不是比对 `name`：同名实体可以出现在不同 namespace 下，
 * 按名字判会把用户自己叫 `RxDBChange` 的表也拖进解码路径。
 */
export const isRxDBChangeMetadata = (metadata: EntityMetadata): boolean => metadata === getEntityMetadata(RxDBChange);

/**
 * 解码一行 `rxdb_change` 查询结果。
 *
 * @param adapter - 提供 schemaManager 与加密上下文的适配器
 * @param data - 已经过 `getEntityObjectFromResult` 的一行数据
 * @returns 同形状的新对象，`entityId` / `patch` / `inversePatch` 三列已还原
 *
 * @remarks
 * 目标实体的元数据取不到时（例如该实体未在本进程注册），两个 patch 原样返回：
 * 缺元数据就没有「特殊类型是哪几列」的依据，猜着解只会把明文改坏。`entityId`
 * 的信封是自描述的，不依赖目标元数据，因此**总是**解码。
 */
export const decodeRxDBChangeRow = (
  adapter: RxDBAdapterPGlite,
  data: Readonly<Record<string, unknown>>
): Record<string, unknown> => {
  const namespace = data['namespace'];
  const entity = data['entity'];
  const metadata =
    typeof namespace === 'string' && typeof entity === 'string' ?
      adapter.rxdb.schemaManager.getEntityMetadata(entity, namespace)
    : undefined;
  const decodePatch = (patch: unknown): Record<string, unknown> | null | undefined => {
    if (patch == null || !metadata) return patch as Record<string, unknown> | null | undefined;
    if (typeof patch !== 'object' || Array.isArray(patch)) throw new TypeError('Invalid RxDB change patch');
    const decoded = decodeRxDBChangePatch(
      metadata,
      patch as Readonly<Record<string, unknown>>,
      adapter.encryptionContext?.resolveEntityMetadata
    );
    return decoded ? transformEntityValuePGliteToJs(metadata, decoded) : decoded;
  };
  return {
    ...data,
    entityId: decodeRxDBChangeEntityId(data['entityId']),
    inversePatch: decodePatch(data['inversePatch']),
    patch: decodePatch(data['patch'])
  };
};
