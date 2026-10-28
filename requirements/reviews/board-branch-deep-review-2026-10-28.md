# 看板分支深度评审（2026-10-28）

> **基准**：`origin/main...HEAD`，merge-base `7bb16a90`，74 个提交，202 个文件，+33955 / -182。
> **方法**：按核心领域包 / 三框架绑定 / 宿主与工程门禁 三个切片并行静态评审，主会话对每条关键结论逐条抽查取证（下文标「已核实」者均由主会话独立复核）。
> **未运行** `nx test` / `nx build` / e2e（并行评审期间避免互相干扰），因此本报告不含 CI 结论。
> **与旧报告的关系**：[xenodochial-board-branch-review.md](xenodochial-board-branch-review.md) 的基准停在 `63398faa`；本报告核对了它「未解决」清单的现状，并覆盖其后的 14 个提交（含 popover 定位与标签色板新功能）。本报告为一次性结论，不占 RV 编号。

---

## 结论摘要

**P0 × 0，P1 × 8，P2 × 35。**

看板功能本体质量高：三端视图 `data-testid` 集合完全一致（120 / 120 / 120，已核实），三端 `useBoard` 的 22 个动作签名对称，领域层的删除级联、并发复核、原位零写、恢复状态机都有测试钉住；核心引擎唯一的改动（`expectedGroup`）语义正确且向后兼容。

风险集中在**交付面而非功能面**：

1. **Angular 发布包根本没有样式产物**，而发布消费门禁恰好只断言 React / Vue，形成「缺陷 + 门禁盲区」的组合。
2. **`@aiao/rxdb-plugin-board/testing` 子路径的类型解析会落空**（`types` 条件排在 `import` 之后），仓内被 tsconfig paths 掩盖。
3. **既有库升级重开的两条验收用例仍被 `it.skip`**，AC#8 / AC#13 无任何自动化背书。
4. 视图编排是三份约 3000 行的独立实现，已有一次「只修 React 一端」的事故先例。

---

## 旧报告「未解决」项现状核对

| 旧编号 | 内容 | 现状 |
| --- | --- | --- |
| P0-1 | 截止日日期断言时间炸弹（2026-11-05 起恒红） | **已拆**：渲染改为「今天到期 + 日期」并存（`due-status.ts:20`），e2e 改正则 `/2026-11-05/`，parity 剥离 `^(已逾期\|今天到期)\s*` 后仍取原始日期 |
| P1-7 | 任务无键盘等价移动路径 | **已做**：三端 `task-move-to-column` 控件（angular `board-view.html:812`、react `view/board-popover.tsx:179`、vue） |
| P1-12 | `setRestoring` 无调用方 | **已接线**：angular `board-view.ts:1680`、react `view/use-view-core.ts:161`、vue `board-view.vue:1581` |
| P1-11 / core | 升级重开用例 `it.skip` | **仍未解决**（见 P1-6） |
| P2 绑定 10 | 删除确认缺标签数 | **已修**：`view/board-dialogs.tsx:77-78` 含标签定义数与关联数 |
| P2 绑定 18 | `dragPointer` / `.board-connecting` 死代码 | **已清** |
| P2 绑定 13 | 列横向溢出提示 | **仍缺**（见 P2-16） |
| P2 绑定 16 | `eq` / `inRule` 三处重复 | **仍是三份**（见 P2-17） |
| P2 核心 7 | 公开导出 TSDoc 缺口 | **部分修复，仍有缺口**（见 P2-18） |
| 工件 P1-13/14、P2-29 | roadmap / status-overview 计数漂移 | **已对齐**：Done 85 / In Progress 5 / Backlog 30 / In Review 7 = 127，与 README「85/127」一致（已核实） |

---

## P1

### P1-1 Angular 发布包没有样式产物，三端样式交付三分叉（已核实）

