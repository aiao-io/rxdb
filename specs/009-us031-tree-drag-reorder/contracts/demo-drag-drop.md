# Contract: 三端树页面的拖放（菜单 3 页 + 文件管理器 3 页）

三端同一份判定、同一组写入、同一组提示。实现位置见 plan「Project Structure」；本文件是三端单测与 e2e 的对照表。

## 1. 判定函数

每端一份纯函数，名字三端相同：`resolveTreeDrop(input) → TreeDropDecision`。拖动中的高亮与放下时的执行**调用同一个函数**，两处不得各判一遍
（Angular 文件管理器今天的高亮与执行分叉，research R5）。

```ts
type TreeDropInput<Id> = {
  movedId: Id;
  target: { id: Id; parentId: Id | null; isFolder: boolean }; // 菜单节点恒 isFolder = true
  position: 'before' | 'after' | 'into';
  manual: boolean; // 菜单恒 true；文件管理器 = sortMode === Manual
  movedParentId: Id | null;
  isTargetInMovedSubtree: boolean; // 目标是被拖节点自己或其后代（祖先链判断）
  groupIds: readonly Id[]; // 目标所在组的完整手动序列（research R2），position 为 into 时不用
};
type TreeDropDecision<Id> = { kind: 'reject' } | { kind: 'noop' } | { kind: 'reorder'; target: ReorderTarget<Id> };
```

### 判定表（自上而下，命中即返回）

| #   | 条件                                                                               | 结果                                                    |
| --- | ---------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 1   | `isTargetInMovedSubtree`                                                           | `reject`（环，含拖到自己）                              |
| 2   | `position = into` 且 `!target.isFolder`                                            | `reject`（文件不作拖入目标）                            |
| 3   | `position = into` 且 `manual`                                                      | `reorder { group: { parentId: target.id } }`            |
| 4   | `position = into` 且 `!manual` 且 `target.id === movedParentId`                    | `reject`                                                |
| 5   | `position = into` 且 `!manual`                                                     | `reorder { group: { parentId: target.id } }`            |
| 6   | `!manual` 且 `target.parentId === null` 且 `movedParentId !== null`                | `reorder { group: { parentId: null } }`（移到根组末尾） |
| 7   | `!manual`                                                                          | `reject`（非手动模式的其余前后放置）                    |
| 8   | `manual`，`reorderTargetForDrop(groupIds, movedId, target.id, position)` 为 `null` | `noop`                                                  |
| 9   | `manual`                                                                           | `reorder { prevId, nextId }`（第 8 行的返回值）         |

「拖进当前父节点」在手动模式按第 3 行处理：已是最后一个子节点时引擎零写，否则移到末尾（research R4）。

## 1.5 落点区间（FR-013）

与 `resolveTreeDrop` 同文件、三端同名的纯函数：

```ts
treeDropPosition(offsetY: number, height: number, ctx: { manual: boolean; targetIsRoot: boolean }): 'before' | 'after' | 'into';
```

| 条件                         | 结果           |
| ---------------------------- | -------------- |
| `!manual` 且 `!targetIsRoot` | `into`（整行） |
| `offsetY < height / 3`       | `before`       |
| `offsetY > height * 2 / 3`   | `after`        |
| 其余                         | `into`         |

菜单恒 `manual: true`。Angular 菜单的 `calculateDropMode`（25% / 75%）、Angular 文件管理器的 `calculateDropMode`、React / Vue 的 `DROP_ZONE_THRESHOLD` 一律由它取代。
单测三端同名：三档边界各一条、非手动模式非根级行整行 `into`、非手动模式根级行仍分三档。

## 2. 写入与失败

