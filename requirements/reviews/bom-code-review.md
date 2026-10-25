# BOM 分支代码评审报告

- **评审对象**：`claude/bom-related-work-77235b` 分支的 BOM 相关代码（分支 tip `0224b9c8`，对比基线 `main`，merge-base `23d8a098`）
- **评审日期**：2026-10-25
- **评审方式**：纯静态代码阅读（未运行测试/未做任何代码修改）

---

## 1. 评审范围与方法

### 1.1 范围

`git diff main...HEAD` 中全部 BOM 相关路径，共 **330 个文件、76,627 行差异**（相对 main 为纯新增，0 行删除）：

| 目录 | 内容 |
| --- | --- |
| `packages/rxdb-plugin-bom/src` | 核心插件：backend/（DDL 触发器）、quantity/（数量/成本/展开）、reach/（可达性）、resolve/（BOM 映射/解析/仓储）、testing/（测试夹具） |
| `packages/rxdb-plugin-bom-{angular,react,vue}` | 三框架绑定（useBomView / BomTree / BomLineEditor） |
| `apps/dev-rxdb-bom` + `apps/dev-rxdb-bom-e2e` | Angular demo 应用与 Playwright e2e |
| `apps/dev-rxdb-angular/src/app/pages/bom-view*` | 三框架 demo 共享的 BOM 视图页（含 React/Vue e2e 复用） |
| `modules/e2e-parity/bom-view-parity.mjs` | 跨框架一致性 e2e 模块 |
| `benchmarks/bom*.bench.ts` | BOM / BOM-reach 基准 |

### 1.2 方法

1. **10 个独立 finder 角度**并行扫描全部差异：
   - 正确性：A 逐行扫描、B 删除行为审计、C 跨文件调用追踪、D 语言陷阱（falsy-zero/浮点/RxJS/三框架响应式）、E 包装器/代理（缓存、后端适配器、DDL 包装）
   - 清理：F 复用、G 简化、H 效率、I 层次（根因 vs 打补丁）、J 规范符合性（CLAUDE.md / AGENTS.md 铁律）
2. **逐条独立验证**（一票制，CONFIRMED / PLAUSIBLE / REFUTED 三态），引用具体行号与调用链证据。
3. **追加查漏扫描**：以已确认清单为黑名单，专找第一轮遗漏的缺陷。
4. 按上限 **15 条**输出，**正确性问题优先于清理/效率/规范问题**（技能规则）。

### 1.3 统计

| 指标 | 数值 |
| --- | --- |
| 原始候选（10 角度） | 44 条 |
| 去重后候选 | 35 条 + 查漏 2 条 = 37 条 |
| 验证结果 | CONFIRMED 31 / PLAUSIBLE 6 / REFUTED 1 |
| 入报告 | 15 条（12 正确性 + 2 效率 + 1 规范） |
| 因上限截断的已确认发现 | 22 条（见第 6 节） |

---

## 2. 结论总览

