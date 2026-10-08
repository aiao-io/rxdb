# Research: US-031 阶段 B — 树页面拖放与显示顺序

现状盘点（2026-10-08，三端源码逐文件核对）的结论散在下面各条里，文件与行号以当日 `003-us031-sortable-tree-entities` 为准。

## R1 拖放交给引擎的入口与目标换算

**Decision**：三端拖放一律调用 `rxdb.entityManager.getRepository(Entity).reorder(id, target)`。

前后放置的邻居换算收进 core，新增纯函数 `reorderTargetForDrop(groupIds, movedId, targetId, position)`，与已导出的 `reorderTargetForMove` 并列：

- 返回 `{ prevId, nextId }`；
- 原位时返回 `null`；
- 目标不在组里、或目标就是被拖行时抛 `RangeError`。

拖进节点直接写 `{ group: { parentId: target.id } }`，不经换算；非手动模式「移到根级」写 `{ group: { parentId: null } }`。

**Rationale**：

- `reorder()` 在一个事务内读邻居、复核相邻、算键、写分组字段与 `sortOrder`，正是三条缺陷与三端分叉缺的那一半（故事「病灶在结构上」）。
- 前后放置的换算三端今天各写一份（Angular `menu-drag-drop.service.ts` / `file-drag-drop.service.ts`，React / Vue `useDragDropService.ts`），
  比较器写法各不相同（`||` 与 `??`）。只把「算键」交给引擎、把「找邻居」留三份，故事要消除的「三端各算一遍」会以另一种形式留下。
- `reorderTargetForMove(ids, from, to)` 只覆盖同组移动（下标都在同一个序列里）。跨父放置时被拖行不在目标组，需要「按目标 id 与上 / 下」的形态。
- 三端 todo 页（US-028 阶段 E）已经用 core 的 `reorderTargetForMove`，同一类换算放 core 有先例。

**Alternatives considered**：

- 三端各留一份换算、用同一张契约表的单测对齐：三份实现对同一张表，仍会漂移，且每份都要维护「原位」判断。
- 放进 `@aiao/rxdb-plugin-tree`：换算与树无关（只看一个序列），放树插件会让非树的手动排序列表用不上，也扩大了插件的公开面。
- 不做原位判断、一律交给引擎：引擎对原位零写，结果正确；但页面没法在提交前区分「原位」与「要写」，拖拽中的落点高亮与零写断言都要等一次事务。
  `reorderTargetForDrop` 返回 `null` 让页面不发事务。

## R2 邻居取自组的完整序列

**Decision**：前后放置时，`groupIds` 取目标所在组在内存里的**完整**手动序列：

- 全量页是查询结果按父节点分组后的数组；
- 懒加载页是该父节点已加载的整组子节点；
- 根组是根查询结果。

不取页面渲染出来的可见行。

**Rationale**：

- Angular 菜单的搜索会过滤掉不匹配的兄弟（`tree-menu.store.ts` 的 `visibleIds`），虚拟滚动只渲染窗口内的行。
  拿可见行算邻居，会把隐藏的兄弟夹在两个邻居之间，引擎按 `staleTarget`（邻居不相邻）拒绝。
- 懒加载页展开节点时经 `findAll({ where: parentId = X })` 取该组全部子节点，不分页（Angular `tree-menu-lazy.store.ts:327`，React / Vue 同），
  所以目标可见时它的整组已在内存。拖进折叠节点用 `{ group }`，不需要它的子节点。React 为此补的 `resolveSiblings` / `mergeById` 随之删除。

**Alternatives considered**：拖动时读库取目标组（React 现状）——多一次查询，而 `reorder()` 自己会在事务里复核邻居，读库得到的序列在提交时同样可能过期。

## R3 显示顺序取自查询默认排序

**Decision**：

- 三端六页的查询删掉 `orderBy: [{ field: 'sortOrder', sort: 'asc' }]`。
- 建树时按查询结果的顺序分组，不再排序：Angular `compareSortOrder`、React / Vue `utils/sort-order.ts`、React virtual store 的内联比较器、Angular 懒加载菜单的内联比较器全部删除。
- 文件管理器 `getSortComparator(SortMode.Manual)` 改为返回 `null`，调用方遇到 `null` 不排序。
- React / Vue 懒加载文件管理器的「文件夹优先」预排序删除。

**Rationale**：

- `Repository.find` / `findAll` / `findOne` / `findOneOrFail` 在未给 `orderBy` 时都经 `normalizeManualOrderBy` 补 `[parentId asc, sortOrder asc, id asc]`（`Repository.ts:269`、`:288`、`:320`、`:349`）。
  按父节点查询的懒加载页同样适用，同组行连续、组内按手动顺序。
