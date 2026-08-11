/**
 * @fileoverview AG-Grid 数据增量更新工具
 * 提供基于指纹对比的高效 Grid 更新机制
 */

import type { GridApi } from 'ag-grid-enterprise';

/**
 * 应用增量 Grid 更新
 *
 * 通过指纹对比计算 add/update/remove 事务，避免全量刷新 Grid。
 * 指纹用于唯一标识数据的某个版本，只有指纹变化时才触发更新。
 *
 * 工作原理：
 * 1. 遍历新数据，生成新指纹映射表
 * 2. 对比新旧指纹：不存在 → add，指纹变化 → update
 * 3. 查找旧映射表中不存在于新数据的 id → remove
 * 4. 调用 gridApi.applyTransaction 应用变更
 * 5. 原地更新 fingerprintMap（避免内存分配）
 *
 * 设计理念：
 * - "好品味"：充分相信指纹，指纹相同则跳过更新
 * - 简洁执念：单一职责，不处理初始加载逻辑
 * - 实用主义：原地修改 Map，减少 GC 压力
 *
 * @template T 数据类型（必须有 id 字段）
 * @param gridApi AG-Grid API 实例
 * @param newData 新数据数组
 * @param fingerprintMap 指纹映射表（会被原地修改）
 * @param getFingerprintFn 指纹生成函数
 *
 * @example
 * ```typescript
 * const fingerprintMap = new Map<string, string>();
 *
 * // 初始加载
 * if (fingerprintMap.size === 0) {
 *   gridApi.setGridOption('rowData', todos);
 *   todos.forEach(todo => {
 *     fingerprintMap.set(todo.id, getEntityStatus(todo).fingerprint);
 *   });
 * } else {
 *   // 增量更新
 *   applyIncrementalGridUpdate(
 *     gridApi,
 *     todos,
 *     fingerprintMap,
 *     (todo) => getEntityStatus(todo).fingerprint
 *   );
 * }
 * ```
 */
export function applyIncrementalGridUpdate<T extends { id: string }>(
  gridApi: GridApi,
  newData: T[],
  fingerprintMap: Map<string, string>,
  getFingerprintFn: (item: T) => string
): void {
  const add: T[] = [];
  const update: T[] = [];
  const newFingerprintMap = new Map<string, string>();

  // 计算 add/update
  for (const item of newData) {
    const fingerprint = getFingerprintFn(item);
    newFingerprintMap.set(item.id, fingerprint);

    const oldFingerprint = fingerprintMap.get(item.id);
    if (!oldFingerprint) {
      add.push(item);
    } else if (oldFingerprint !== fingerprint) {
      update.push(item);
    }
  }

  // 计算 remove
  const remove: T[] = [];
  for (const [id] of fingerprintMap) {
    if (!newFingerprintMap.has(id)) {
      remove.push({ id } as T);
    }
  }

  // 应用事务
  gridApi.applyTransaction({ add, update, remove });

  // 更新指纹映射表（原地修改）
  fingerprintMap.clear();
  newFingerprintMap.forEach((fingerprint, id) => {
    fingerprintMap.set(id, fingerprint);
  });
}