| # | 级别 | 位置 | 标题 | 类别 | 判定 |
| --- | --- | --- | --- | --- | --- |
| 1 | P0 | `resolve/expansion.ts:166` | NaN 预算使截断失效，环状 BOM 可无限遍历 | correctness | CONFIRMED |
| 2 | P0 | `decimal-columns.ts:106` | equivQty 允许 0，替代件零当量静默蒸发主件需求 | correctness | CONFIRMED |
| 3 | P0 | `rxdb-plugin-bom-angular/src/use-bom-view.ts:94` | setInput 绕过 appliedInput 缓存，视图与声明输入永久分歧（三端同路径） | correctness | CONFIRMED |
| 4 | P0 | `plugin.ts:96` | pglite-electron 适配器被后端解析器拒绝，Electron 宿主无法安装 BOM 插件 | correctness | CONFIRMED |
| 5 | P1 | `view-state.ts:159` | calculate() 不等待在途保存，可能读到保存前的旧值 | correctness | CONFIRMED |
| 6 | P1 | `types.ts:221` | 远程 PG 守卫消息被误归一化为物料环错误（伪造 path） | correctness | CONFIRMED |
| 7 | P1 | `view-state.ts:235` | 爆炸失败被渲染为「空」状态，错误计算被标成无数据 | correctness | CONFIRMED |
| 8 | P1 | `quantity/cost.ts:1105` | 多工序混合工作中心时 overheadReason 只报最后一个工序 | correctness | CONFIRMED |
| 9 | P2 | `resolve/expansion.ts:515` | whereUsed 路径方向与文档契约相反（当前被掩盖） | correctness | PLAUSIBLE |
| 10 | P2 | `plugin.ts:506` | 方言来源不一致（config 字符串 vs 适配器实例名），宿主错配时安装中途失败 | correctness | PLAUSIBLE |
| 11 | P3 | `apps/dev-rxdb-bom/src/app/bom-workspace-state.ts:168` | guide 参数未做整数归一化，小数永不匹配任何步骤 | correctness | CONFIRMED |
| 12 | P3 | `modules/e2e-parity/bom-view-parity.mjs:473` | 期望值用 JS 浮点计算小数，与引擎精确十进制输出可能不一致 | correctness | PLAUSIBLE |
| 13 | — | `quantity/explosion.ts:510` | 每次爆炸展开执行 3 条无 WHERE 全表 SELECT | efficiency | CONFIRMED |
| 14 | — | `repository.ts:468` | 每次结果发射对整个视图快照做全量确定性序列化 | efficiency | CONFIRMED |
| 15 | — | `resolve/history-loader.ts:443` | 控制流嵌套 5 层，违反「嵌套 ≤ 3 层」铁律 | conventions | CONFIRMED |

---

## 3. 正确性问题

### 3.1（P0）NaN 预算使截断失效 → 无限遍历

- **位置**：`packages/rxdb-plugin-bom/src/resolve/expansion.ts:166`
- **问题**：`resolveBudgets` 是裸展开合并（`{ ...DEFAULT_EXPANSION_BUDGETS, ...budgets }`），对 NaN/Infinity/负数无任何校验；`checkBudgets`（:184-188）只用 `>` 比较，`> NaN` 恒为 false，截断永不触发。
- **触发场景**：demo 深度输入框是自由文本（`bom-view.ts:220` `Number(this.depth())`），输入非数字即产生 NaN 预算，经 `view.ts:53` 原样流入 `expandBom`。深度预算同时是判环兜底（expansion.ts:96 注释「与判环硬上限同阶」），环状 BOM + NaN 深度**不会终止**。同款未校验展开还存在于 `quantity/explosion.ts:994`。
- **修复方向**：在 `resolveBudgets` 内校验（仿 `instance.ts:79-80` 的 `Number.isSafeInteger` 模式），非法值抛 `BomInstanceError` 风格的错误。
- **判定**：CONFIRMED。

### 3.2（P0）equivQty 允许 0，需求静默蒸发

- **位置**：`packages/rxdb-plugin-bom/src/decimal-columns.ts:106`
- **问题**：`equivQty` 注册为 CANONICAL 域（允许 0），而同类除数/系数列（baseQty :62、uomConversion :79-84、costLotQty :86-91）均为 `positive`。写库侧 `assertDomain`（write-rules.ts:49-51）只对 positive 拒绝 `'0'`，DDL 触发器同样只对 positive 列装正数守卫（bom-trigger-ddl.ts:566-568），equivQty='0' 全链路放行。
- **触发场景**：优先级替代组中某成员 `equivQty='0'` → `allocatePriorityShares`（quantity/layer.ts:326-331）计算 `needed = remaining × 0 = 0 ≤ capacity` 恒成立，该成员以 gross=0 的份额**吞掉主件全部剩余需求且无任何报错**，违反模块自身不变量「不让需求静默蒸发」（layer.ts:311）、「不留 qty=0 的需求行占路径预算」（layer.ts:271）。验证时修正：:339 的除零分支对 equiv=0 不可达（需 needed > capacity），真实危害是静默蒸发。
- **修复方向**：将 `equivQty` 域改为 `positive`（替代件的当量应为正数），或在 layer.ts 分配前显式拒绝零当量成员。
- **判定**：CONFIRMED。