- **位置**：`packages/rxdb-plugin-board-angular/ng-package.json`（无 `assets` 配置）、`packages/rxdb-plugin-board-angular/package.json`（`exports` 为空）、`apps/dev-rxdb-board/src/styles.scss:2`、`apps/dev-rxdb-angular/src/styles.scss:15`、`scripts/audit/api-surface.mjs:86-92`
- **事实**：三端共用一份 `packages/rxdb-plugin-board/board.css`，接入方式各不相同：
  - React：`board-view.tsx:4` 组件内 `import './board-view.css'`，而该文件首行 `@import '@aiao/rxdb-plugin-board/board.css'` → 构建内联，消费端零配置，且有 `./board-view.css` 子路径。
  - Vue：`board-view.vue:3331` 的 `<style>@import ...</style>` → Vite 内联为 `dist/index.css`，有 `./index.css` 导出，但**需消费端手动 import**。
  - Angular：`board-view.ts:175` 注释直言「Angular 宿主需在全局样式中引入」，而包内既无样式文件也无子路径，两个宿主 app 都用跨包相对路径 `../../../packages/rxdb-plugin-board/board.css` —— 这只在 monorepo 内成立。
- **失败场景**：外部项目 `pnpm add @aiao/rxdb-plugin-board-angular` 后渲染 `BoardViewComponent`，得到完全无样式的裸 DOM，包内没有任何线索指向核心包的 `board.css`。
- **建议**：Angular 构建期把 `board.css` 拷成 `dist/board-view.css` 并在 `exports` 暴露，`api-surface.mjs` 同步登记；或三端统一为「组件自动内联」。

### P1-2 发布消费门禁恰好绕过 P1-1，且不校验三端入口的 hook 导出（已核实）

- **位置**：`scripts/audit/release-consumers.mjs:550`、`:444-455`
- **事实**：`for (const framework of board ? ['react', 'vue'] : [])` 只对 React / Vue 断言 `.rxb-columns` 与 `.is-drop-before`，Angular 无任何样式断言；`writeBindingEntries` 的 board 入口只 `export { BoardViewComponent }` / `export { BoardView }`，**不导出 `useBoard`**。
- **失败场景**：Angular 样式产物丢失、或任一端 `useBoard` 从包入口掉出 / 被改名，门禁照绿。
- **建议**：三端都断言样式产物；入口补 `export { useBoard }` 并断言其类型可解析。

### P1-3 `@aiao/rxdb-plugin-board/testing` 的条件导出键序错误，类型解析落空（已核实）

- **位置**：`packages/rxdb-plugin-board/package.json` 的 `exports["./testing"]`
  ```json
  { "@aiao/source": "./src/testing/index.ts", "import": "./dist/testing.js", "types": "./dist/testing/index.d.ts" }
  ```
- **事实**：`import` 排在 `types` 之前。TypeScript 解析条件导出时按键序取首个匹配项，`types` 条件永远不可达，于是落到 `./dist/testing.js` 再找同名声明 `dist/testing.d.ts` —— 实际产物是 `dist/testing/index.d.ts`（已核实目录结构），文件不存在。此外缺 `default`，非 `import` 条件的解析直接失败。仓库其他包（`packages/rxdb` 等）的写法是 `types` → `import` → `default`。
- **失败场景**：外部消费者 `import { seedReleaseBoardDataset } from '@aiao/rxdb-plugin-board/testing'` 在 Bundler / NodeNext 下得到 TS7016（隐式 any）或无声明。仓内被 `tsconfig.base.json:92` 的 paths 掩盖，`release-consumers` 的探针只 import 主入口，同样测不到。
- **建议**：改为 `types` → `import` → `default` 三键；探针补一次 `/testing` 导入。

### P1-4 React `useBoard()` 首帧 `actions` 是空对象，类型却声明为完整动作集（已核实）

- **位置**：`packages/rxdb-plugin-board-react/src/use-board.ts:355`（`const actions = actionsRef.current ?? ({} as UseBoardActions);`），赋值点在 `:300` 的 effect 内
- **失败场景**：父组件 `const { actions } = useBoard(rxdb)`，子组件在 `useEffect(() => { void actions.createBoard(...) }, [])` 里调用 —— React 的子 effect 先于父 effect 执行，得到 `actions.createBoard is not a function`。Angular / Vue 在构造期同步就绪，三端行为不对称。随包的 `BoardView` 自身不受影响（同组件内按调用序执行）。
- **建议**：render 期返回稳定的委托对象（`useMemo` 包一层转发到 `serviceRef.current`），或把类型改成 `UseBoardActions | null` 强制判空。

### P1-5 外键与热路径索引缺失

