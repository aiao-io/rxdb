# PR #139 全差异深度评审：任务看板

- 日期：2026-10-28。
- PR：[aiao-io/rxdb#139](https://github.com/aiao-io/rxdb/pull/139)。
- 分支：`claude/xenodochial-leakey-5a7c4d`。
- 审查 HEAD：`676cabc07d8b7d93850ef626021846b8174973c5`。
- `main` / `origin/main`：`7bb16a9014095d4003bd059244722013b36867c1`。
- merge-base：`7bb16a9014095d4003bd059244722013b36867c1`。本分支已经包含该 main；`git diff main HEAD` 与 `git diff main...HEAD` 范围相同。
- 范围：202 文件，新增 33,955 行、删除 182 行。没有删除文件或二进制差异。附录列出全部 202 个差异文件。
- 审查对象是上述已提交快照。原分支检出目录里的未提交修复与旧评审报告不纳入结论，也未修改或提交它们。

## 结论

**🔴 暂不可合并。代码缺陷：P1 × 3、P2 × 4；另有 1 项独立的合并治理阻断。没有证据支持 P0。**

三个必须先修的问题分别是：把默认只读 100 行的 `Repository.find()` 当成全量查询，导致正常规模下任务消失、搜索漏项及无法删除整列；详情保存队列没有绑定入队时的任务身份，切换详情会把 A 的排队改动写到 B；React 公共 hook 首帧返回空 actions，子组件挂载 effect 调用直接抛错。三项都已用 Nx 执行的临时复现验证，均产生预期回归断言失败。

🟢 五实体关系与板归属单一来源清晰，删除、详情保存、本列排序的 executor 事务边界基本合理；`expectedGroup` 把邻居换组的竞态校验放回引擎事务，方向正确。🟡 三端公共入口对称，但读就绪状态、详情保存队列和模态键盘行为仍有共同缺口。现有核心 125 项单测全绿，不能覆盖这三个已复现的边界。

## 审查方式与证据边界

1. 对完整 `main → HEAD` 文件清单、文本差异及新增源码进行审查，按领域服务、引擎改动、三端绑定与视图、宿主/恢复、测试/对拍、发布/配置、需求/生成物逐组核对。源码调用链同时追入 main 已有的 `Repository.find()`、QueryManager、适配器 executor 查询及历史机制。
2. 测试文件核对用例清单、关键断言、数据规模、mock 与真实后端边界及 `skip`；测试运行范围见下表。完整文件台账表示该文件已纳入审查，不表示每个文件都执行过独立测试，也不构成“全部路径无缺陷”的保证。
3. 采用 `nx-workspace` / `nx-run-tasks` 查明真实目标，以 `tri-framework-check` 核对 `src/index.ts`、绑定返回字段和动作签名。代码审查没有依赖外部库文档推断，因此未为通用框架知识调用 Context7。
4. 未运行本机浏览器矩阵、三端完整 e2e、发布消费者全矩阵或四指标覆盖率门禁；不把 GitHub 既有绿灯写成本次本机验证。两个持久化升级用例明确为 `it.skip`，也没有当成通过项。

## P1：必须修复

### B-01：全量集合误用分页查询，第 101 项起静默丢失，删除清单永久过期

**位置与符号：**

- [`BoardDomain.listTasksOfBoard()`](../../packages/rxdb-plugin-board/src/board-domain.ts)，HEAD 第 119 行起。
- [`BoardDeleteService.planColumnDelete()` / `planBoardDelete()`](../../packages/rxdb-plugin-board/src/delete-service.ts)，第 89 / 120 行起；标签删除、详情关联读取及 `BoardLabelService.listLabels()` 存在同类查询。
- [`BoardSearchSource.currentBoardTaskIds()`](../../packages/rxdb-plugin-board/src/search/board-search-source.ts)，第 139 行起。
- 三端 [`useBoard()`（Angular）](../../packages/rxdb-plugin-board-angular/src/use-board.ts)、[React](../../packages/rxdb-plugin-board-react/src/use-board.ts)、[Vue](../../packages/rxdb-plugin-board-vue/src/use-board.ts) 的 boards / columns / tasks / labels / taskLabels 数据流；例如 React 第 212、220、255 行。
- 上游契约：[`Repository.find()`](../../packages/rxdb/src/repository/Repository.ts) 第 333 行使用 `limit: options.limit ?? 100`；同类真正全量入口是 `findAll()`。

```ts
limit: options.limit ?? 100,
offset: options.offset ?? 0
```

上面是上游归一化对象的原文摘录。领域侧的典型原文是：

```ts
this.rxdb.entityManager
  .getRepository(Task)
  .find({ where: { combinator: 'and', rules: [{ field: 'columnId', operator: 'in', value: columnIds }] } });
```

**触发与影响：** 在同一板/列建立 101 个任务，不需要大规模导入或并发。UI 与 `listTasksOfBoard()` 只保留前 100 项；全文搜索即使从上游取全，也会与截断的任务 ID 集合求交而漏掉剩余结果。删列时确认清单只含 100 项，执行事务直接在后端重读 101 项，判为 `confirm_stale`；重新确认仍只有 100 项，用户无法通过该入口删除这列。超过 100 个板、列、标签或关联行时也有同一契约误用。

**验证：** 临时 Node spec 使用真实 PGlite，创建 1 板、1 列、101 任务，经 `count()`、领域列表、删除清单与执行入口核对。输出为：

```json
{ "count": 101, "deleteError": "列内任务已变化，请重新确认", "planned": 100, "visible": 100 }
```

期望列表/清单均为 101 且删除成功的三个断言均失败。现有种子只有主板 12 个任务、隔离板 8 个任务，现有小集合断言抓不到该阈值。

**修复：** 对“全部”的集合使用 `findAll()` 或明确完整分页遍历；事务内与确认时统一集合语义。不要把默认上限改成更大的任意数字。补三端 101 项显示/关联/搜索、整列/整板删除，以及标签关联数跨阈值的回归。

### B-02：排队保存没有固定任务身份，A 的截止日/标签会写入 B

**位置与符号：**

- [`useDetailModel.enqueue()` / `saveFields()` / `commitDetailDue()`](../../packages/rxdb-plugin-board-react/src/view/use-detail-model.ts)，第 82、89、133 行起；`saveLabels()` 也进入同一队列。
- [`BoardViewComponent.enqueueDetail()` / `saveDetailFields()`](../../packages/rxdb-plugin-board-angular/src/board-view.ts)，第 1401 / 1407 行起；`commitDetailDue()` 在第 907 行起。
- [`enqueueDetail()` / `saveDetailFields()`（Vue）](../../packages/rxdb-plugin-board-vue/src/board-view.vue)，第 1305 / 1311 行起；`commitDetailDue()` 在第 840 行起。

```ts
const next = queueRef.current.then(operation, operation);
const taskId = detailTaskIdRef.current;
const base = detailBaseRef.current;
```

第一行仅延迟执行闭包；后两行在闭包执行时才读取“当前详情”，没有保存入队时的任务 ID、编辑代次和数据实例。`openDetail()` / `reset()` 只处理快照请求代次，没有处理保存队列。

**触发与影响：** 打开 A；令第一笔保存耗时；再对 A 选择另一个截止日，形成第二笔排队保存；第一笔完成前打开 B；释放第一笔保存。第二笔携带的日期仍属于 A，执行时却拿到 B 的 ID 与 B 的基线，调用 `saveTaskFields(B, baseB, patchA)`。领域层看到的是一份合法 B 编辑，无法识别值来源，因而可能把错误日期/标签持久化到 B。关闭详情会使排队修改直接被丢弃，也是同一身份缺失的另一结果。

**验证：** 运行真实 `useBoardViewModel()` / `useDetailModel()`，只把 `useBoard` 动作换成 deferred 替身来精确控制存储延迟。实际动作记录：

```json
[
  { "id": "A", "patch": { "dueDate": "2026-12-01" } },
  { "id": "B", "patch": { "dueDate": "2026-12-02" } }
]
```

断言两次动作 ID 应均为 A，实际得到 `[A, B]`，26ms 内失败。Angular/Vue 上述代码具有同一读 ID 时点，三端归因来自源码逐项对照；本次没有把 React 复现冒称三端运行复现。现有“保存途中切换任务”测试只检查一笔迟到回执不会覆盖 B 的显示，未排入第二笔修改。

**修复：** 入队时固定数据库/绑定实例、任务 ID、编辑代次及补丁；执行时只对该任务重读基线。关闭/切换时明确排空或作废旧编辑会话的待执行项。保留同一任务串行保存，避免用当前详情变量重定向队列。三端补“第一笔挂起 + 第二笔已入队 + 切到另一任务/另一板”的 deferred 回归，断言实际写入对象。

### B-07：React 公共 hook 首帧返回空 actions，子组件挂载 effect 调用即崩溃

**证据：** [`useBoard()`](../../packages/rxdb-plugin-board-react/src/use-board.ts) 第 300 行起在 passive effect 里给 `actionsRef.current` 赋值，而第 355 行的返回值是：

```ts
const actions = actionsRef.current ?? ({} as UseBoardActions);
```

`UseBoardReturn.actions` 对外声明始终具备完整 23 个方法。父组件首帧把 `board.actions` 传给子组件，子组件挂载 effect 先于父组件该 effect 执行，因此调用的是被强制断言为完整动作集的空对象。即使随后父组件重渲染，子组件首次 effect 已抛错；只在同一个组件里消费的随包 `BoardView` 无法覆盖此公共 hook 使用方式。

**触发与影响：** 外部 React 消费者用 `useBoard(db)`，把动作传入子组件，子组件在 `useEffect(..., [])` 中执行初始化建板或其他动作，得到 `TypeError: actions.createBoard is not a function`。Angular/Vue 在绑定构造/setup 期间同步建立动作集，没有同一首帧空对象问题。

**验证：** 真实 PGlite + 真实 `useBoard()` + 父/子 React 组件；子 effect 调用 `actions.createBoard()`，捕获到上述 TypeError，期望“没有异常”的断言失败。复跑耗时 2.01s。首次运行因本机并发导致 PGlite 初始化超过默认 5s，本次将临时用例超时设置为 30s 后取得明确业务断言失败，没有把环境超时算成源码证据。

**修复：** 在首次返回前构造稳定、完整的动作对象与其服务依赖，订阅生命周期继续留在 effect；如果 API 必须等待初始化，应通过显式可判别的 pending 类型表达，并让消费端处理。不要用 `{} as UseBoardActions` 掩盖未就绪状态。补父组件使用 hook、子组件挂载 effect 调动作的公开 API 回归，包含 StrictMode。

## P2：需要处理

### B-03：模态对话框声明 `aria-modal`，但 Tab 可以离开并操作背景

**证据：** [`ConfirmDialog()` / `BoardDialog()`](../../packages/rxdb-plugin-board-react/src/view/board-dialogs.tsx) 第 86 行起声明 `role='alertdialog'`、`aria-modal='true'`，对话框外围只处理 `onMouseDown`。[`onDocumentKeydown()`](../../packages/rxdb-plugin-board-react/src/view/use-board-view-model.ts) 第 49 行起只处理 Esc / ⌘K / 单键快捷键，没有 Tab 环绕。Angular 的 `onDocumentKeydown()`（`board-view.ts` 第 1490 行）与 Vue 第 1395 行同样如此。背景区域没有 `inert`，也没有原生 `<dialog>.showModal()` 或焦点陷阱；共享 CSS 的 `.has-overlay` 只调整错误横幅。

**触发与影响：** 打开删除确认，初始焦点在“取消”；按 Shift+Tab，DOM 中前一个可聚焦节点来自背景看板。继续键盘操作可以离开“模态”区域；背景卡片自身的按键处理仍可触发操作。这违反模态焦点语义，自动 axe 检查无法验证真实 Tab 顺序。

**验证边界：** 静态 DOM/事件调用链确认，未在本次另跑真实浏览器 Tab 操作。现有三端 AC#23/24 检查 axe 与 Esc，不包含 Tab/Shift+Tab 首尾环绕。

**修复：** 三端共用焦点约束策略，打开时捕获背景、限制 Tab/Shift+Tab、关闭时恢复焦点；包含零可聚焦项与多层弹窗场景。补真实键盘 e2e，断言焦点全程留在最上层模态框。

### B-04：筛选序列化删除名称中的双引号，点击自己的标签却匹配不到

**证据：** [`quoteValue()` / `unquote()`](../../packages/rxdb-plugin-board/src/filter/board-filter.ts) 第 130、137 行附近分别使用 `value.replaceAll('"', '')`。合法标签名只要求去空白后非空，[`BoardLabelService.createLabel()`](../../packages/rxdb-plugin-board/src/label-service.ts) 没有禁止双引号；匹配器比较实际名称。

```ts
const unquote = (value: string): string => value.replaceAll('"', '').trim();
```

**触发与影响：** 创建并引用标签 `版本"A"`，点击卡片上的标签；`toggleBoardFilterValue('', 'label', '版本"A"')` 生成的值去掉引号，解析后为 `版本A`，与原名不相等，卡片被自己的筛选隐藏。包含双引号的列标题通过补全筛选时也会失真；无法可靠表达这些已允许的名称。

**验证边界：** 由 `quoteValue → parseBoardFilter → FIELD_MATCHERS.label` 的纯函数调用链确认；本次未新增运行该边界的测试。现有引号用例覆盖语法引号与空格/逗号，没有值内的字面双引号。

**修复：** 为字面引号/转义字符定义可往返的编码解析规则，只移除包裹语法字符。补任意合法名称经 toggle/补全/parse 后仍能匹配的回归，至少包含双引号、逗号、空格及组合值。

### B-05：React 宿主丢弃备份 Promise，失败也提前显示“备份已生成”

**证据：** [`BoardPage()`](../../apps/dev-rxdb-react/src/app/pages/board/board.page.tsx) 第 102 行：

```tsx
<BoardView rxdb={rxdb} onExportBackup={() => void exportBackup()} />
```

[`useHeaderModel.onExportBackup()`](../../packages/rxdb-plugin-board-react/src/view/use-header-model.ts) 等待 `callback()`，随后显示“备份已生成”。宿主 `void` 使它立即拿到 `undefined`，实际 `adapter.backup()` 仍在运行；异步拒绝也逃出 `core.guard()`。Angular 与 Vue 宿主传递 Promise，行为不同。

**触发与影响：** 备份慢、存储读取失败或归档生成抛错；React UI 提前显示成功，失败可能成为未处理拒绝，用户拿不到有效备份却收到完成反馈。

**验证边界：** 已核对从按钮到宿主再到 `adapter.backup()` 的完整 Promise 链；本次没有注入浏览器备份失败。组件单测验证的是正确返回 Promise 的回调，未覆盖此宿主包装。

**修复：** 直接传 `onExportBackup={exportBackup}` 或返回该 Promise。宿主级回归用 deferred 验证未完成前无成功提示，拒绝时出现错误且不报成功。

### B-06：读取中标记只等待板列表，子集合未读完就展示可写空板

**证据：** 三端 `useBoard()` 的 `boards$` 都在板列表一发出时执行 `loading=false`，例如 [React 第 202 行](../../packages/rxdb-plugin-board-react/src/use-board.ts)：

```ts
).pipe(tap(() => setLoading(false)));
```

列、任务、标签、关联的首个结果还要经独立 `switchMap` / `combineLatest` 取得；`writeLocked` 仅组合 `restoring || loading || readError`。这些子集合的初始值为空数组/空 Map，选板时也不重新建立完整读取屏障。

**触发与影响：** 旧库有板和任务，板查询很快，但任务/标签查询慢或尚未失败；界面先显示无任务/无标签并解除写禁用。用户无法区分真实空集合与尚未加载，计数、筛选与“加载完成”反馈失真。失败发生前还可在读取不完整的 UI 上继续新建或按不完整可见序列移动；领域校验能拒绝部分错误目标，但不补齐读取状态。

**验证边界：** 静态数据流时序确认；未用延迟适配器对三端分别跑复现。现有加载态测试直接注入 `loading=true` 的绑定替身，没有验证实际 `useBoard()` 的多集合就绪条件。

**修复：** 以当前板/读取代次的列、任务、标签及关联首个结果组合就绪；切板重置，空板也要显式完成。错误重试只释放当前代次的完整成功状态。三端增加“板列表已就绪、任务查询仍挂起/失败”的绑定层测试。

## 独立的合并治理阻断

**G-01：本分支仍混合领域交付与 `packages/*` 变更，尚不能按领域 PR 直接合入 main。**

依据根 [AGENTS.md](../../AGENTS.md)：“领域分支改了 `packages/*`：……单独提取成独立 PR，经评审后先合并进 main；领域分支再从 main 合并回来”。当前 main 快照尚无四个 board 包，且本分支还修改核心 `ReorderBetween.expectedGroup`、排序校验以及 sqlite-wasm 测试工厂。完整清单可由附录或 `git diff main HEAD -- packages` 复验；当前 main 是分支祖先，因此这些变更没有因一次“合回 main”而消失。

任务看板立项/范围已有 [`epic-011-task-board-domain-model.md`](../epics/epic-011-task-board-domain-model.md) 的 owner 解锁记录，不把“没有立项”作为问题。需要完成的是 packages 独立提取/评审/先合入，以及领域分支从 main 合回的实际流程。本报告本身不代表引擎提取 PR 已获评审通过。

## 三端 API 核对

按实际 `src/index.ts` 和 `UseBoardActions` / `UseBoardReturn` 核对，**公开形状 🟢 对称**。Angular 使用 `useBoard` 是本包明确选择，不因与一般 `inject*` 惯例不同而误报。

| 核对项                                                                 | Angular                  | React                              | Vue                     | 结论                         |
| ---------------------------------------------------------------------- | ------------------------ | ---------------------------------- | ----------------------- | ---------------------------- |
| `BoardDomainError` / `resolveCardDrop` / `resolveColumnDrop`           | 导出                     | 导出                               | 导出                    | 一致                         |
| `Board`、`Column`、`Task`、`BoardLabel`、`BoardHostContext` 等共享类型 | 相同 14 项类型再导出     | 相同                               | 相同                    | 一致                         |
| `LAST_BOARD_KEY` / `useBoard` / `UseBoard*`                            | 导出                     | 导出                               | 导出                    | 一致                         |
| `UseBoardActions`                                                      | 23 个动作，构造期可用    | 声明 23 个动作，首帧空对象（B-07） | 23 个动作，setup 期可用 | 声明对称，首次可用时机不对称 |
| `UseBoardReturn`                                                       | 19 字段，Signal          | 19 字段，state                     | 19 字段，Ref            | 载体按框架适配               |
| 视图入口                                                               | `BoardViewComponent`     | `BoardView` + `BoardViewProps`     | `BoardView`             | 组件形态差异合理             |
| 行为                                                                   | B-01/B-02/B-03/B-04/B-06 | 同左，另 B-05 宿主 / B-07 动作首帧 | 同左                    | API 对称不等于行为已正确     |

## 验证记录

统一在 Node `v26.12.0` 下执行。初次默认 shell 的 Node `v22.14.0` 被仓库 preinstall 拒绝，随后显式设置 Node 26 路径；这是本机运行环境问题，没有登记为 PR 缺陷。

| 验证                                                                                                                                                                   | 结果与含义                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm nx show project rxdb-plugin-board --json`、`rxdb-plugin-board-react`、`e2e-parity`                                                                               | 成功解析真实目标与依赖。隔离 worktree 自动安装依赖完成，未修改锁文件或业务源码。                                                   |
| `pnpm nx run rxdb-plugin-board:test --skipRemoteCache --outputStyle=static -- src/__tests__/pr139-review-repro.node.spec.ts`                                           | **1 项预期回归失败**；真实 PGlite，B-01，count=101/list=100/plan=100/删除被拒。测试耗时 5.77s。                                    |
| `pnpm nx run rxdb-plugin-board-react:test --skipRemoteCache --outputStyle=static -- src/__tests__/pr139-review-repro.spec.tsx --coverage=false --maxWorkers=1`         | **1 项预期回归失败**；B-02，真实视图模型 + deferred 动作替身，A 的排队 patch 指向 B，测试耗时 26ms。                               |
| `pnpm nx run rxdb-plugin-board:test --skipRemoteCache --outputStyle=static`                                                                                            | **125/125 通过**，18 个 Node 测试文件，Vitest 136.17s。两项临时复现文件已在运行基线前移除；未把浏览器 `it.skip` 记为通过。         |
| `pnpm nx run e2e-parity:test --skipRemoteCache --outputStyle=static`                                                                                                   | **40/40 通过**（共享 entity-model 与 board 归一化/golden 套件合计），0 skipped，Node 79.45ms；不代表跑过三端浏览器。               |
| `pnpm nx run rxdb-plugin-board-react:test --skipRemoteCache --outputStyle=static -- src/__tests__/pr139-first-actions-review.spec.tsx --coverage=false --maxWorkers=1` | **1 项预期回归失败**；B-07，真实 PGlite + 公共 hook + 父子组件，TypeError 实证，复跑测试 2.01s。                                   |
| `pnpm nx exec --projects=@aiao/source --parallel=1 -- node /tmp/pr139-exports-probe.mjs`                                                                               | **通过**；真实 TS 6 的 Bundler / NodeNext 均成功解析 `/testing` 到 `dist/testing/index.d.ts`，排除条件键序必然导致类型缺失的判断。 |
| 本次未运行                                                                                                                                                             | 全量 `test-all`、浏览器持久化/升级、三端 e2e、全部包 typecheck/lint/build、发布消费者、覆盖率门禁。                                |

三个临时 spec 已从 worktree 移除，评审不夹带测试或业务修改。本机复验源分别保存在 `/tmp/pr139-domain-review-repro.node.spec.ts` 、`/tmp/pr139-react-review-repro.spec.tsx` 与 `/tmp/pr139-first-actions-review.spec.tsx`，React 输出在 `/tmp/pr139-react-repro.log`，核心基线在 `/tmp/pr139-board-baseline.log`，B-07 输出在 `/tmp/pr139-first-actions-review.log`，类型解析输出在 `/tmp/pr139-exports-probe.log`。这些临时路径只用于本机交叉核对，不是仓库交付依赖；上述触发步骤、实际输出与修复测试要求已完整记录在正文。

## 已排除的候选与性能待证项

- **Angular 没有独立 CSS 产物不等于样式无法外部消费。** Angular 桥接包确实不内联 CSS，但核心包公开导出 `@aiao/rxdb-plugin-board/board.css`，其 `files` 明确包含该资产；`BoardViewComponent` TSDoc 也明确要求 Angular 宿主全局引入。外部可以通过公开包子路径接入。两个仓内宿主使用相对路径是源码集成选择，不能据此断言外部只能得到无法修复的裸 DOM。可以补接入示例与样式消费者验证，不登记为发布阻断。
- **`/testing` 条件键序没有造成已声称的类型缺失。** TS 6 解析探针没有使用仓库 paths；从 `/tmp` 模拟外部消费者。Bundler / NodeNext 的 trace 都先尝试 `import`，找不到同名声明后继续命中 `types`，最后正确解析 `dist/testing/index.d.ts`。缺少 `default` 不能据此扩写为当前 ESM 导入失败；本包本就不承诺 CommonJS require 入口。
- **发布消费者探针有边界，不能称现有导出已坏。** `release-consumers.mjs` 对 board 的 CSS 内容只断言 React/Vue，三端入口探针只导出视图。建议补 Angular 公开 CSS 接入和 hook 使用探针；现有 API baseline 另行保护公开导出，没有出现已确认的 `useBoard` 导出缺失。B-07 是已运行验证的运行时可用性缺陷，单纯导入 hook 的探针也抓不到。
- **热路径索引缺失属实，性能影响仍需量测。** `Column` / `Task` 未声明 `boardId` / `columnId` 分组索引，`TaskLabel` 仅有 `(taskId,labelId)` 唯一索引，不能服务以 `labelId` 开头的查找。适配器建表只消费 `indexMap`，没有从 `manualOrder` 自动补这些索引。建议在修复 B-01 后对真实规模执行 EXPLAIN/交互基准，评估 `(columnId,sortOrder,id)`、`(boardId,sortOrder,id)` 与 `labelId`；本次没有性能实测，不把“几千条必然明显卡顿”作为已证实的 P1。

## 其余差异与限制

- **核心排序改动：** `ReorderBetween.expectedGroup` 验证字段集合，在 `placeBetweenNeighbors()` 的同一重排事务里比较目标邻居实际分组；新增三类回归覆盖匹配、换组和 NULL/非法分组。不把它当成跨板授权，板归属仍由领域入口守卫。未发现该有限改动的确定性新增缺陷；仍须按 G-01 提取。
- **恢复与持久化：** 独立 demo 使用 Web Locks 串行化恢复/启动清理，检查 pending 目标存在，活动位置在读回后写入，失败保留旧库；多页成功切换有 `board-recovery.spec.ts`。`board-upgrade.browser.spec.ts` 两个 `it.skip` 保留关闭/重连数据丢失的旧问题说明，本次未独立复现适配器缺陷，故不把说明中的“P0”抄成本报告新增发现，也不承诺升级路径已验证。
- **发布与配置：** 四包 exports、CSS 资产子路径、API baseline、workspace 锁、TS project references、RxDB skill hash、API/消费者审计注册均纳入核对；锁差异为新增 board importers，没有新注册表包下载版本。新增发布消费组合检查三端导入与样式；本次未重跑真实 tgz 消费矩阵。
- **测试资产：** 三端 board/parity 场景检查到同一组种子和关键用户动作；底层共享 parity 用例覆盖格式/类型/排序与 golden，不验证浏览器事件时序。现有“保存途中切换”用例只能排除迟到显示覆盖，不能排除 B-02。
- **需求一致性：** 单人/团队版边界有记录，US-541 保持 Backlog；不能据此要求本 PR 交付登录、RLS 或多人冲突功能。部分派生状态仍写“工具菜单恢复成功路径未落”，但 `board-closed-loop.spec.ts` 已有该用例，建议收尾时按当前测试事实重生成/修正文案。`epic-011-task-board-domain-model` 与 main 已有的 `epic-011-p2p-file-share` 共用编号段，建议整理编号，避免索引歧义；这两项按文档维护建议记录，不与数据错误混排。
- **结构：** Angular 视图逻辑 1,691 行加模板 1,336 行，Vue 单文件 3,332 行，React 拆成多个模型但仍复制同样时序。优先修复并测试上面的共同状态问题，再评估提取共享 headless 状态；不以大重构作为修复前置。

## 全部差异文件台账

以下台账由固定 `main/HEAD` 的 `git diff --name-status` 与 `--numstat` 交叉生成，合计 202 项。分类为21 个文档、43 个测试、75 个运行时源码、8 个模板/样式、47 个配置/工具/契约、8 个生成物。测试分类排除了 `tsconfig.spec.json`；类别是审查切面，不是额外覆盖率声明。A=新增，M=修改。

| 状态 | 文件                                                                               | 行变化   | 分类           | 核对落点                        |
| ---- | ---------------------------------------------------------------------------------- | -------- | -------------- | ------------------------------- |
| M    | `README.md`                                                                        | +1/-1    | 文档           | 范围/契约/证据与派生一致性      |
| A    | `apps/dev-rxdb-angular-e2e/src/board-parity.spec.ts`                               | +126/-0  | 测试           | 用例/断言/替身与真实后端边界    |
| A    | `apps/dev-rxdb-angular-e2e/src/board.spec.ts`                                      | +692/-0  | 测试           | 用例/断言/替身与真实后端边界    |
| M    | `apps/dev-rxdb-angular/src/app/app.routes.ts`                                      | +4/-0    | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| M    | `apps/dev-rxdb-angular/src/app/components/app-menu.ts`                             | +6/-0    | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `apps/dev-rxdb-angular/src/app/pages/board/board.page.spec.ts`                     | +66/-0   | 测试           | 用例/断言/替身与真实后端边界    |
| A    | `apps/dev-rxdb-angular/src/app/pages/board/board.page.ts`                          | +142/-0  | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| M    | `apps/dev-rxdb-angular/src/styles.scss`                                            | +2/-0    | 模板/样式      | 事件/状态/样式与可访问性        |
| M    | `apps/dev-rxdb-angular/tsconfig.app.json`                                          | +20/-14  | 配置/工具/契约 | 注册/依赖/构建/发布或对拍契约   |
| M    | `apps/dev-rxdb-angular/tsconfig.spec.json`                                         | +32/-26  | 配置/工具/契约 | 注册/依赖/构建/发布或对拍契约   |
| A    | `apps/dev-rxdb-board-e2e/playwright.config.ts`                                     | +39/-0   | 测试           | 用例/断言/替身与真实后端边界    |
| A    | `apps/dev-rxdb-board-e2e/project.json`                                             | +12/-0   | 测试           | 用例/断言/替身与真实后端边界    |
| A    | `apps/dev-rxdb-board-e2e/src/board-closed-loop.spec.ts`                            | +330/-0  | 测试           | 用例/断言/替身与真实后端边界    |
| A    | `apps/dev-rxdb-board-e2e/src/board-recovery.spec.ts`                               | +214/-0  | 测试           | 用例/断言/替身与真实后端边界    |
| A    | `apps/dev-rxdb-board-e2e/src/env.ts`                                               | +4/-0    | 测试           | 用例/断言/替身与真实后端边界    |
| A    | `apps/dev-rxdb-board/project.json`                                                 | +85/-0   | 配置/工具/契约 | 注册/依赖/构建/发布或对拍契约   |
| A    | `apps/dev-rxdb-board/src/app/app.config.ts`                                        | +13/-0   | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `apps/dev-rxdb-board/src/app/app.ts`                                               | +406/-0  | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `apps/dev-rxdb-board/src/app/board-rxdb.ts`                                        | +115/-0  | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `apps/dev-rxdb-board/src/index.html`                                               | +12/-0   | 模板/样式      | 事件/状态/样式与可访问性        |
| A    | `apps/dev-rxdb-board/src/main.ts`                                                  | +5/-0    | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `apps/dev-rxdb-board/src/styles.scss`                                              | +191/-0  | 模板/样式      | 事件/状态/样式与可访问性        |
| A    | `apps/dev-rxdb-board/tsconfig.app.json`                                            | +37/-0   | 配置/工具/契约 | 注册/依赖/构建/发布或对拍契约   |
| A    | `apps/dev-rxdb-board/tsconfig.json`                                                | +24/-0   | 配置/工具/契约 | 注册/依赖/构建/发布或对拍契约   |
| A    | `apps/dev-rxdb-react-e2e/src/board-parity.spec.ts`                                 | +126/-0  | 测试           | 用例/断言/替身与真实后端边界    |
| A    | `apps/dev-rxdb-react-e2e/src/board.spec.ts`                                        | +692/-0  | 测试           | 用例/断言/替身与真实后端边界    |
| A    | `apps/dev-rxdb-react/src/app/pages/board/board-page.css`                           | +58/-0   | 模板/样式      | 事件/状态/样式与可访问性        |
| A    | `apps/dev-rxdb-react/src/app/pages/board/board.page.tsx`                           | +115/-0  | 运行时源码     | B-05；连接/备份/种子宿主        |
| M    | `apps/dev-rxdb-react/src/app/router.tsx`                                           | +4/-0    | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| M    | `apps/dev-rxdb-react/src/styles.css`                                               | +6/-0    | 模板/样式      | 事件/状态/样式与可访问性        |
| M    | `apps/dev-rxdb-react/tsconfig.app.json`                                            | +6/-0    | 配置/工具/契约 | 注册/依赖/构建/发布或对拍契约   |
| M    | `apps/dev-rxdb-react/tsconfig.spec.json`                                           | +22/-16  | 配置/工具/契约 | 注册/依赖/构建/发布或对拍契约   |
| A    | `apps/dev-rxdb-vue-e2e/src/board-parity.spec.ts`                                   | +126/-0  | 测试           | 用例/断言/替身与真实后端边界    |
| A    | `apps/dev-rxdb-vue-e2e/src/board.spec.ts`                                          | +692/-0  | 测试           | 用例/断言/替身与真实后端边界    |
| A    | `apps/dev-rxdb-vue/src/pages/BoardPage.vue`                                        | +144/-0  | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| M    | `apps/dev-rxdb-vue/src/router/index.ts`                                            | +5/-0    | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| M    | `apps/dev-rxdb-vue/tsconfig.app.json`                                              | +6/-0    | 配置/工具/契约 | 注册/依赖/构建/发布或对拍契约   |
| M    | `apps/dev-rxdb-vue/tsconfig.spec.json`                                             | +20/-14  | 配置/工具/契约 | 注册/依赖/构建/发布或对拍契约   |
| M    | `eslint.config.mjs`                                                                | +2/-1    | 配置/工具/契约 | 注册/依赖/构建/发布或对拍契约   |
| A    | `modules/e2e-parity/board-parity.d.mts`                                            | +102/-0  | 配置/工具/契约 | 注册/依赖/构建/发布或对拍契约   |
| A    | `modules/e2e-parity/board-parity.golden.json`                                      | +134/-0  | 配置/工具/契约 | 注册/依赖/构建/发布或对拍契约   |
| A    | `modules/e2e-parity/board-parity.mjs`                                              | +153/-0  | 配置/工具/契约 | 注册/依赖/构建/发布或对拍契约   |
| A    | `modules/e2e-parity/board-parity.spec.mjs`                                         | +140/-0  | 测试           | 用例/断言/替身与真实后端边界    |
| M    | `modules/e2e-parity/project.json`                                                  | +1/-1    | 配置/工具/契约 | 注册/依赖/构建/发布或对拍契约   |
| M    | `packages/rxdb-adapter-sqlite-wasm/src/__tests__/sqlite-wasm-factory.ts`           | +6/-1    | 测试           | 用例/断言/替身与真实后端边界    |
| A    | `packages/rxdb-plugin-board-angular/ng-package.json`                               | +7/-0    | 配置/工具/契约 | 注册/依赖/构建/发布或对拍契约   |
| A    | `packages/rxdb-plugin-board-angular/package.json`                                  | +48/-0   | 配置/工具/契约 | 注册/依赖/构建/发布或对拍契约   |
| A    | `packages/rxdb-plugin-board-angular/project.json`                                  | +45/-0   | 配置/工具/契约 | 注册/依赖/构建/发布或对拍契约   |
| A    | `packages/rxdb-plugin-board-angular/src/__tests__/board-view-interactions.spec.ts` | +988/-0  | 测试           | 用例/断言/替身与真实后端边界    |
| A    | `packages/rxdb-plugin-board-angular/src/__tests__/board-view.spec.ts`              | +248/-0  | 测试           | 用例/断言/替身与真实后端边界    |
| A    | `packages/rxdb-plugin-board-angular/src/__tests__/use-board.spec.ts`               | +214/-0  | 测试           | 用例/断言/替身与真实后端边界    |
| A    | `packages/rxdb-plugin-board-angular/src/board-view.html`                           | +1336/-0 | 模板/样式      | 事件/状态/样式与可访问性        |
| A    | `packages/rxdb-plugin-board-angular/src/board-view.ts`                             | +1691/-0 | 运行时源码     | B-02 / B-03；视图行为对照       |
| A    | `packages/rxdb-plugin-board-angular/src/index.ts`                                  | +36/-0   | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board-angular/src/query-helpers.ts`                          | +16/-0   | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board-angular/src/test-setup.ts`                             | +22/-0   | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board-angular/src/use-board.ts`                              | +400/-0  | 运行时源码     | B-01 / B-06；API 对称           |
| A    | `packages/rxdb-plugin-board-angular/tsconfig.json`                                 | +26/-0   | 配置/工具/契约 | 注册/依赖/构建/发布或对拍契约   |
| A    | `packages/rxdb-plugin-board-angular/tsconfig.lib.json`                             | +27/-0   | 配置/工具/契约 | 注册/依赖/构建/发布或对拍契约   |
| A    | `packages/rxdb-plugin-board-angular/tsconfig.lib.prod.json`                        | +10/-0   | 配置/工具/契约 | 注册/依赖/构建/发布或对拍契约   |
| A    | `packages/rxdb-plugin-board-angular/tsconfig.spec.json`                            | +17/-0   | 配置/工具/契约 | 注册/依赖/构建/发布或对拍契约   |
| A    | `packages/rxdb-plugin-board-angular/vite.config.mts`                               | +38/-0   | 配置/工具/契约 | 注册/依赖/构建/发布或对拍契约   |
| A    | `packages/rxdb-plugin-board-react/package.json`                                    | +73/-0   | 配置/工具/契约 | 注册/依赖/构建/发布或对拍契约   |
| A    | `packages/rxdb-plugin-board-react/project.json`                                    | +12/-0   | 配置/工具/契约 | 注册/依赖/构建/发布或对拍契约   |
| A    | `packages/rxdb-plugin-board-react/src/__tests__/board-regressions.spec.tsx`        | +206/-0  | 测试           | 用例/断言/替身与真实后端边界    |
| A    | `packages/rxdb-plugin-board-react/src/__tests__/board-test-utils.ts`               | +140/-0  | 测试           | 用例/断言/替身与真实后端边界    |
| A    | `packages/rxdb-plugin-board-react/src/__tests__/board-view-interactions.spec.tsx`  | +1422/-0 | 测试           | 用例/断言/替身与真实后端边界    |
| A    | `packages/rxdb-plugin-board-react/src/__tests__/board-view.spec.tsx`               | +249/-0  | 测试           | 用例/断言/替身与真实后端边界    |
| A    | `packages/rxdb-plugin-board-react/src/__tests__/use-board.spec.tsx`                | +188/-0  | 测试           | 用例/断言/替身与真实后端边界    |
| A    | `packages/rxdb-plugin-board-react/src/board-view.css`                              | +2/-0    | 模板/样式      | 事件/状态/样式与可访问性        |
| A    | `packages/rxdb-plugin-board-react/src/board-view.tsx`                              | +134/-0  | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board-react/src/index.ts`                                    | +35/-0   | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board-react/src/use-board.ts`                                | +378/-0  | 运行时源码     | B-01 / B-06；API 对称           |
| A    | `packages/rxdb-plugin-board-react/src/view/board-columns.tsx`                      | +365/-0  | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board-react/src/view/board-dialogs.tsx`                      | +496/-0  | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board-react/src/view/board-header.tsx`                       | +240/-0  | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board-react/src/view/board-popover.tsx`                      | +313/-0  | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board-react/src/view/detail-panel.tsx`                       | +180/-0  | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board-react/src/view/model.ts`                               | +35/-0   | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board-react/src/view/types.ts`                               | +148/-0  | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board-react/src/view/use-board-data.ts`                      | +216/-0  | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board-react/src/view/use-board-view-model.ts`                | +125/-0  | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board-react/src/view/use-card-model.ts`                      | +154/-0  | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board-react/src/view/use-column-model.ts`                    | +186/-0  | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board-react/src/view/use-detail-model.ts`                    | +230/-0  | 运行时源码     | B-02 / B-03；视图行为对照       |
| A    | `packages/rxdb-plugin-board-react/src/view/use-dialog-model.ts`                    | +165/-0  | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board-react/src/view/use-drag-model.ts`                      | +167/-0  | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board-react/src/view/use-header-model.ts`                    | +139/-0  | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board-react/src/view/use-popover-model.ts`                   | +215/-0  | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board-react/src/view/use-search-model.ts`                    | +132/-0  | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board-react/src/view/use-state-ref.ts`                       | +23/-0   | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board-react/src/view/use-view-core.ts`                       | +196/-0  | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board-react/tsconfig.json`                                   | +19/-0   | 配置/工具/契约 | 注册/依赖/构建/发布或对拍契约   |
| A    | `packages/rxdb-plugin-board-react/tsconfig.lib.json`                               | +40/-0   | 配置/工具/契约 | 注册/依赖/构建/发布或对拍契约   |
| A    | `packages/rxdb-plugin-board-react/tsconfig.spec.json`                              | +28/-0   | 配置/工具/契约 | 注册/依赖/构建/发布或对拍契约   |
| A    | `packages/rxdb-plugin-board-react/vite.config.mts`                                 | +65/-0   | 配置/工具/契约 | 注册/依赖/构建/发布或对拍契约   |
| A    | `packages/rxdb-plugin-board-vue/README.md`                                         | +10/-0   | 文档           | 范围/契约/证据与派生一致性      |
| A    | `packages/rxdb-plugin-board-vue/eslint.config.mjs`                                 | +23/-0   | 配置/工具/契约 | 注册/依赖/构建/发布或对拍契约   |
| A    | `packages/rxdb-plugin-board-vue/package.json`                                      | +72/-0   | 配置/工具/契约 | 注册/依赖/构建/发布或对拍契约   |
| A    | `packages/rxdb-plugin-board-vue/project.json`                                      | +12/-0   | 配置/工具/契约 | 注册/依赖/构建/发布或对拍契约   |
| A    | `packages/rxdb-plugin-board-vue/src/__tests__/board-view-interactions.spec.ts`     | +1629/-0 | 测试           | 用例/断言/替身与真实后端边界    |
| A    | `packages/rxdb-plugin-board-vue/src/__tests__/board-view.spec.ts`                  | +245/-0  | 测试           | 用例/断言/替身与真实后端边界    |
| A    | `packages/rxdb-plugin-board-vue/src/__tests__/use-board.spec.ts`                   | +201/-0  | 测试           | 用例/断言/替身与真实后端边界    |
| A    | `packages/rxdb-plugin-board-vue/src/board-view.vue`                                | +3332/-0 | 运行时源码     | B-02 / B-03；视图行为对照       |
| A    | `packages/rxdb-plugin-board-vue/src/index.ts`                                      | +35/-0   | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board-vue/src/use-board.ts`                                  | +380/-0  | 运行时源码     | B-01 / B-06；API 对称           |
| A    | `packages/rxdb-plugin-board-vue/src/vue-shims.d.ts`                                | +9/-0    | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board-vue/tsconfig.json`                                     | +19/-0   | 配置/工具/契约 | 注册/依赖/构建/发布或对拍契约   |
| A    | `packages/rxdb-plugin-board-vue/tsconfig.lib.json`                                 | +36/-0   | 配置/工具/契约 | 注册/依赖/构建/发布或对拍契约   |
| A    | `packages/rxdb-plugin-board-vue/tsconfig.spec.json`                                | +26/-0   | 配置/工具/契约 | 注册/依赖/构建/发布或对拍契约   |
| A    | `packages/rxdb-plugin-board-vue/vite.config.mts`                                   | +62/-0   | 配置/工具/契约 | 注册/依赖/构建/发布或对拍契约   |
| A    | `packages/rxdb-plugin-board/board.css`                                             | +1509/-0 | 模板/样式      | 事件/状态/样式与可访问性        |
| A    | `packages/rxdb-plugin-board/package.json`                                          | +75/-0   | 配置/工具/契约 | 注册/依赖/构建/发布或对拍契约   |
| A    | `packages/rxdb-plugin-board/project.json`                                          | +38/-0   | 配置/工具/契约 | 注册/依赖/构建/发布或对拍契约   |
| A    | `packages/rxdb-plugin-board/src/__tests__/board-create.node.spec.ts`               | +167/-0  | 测试           | 用例/断言/替身与真实后端边界    |
| A    | `packages/rxdb-plugin-board/src/__tests__/board-delete.node.spec.ts`               | +186/-0  | 测试           | 用例/断言/替身与真实后端边界    |
| A    | `packages/rxdb-plugin-board/src/__tests__/board-detail-label.node.spec.ts`         | +455/-0  | 测试           | 用例/断言/替身与真实后端边界    |
| A    | `packages/rxdb-plugin-board/src/__tests__/board-edge.node.spec.ts`                 | +258/-0  | 测试           | 用例/断言/替身与真实后端边界    |
| A    | `packages/rxdb-plugin-board/src/__tests__/board-filter.node.spec.ts`               | +188/-0  | 测试           | 用例/断言/替身与真实后端边界    |
| A    | `packages/rxdb-plugin-board/src/__tests__/board-move-sort.node.spec.ts`            | +463/-0  | 测试           | 用例/断言/替身与真实后端边界    |
| A    | `packages/rxdb-plugin-board/src/__tests__/board-restore-machine.node.spec.ts`      | +126/-0  | 测试           | 用例/断言/替身与真实后端边界    |
| A    | `packages/rxdb-plugin-board/src/__tests__/board-search-source.node.spec.ts`        | +216/-0  | 测试           | 用例/断言/替身与真实后端边界    |
| A    | `packages/rxdb-plugin-board/src/__tests__/board-search.browser.spec.ts`            | +142/-0  | 测试           | 用例/断言/替身与真实后端边界    |
| A    | `packages/rxdb-plugin-board/src/__tests__/board-seed.node.spec.ts`                 | +100/-0  | 测试           | 用例/断言/替身与真实后端边界    |
| A    | `packages/rxdb-plugin-board/src/__tests__/board-upgrade.browser.spec.ts`           | +168/-0  | 测试           | 2 项 skip；本次未验持久化升级   |
| A    | `packages/rxdb-plugin-board/src/__tests__/drop-indicator.node.spec.ts`             | +38/-0   | 测试           | 用例/断言/替身与真实后端边界    |
| A    | `packages/rxdb-plugin-board/src/__tests__/due-status.node.spec.ts`                 | +33/-0   | 测试           | 用例/断言/替身与真实后端边界    |
| A    | `packages/rxdb-plugin-board/src/__tests__/keyboard.node.spec.ts`                   | +105/-0  | 测试           | 用例/断言/替身与真实后端边界    |
| A    | `packages/rxdb-plugin-board/src/__tests__/label-text-color.node.spec.ts`           | +39/-0   | 测试           | 用例/断言/替身与真实后端边界    |
| A    | `packages/rxdb-plugin-board/src/__tests__/popover-palette.node.spec.ts`            | +48/-0   | 测试           | 用例/断言/替身与真实后端边界    |
| A    | `packages/rxdb-plugin-board/src/__tests__/query.node.spec.ts`                      | +25/-0   | 测试           | 用例/断言/替身与真实后端边界    |
| A    | `packages/rxdb-plugin-board/src/board-domain.ts`                                   | +137/-0  | 运行时源码     | B-01；事务/归属/集合完整性      |
| A    | `packages/rxdb-plugin-board/src/board-storage.ts`                                  | +53/-0   | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board/src/column-sort-service.ts`                            | +129/-0  | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board/src/delete-service.ts`                                 | +310/-0  | 运行时源码     | B-01；事务/归属/集合完整性      |
| A    | `packages/rxdb-plugin-board/src/detail-service.ts`                                 | +204/-0  | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board/src/drop-resolution.ts`                                | +181/-0  | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board/src/due-status.ts`                                     | +39/-0   | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board/src/entities/board-label.entity.ts`                    | +35/-0   | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board/src/entities/board.entity.ts`                          | +23/-0   | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board/src/entities/column.entity.ts`                         | +43/-0   | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board/src/entities/index.ts`                                 | +5/-0    | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board/src/entities/task-label.entity.ts`                     | +37/-0   | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board/src/entities/task.entity.ts`                           | +48/-0   | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board/src/errors.ts`                                         | +35/-0   | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board/src/filter/board-filter.ts`                            | +284/-0  | 运行时源码     | B-04；解析/匹配/补全/往返       |
| A    | `packages/rxdb-plugin-board/src/host-context.ts`                                   | +36/-0   | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board/src/index.ts`                                          | +90/-0   | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board/src/keyboard.ts`                                       | +101/-0  | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board/src/label-service.ts`                                  | +145/-0  | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board/src/label-text-color.ts`                               | +46/-0   | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board/src/move-service.ts`                                   | +127/-0  | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board/src/palette.ts`                                        | +25/-0   | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board/src/popover.ts`                                        | +50/-0   | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board/src/query.ts`                                          | +39/-0   | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board/src/restore-machine.ts`                                | +117/-0  | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board/src/search/board-search-source.ts`                     | +175/-0  | 运行时源码     | B-01；事务/归属/集合完整性      |
| A    | `packages/rxdb-plugin-board/src/testing/index.ts`                                  | +9/-0    | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board/src/testing/release-board-dataset.ts`                  | +234/-0  | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board/src/title.ts`                                          | +31/-0   | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board/src/write-notifier.ts`                                 | +42/-0   | 运行时源码     | 读写调用链/生命周期/错误与竞态  |
| A    | `packages/rxdb-plugin-board/tsconfig.json`                                         | +16/-0   | 配置/工具/契约 | 注册/依赖/构建/发布或对拍契约   |
| A    | `packages/rxdb-plugin-board/tsconfig.lib.json`                                     | +47/-0   | 配置/工具/契约 | 注册/依赖/构建/发布或对拍契约   |
| A    | `packages/rxdb-plugin-board/tsconfig.spec.json`                                    | +29/-0   | 配置/工具/契约 | 注册/依赖/构建/发布或对拍契约   |
| A    | `packages/rxdb-plugin-board/vite.config.mts`                                       | +158/-0  | 配置/工具/契约 | 注册/依赖/构建/发布或对拍契约   |
| M    | `packages/rxdb/skills/aiao-rxdb/SKILL.md`                                          | +1/-1    | 生成物         | API/包关系/知识摘要与源码一致性 |
| M    | `packages/rxdb/src/__tests__/sortable/manual-order-group.spec.ts`                  | +23/-0   | 测试           | 用例/断言/替身与真实后端边界    |
| M    | `packages/rxdb/src/repository/Repository.ts`                                       | +1/-1    | 运行时源码     | G-01；expectedGroup事务校验     |
| M    | `packages/rxdb/src/sortable/sortable.interface.ts`                                 | +2/-0    | 运行时源码     | G-01；expectedGroup事务校验     |
| M    | `packages/rxdb/src/sortable/sortable.utils.ts`                                     | +7/-1    | 运行时源码     | G-01；expectedGroup事务校验     |
| M    | `pnpm-lock.yaml`                                                                   | +121/-0  | 配置/工具/契约 | 注册/依赖/构建/发布或对拍契约   |
| M    | `project.json`                                                                     | +5/-1    | 配置/工具/契约 | 注册/依赖/构建/发布或对拍契约   |
| M    | `requirements/README.md`                                                           | +2/-1    | 文档           | 范围/契约/证据与派生一致性      |
| A    | `requirements/api-baseline/rxdb-plugin-board-angular.json`                         | +102/-0  | 生成物         | API/包关系/知识摘要与源码一致性 |
| A    | `requirements/api-baseline/rxdb-plugin-board-react.json`                           | +106/-0  | 生成物         | API/包关系/知识摘要与源码一致性 |
| A    | `requirements/api-baseline/rxdb-plugin-board-vue.json`                             | +102/-0  | 生成物         | API/包关系/知识摘要与源码一致性 |
| A    | `requirements/api-baseline/rxdb-plugin-board.json`                                 | +436/-0  | 生成物         | API/包关系/知识摘要与源码一致性 |
| M    | `requirements/capability-matrix.md`                                                | +4/-4    | 文档           | 范围/契约/证据与派生一致性      |
| M    | `requirements/domain-research/README.md`                                           | +69/-57  | 文档           | 范围/契约/证据与派生一致性      |
| A    | `requirements/domain-research/board-v2-github-projects-style.md`                   | +238/-0  | 文档           | 范围/契约/证据与派生一致性      |
| M    | `requirements/domain-research/task-board.md`                                       | +13/-5   | 文档           | 范围/契约/证据与派生一致性      |
| A    | `requirements/epics/epic-011-task-board-domain-model.md`                           | +126/-0  | 文档           | 范围/契约/证据与派生一致性      |
| M    | `requirements/generated/package-knowledge.json`                                    | +115/-1  | 生成物         | API/包关系/知识摘要与源码一致性 |
| M    | `requirements/generated/package-knowledge.md`                                      | +1/-1    | 生成物         | API/包关系/知识摘要与源码一致性 |
| M    | `requirements/package-graph.json`                                                  | +32/-0   | 生成物         | API/包关系/知识摘要与源码一致性 |
| M    | `requirements/reviews/README.md`                                                   | +8/-6    | 文档           | 范围/契约/证据与派生一致性      |
| A    | `requirements/reviews/RV-083-board-v1-closeout-checklist.md`                       | +120/-0  | 文档           | 范围/契约/证据与派生一致性      |
| A    | `requirements/reviews/xenodochial-board-branch-review.md`                          | +366/-0  | 文档           | 范围/契约/证据与派生一致性      |
| M    | `requirements/roadmap.md`                                                          | +23/-5   | 文档           | 范围/契约/证据与派生一致性      |
| M    | `requirements/status-overview.md`                                                  | +31/-9   | 文档           | 范围/契约/证据与派生一致性      |
| A    | `requirements/stories/domain/US-534-board-column-task-skeleton.md`                 | +150/-0  | 文档           | 范围/契约/证据与派生一致性      |
| A    | `requirements/stories/domain/US-535-cross-column-move-ordering.md`                 | +133/-0  | 文档           | 范围/契约/证据与派生一致性      |
| A    | `requirements/stories/domain/US-536-task-detail-editing.md`                        | +155/-0  | 文档           | 范围/契约/证据与派生一致性      |
| A    | `requirements/stories/domain/US-537-board-backup-restore.md`                       | +149/-0  | 文档           | 范围/契约/证据与派生一致性      |
| A    | `requirements/stories/domain/US-538-board-task-search.md`                          | +127/-0  | 文档           | 范围/契约/证据与派生一致性      |
| A    | `requirements/stories/domain/US-539-board-tri-framework-ui.md`                     | +232/-0  | 文档           | 范围/契约/证据与派生一致性      |
| A    | `requirements/stories/domain/US-540-board-end-to-end-demo.md`                      | +166/-0  | 文档           | 范围/契约/证据与派生一致性      |
| A    | `requirements/stories/domain/US-541-board-team-sync.md`                            | +124/-0  | 文档           | 范围/契约/证据与派生一致性      |
| M    | `scripts/audit/api-surface.mjs`                                                    | +3/-0    | 配置/工具/契约 | 注册/依赖/构建/发布或对拍契约   |
| M    | `scripts/audit/release-consumers.mjs`                                              | +67/-14  | 配置/工具/契约 | 注册/依赖/构建/发布或对拍契约   |
| M    | `tsconfig.base.json`                                                               | +7/-1    | 配置/工具/契约 | 注册/依赖/构建/发布或对拍契约   |
| M    | `tsconfig.json`                                                                    | +15/-0   | 配置/工具/契约 | 注册/依赖/构建/发布或对拍契约   |