### 3.3（P0）setInput 绕过缓存 → 三端视图与输入永久分歧

- **位置**：`packages/rxdb-plugin-bom-angular/src/use-bom-view.ts:94`（React `use-bom-view.ts:48/68`、Vue `use-bom-view.ts:87/105` 同路径）
- **问题**：三个绑定都用内容指纹 + `appliedInput` 缓存去重（Angular :73-74 `if (key === appliedInput) return`），但 `commands.setInput` 直通控制器（`current().setInput(value)`）**不更新缓存**。
- **触发场景**：父级输入为 A（缓存='A'）→ 命令式 `setInput(B)` 使控制器显示 B，缓存仍为 'A' → 父级再发一个内容为 A 的新对象（撤销/重置）→ effect 比较 `key('A') === appliedInput('A')` 提前返回 → 视图永远显示 B，而其他所有消费者显示 A。静默、无错误。Vue 端更甚：watch 源本身是序列化指纹字符串，同内容新对象连 watch 都不触发。
- **修复方向**：`commands.setInput` 同步更新绑定的 `appliedInput` 缓存（Vue 需将 watch 源改为跟踪原始输入引用）。
- **判定**：CONFIRMED。

### 3.4（P0）pglite-electron 适配器被拒 → Electron 宿主无法安装插件

- **位置**：`packages/rxdb-plugin-bom/src/plugin.ts:96`
- **问题**：`resolveBomBackend` 只把字面名 `'pglite'` 路由到 PG 方言，SQLite 白名单（:64-71）精确匹配。仓库中真实存在的 Electron PGlite 适配器（`packages/rxdb-adapter-electron/src/pglite/pglite-adapter.interface.ts:20`，`ADAPTER_NAME = 'pglite-electron'`，存储就是普通 PGlite，capability-matrix 列为一级 Local 适配器）两个名单都不匹配 → :107 抛 `BomBackendCapabilityError`，**整个 connect 失败**。
- **系统性**：同款字面名分派还有 5 处——`plugin.ts:319`（sqliteDdlIsCurrent）、`resolve/bom-sql.ts:35`、`reach/reach-sql.ts:13-19`、`resolve/ext-attr.ts:446`、`resolve/integration.ts:660`，修复须覆盖全部。
- **修复方向**：方言分派改为按「存储引擎类型」判断（如 name 前缀 `pglite*` 归入 PG 方言），或引入适配器能力标志。
- **判定**：CONFIRMED。

### 3.5（P1）calculate() 不等待在途保存 → 读到旧值

- **位置**：`packages/rxdb-plugin-bom/src/view-state.ts:159`
- **问题**：`loadOccurrence`（:133-134）明确 `await this.#saves` 并注释「保存未落库时先等它：否则读到保存前的旧值」；`calculate()`（:159-162）却直接 `readBomViewSnapshot`，不等待 `#saves` 链。
- **触发场景**：用户点保存后立刻点计算（demo 两按钮无互斥，`bom-view.ts:295`）。保存路径先有多次读取前导、再入队写入，而适配器事务经并发度为 1 的队列串行（RxDBAdapterSqliteBase.ts:1084 / PGlite :167），计算读取可插在写入前执行——返回**用旧用量算出的成功结果**，与刚保存的值矛盾。
- **修复方向**：`calculate()` 入口同样 `await this.#saves`。
- **判定**：CONFIRMED。

### 3.6（P1）远程 PG 守卫消息被误判为物料环