- **位置**：`packages/rxdb-plugin-board/src/entities/task.entity.ts:19-41`、`column.entity.ts:18-38`、`task-label.entity.ts:32`
- **事实**：三张表只为唯一约束声明了索引，`task.column_id`、`column.board_id`、`task_label.label_id` 全裸。仓库自身约定是显式声明外键索引（对照 `rxdb-plugin-working-tree` 的 `idx_commit_first_parent` 等），`create_table_sql.ts` 不做自动外键索引。
- **失败场景**：任务量到几千条后，列渲染（`whereEq('columnId')`）、`sortColumn`、列/板删除清单、搜索求交（`board-search-source.ts:139-151`）全部退化为全表扫；删标签时 `whereEq('labelId')` 无法走 `(taskId,labelId)` 联合索引前缀。
- **建议**：补 `['columnId','sortOrder']`、`['boardId']`、`['labelId']` 三个索引；前两个同时服务默认排序。

### P1-6 既有库升级重开的验收整份被跳过（已核实）

- **位置**：`packages/rxdb-plugin-board/src/__tests__/board-upgrade.browser.spec.ts:39`、`:104`
- **事实**：两条用例（含「同实体重开」对照组）都是 `it.skip`，原因写在 `:101` 的 `TODO(SQLC-待开)`：sqlite-wasm idb vfs 干净关闭后重连丢已提交行。三端 e2e 也没有任何升级重开覆盖。
- **失败场景**：看板实体表加进一个已有库时的建表 / 迁移 / 触发器重建路径在 CI 里零验证；对照组一起 skip 意味着无法区分「看板 schema 有问题」与「适配器有问题」。这正是 US-534 AC#8 与 US-540 AC#7 / AC#13 无法关闭的原因。
- **建议**：对照组换 PGlite（不受该适配器缺陷影响）先跑绿，把问题收敛到单条 skip 并挂具体 issue。

### P1-7 独立 demo e2e 是全仓唯一 `reuseExistingServer: true`（已核实）

- **位置**：`apps/dev-rxdb-board-e2e/playwright.config.ts:35`
- **事实**：其余 6 个 e2e 配置全部 `false`，`dev-rxdb-angular-e2e/playwright.config.ts:83` 甚至写明了「`reuseExistingServer` 恒为 false，端口被孤儿进程占住时显式失败」。
- **失败场景**：用户开着旧的 dev server 或残留进程占住 4312，Playwright 直接复用，跑的是非本次构建的产物 —— 假绿和假红都无法区分。
- **建议**：对齐为 `false`；确需对用户 dev server 跑时用显式 env 开关。

### P1-8 视图编排是三份约 3000 行的独立实现，已在漂移

- **位置**：Angular `board-view.ts` 1691 行 + `board-view.html` 1336 行；Vue `board-view.vue` 3332 行；React `view/` 约 2900 行
- **事实**：纯规则已下沉到核心包（`drop-resolution` / `popover` / `keyboard` / `due-status`），但编排层逐字重复：`filteredLabelNames`（`use-board-data.ts:119` / `board-view.ts:200` / `board-view.vue:345`）、`visibleTaskMap`（`use-board-data.ts:89` / `board-view.ts:292` / `board-view.vue:304`）、`commitPickerLabels`（`use-popover-model.ts:76` / `board-view.vue:1240`）、`onDocumentKeydown`（`use-board-view-model.ts:49` / `board-view.ts:1490` / `board-view.vue:1395`）。
- **失败场景**：本分支已有先例 —— `676cabc0` 只修了 React 的活查询等待，另两端靠各自实现碰巧没挂。任何交互规则改动都要在三份 3k 行文件里各改一遍，「三端对称」实际靠 e2e 兜底。
- **建议**：把 `visibleTaskMap`、筛选派生、键盘命令分派、删除编排收进核心包（纯函数），视图层只保留框架原语。

---

## P2

### 核心领域包