- `reorder` → `await rxdb.entityManager.getRepository(Entity).reorder(movedId, target)`；`reject` / `noop` 不调用。
- 页面判定为 `reject` 时不调用引擎、不出页内提示，以拖动中的 `data-drop-valid="false"` 表示（FR-007）。
- 调用经阶段 A 的 `runWrite`（Angular）/ `runWrite`（React `useTreeWriteError`）/ `guardWrite`（Vue `useTreeWriteError`），操作名 `'拖放'`：
  失败时页内提示 `拖放失败：<错误消息>`，`role="alert"`，`data-testid="tree-write-error"`；新一次写入开始时清空。
- 拖拽状态（被拖节点、落点、高亮）在成功、失败、`reject`、`noop` 四条路径上都复位（`finally`）。
- 删除 `window.alert`（Angular 两个拖放基类、React 六页）与 `useToast().error`（Vue 六页）在拖放路径上的调用。
- 懒加载页拖进节点后展开目标（三端现状保留）。

## 3. DOM 约定（三端同名，e2e 用）

| 位置           | 属性                                            | 取值                                           |
| -------------- | ----------------------------------------------- | ---------------------------------------------- |
| 节点行         | `data-testid="menu-row"` / `"file-row"`（现有） |                                                |
| 节点行         | `data-parent-id`（现有）                        | 父节点 id，根为空串                            |
| 拖动中的目标行 | `data-drop-mode`                                | `before` / `after` / `into`                    |
| 拖动中的目标行 | `data-drop-valid`                               | `true` / `false`（判定为 `reject` 时 `false`） |

React / Vue 已有后两个属性；Angular 补上（现只有 `drop-*` class）。

## 4. 单测（三端同名）

每端对 `resolveTreeDrop` 跑判定表的 9 行各一条；另有：

- 「拖进折叠且子节点未加载的节点，目标是 `{ group }`、不读子节点」（缺陷三，不修即红）
- 「前后放置的邻居取自组的完整序列，不取搜索过滤后的可见行」（Angular / React / Vue 菜单 store）
- 「`reorder` 抛 `SortOrderError('staleTarget')` 时页内提示 `拖放失败：…`、拖拽状态复位、不弹窗」
- 「`reject` / `noop` 不调用 `reorder`」
- 文件管理器：「手动模式显示顺序 = 查询顺序（`getSortComparator(Manual)` 为 `null`）」；React 删除「自由排序保持文件夹优先」用例

被删代码（`calculateDropPosition`、`rebalanceSortOrder`、`compareSortOrder`、`isDropRedundant`、`resolveSiblings` 等）的单测随之删除。

## 5. e2e（三端 `tree-drag-reorder.spec.ts`，同名用例，`mode: 'serial'`）

| 用例                                                   | 页面                       | 断言（刷新后）                  |
| ------------------------------------------------------ | -------------------------- | ------------------------------- |
| 同父拖到两邻之间                                       | 菜单 simple                | A、D、B、C                      |
| 拖到组首与组尾                                         | 菜单 simple                | C 在首 / A 在尾                 |
| 跨父拖到两个子节点之间                                 | 菜单 simple                | p1 的父为 Q，Q 下 q1、p1、q2    |
| 拖进折叠的懒加载节点，展开后排在末尾（缺陷三）         | 菜单 lazy、文件管理器 lazy | c1、c2、X                       |
| 拖到后代上被拒、零写                                   | 菜单 simple                | 顺序与父节点不变，撤销计数不变  |
| 原位放下与拖进当前父节点（已是末尾）都零写             | 菜单 simple                | 顺序不变，撤销计数不变          |
| 拖放后撤销一次恢复                                     | 菜单 simple                | 父节点与顺序复原                |
| 虚拟滚动页同父重排                                     | 菜单 virtual               | 同第一条                        |
| 文件管理器手动模式：文件夹之间重排、拖进文件夹         | 文件管理器 simple          | 顺序与父节点                    |
| 文件管理器非手动模式：子级拖到根级节点下方移到根组末尾 | 文件管理器 simple          | 切回手动后根组末尾是它          |
| 文件管理器非手动模式：同级前后放置被拒                 | 文件管理器 simple          | `data-drop-valid="false"`，零写 |