- **位置**：`packages/rxdb-plugin-bom/src/types.ts:221`
- **问题**：`normalizeBomError` 只特判 `depth_limit`（:218-222），其余 `rxdb:bom_cycle:` 前缀消息一律按「真环路径」处理：`payload.split('>')` 拼 path。而远程 PG 的两个守卫抛的是机器配置类消息——`reach/cycle-ddl.ts:60` 的 `rxdb:bom_cycle:isolation:%`（事务隔离级别）与 `reach/remote.ts:24` 的 `rxdb:bom_cycle:existing_graph`——均不含 `>`，被伪造为单元素 path。
- **触发场景**：远程 PG 部署事务隔离配置错误时，错误被归一化为 `BOM_CYCLE` + `{path:['isolation:repeatable read']}`。消费方全线误判：`bomErrorText`（view-fields.ts:5-9）把 payload 原样渲染给三端用户、`attachUnionOnlyMark`（repository.ts:294）按环错误标记、`integration.ts:601-606` 输出「环违约」诊断——机器配置问题被当作物料环排查。现有测试只断言原始 P0001 消息，未覆盖归一化形态。
- **修复方向**：`normalizeBomError` 对 `isolation:` / `existing_graph` 前缀特判为配置类错误（独立错误码），不伪造环路径。
- **判定**：CONFIRMED。

### 3.7（P1）爆炸失败被渲染为「空」

- **位置**：`packages/rxdb-plugin-bom/src/view-state.ts:235`
- **问题**：`#accept` 的空判定（:230-235）中 `snapshot.explosion?.truncated == null` 在 explosion 为 null 时为真（`undefined == null` 宽松相等），于是「根级爆炸失败（quantityError 已置、explosion 为 null）+ 仅根节点」的快照被判为 `phase: 'empty'`。
- **触发场景**：仅含根节点且根级数量计算抛错（如 plannedQty 缺 uom 换算，`explosion.ts:1020` convertUom 抛 BomQuantityError）→ 根节点被隐藏，三端树渲染「没有可见 BOM 节点」，同时旁边显示数量错误提示——错误计算被标成无数据，依赖 `phase === 'empty'` 的消费者全部误判。现有测试只覆盖真·空快照（bom-view.spec.ts:446-458），无此组合。
- **修复方向**：空判定增加 `snapshot.quantityError === null` 条件（或把该组合映射到独立 phase）。
- **判定**：CONFIRMED。

### 3.8（P1）overheadReason 只报最后一个工序

- **位置**：`packages/rxdb-plugin-bom/src/quantity/cost.ts:1105`
- **问题**：`buildLayerDetail` 中 `overheadReason` 在工序循环（:1083）内**无条件每轮重赋值**，而 `overhead`/`overheadAmount` 跨轮累加（:1106），两者一起返回（:1110）。
- **触发场景**：路由含两个工序，op1 的工作中心声明了制费率、op2 未声明 → 输出 `overhead: '12.5'` 配 `overheadReason: '工作中心未声明制费'`——成本树声称未收制费却收了制费。无守卫（对比 :1015 的默认值检查模式），类型与 spec 均未声明 last-op-wins 语义。
- **修复方向**：仅当当前 reason 仍为默认值时写入（保留首个非默认 reason），或按金额占比合成。
- **判定**：CONFIRMED。

### 3.9（P2）whereUsed 路径方向与文档契约相反

- **位置**：`packages/rxdb-plugin-bom/src/resolve/expansion.ts:515`
- **问题**：`ExpansionNode.path` 契约（:62）为「根→本节点」，下钻（:471 追加）遵守；`whereUsed` 却是前插（`path: [usage.occurrenceId, ...parentPath]`）即「节点→根」，且 :489 注释「路径前插，保持根→节点序」描述的恰是相反效果。
- **现状**：现有消费者恰好依赖反向序（`where-used-tree.ts:27` 用 `slice(1)`，ecn-panel 原样拼接），spec 也固化了反向序（bom-expansion.spec.ts:296），所以今天不炸——但任何按文档契约写的新消费者（如仿 `view-projection.ts:93` 的 `slice(0,-1)` 取父）都会得到倒置嵌套。验证时修正：ECN 路径本身是根→节点（ecn.ts:241/259），不在本问题内。
- **修复方向**：统一为文档方向并同步修正 where-used-tree 与相关 spec（或改文档）；二者必改其一。
- **判定**：PLAUSIBLE（机制真实，触发依赖未来消费者）。