1. **`saveTaskFields` 对 `null` 的语义自相矛盾**：`detail-service.ts:197-202` 中 `title` / `description` / `labelIds` 用 `??`（`null` 视为未修改），`dueDate` 用 `=== undefined`（`null` 视为清空）；而 `:189` 的 stale 校验用 `!== undefined`（`null` 视为已修改）。三端视图恰好绕开了（清空描述传 `''`、清空截止日显式转 `null`），但 `TaskFieldPatch` 是公开类型，外部调用方传 `{ description: null }` 会得到「校验认为改了、合并认为没改」。建议统一为 `=== undefined` 判定。
2. **`sameSet` / `sameIdSet` 语义不一致**：`delete-service.ts:56` 对两侧都去重，`detail-service.ts:48` 只对 `a` 去重；带重复元素时结论相反。当前受唯一约束保护不可达，但两处判断「集合是否变化」的写法应合并到 `query.ts`。
3. **`acrossTarget` 在 `row === -1` 时抛未捕获异常**：`keyboard.ts:68-74,92-100`，`visibleIds.indexOf` 返回 `-1` 时 `visible[Math.min(-1, len-1)]` 为 `undefined`，而 `reorderTargetForDrop` 对「目标不在序列里」是 throw。三端调用点只对已渲染卡片触发故不可达，但这是公开纯函数。建议 `row < 0` 返回 `null`。
4. **本列排序并发可能写出重复 `sortOrder`（待确认）**：`column-sort-service.ts:110-119` 从「当前最大键」之后生成，无唯一约束兜底；两个客户端同时排序同一列时是否可能读到同一快照，取决于事务隔离级别，需 sqlite / PGlite 的实际证据。
5. **恢复状态机不携带目标库名**：`restore-machine.ts:74-80,99-115`，`restore_failed` / `readback_failed` 都用 `initialRestoreSnapshot` 重置、`targetDbName` 被抹成 `null`，宿主只能另存一份（`apps/dev-rxdb-board/src/app/app.ts:262` 的 `RESTORE_TARGET_KEY` 就是补丁）；`switching` 态 `cancel` 是 no-op，写 `pendingSwitch` 后重载未发生时快照永久停在 `switching`。
6. **每次搜索都跑全库 count 当 `pageSize`**：`search/board-search-source.ts:106-107,134-136`，`countAllTasks()` 是无区间的 `matchAll` 计数，板内其实只需本板任务数。
7. **`waitUpstreamSettled` 的兜底分支**：`search/board-search-source.ts:66-67` 的 `throw error ?? new Error('搜索执行失败')`，一旦上游改为 `error$` 先完成不发射，真实原因会被统一成通用消息。建议直接 `throw error`。
8. **确定性种子没有空库自检**：`testing/release-board-dataset.ts:120` 固定主键写入，约束只写在注释里；这是发布出去的 API，外部调用方在已有数据的库上调用会撞主键且中途失败留下半套种子。建议入口先 `count(matchAll())` 非空即抛领域错误。
9. **`query.ts` 规则泛型只接受 `string`**：`query.ts:13-24,36-39` 的 `eq` / `inRule` / `whereEq` 收窄为 `V extends string`，将来加数字 / 布尔 / 日期列时 helper 全部不可用。
10. **`board.css` 焦点态与选中态不可区分**：`board.css:97-99` 把 `.rxb :focus-visible` 的 outline 全部换成 `box-shadow`，而 `.rxb-card:focus-visible, .rxb-card.is-selected` 又用同一套「选中环」样式，键盘用户无法分辨焦点与选中（WCAG 2.4.7）。axe 不报。
11. **`nextLabelColor` 的短格式等价色不归一**：`palette.ts:21-24` 用 `toLowerCase()` 比对，`#fff` 与 `#ffffff` 被视为不同色。`label-service.ts:143` 也只 `trim` 不展开短格式。影响有限（8 个预设色都不可缩写成 3 位），但「等价色」的判定口径应统一。

### 三端绑定

