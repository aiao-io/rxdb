# Contract: `reorderTargetForDrop`（`@aiao/rxdb` 新增导出）

与 `reorderTargetForMove` 同在 `packages/rxdb/src/sortable/sortable.utils.ts`，经 `src/index.ts` 导出，带 TSDoc。

```ts
export const reorderTargetForDrop = <Id>(
  groupIds: readonly Id[],
  movedId: Id,
  targetId: Id,
  position: 'before' | 'after'
): ReorderBetween<Id> | null;
```

## 语义

1. `rest = groupIds` 去掉 `movedId`（`movedId` 可以不在 `groupIds` 里——跨组放置）。
2. `i = rest.indexOf(targetId)`。
3. `before` → `{ prevId: rest[i - 1] ?? null, nextId: targetId }`；`after` → `{ prevId: targetId, nextId: rest[i + 1] ?? null }`。
4. `movedId` 在 `groupIds` 里、且第 3 步的两个邻居恰好等于它在 `groupIds` 里原来的前后邻居（缺的一侧为 `null`）→ 返回 `null`（原位）。

结果的两个邻居至少一侧是 `targetId`，永远不会两侧都为 `null`。

## 抛错

| 条件                          | 错误         |
| ----------------------------- | ------------ |
| `movedId === targetId`        | `RangeError` |
| `targetId` 不在 `groupIds` 里 | `RangeError` |

调用方在调用前已判掉「拖到自己」（环检测，research R6），这两条只拦调用方的逻辑错误，与 `reorderTargetForMove` 的下标越界同一口径。

## 单测（`packages/rxdb/src/__tests__/sortable/reorder-target-for-drop.spec.ts`）

| 场景                                         | groupIds        | moved | target | position | 期望                                |
| -------------------------------------------- | --------------- | ----- | ------ | -------- | ----------------------------------- |
| 同组下移到两邻之间                           | A B C D         | D     | A      | after    | `{ A, B }`                          |
| 同组上移到组首                               | A B C D         | C     | A      | before   | `{ null, A }`                       |
| 同组到组尾                                   | A B C D         | A     | D      | after    | `{ D, null }`                       |
| 原位（目标是后邻、放在它前面）               | A B C           | A     | B      | before   | `null`                              |
| 原位（目标是前邻、放在它后面）               | A B C           | C     | B      | after    | `null`                              |
| 跳过自己：目标在被拖行之后、放在目标前面     | A B C           | A     | C      | before   | `{ B, C }`                          |
| 跨组（moved 不在 groupIds）                  | Q1 Q2           | P1    | Q1     | after    | `{ Q1, Q2 }`                        |
| 跨组到空侧                                   | Q1              | P1    | Q1     | before   | `{ null, Q1 }`                      |
| 拖到自己                                     | A B             | A     | A      | before   | `RangeError`                        |
| 目标不在组里                                 | A B             | A     | X      | after    | `RangeError`                        |