### 3.10（P2）方言来源不一致（config vs 实例）

- **位置**：`packages/rxdb-plugin-bom/src/plugin.ts:506`
- **问题**：实体 DDL 方言取自配置字符串（:486-487），reach DDL（:506）与安装跳过指纹（:510）取自**活体适配器实例名**（`adapter.name`），两个来源核心 connect() 从不校验一致性；`reach/system.ts:7-11` 的迁移读的又是配置字符串。
- **触发场景**：宿主把 PGlite 实例错注册到 `sqlite` 槽位（核心 `RxDB.adapter()` 只存 Map、`AdapterFactory` 名字无类型约束、`assertLocalAdapterCapabilities` 只查 bootstrap 成员）→ 混合方言 DDL 在一个 bootstrapTransaction 里执行，安装中途失败而非前置拒绝。当前 monorepo 无应用错配，属纵深防御缺口。
- **修复方向**：安装时比对 `adapter.name` 与配置名，不一致即抛 `BomBackendCapabilityError`。
- **判定**：PLAUSIBLE（仅错配触发）。

### 3.11（P3）guide 参数未整数归一化

- **位置**：`apps/dev-rxdb-bom/src/app/bom-workspace-state.ts:168`
- **问题**：`Math.max(0, Math.min(3, Number(params['guide']) || 0))` 有钳制但无 `Math.trunc/round`，`?guide=1.5` 原样通过。
- **触发场景**：分享链接带小数 guide → 旅程面板显示（`guideStep() > 0`）但 `=== step.number` 永不命中任何步骤，且小数值经 :99 回写 URL。应用自身只写整数，严重度低。
- **修复方向**：解析时 `Math.trunc`。
- **判定**：CONFIRMED。

### 3.12（P3）parity e2e 用浮点算期望小数

- **位置**：`modules/e2e-parity/bom-view-parity.mjs:473`
- **问题**：期望值 `${Number(event.target.value) * base} pcs`（:462 取 fixture 的十进制字符串转 JS number；:498 同样）用浮点乘法，引擎侧是纯 BigInt 十进制内核（decimal.ts「全程不经 JS number」）并原样渲染规范字符串。
- **触发场景**：fixture 数量全为 '1'、planned ∈ {1,2} 时恰好全整数掩盖；一旦出现非二进小数（如 '0.1'）或 planned 扩展为 3，期望值变 `0.30000000000000004 pcs`，引擎正确输出 `0.3 pcs`，三端 parity 测试**引擎没错却假失败**。
- **修复方向**：期望值用内核十进制乘（引入测试侧 decimal 辅助），不经过 JS number。
- **判定**：PLAUSIBLE（当前被掩盖）。

---

## 4. 效率问题

### 4.1 每次爆炸展开执行 3 条全表 SELECT

- **位置**：`packages/rxdb-plugin-bom/src/quantity/explosion.ts:510`
- **问题**：`loadRoutingData` 对 `routing_operation`（:511）、`routing`（:525）、`bom_line_operation_split`（:535）执行无 WHERE 的全表 SELECT，且每次 `explodeBom`（:1007）都调用，无跨调用缓存。
- **影响**：每次活视图刷新（view.ts:57 逢实体变更即刷新）与每次 demo 爆炸都把**整个组织的路由与分摊表**物化成 JS Map，即使目标 BOM 只触及一条路由。
- **修复方向**：按层收集 routingIds/occurrenceIds 后做批量 IN 查询（该模式已在行数据加载中使用）。
- **判定**：CONFIRMED。

### 4.2 每次发射对整个视图快照做全量序列化