- 显式 `orderBy: sortOrder` 被原样尊重、不补 `id`（US-028 契约），删掉才走默认排序。
- 活查询的增量合并只在 `orderBy` 非空时重排，归一化后的默认排序正是非空的，拖放后列表会换位（`sortable.utils.ts:64` 的说明）。
- `findDescendants` 只在级联删除里用（Angular `tree-menu.store.ts:344`、React 两个懒加载 store），与显示顺序无关，不动（故事 Out of Scope「树查询的排序」）。
- 「文件夹优先」预排序之后，`treeNodes` 还会按排序模式再排一次：Vue 手动模式随即被纯 `sortOrder` 覆盖，React 手动模式本身就是文件夹优先（`file-sorters.ts:60-70`）。
  去掉预排序、Manual 不排序后，三端手动模式都显示库里的顺序。
- 非手动模式的比较器保留（故事 Out of Scope）。

**Alternatives considered**：Manual 返回恒为 0 的比较器（依赖稳定排序）——语义上仍是「排序」，调用方看不出这一档不排；返回 `null` 让「不排序」显式出现在类型里。

## R4 原位与拖进当前父节点

**Decision**：

- **前后放置**：由 `reorderTargetForDrop` 判原位。被拖行在 `groupIds` 里，且换算出的两个邻居恰好是它原来的两个邻居时，返回 `null`，页面不调用 `reorder()`。
- **手动模式拖进节点**：一律 `{ group: { parentId } }`。已是该组最后一个时引擎零写，不是最后一个则移到末尾。
- 三端现有的「冗余判断」删除：Angular `isDropRedundant` 用 `compareSortOrder`；React 对「拖进当前父节点」一律不动。

**Rationale**：

- 故事 AC#5 是「拖进节点一律追加到其子节点末尾」「原位零写」。React 的「拖进当前父节点不动」与前一句矛盾，Angular 的 `isDropRedundant` 已与此一致。
- 引擎对已在目标位置的行原样返回、零写（`Repository.ts:482-504`），不产生历史项。所以「拖进节点」不必在页面重复判断原位。

## R5 文件管理器非手动模式的规则

**Decision**：三端采用同一张规则表（[contracts/demo-drag-drop.md](contracts/demo-drag-drop.md)），沿用 Angular 现状（`file-drag-drop.service.ts:94-125`）。

- 拖进文件夹：追加到末尾。拖进被拖节点当前的父文件夹被拒。
- 非根级节点拖到根级节点上方 / 下方：追加到根组末尾。
- 其余前后放置被拒，包括根级节点之间。

React / Vue 的拖放给拖放层加上排序模式这一输入。

**Rationale**：

- 非手动模式显示的不是手动顺序，前后放置的位置对用户不可见。React / Vue 今天照样改写 `sortOrder`，界面看不出变化，切回手动模式时顺序莫名其妙。
- Angular 的规则在拖动高亮时生效，执行时却没传排序模式（`executeDrop` 调 `isValidDrop` / `calculateDropPosition` 时 `isManualSort` 走默认 `true`，`:305`、`:323`），
  于是「移到根级」那一支在执行时走不到。本阶段把高亮与执行收进同一个判定函数，两处不可能再分叉。
- 「拖进当前父文件夹」在手动模式下有意义（移到末尾），在非手动模式下用户看不到末尾，沿用现状拒绝。

## R6 环检测

**Decision**：三种落点（前、后、内部）都在调用 `reorder()` 之前判「目标是被拖节点自己或其后代」，沿用 demo 的祖先链判断。

**Rationale**：

- 前后放置到后代上，等于把被拖节点改挂进自己的子树。Vue 今天只在「拖进」时判（`useDragDrop.ts` 的 `validateDrop`），前后放置不判，能造出环。
- 引擎的 `reorder()` 不知道树语义，不判环（故事 Out of Scope 写入期环检测）。

## R7 失败处理

**Decision**：

- 阶段 A 的 `TreeWriteOperation` 增加一档 `'拖放'`，文案 `拖放失败：<错误消息>`，三端同名。
- 拖放失败写进同一个页内提示（Angular `writeError` / `app-tree-write-error`，React `OperationErrorAlert`，Vue `TreeWriteError`）。
- 删除 `window.alert`（Angular、React）与 `useToast`（Vue）。
- 拖拽状态在 `finally` 里复位，不自动重试。
- 页面提交前拒绝的落点（环、非手动模式的同级前后、文件作目标）不弹提示，沿用拖动中的「无效」高亮，放下时零写。