12. **`ReorderTarget` 允许 `{ group, expectedGroup }` 共存，运行期静默忽略后者**：`packages/rxdb/src/sortable/sortable.interface.ts:70-110` + `sortable.utils.ts:540`（`'group' in target` 即 return）。联合类型的多余属性检查放行该写法，调用方以为带上了并发改组保护，实际 `placeAtGroupTail` 完全无视它。建议在 `assertReorderTarget` 里对两者共存抛 `invalidTarget`。
13. **`Repository.reorder` 的 `@throws` 未列 `expectedGroup` 新成因**：`Repository.ts:505-515` 只补了一句正文，`reorderRow` 的 `@throws`（`sortable.utils.ts:637-652`）列的仍是旧成因。
14. **Vue `useBoard` 在组件作用域外调用时无清理入口**：`use-board.ts:340-343` 注释写「独立调用（测试）由调用方 stop」，但 `UseBoardReturn` 里没有 `stop`；`getCurrentScope()` 为假时订阅与 notifier 永不释放。
15. **React effect 依赖漏 `options`**：`use-board.ts:167` 在 effect 内读 `options?.search`，`:337` 的 deps 是 `[readAttempt, rxdb, boardId$, restoring$]`。搜索插件异步安装、宿主随后传入 `search` 时服务实例不重建，看板永远显示「搜索插件未安装」。
16. **全局 `pointerdown` 用 `[aria-expanded="true"]` 判定触发器**：`view/use-board-view-model.ts:65-72`。同页两个 `BoardView` 时，点 B 的触发器不会关闭 A 已打开的弹层；宿主自己的 accordion / combobox 展开时同理。建议改为实例根内 `contains` 判定。
17. **`eq` / `inRule` 三处重复实现**：`angular/src/query-helpers.ts:8-16`、`react/src/use-board.ts:120-127`、`vue/src/use-board.ts:118-125`，核心包已公开导出同语义的 helper。
18. **公开导出 TSDoc 缺口（铁律要求）**：`board-storage.ts:32,34,39,41`（`readPendingSwitch` / `clearPendingSwitch` / `readRestoringMarker` / `clearRestoringMarker`）、`label-service.ts:30`（`BoardLabelService`）、`detail-service.ts:42,53`、`delete-service.ts:54,59`、`search/board-search-source.ts:45,175`、`restore-machine.ts:39`。
19. **依赖声明三端策略不一致**：`board-react/packages.json` 与 `board-vue` 把 `@aiao/rxdb-plugin-board` 放 `dependencies`，`board-angular` 放 `peerDependencies`；仓库既有约定（`rxdb-plugin-tree-angular/-react/-vue` 三端）是 `dependencies` 为空、核心包与桥接包全放 `peerDependencies`。放 `dependencies` 会在版本区间不一致时给消费者装第二份核心包。
20. **三端输入名不一致**：Angular `exportBackup`（`board-view.ts:386`）vs React / Vue `onExportBackup`。要么统一，要么在 API 对照文档里写明是有意偏离。
21. **模态对话框无焦点陷阱（三端一致）**：`aria-modal="true"` 与 `role="dialog"/"alertdialog"` 都在，但没有 Tab 循环 / 背景 `inert`，键盘用户按 Tab 会跑到背后的看板卡片上。axe 不报，e2e 覆盖不到。
22. **`dragover` 每帧全量量测 DOM 几何**：`view/use-drag-model.ts:74-93,106-111`，约 60Hz 对每张卡片调 `getBoundingClientRect`，100 张卡即每秒数千次布局查询；三端同构。建议拖拽开始时量一次并缓存。
23. **同一查询 Observable 被订阅两次**：三端 `use-board.ts` 的 `boards$` / `columns$` / `tasks$` / `labels$` 各被订阅两处（React `:203`+`:289`、`:215`+`:216`、`:234`+`:251`、`:250`+`:251` 等）。底层查询经归一化去重，但派生链跑两遍且两份快照靠活查询最终收敛。建议 `shareReplay({ bufferSize: 1, refCount: true })`。
24. **`destroySearch` 不清 `searchQuery`**：删板后输入框留旧词但句柄已销毁，「加载更多」无声失效，再输入同一词才会重建。

### 宿主 app 与 e2e

25. **恢复失败可能陷入重试死循环**：`apps/dev-rxdb-board/src/app/app.ts:327-331`，`completePendingSwitch` 清理失败时故意保留 `PENDING_SWITCH_KEY`，下次启动走同一路径、同一失败；`board-recovery.spec.ts:87` 只 reload 一次。
26. **`deleteBoardDbStorage` 有猜名兜底**：`board-rxdb.ts:78` 的 `databaseNames.length > 0 ? databaseNames : [\`${dbName}.sqlite\`]`。调用方 `cleanupBoardRestoreTarget` 刚证明过库存在，该分支要么空操作、要么在命名规则变化时删错库；违反「无 fallback」铁律。
27. **备份导出的 Blob URL 同步 revoke**：`app.ts:198-203`，`anchor.click()` 后立即 `URL.revokeObjectURL`，且 anchor 未挂载 DOM —— Safari / Firefox 上可能拿到 0 字节文件。建议延迟 revoke 并在 click 前后 append / remove。
28. **根组件不释放连接**：`app.ts:155-157` 的 `ngOnDestroy` 只摘 storage 监听，不 `disconnectAll()`；配合 `board-rxdb.ts:105` 删除时 `onblocked` 直接 reject，HMR / 切页后再清理恢复目标会报「库仍被占用」。
29. **三端 `board.spec.ts` 是 692 行逐字节复制（已核实）**：react 与 vue 的 md5 完全相同，angular 只差首行 import（`./fixtures.js` vs `@playwright/test`）。改一端漏两端不会被发现。建议抽共享 spec，或在门禁里加 diff 校验。
30. **`normalizeTask` 对缺失 labels 静默返回 `[]`**：`modules/e2e-parity/board-parity.mjs:64-72`，与文件其余「形状不对就 throw」的风格不一致，三端任一漏采会退化成空数组参与对拍。
31. **列横向溢出提示仍缺**：`.rxb-columns` 只有 `overflow-x: auto`，无任何提示；约定要求明显的溢出提示。
32. **`tsconfig.base.json` 只有 React 的 css 路径映射**：`:124` 的 `@aiao/rxdb-plugin-board-react/board-view.css` 是全仓唯一一条 css 映射，只为 `apps/dev-rxdb-react/.../board.page.tsx:5` 服务；Vue 的 `index.css` 无对应映射。
33. **demo e2e 无阶段 B 用例**：`apps/dev-rxdb-board-e2e/` 只有两个 spec，与 US-540「demo e2e 覆盖 A/B、AC#2~13 各至少一条」的声明不符（即 RV-083 第 9 条）。