- **位置**：`packages/rxdb-plugin-bom/src/repository.ts:468`
- **问题**：`getFingerprint` 对完整 `BomViewSnapshot`（全部展开节点、爆炸需求行、items）做 `deterministicStringify`，仅用于变更检测；`QueryTask.ts:386` **无条件**计算（在 autoCache 分支之前），且每轮刷新发射两次快照。
- **影响**：预算允许约 100k 节点（`DEFAULT_EXPANSION_BUDGETS`），每次实体变更同步全树序列化，无大小守卫/抽样/校验和捷径。
- **修复方向**：改用廉价指纹（节点/行计数 + 稳定键校验和）或复用读事务版本号。
- **判定**：CONFIRMED。

---

## 5. 规范问题

### 5.1 控制流嵌套 5 层，违反「嵌套 ≤ 3 层」

- **位置**：`packages/rxdb-plugin-bom/src/resolve/history-loader.ts:443`
- **规则**：CLAUDE.md「关键约束（不可违反）」『嵌套 ≤ 3 层』；AGENTS.md 铁律『<3层缩进，单一职责』、禁止『嵌套>3层』。
- **违反点**：`for headerInput`（:352）→ `if (headerInput.routing)`（:411）→ `for allocation`（:435）→ `for splitInput`（:443）→ `if (splitInput.id)`（:445），达 5 层（事务回调属函数调用层，不计入）。这是整个 BOM diff 中**唯一**超过 3 层的控制流。
- **修复方向**：把 splits 处理提取为独立函数。
- **判定**：CONFIRMED。

---

## 6. 已确认但超出 15 条上限的发现（22 条）

以下全部经独立验证（19 CONFIRMED + 3 PLAUSIBLE），仅因「正确性优先、上限 15 条」未入正报告，按类别列出供后续消化：

### 6.1 复用（reuse）

| 位置 | 内容 | 判定 |
| --- | --- | --- |
| `rxdb-plugin-bom-angular/src/use-bom-view.ts:45` | 整个 BOM 视图生命周期（inputIdentity 逐字相同、release/install/sync 状态机、命令委托、错误文案）三端近乎逐字重复，核心包无共享控制器（BomViewController 未导出） | CONFIRMED |
| `rxdb-plugin-bom-angular/src/bom-tree.ts:164` | WAI-ARIA 键盘导航状态机（8 键映射、钳制、`JSON.stringify(path.slice(0,-1))` 父键）三端逐字重复，仅焦点机制不同；Vue moveRight 已出现细微分歧（用 depth 比较替代 expanded 守卫） | CONFIRMED |
| `rxdb-plugin-bom-angular/src/bom-line-editor.ts:12` | 可编辑字段列表字节级相同 + 保存/重置/错误合并状态机三端重复；核心 view-fields.ts 只提供了 bomEditorFields/parseBomEditorFields | CONFIRMED |
| `apps/dev-rxdb-bom/src/app/presentation/decimal-format.ts:8` | formatDecimal 手写 BigInt half-even 舍入，逐字重复核心 decimal.ts 的平局规则（`% 2n !== 0n` ≡ `kept & 1n`）；核心无「舍入到 N 位小数」入口（roundToSignificant 按有效位、ceil 只上取），且它是全仓库唯一显示舍入点（三端绑定渲染原始规范字符串） | CONFIRMED |
| `apps/dev-rxdb-bom/src/app/presentation/requirement-tree.ts:17` | 需求树与反查树（where-used-tree.ts:11）独立实现同一「路径→JSON 键索引 + 重复检测 + 父路径挂载」算法，仅 slice 方向与载荷不同 | CONFIRMED |
| `benchmarks/bom.bench.ts:81` | 两个 benchmark 各自手写同一 PGlite 内存启动（实体列表、BomRepository 接线、connect），仅名称前缀与 legacy 标志不同 | CONFIRMED |
| `apps/dev-rxdb-bom/src/app/bom-demo.service.ts:134` | 手写 200 条一批的 `or`-of-`=` 分块；适配器已导出 `chunkBySqliteBindLimit`（999 上限）却硬编码 200，且与适配器上限漂移 | PLAUSIBLE |
| `benchmarks/bom-reach.bench.ts:147` | diamonds() 重建了 tests-reach/graph-test-utils.ts 的 reachDiamonds(20)（同 3n+1 项/4n 边拓扑）；直接 import 受包边界阻断，需提升到 src/testing 共享 | PLAUSIBLE |