**Rationale**：

- 阶段 A 把除拖放外的写入失败统一到页内提示，`tree-write-error.ts` 的注释明写「除拖放外」，FR-008 留给本阶段。
- `staleTarget` / `notFound` 的含义是「重新查询再试」（`sortable-error.ts`），而树页面由活查询驱动：失败时界面已经是库里的顺序，用户再拖一次即可。
- 被拒落点的「无效」高亮在三端已经存在（Angular `drop-invalid` class，React / Vue `data-drop-valid="false"`）。放下时再弹一次错误是重复提示。

## R8 撤销

**Decision**：三端沿用页面现有的撤销按钮（`history.undo()`），不改。

**Rationale**：`reorder()` 走主适配器事务，history 里这一项的类型是 `TRANSACTION`（US-028「重排写入」），一次撤销恢复一次拖放。

Angular 菜单在算键失败时的整组重编号会产生 N 条历史，随 `rebalanceSortOrder` 删除而消失。e2e 断言撤销后父节点与顺序复原，不断言历史项类型（故事技术笔记「撤销」）。

## R9 e2e 的拖拽方式与对称性

**Decision**：

- 三端 e2e 各新建 `tree-drag-reorder.spec.ts`，用例同名，`mode: 'serial'`（[local-e2e 并发干扰的先例](../008-us031-sortable-tree-entities/tasks.md)）。
- 每端 e2e 项目里各写一个真实鼠标拖拽 helper：`mouse.move` → `down` → 分步 `move` → `up`。
- 落点取目标行高的 15% / 50% / 85%，分别落进「上方 / 拖进 / 下方」三档。三端的落点区间本阶段统一为三等分（见 R11），15% / 85% 离 1/3、2/3 边界足够远。
- 操作后刷新页面读回顺序。
- Angular 行模板补 `data-drop-mode` / `data-drop-valid` 两个属性，与 React / Vue 同名，供断言高亮。

**Rationale**：

- 故事 AC#5、#6 要求真实拖拽。现有 React 的「重排」用例把 A 放在 B 中央（实为拖进），断言也弱；Angular `menu-drag-sort.spec.ts` 没有拖拽；Vue 没有文件管理器拖放。
- 本阶段的用例是新增，不改旧用例。

**拖拽失败路径不进 e2e**：同一页面里活查询会在拖动前把界面刷新到库里的状态，提交时的 `staleTarget` 在 Playwright 下没有确定性的触发点。

- 失败分支由三端单测（mock 仓库的 `reorder` 抛 `SortOrderError`）覆盖：断言页内提示、拖拽状态复位、零写。
- 这与阶段 A 对页内提示的处理相同，见 plan 的 Complexity Tracking。

## R10 性能

**Decision**：SC-004（松开到新顺序可见 ≤ 1 秒）在 demo 虚拟滚动页、10,000 节点上实测一次，记入本文件；不新增基准。

**Rationale**：

- `reorder()` 每次是固定几条语句：读被拖行、读两个邻居或组尾、复核相邻、写一行，与组大小无关（US-028 阶段 A）。
- 页面侧只多一次 `reorderTargetForDrop`，O(组大小)。
- 现状每次拖放同样是一次 `save()` 加一次活查询刷新，本阶段不增加查询。constitution IV 的「Database operation < 100 ms」按 `reorder()` 一次事务计。

**实测**：待实现后补。

## R11 落点区间三端统一

**Decision**：三端各一份同名纯函数 `treeDropPosition(offsetY, height, { manual, targetIsRoot })`：

- 上三分之一为 `before`，下三分之一为 `after`，中间为 `into`；
- 非手动模式且目标不是根级行时整行为 `into`。

它与 `resolveTreeDrop` 放在同一文件。Angular 菜单 `menu/utils/tree-utils.ts` 的 `calculateDropMode` 由它取代，原来是 25% / 75%。

**Rationale**：

- 现状 Angular 菜单为 25% / 75%，Angular 文件管理器为三等分，React / Vue 为 33%。同一个手势在三端落到不同档，违反 constitution III。
- 非手动模式下「非根级行整行拖进」是 Angular 文件管理器的现状（`file-drag-drop.service.ts:45-64`）。React / Vue 不看排序模式，同一位置会显示「上方」再判无效，与 Angular 显示「拖进」不一致。
- 统一后，三端的高亮与判定表完全由两个同名纯函数决定。

**Alternatives considered**：

- spec 明确批准三端区间不同：落点区间是直接可感的交互，差异没有任何框架层面的理由。
- 只统一 e2e 的落点比例：掩盖分歧，不消除分歧。