### 工程与文档

34. **提交信息卫生**：74 个提交里有 8 条占位标题（`wer`、`123123`、`123` ×3、`1212`、`1221`），另有一次 `13be7836` 把弹层定位、色板、筛选、键盘、详情即改即存五块互不相关的能力混在一个提交。建议开 PR 前 squash / rebase 成按 story 分段的提交。
35. **需求工件是诚实的，但与「可合入」标准有距离**：`US-534 / 537 / 539 / 540` 仍 `In Progress`，`US-539` 有 6 条、`US-540` 有 6 条 AC 标 ⚠️，`US-541`（团队同步）整条 `Backlog` 未实现 —— 均为如实标注，不算缺陷，但 PR 描述需要明说本分支不关闭这些故事。

---

## 三端能力对照

| 能力 | Angular | React | Vue |
| --- | --- | --- | --- |
| `useBoard` 返回值 · 22 个动作 | 全部（`Signal<T>`） | 全部（`T`） | 全部（`Ref<T>`） |
| 动作首次可用时机 | 构造期同步 | **首帧空对象**（P1-4） | setup 期同步 |
| 视图 `data-testid` 集合 | 120 | 120 | 120（+1 动态模板串） |
| 拖拽 / 键盘移动 / 内联建任务 / 搜索 / 详情 / 标签 / popover / 删除确认 | ✓ | ✓ | ✓ |
| 样式交付 | **无产物**（P1-1） | 组件内自动引入 | 消费端手动 import |
| 发布门禁断言 | **无**（P1-2） | ✓ | ✓ |
| 模态焦点陷阱 | ✗ | ✗ | ✗ |
| 外部调用清理入口 | `ngOnDestroy` | effect cleanup | **仅 scope 内**（P2-14） |

---

## 合入前建议清单

**必须修（P1）**

1. Angular 包补样式产物与导出子路径，`api-surface` 登记。
2. 发布消费门禁补 Angular 断言 + 三端 `useBoard` 入口断言。
3. `exports["./testing"]` 键序改为 `types` → `import` → `default`，探针补导入。
4. React `useBoard` 的 `actions` 首帧语义修正（委托对象或 `| null`）。
5. 补三张表的外键 / 热路径索引。
6. 升级重开对照组改 PGlite 跑绿，收敛成单条 skip 并挂 issue。
7. demo e2e `reuseExistingServer` 改回 `false`。

**建议修（P2 高价值）**

8. `saveTaskFields` 的 `null` 语义统一（核心 P2-1）。
9. `ReorderTarget` 的 `group` + `expectedGroup` 共存拒绝（核心 P2-12）。
10. Vue `useBoard` 返回 `stop`（P2-14）；React effect deps 补 `options`（P2-15）。
11. `deleteBoardDbStorage` 去掉猜名兜底、Blob revoke 延迟（P2-26 / 27）。
12. 三端 `board.spec.ts` 去重（P2-29）。

**可以不修，但要记录**

13. `column-sort-service` 的并发重复键（需先取证事务隔离级别）。
14. 三端输入名 `exportBackup` / `onExportBackup` 的偏离。
15. 视图编排三份实现（P1-8）—— 这是结构性债，建议单独立项而非在本分支解决。