### 6.2 简化（simplification）

| 位置 | 内容 | 判定 |
| --- | --- | --- |
| `resolve/bom-map.ts:58` | scopedAdapter 包装（事务重绑定到执行器）在 bom-map.ts:58、view.ts:15、integration.ts:174、ecn.ts:354 独立定义四份，且均丢失了 `transactionLog` 参数转发 | CONFIRMED |
| `resolve/bom-sql.ts:102` | 5 行 bind/placeholder 闭包在 7 个 SQL 构建函数中字符级复制（:102/155/183/209/249/355/426） | CONFIRMED |
| `repository.ts:181` | validateExtOf 对同一值调用 normalizeExtValue 两次（先 parse 丢弃、再对解析结果重序列化），依赖未言明的幂等性；路径为 src/repository.ts（非 resolve/ 下） | CONFIRMED |
| `resolve/history-loader.ts:225` | id/createdAt/updatedAt 确定性种子赋值块复制 8 次（:225/298/309/319/338/354/373/500），仅类型断言不同 | CONFIRMED |
| `resolve/integration.ts:93` | 列索引→记录映射（Object.fromEntries）逐字重复 **5 处**（repository.ts:80、ecn.ts:44、integration.ts:95、coproduct.ts:69、ext-attr.ts:458） | CONFIRMED |
| `apps/dev-rxdb-bom/src/app/bom-demo.service.ts:1227` | rawQuery 结果形态三元在 5 个方法内联（:276/698/1146/1227/1237），旁边已有私有 `#rows` 助手且 :276 变体还多出 Array.isArray + ?? [] 差异 | CONFIRMED |
| `apps/dev-rxdb-bom/src/app/components/cost-panel.ts:453` | costResult/resultKey 是 workspace.cost 的可派生镜像可写信号；当前仅一个写入方（漂移为未来风险），且 clearResult 不清 resultKey（当前被 stale 门掩盖） | PLAUSIBLE |

### 6.3 效率（efficiency）

| 位置 | 内容 | 判定 |
| --- | --- | --- |
| `quantity/cost.ts:1115` | 成本树每个节点计算两遍：buildDetail 先跑 buildLayerDetail（全行/工序循环），unitCostOf 再触发 batchCostOf 对同一层重取重算（batchCost 明确不缓存），结构性约 2x SQL 与十进制运算 | CONFIRMED |
| `quantity/cost.ts:898` | batchCostOf/buildLayerDetail 每行调 resolveChildHeader/fetchItemCost 均无运行内缓存（同一子件修订出现 N 行 = N 次相同 SQL ×2 遍）；explosion.ts:558 已有 childHeaders Map 模式可抄 | CONFIRMED |
| `quantity/cost.ts:495` | operationCostOf/overheadOf 每工序查询工作中心级数据（3 条原始 SQL），无记忆化；种子数据所有工序同工作中心 → 3k 次重复查询/层/遍 | CONFIRMED |
| `view-projection.ts:80` | projectViewNodes 每节点两次 JSON.stringify 路径（自身 + slice 父路径），每次 toggle 与每次快照刷新全量重投影；100k 节点预算下约 20 万次序列化 | CONFIRMED |
| `apps/dev-rxdb-angular/src/app/pages/bom-view.ts:215` | 日期/数量/深度输入 `(input)` 事件直连信号、无防抖，每击键产生新 BomViewInput → setInput → 完整视图重读（两次 SQL 遍历）+ 指纹序列化 | CONFIRMED |

