# 分支评审报告：claude/xenodochial-leakey-5a7c4d（任务看板）

评审基准 `63398faa`（含 CI 修复 `60911d70` 前的状态）。四个切片：核心领域包
（`packages/rxdb-plugin-board`）、三端绑定（`-angular/-react/-vue`）、demo 与 e2e
（`apps/dev-rxdb-board*`、三端宿主看板页、对拍）、需求工件一致性；另加 CI 证据核对。
只读评审；全部 P0/P1 证据由主会话逐条抽查复核。与 [RV-083](RV-083-board-v1-closeout-checklist.md)
重叠的已知项在此只交叉引用，不重复登记；本报告不占用 RV 编号（一次性结论，见
[reviews README](README.md#命名规范)）。

## 修复进展（2026-10-22，逐条核对后更新）

已解决：P0-1（截止日始终带日期渲染 + 三端 e2e 断言改正则，`c88e2801`）；核心 P1-1/P1-2
（单卡列原位、间隙归最近卡，`c88e2801`）；绑定 P1-3（拖拽 handler 按 kind 分流，`c88e2801`）、
P1-4（Angular/Vue 补样式 + computed-style 断言，`923752a4`）、P1-5（Angular 标题草稿拆分，
`c88e2801`）、P1-6 服务层半边（delete-service 归属校验，`c88e2801`）、P1-12（三端 setRestoring
跨页接线，`edbf87d3`）；绑定 P2-1/P2-9（`c88e2801`）；demo P1-9（库名避让现存 IDB 库 +
连续两次重置 e2e，`edbf87d3`）、P2-3/P2-4（`edbf87d3`）；
工件 P1-13/P1-14/P1-15/P1-11（roadmap 计数与批次号、status-overview 补行与注记、US-540
阶段 B 与 AC#13 状态、验收注记）与工件 P2-27～32（`edbf87d3`）。验证：核心包 70/70、
Angular 看板 e2e+对拍 12/12、demo e2e 7/7、四包 + demo 构建绿、check-format / audit:api-surface 绿。

第二批（提交中）：核心 P2-1（move-service 邻居归属校验 + 用例）、P2-3（describeBoardFailure
稳定错误码）、P2-4（本列排序改 `unsupported_primary`）、P2-5（标签颜色 trim 归一落库 + 用例）、
P2-6（labelTextColor 抛 BoardDomainError）、P2-7（TSDoc 补齐）、P2-8（保存后重查空结果
抛 task_stale）；绑定 P1-8（三端 busy 状态：保存 / 排序 in-flight 禁用）与 P2-4（React/Vue
loadMore 守卫）、P2-6（卡片标题两行截断）；demo P1-10（工具菜单恢复成功路径 e2e）、
P2-1（拖后先断言落点再 reload）、P2-2（AC#4 undo 前 reload）、P2-5（首装 loading 相位）、
P2-8（e2e 复用端口健康服务）。验证：核心包 72/72、构建与门禁绿，四套 e2e 复跑中。

第三批（提交中）：绑定 P1-6 视图半边（三端详情未保存修改关闭 / 切板先确认放弃；切板关
详情消除旧板任务残留，配合服务层归属校验三端删除行为一致）、P1-7（核心 `resolveMenuMove`
换算表 + 三端详情面板「移动到列 + 位置」控件与 AC#6 e2e：移动后焦点落在被移动卡片）。
验证：核心包 73/73、构建与门禁绿，四套 e2e 复跑中。

未解决（保留在本报告与 RV-083）：绑定 P2-2/3/5/7/8/10；demo P2-6/7；适配器关闭路径
缺陷（TODO SQLC-待开）；待人工确认第 1～10 条按原样保留。

## 全分支 vs main 差异覆盖（2026-10-22 补充）

`git diff main...HEAD` 共 157 个文件、+17982/-229。看板范围（board 四包、demo、三端宿主页、
对拍与需求工件）由本报告四个切片与修复进展覆盖；看板之外的 14 个文件逐一核对如下，
全部合规：

- `README.md`：交付状态 75/100 → 78/108，与 status-overview 修复后的口径一致。
- `eslint.config.mjs`：允许三端对拍 spec 相对加载 `board-parity.mjs`（entity-model 同款白名单）。
- `scripts/audit/api-surface.mjs`：资产入口登记 `rxdb-plugin-board-react/board-view.css`。
- `tsconfig.base.json`：5 个 board 包路径别名 + `board-view.css` 子路径。
- `tsconfig.json`：4 个 board 包 + `apps/dev-rxdb-board` 的 project references。
- `requirements/README.md`：大故事清单 30 → 32（US-539 / US-540 有阶段表）+ epic-011 登记。
- `requirements/package-graph.json` + `generated/package-knowledge.{json,md}`：三份生成物一起
  更新（board 包注册，符合「package-graph 三件套随提交」约定）；`rxdb/skills/aiao-rxdb/SKILL.md`
  事实摘要哈希同步刷新。
- `pnpm-lock.yaml`：新增 board 包依赖图；同时修剪了 main 锁文件里的 @jimp 陈旧条目——
  核对全仓无任何 `package.json` 依赖 jimp，属无害归一化。
- `packages/rxdb-adapter-sqlite-wasm/src/__tests__/sqlite-wasm-factory.ts`：测试工厂加可选
  `dbName`（跨断开重开验收需要同名重连），默认随机名，既有调用方零变化。
- `requirements/stories/collaboration/US-302-undo-redo.md`：**对 Done 故事的范围改写**——
  undo 从「durable，刷新后仍可撤销」改为「范围是本次会话（firstConnectedAt 起点）」。
  核对结论：main 上的 `rxdb-plugin-history`（`HistoryManager` 的 `#firstConnectedAt`）本就
  实现会话级 undo，本分支对 history 包零改动——这是把故事校正到引擎既有行为，不是
  借故事改产品语义；看板 US-536 的「刷新后不可撤销」正是按该行为验收的。
- `requirements/stories/domain/US-541-board-team-sync.md`：新故事（Backlog、价值待证、
  Low），与 epic-011 解锁记录一致。
- board 四包 `package.json` / `ng-package.json`：版本随桥接线 0.0.26、exports 与 api 基线
  一致（`audit:api-surface` 全绿）。

## CI 证据

- 评审时 PR #139 的 setup lane 红，两层原因：① 分支既有——`rxdb-plugin-board` 新增
  `isHexColor`/`labelTextColor`/`SearchHandle`/`SearchResult` 四个导出未同步 api 基线
  （cd2dd1e0 起红）；② 评审引入——两份 domain-research 文档误用主检出 prettier 格式化。
  均已修于 `60911d70`，本地 `pnpm check-format` 与 `pnpm audit:api-surface` 复验绿。
- setup 红导致 lint / test / e2e 等后续 lane 全程被跳过，**推送修复后需完整跑一轮
  affected 才能确认下游全绿**。

## 结论摘要

P0 × 1，P1 × 15，P2 × 30，待人工确认 × 10。核心领域的事务边界、撤销语义、confirm_stale
复核做得扎实且有测试钉住；风险集中在：drop-resolution 纯函数边界（2 条 P1 未被 spec 覆盖）、
三端视图层交互状态与样式（Angular / Vue 拖拽反馈样式整体缺失、Angular 标题草稿串用）、
三个标 ✅ 的 AC 实无有效测试或实现，以及一条 2026-11-05 触发的日期断言时间炸弹。

## P0

**P0-1 日期断言时间炸弹：2026-11-05 起三端 board e2e 与对拍确定性变红**

- 位置：`apps/dev-rxdb-{angular,react,vue}-e2e/src/board.spec.ts:65,323`、
  `apps/dev-rxdb-angular-e2e/src/board-parity.spec.ts:42`；渲染侧
  `packages/rxdb-plugin-board-react/src/board-view.tsx:420-421`（angular `board-view.ts:676-677`
  / vue `board-view.vue:439-440`）
- 断言：spec 恒以纯日期串断言卡片截止日；渲染在到期当天只输出「今天到期」（不带日期）。
- 失败场景：种子「修复登录 bug」截止日 2026-11-05——当天起 `toHaveText('2026-11-05')`
  恒红（先「今天到期」、次日改「已逾期 2026-11-05」）；parity 剥离正则把「今天到期」
  剥成空串归一为 null，golden 在种子三个截止日失配。纯时间流逝触发，无需任何代码变更。
- 修法：三端 e2e fixture 与 parity spec 统一 `page.clock.setFixedTime`（固定本地日期，
  与 AC#12 口径一致）；或 parity 改用 data-* 属性取原始日期、board.spec 断言改用正则。

## P1

### 核心领域包

**P1-1 单卡列的首 / 尾空区生成 `undefined` 邻居，原位拖拽报错而非零写**

- 位置：`packages/rxdb-plugin-board/src/drop-resolution.ts:77,80-86`
- 断言：列内只有被拖行一张卡时 `rest` 为空，列首 `nextId: rest[0]` 与列尾
  `prevId: rest[rest.length - 1]` 均产出 `undefined`；原位判定 `isCurrentPlacement` 的
  `?? null` 归一挡不住（`null === undefined` 为 false）；引擎 `readNeighbor` 只判
  `id === null`，`undefined` 进 `findById` → 无行 → `SortOrderError('staleTarget')`。
- 失败场景：单卡列上任何空区拖拽（纯 no-op）→ 事务内抛错 → `move-failed` 提示。
- 修法：算出 `rest` 后 `if (rest.length === 0) return null;`（单卡列空区即原位），
  并补单卡列 spec。

**P1-2 卡片之间的间隙被当成「列尾空区」，中间间隙落点错置到列尾**

- 位置：`packages/rxdb-plugin-board/src/drop-resolution.ts:74-86`
- 断言：列尾分支是列首判定的 `else`——凡不压在任何卡上且不低于首卡的点一律解析为
  「插到末卡之后」，包括两张中间卡之间的间隙，与函数自身契约（列尾空区 = 末卡下沿到
  列体下沿）不符。
- 失败场景：本包 spec 自带几何（卡高 30、行距 50，间隙 20px）把 a1 拖到 a1/a2 间隙
  （y≈145）→ 不压卡 → 返回 `{prevId: a3, nextId: null}`，任务落库到列尾而非视觉落点。
  真实 UI 卡片普遍有间距，同样中招。
- 修法：间隙按 y 最近的卡换算 before/after（不可判定区域返回 null），补间隙用例。

### 三端绑定

**P1-3 拖列落点反馈被任务落点覆盖，列插入线永远不可见（三端同错）**

- 位置：react `board-view.tsx:664,683,219-268`；angular `board-view.html:5,140` +
  `board-view.ts:431-452,459-480`；vue `board-view.vue:695,710,234-279`
- 断言：`onTaskDragOver` 与 `onColumnDragOver` 都不校验 `dragging.kind`；任务 handler 挂在
  列 handler 的祖先上，列头 dragover 冒泡后任务 handler 用列 id 调 `resolveCardDrop` 覆盖
  列目标（`reorderTargetForDrop` 对被拖行不在组内的情况返回合法 between 目标）。
- 失败场景：拖列经过任意列——列插入线从未显示，反在卡片上显示误导性任务插入线；空列
  显示任务语义虚线框。drop 时用 `resolveColumnTarget` 重算故数据不错，反馈全错；e2e 只对
  任务拖拽断言 class（`board.spec.ts:464-492`），AC#9 鼠标半边未做（见 RV-083）故未暴露。
- 修法：两个 handler 入口各加 kind 守卫，三端同改，并补拖列落点 e2e。

**P1-4 Angular / Vue 缺拖拽落点与搜索的整套 CSS，反馈功能实际不可见**

- 位置：react `board-view.css:197-293`（`.search-hit`/`.board-search`/`.card.dragging`/
  `.drop-before|after`/`.column.drop-end`/`.add-task-form` 等）vs angular `board-view.ts:50-247`
  styles 与 vue `board-view.vue:1014-1226` scoped styles 均无对应规则
- 断言：三端模板绑定同一批 class，Angular/Vue 无任何样式规则（vue 的 23 处匹配全在模板
  区、style 块 0 条）——提交 b340c949 声称的「拖拽落点反馈三端对称」只在 React 端可见。
- 失败场景：Angular/Vue 端插入线 / 源卡半透明 / 空列高亮 / 搜索下拉样式全部不渲染；
  e2e 只断言 class 不断言 computed style，套件保持绿色掩盖缺口。
- 修法：把 react 样式块移植进 Angular styles 与 Vue scoped styles，e2e 补 computed-style
  断言（口径见待确认 1）。

**P1-5 Angular 详情面板与内联标题编辑共用 `draftTitle`，互相污染写错任务**

- 位置：`packages/rxdb-plugin-board-angular/src/board-view.ts:310,409-415,528-548` +
  `board-view.html:199-202,300`
- 断言：详情标题输入与卡片内联编辑器绑定同一 signal；React/Vue 各自分离。
- 失败场景：详情开着任务 A 时点卡片 B 的「编辑」→ 详情标题框变成 B 的标题；此时点详情
  「保存」把 B 的标题写进 A（`detail-service.ts` 只复核快照不校验值来源）；反向同理。
- 修法：拆成 `detailDraftTitle` 与内联 `editTitleValue` 两个 signal，对齐 React/Vue 结构，
  补互污染回归用例。

**P1-6 详情面板未保存切换 / 关闭无确认，切板后面板残留旧板任务且三端删除行为分叉**

- 位置：关闭 vue `board-view.vue:942` / react `board-view.tsx:940` / angular
  `board-view.ts:538-541`；切板不清详情三端 `board-view.*:428-436/447-455/690-697`；
  删除路径 vue `board-view.vue:937` vs angular `board-view.ts:592-599` / react `:933-935`
- 断言：约定「未保存关闭或切板先确认放弃」未实现；切板后详情面板继续展示旧板任务草稿；
  服务层 `delete-service.ts` plan/execute 无板归属校验（对比 `detail-service.ts:60-65`
  有 `cross_board` 校验）。
- 失败场景：打开 A 板任务详情 → 切到 B 板：Vue 仍可确认并删除 A 板任务（确认框无板上下文）；
  Angular/React 删除按钮静默无响应。同一操作三端结果不同。
- 修法：切板时关闭详情或弹确认（三端一致）；`planTaskDelete` 补板归属校验（服务层兜底）。

**P1-7 任务无键盘等价移动路径，AC#6 标 ✅ 与实现不符**

- 位置：卡片结构三端 `board-view.*`（仅标题按钮 + 编辑按钮，详情面板无移动控件）；
  列的「前移 / 后移」在 angular `board-view.html:158-163`；e2e 只有列移动
  （`board.spec.ts:193-206`）
- 断言：US-539 AC#6 要求「任务可通过『移动到列 + 位置』完成等价移动」，任务半边三端均无
  UI 也无 e2e；AC#6 与 验收注记均标 ✅。
- 失败场景：纯键盘用户无法把任务移列（无障碍硬伤）；三框架对称未闭环。
- 修法：卡片或详情面板补「移动到列 + 位置」控件（三端对称）并补 e2e；若有意豁免则回改
  AC#6 文案与状态（口径见待确认 2）。

**P1-8 写入期间无「进行中」状态、不阻止重复提交**

- 位置：详情保存 angular `board-view.html:325` / react `board-view.tsx:929` / vue
  `board-view.vue:932`；排序按钮三端 `board-view.*`；`detail-service.ts:106-112`
- 断言：保存 / 排序 / 建任务均无 busy 状态；约定「执行中阻止重复提交」未落码。
- 失败场景：双击保存 → 两事务并发，第二个复核抛 `task_stale` → 保存实际成功却弹
  「任务字段已被其它入口修改」；连点排序叠加请求。
- 修法：三端加 in-flight 状态并禁用按钮（或提交中 early-return），成功后再关面板。

### demo 与 e2e

**P1-9 「重置为演示数据」/ 工具菜单恢复二次使用必败（库名回绕撞已有库）**

- 位置：`apps/dev-rxdb-board/src/app/board-rxdb.ts:57`、`app.ts:133-138,175,226-240`、
  `packages/rxdb-plugin-board/src/board-storage.ts:41-50`
- 断言：`nextBoardDbName` 从不传 `existing`，只避开当前活动库名。
- 失败场景：startEmpty 建 `restore-0` → 第一次重置建 `restore-1` → 第二次重置回算
  `restore-0`（已存在用户旧板）→ 种子装载数出 boards>0 抛「演示数据只能装进新库」→
  踢回启动页且此后每次重置都重算同一个库名，**永久失败**。工具菜单恢复同理。e2e 每用例
  只重置一次，抓不到。
- 修法：生成库名时把 `indexedDB.databases()` 的名称传入 `existing`，或重置 / 恢复前先删
  同名旧库；补「连续两次重置」e2e。

**P1-10 US-540 AC#6 工具菜单恢复成功路径无 e2e（故事标 ✅）**

- 位置：`apps/dev-rxdb-board-e2e/src/board-closed-loop.spec.ts:178-229`（只测启动页恢复 +
  工具菜单喂坏归档）
- 断言：AC#6「两条入口均恢复…原库保留且未被写入」——已连接库上「确认 → 恢复 → 整页重载
  → 读回切换 → 原库保留」主流程没有任何 e2e。
- 失败场景：P1-9 的库名回绕、恢复期间原库被写等回归全部放行。
- 修法：补工具菜单成功恢复用例（seed → 编辑 → 导出 → 恢复 → 断言重载后一致、旧库未动）。

**P1-11 US-540 AC#13 标 ✅ 但无有效测试；阶段 B 行 ⬜ 与 AC ✅ 自相矛盾**

- 位置：`packages/rxdb-plugin-board/src/__tests__/board-upgrade.browser.spec.ts:39,107`
  （两用例 `it.skip`，TODO SQLC-待开）；`requirements/stories/domain/US-540-board-end-to-end-demo.md:37,104-114`
- 断言：全仓唯一「断开重连」看板用例被 skip；「阶段 A 库在阶段 B 版本重开、旧任务可搜」
  无任何有效测试；同时 US-540 阶段 B 行标 ⬜ 而 AC#9-11/#13 标 ✅，注记把关闭归给
  「US-539 阶段 B 三端 e2e」，与本故事自己的验收机制（demo e2e 覆盖 AC#2~13 各至少一条）
  冲突。
- 失败场景：阶段 A 库真重开时的迁移 / 触发器 / 索引缺陷无人拦截。
- 修法：修适配器关闭路径缺陷后取消 skip 并加「重开后搜旧任务」断言；修复前把 AC#13 与
  阶段 B 行统一改 ⚠️ 并注明证据出处（口径见待确认 4，与 RV-083 第 12 条对齐）。

**P1-12 `setRestoring` 全链路无调用方，跨页恢复门禁未接线（AC#5 无法关闭）**

- 位置：三端 `use-board.ts:280-282/299-301/295`；`apps/dev-rxdb-board/src/app/app.ts:181-200`
- 断言：全仓无任何 `setRestoring` 调用点、无 `storage` 事件监听；demo 恢复只在本页 phase
  换页，另一页 / tab 不感知；三端绑定里的 restoring badge 与禁用绑定是死代码。
- 失败场景：US-539 AC#5（一页恢复、另一页写）永远无法关闭；第二页在恢复期间照常写入，
  切换后与新库错位。
- 修法：恢复编排对标记做 storage 事件广播（或轮询），宿主 / 绑定据此调 `setRestoring`。

### 需求工件

**P1-13 roadmap 现状快照数字与 YAML 实际计数矛盾，且 epic-011 排期写「批次 5」**

- 位置：`requirements/roadmap.md:11-21,45`
- 断言：表写 Done 75 / In Progress 2 / Backlog 29，实测 YAML 为 78 / 5 / 23；同表下一句
  自写「30 条未关闭（5 + 2 + 23）」与表列矛盾；epic-011 行尾「批次 5」不存在（全仓仅此
  一处，正文与 epic 均指批次 6）。
- 修法：按 grep 重推数字统一为 78 / 5 / 2 / 23 / 30 / 108；行尾改「批次 6」。

**P1-14 status-overview 进行中节缺 3 条，注记「其余随 US-539 阶段 B 收尾」与故事状态相反**

- 位置：`requirements/status-overview.md:22,29-34`
- 断言：汇总「In Progress 5」与实际 YAML 一致（US-211/534/537/539/540），进行中节只有
  US-211、US-534；注记「其余随 US-539 阶段 B 收尾」——但 US-538 已 Done、US-539 阶段 B
  已 ✅，剩余保留项全在阶段 A。
- 修法：补 US-537/539/540 进展行；注记改为「US-535 / US-536 / US-538 Done；US-534/537/
  539/540 阶段 A 各有保留项（收尾见 RV-083）」。

**P1-15 US-540 阶段 B 的 ✅ 证据口径与 RV-083 直接冲突**

- 位置：`US-540-board-end-to-end-demo.md:112` vs `RV-083-board-v1-closeout-checklist.md`
  （第 9、12 条）
- 断言：US-540 注记把 AC#9~11/#13 的关闭归给「US-539 阶段 B 三端 e2e」，但本故事的关闭
  判据是 demo e2e 各 AC 至少一条用例；RV-083 明确 demo 侧用例未落、适配器缺陷挡升级重开
  验收。故事 ✅ 与收尾清单互相矛盾（含在 P1-11 一并修）。

## P2

### 核心领域包

1. move-service 的 between 目标不校验邻居归属（`move-service.ts:35-44,53-68`）——双邻居同属
   异板列时可跨板移动；领域防线缺口，UI 正常路径不触发。修法：对非 null 邻居断言归属。
2. delete-service 与 updateBoard 不校验实体归属当前板（`delete-service.ts:66-79,165-182`、
   `board-domain.ts:61-71`）——与 move/detail/label 入口不对称。修法：复用 requireTaskInBoard。
3. `describeBoardFailure` 丢稳定错误码（`write-notifier.ts:34-38`）——SortOrderError 只回 name
   丢 reason，BoardDomainError 回 message 丢 code，与 `errors.ts` 契约断链。修法：优先发布
   reason / code。
4. 本列排序复用 `cross_board` 表达「主端不支持」（`column-sort-service.ts:76-81`）——语义错位，
   spec AC#11b 已钉进该 code，属有意为之的语义债。修法：新增 `unsupported_primary`。
5. 标签颜色按 trim 校验、按原值入库（`label-service.ts:40,45,138-141`）——`' #16a34a '` 通过
   校验后原值落库，与名称的归一化行为不对称。修法：校验返回 trim 值并落库。
6. `labelTextColor` 抛裸 Error（`label-text-color.ts:35`）——与 `BoardDomainError('invalid_color')`
   通道不统一。修法：共用领域错误。
7. 公开导出 TSDoc 缺口（`write-notifier.ts:10`、`board-storage.ts:15-17`、`delete-service.ts:281-283`）
   ——违反「新导出必须补齐 TSDoc」铁律。
8. 保存后重查 `refreshed[0]` 可为 undefined（`detail-service.ts:164-167`）——提交后重查前任务
   被删的窄窗口越过类型约束。修法：重查为空返回新结果分支。

### 三端绑定

9. 内联标题编辑失败丢弃草稿（三端 `board-view.*:203-206/193-196/414-418`）——`commitEditTitle`
   先关编辑器再走 guard，违反「失败保留草稿」，与 `commitAddTask` 行为自相矛盾。
10. 板删除确认清单缺标签定义数 / 关联数（三端）——`BoardDeletePlan` 已有字段但文案只显示
    列数 / 任务数，违反约定「确认清单包含实际影响的数量」。
11. 删除当前板后空态文案失真且三端构图不一致——`picked` 只挑一次，板列表非空却渲染
    「没有看板」；Angular 保留完整页头而 React/Vue 只有选择器。修法：区分「无板」与
    「未选中板」，统一构图。
12. React/Vue「加载更多」无 loading 守卫（Angular 有，`board-view.ts:723-726`）——连点并发
    loadMore。修法：对齐 Angular。
13. 列横向溢出提示缺失（三端，`.columns` 只有 `overflow-x: auto`）——约定要求明显的溢出提示。
14. 卡片标题无两行截断（三端，`.card-title` 无 line-clamp）——约定「标题最多两行且详情展示全文」。
15. 拖拽元素缺可访问名称（三端）——整卡 / 整列头 draggable 无 role/aria-label，与 RV-083 第 8 条
    同源，修法合并。
16. `eq`/`inRule` 三处重复实现（angular `query-helpers.ts:8-16`、react `use-board.ts:107-114`、
    vue `use-board.ts:105-112`）——核心包已公开导出，统一导入。
17. Angular 空降数据回退把列 id 当任务 id（`board-view.ts:484-486,497-499`）——合成 drop 事件
    且 dataTransfer 为 null 时回退列 id 发起必失败的 moveTask（真实浏览器恒存在，仅 P2）。
18. 右侧固定面板无窄屏适配 + 死代码（`.detail-panel` 固定 `width:20rem` 遮挡列区；
    `dragPointer` signal 只写不读；`.board-connecting` 三端定义未用）。

### demo 与 e2e

19. demo 拖拽用例固定 sleep、无落点断言（`board-closed-loop.spec.ts:100,114,124`）——CI 慢盘下
    移动事务 >500ms 未提交时 reload 读回旧序 → 假红。修法：换三端同款「先断言落点、再 reload」。
20. AC#11 与 demo AC#4 在 undo 前未 reload（`board.spec.ts:294-322`、`board-closed-loop.spec.ts:145-149`）
    ——种子写入异步进撤销栈，undo 可能先弹到种子条目；同文件 AC#6/#14 已防御这两处没有。
21. pending-switch 读回期间启动页可交互（`app.ts:117-121,203-224`）——恢复重载后的读回窗口内
    点「新建空看板」→ 两流程并发写 ACTIVE_DB_KEY、另一库成孤儿。修法：completePendingSwitch
    开头置 restoring phase。
22. RESTORING_MARKER 崩溃残留无清理路径（`app.ts:188,195-196,123,132-140`）——恢复中途断电 →
    marker 永久残留 → 每次 reload 落启动页，唯一清法再跑一次 restore。修法：startEmpty/
    startSeed/openBoard 成功时清除。
23. 首装复用「恢复中」文案（`app.ts:227` + `:41-45`）——首次新建 / 装载显示「恢复中：全部写
    入口已暂停」，与操作不符。修法：区分 loading / restoring phase。
24. AC#12 无搜索插件时静默隐藏入口（三端 `board-view.*:596`）——约定要求「禁用并说明原因，
    不静默降级」。修法：渲染禁用输入 + 原因文案，或回改 AC 记录偏离。
25. demo e2e 无阶段 B 用例（`apps/dev-rxdb-board-e2e/` 仅一个 spec 6 条）——与故事「实现文件」
    声明（demo e2e 覆盖 A/B、AC#2~13 各至少一条）不符；即 RV-083 第 9 条，修法见 RV-083。
26. e2e 端口 4312 与 dev server 互斥（`playwright.config.ts:34` `reuseExistingServer: false`）——
    用户开着 `nx serve dev-rxdb-board` 时跑 e2e 绑定失败（BOM 4311 先例）。修法：独立端口或
    复用现有服务器加健康检查。

### 需求工件

27. roadmap 批次 6「后续」行与 epic-011 首轮切片「后续」行把已完成项当待办（roadmap:98、
    epic:88）——US-538 Done、US-539 阶段 B ✅ 后仍写「US-538 → US-539 阶段 B → US-540 阶段 B」。
    修法：改为「阶段 A 保留项收尾 → US-540 阶段 B」。
28. roadmap 全景表 epic-011「剩什么」列含已完成的第 1/2 步（roadmap:45）。修法：改写为剩余事项。
29. status-overview「30 条 Backlog 里 BOM 19 条」计数过期（status-overview:21）——实际 23。
    修法：改 23 并注明构成。
30. capability-matrix 只更新了包计数，「演示应用」「E2E 测试套件」与三端绑定列举三处未登记
    看板（capability-matrix:13-14,51）。修法：三处补登记。
31. 多条故事的「实现文件」节仍写「待建」（US-534:142、US-537:139-141 等）——包与 demo 均已存在。
    修法：改「已建」或去掉待建字样。
32. US-539 验收注记「board.spec 8 条」与实际 11 条（含阶段 B）漂移（US-539:100）。修法：
    随收尾一并修订。

## 待人工确认

1. e2e 反馈断言口径：是否要求补 computed-style 断言（或快照），否则 P1-4 类缺口套件恒绿。
2. AC#6 任务键盘路径：豁免（改 AC 文案与状态）还是按 P1-7 实现。
3. 「今天到期」展示口径：若模板改为「今天到期 + 日期」并存，P0-1 的 parity 剥离问题消失；
   约定只要求文字说明，是否带日期未规定。
4. 适配器关闭路径丢数据缺陷（TODO SQLC-待开）：修复归属与排期直接影响 US-534 AC#8 /
   US-540 AC#7/#13 三条 AC 的关闭；AC#13 的验收路径（重载 vs 干净断开）需在 US-540 注记
   写清后与 RV-083 第 12 条对齐。
5. 拖拽视口可靠性：四个 board 相关 playwright config 均未锁 viewport，需确认 CI runner 下
   4 列布局目标稳定可见、半边判定不因缩放 / 滚动偏移。
6. 种子历史条目异步注册时序：P2-20 竞态是否真实取决于注册顺序是否恒等于提交顺序，建议
   慢写入复跑验证或统一加 reload 防御。
7. 删板 undo 的插回顺序未在本包钉住（`delete-service.ts:272-276`）——依赖引擎按变更 id
   降序插回，板级 undo 无用例，建议补回归。
8. `Intl.Collator('zh-Hans-CN', { numeric: true })` 跨平台一致性（`column-sort-service.ts:28,42-45`）
   ——Node 与各浏览器实现可能有差异，建议在 parity e2e 观察。
9. restore-machine 的 `archive_invalid` 仅在选择态生效（`restore-machine.ts:82-89`）——宿主
   在 restoring 态把归档校验失败译成 `archive_invalid` 时状态机 no-op、写入口永久被挡；
   宿主契约需明确恢复期失败一律译 `restore_failed`。
10. 切板对已 settle 搜索结果的失效（`search/board-search-source.ts:109-110,151-169`）——板 id
    守卫只丢在途请求；宿主跨板复用同一 handle 时旧板命中继续显示且 loadMore 拼接新板第 1 页。
    当前三端宿主切板即重建句柄（`board-view.ts:689-697`），需确认该契约固化进 US-538 口径。