### 6.4 层次（altitude）

| 位置 | 内容 | 判定 |
| --- | --- | --- |
| `modules/e2e-parity/bom-view-parity.mjs:522` | 首屏预算 1500→3600ms（实测 1307-2707ms）是治标：`__bomFirstDataAt` 由 init 脚本 MutationObserver 从页面加载起计时，混入 DB 连接/wasm/种子时间；beforeEach 已在等「BOM 数据已就绪」+ phase success，从该时刻起计即可回归紧预算（输入 p95 100ms 门保持正确） | CONFIRMED |

### 6.5 规范（conventions）

| 位置 | 内容 | 判定 |
| --- | --- | --- |
| 新包 5 处公开导出缺 TSDoc | `repository.ts:325` BomRepository、`plugin.ts:342` RxDBPluginBom、`plugin.ts:528` rxDBPluginBom、`config-condition.ts:74` positionText、`types.ts:191` BOM_CYCLE_PREFIX（其判环注释错挂在 BOM_EFFECTIVITY_OVERLAP_PREFIX 上方），违反「新包/新导出必须补齐 TSDoc」；规则未机械强制（无 eslint tsdoc 插件） | CONFIRMED |

---

## 7. 被推翻的候选

| 候选 | 结论 |
| --- | --- |
| `resolve/bom-map.ts:287` saveMapping 校验与写入不在同一事务，存在 check-then-act 竞态，可持久化引用已删行的映射 | **REFUTED**：bom_map 表实际有外键——`entities.ts:956-969` 的 sourceLine/targetLine MANY_TO_ONE 关系生成 REFERENCES，SQLite 连接开启 `PRAGMA foreign_keys=ON`（sqlite-client.utils.ts:160），PGlite 生成 `ADD CONSTRAINT ... FOREIGN KEY`（create_table_sql.ts:253/259）。并发删除先提交时插入以 FK 违约失败，而非静默持久化。残余观察：FK 不覆盖的不变量（如成员性/路径邻接经发生项删除破坏）仍存在理论窗口，但非原失败场景。 |

---

## 8. 通过核验的方面

1. **删除行为审计（Pass B）零发现**：相对 main 是纯新增（330 文件、0 删除行）；对分支内部 42 个提交的全部删除行（核心 src 5,463 行 + 绑定/demo 3,533 行 + spec/e2e 1,579 行）逐一核验，所有守卫均有重建——成本/爆炸/公式/单位/层分配/映射/仓储写校验/DDL 触发器/视图生命周期/三端卸载清理，删除的 6 个 `it()` 全部以更名或参数化形式保留。两处有意的移除均有文档背书（1-D 日期排他被 3-D 单位-批次重叠守卫严格覆盖；位号 released 协议按 US-515 放宽且已测）。
2. **三框架对称性通过**：三个绑定 index 面相同（类型 + 组件 + 6 命令同语义），parity e2e 被三个 demo e2e 共同消费，无单端缺失。
3. **静态质量门通过**：5 个包 ESLint 零警告；TS strict 继承；非测试代码无 `any`/`@ts-ignore`；无违规兜底（两处 salvage 路径均文档化且错误仍上抛）。
4. **后端方言分层合理**：SQLite/PG 触发器重复为固有方言分裂，共享参数化谓词构建器（Pass I 明确未标）；decimal-columns 单一真源、`resolveBomBackend` 集中分派且 fail-fast 均获正面评价。

---

## 9. 附注

- 全部结论为**静态代码阅读验证**（引用具体行号与调用链），未运行测试或运行时复现；PLAUSIBLE 类结论建议按文中「可确认方式」补验证。
- 修复优先级建议：先 3.1-3.4（P0，涉及数据正确性与可用性），再 3.5-3.8（P1），第 6 节按「三端共享化（6.1 前三条）→ 效率热点（6.3）→ 其余」顺序消化。
