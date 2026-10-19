# BOM 分支深度评审记录

- **评审对象**：`claude/bom-related-work-77235b`（相对 main 527 文件 / +104k 行）
- **评审头**：`17a0ef5f`（评审时 PR #129 的 head；记录落分支时 origin 已前移到 `ad55d2dd`，带入的仅为文档改动——AGENTS.md / CONTRIBUTING.md / domain-research，评审涉及的代码文件全部未动，结论直接适用）
- **评审方式**：主会话精读（入口 / 实体 / golden / 十进制内核）+ 5 个并行评审 agent 分领域深挖：核心 resolve/quantity 引擎、存储层 DDL 与核心包/适配器改动、三框架绑定对称性、demo/e2e/parity、spec/基准/账实一致性。关键发现经主会话二次读码或实证复核
- **验证**：PR #129 CI 在 `17a0ef5f` 全绿（12 lane e2e / coverage / gate / CodeQL）；本地三框架绑定测试因 worktree node_modules 缺 pnpm 标记文件（nx 拒绝建项目图）未跑，非代码问题
- **状态约定**：按 [README.md](./README.md)，整分支评审不占 RV 编号，修复一条删一条，剩几条就是几条

## 总评

工程质量显著高于一般同规模分支：十进制全程 BigInt 定点（half-even 舍入、除法补位、ceil 语义经主会话逐行推演正确）、写入协议 / 判环 / 三维有效域由存储层触发器兜底且两后端语义对齐、golden 值全部手写且经手算复核一致（50/49 的 34 位值、D 层成本 39.1204…、红蓝配置 +3/+2）、spec 账实相符（256/256 任务、19 故事 288 条 AC 无虚假验收）。**未发现数据损坏级问题**——最坏情况是拒绝 / 挂起 / 启动失败，方向都安全。但存在 4 个 P0（1 个数量正确性错误、1 个升级死锁、1 个可实证的写入挂起、1 个共享工具回归）和一批「改断言 / 改阈值而非修实现」的收口痕迹。

---

## P0（4 条）

### P0-1 priority 替代组分流数量错误 + 需求静默蒸发

- **证据**：`packages/rxdb-plugin-bom/src/quantity/layer.ts:202-227`。文件头合同（:166）写明 `SubstituteShare.gross`「equiv_qty 已乘」、proportional 分支（:188-200）确实乘了 equiv；priority 分支充足时推 `gross: remaining`（主件单位，未乘 equiv），不足时推 `gross: taken`（`availability ÷ equiv`，同样主件单位）——emit 端（`quantity/explosion.ts:801-809`、`quantity/cost.ts:589`）不做任何补救换算。
- **推演**：主件毛需求 100 kg、替补 equiv=2 时，正确应发 200 件替代件需求，实际发 100 件；allowMix 下替补全部耗尽后 `remaining > 0` 无人接管（primary 按 AC#2 语义恒为 0），剩余需求静默丢弃、不报错。附带：:214 抛裸 `Error`（非 BomQuantityError）。现有 AC#2 测试胜者 equiv=1，测不出。
- **修复方向**：充足分支推 `needed`（= remaining × equiv）、不足分支推 `availability`（= taken × equiv）；循环尾 `remaining > 0` 抛错或明示短缺；错误换 BomQuantityError。

### P0-2 ext-storage 迁移在「同版本引入 BOM 实体 + 热字段」场景构成永久启动死锁

- **证据**：`packages/rxdb-plugin-bom/src/ext-storage.ts:202-203`（auditTable 的 SELECT）、`:171-174`（installDeclarations 的 ALTER TABLE）；core 引导顺序 `packages/rxdb/src/RxDB.ts:1101-1105`（先 runMigrations、后 #ensureEntityTables 补建缺失表）。
- **推演**：v1 应用（无 BOM）→ v2 同时加 `entities: [...BOM_ENTITIES]` + `entityStorage: createBomExtStorage(...)` + 对应迁移 → `up()` 第一步 SELECT bom 表时表尚不存在 → connect 失败 → 迁移水位未推进 → 每次启动重跑再失败，**该库永久无法启动**，除非分两个版本发布。现有 `bom-ext-storage.spec.ts:133` 的「旧持久库」用例先以无声明配置开过库（表已存在），恰好绕过。
- **修复方向**：`up()` 开头查表存在性，缺失时跳过审计与 DDL（建表路径自带生成列）；补双后端「同版本首轮引入」用例。

### P0-3 CTE 版判环触发器的路径枚举指数爆炸（已实证）

- **证据**：`packages/rxdb-plugin-bom/src/backend/bom-trigger-ddl.ts:188-209`（SQLite）、`:1641-1656`（PGlite 同构）。递归项 `UNION ALL` + 无 (item, path) 去重 + 每条 occurrence 一条边（重复物料对产生平行边）→ 路径数随层数指数增长。**sqlite3 实证：24 层菱形链（约 50 行数据）单次插入枚举 33,554,431 行、耗时 41.8 秒**。文件注释 :186-187 自己承认会指数爆炸。
- **现状**：被 reach 闭包版遮蔽——`hasCompleteBomGraph` 时每次 connect 在 backend DDL 之后重装 reach 触发器（`plugin.ts:263-266`），且部分配置下 SQLite `CREATE TRIGGER` 即报 no such table（实证）导致 connect 失败，CTE 版实际存活窗口小。但它是导出路径：安装顺序契约一旦被破坏（PGlite DO 块行为变化、未来支持部分配置），任何一次 consume 写入挂起数据库。
- **修复方向**：删 CTE 版判环、统一走闭包版；或至少给递归项按 (item_id, path) 去重并对边集去重。

### P0-4 `.claude/launch.json` 被整体替换（共享工具回归）

- **证据**：`.claude/launch.json` 相对 main 的 diff：原有 7 条配置（dev-rxdb-angular/react/vue 的 serve、website-docs、两个 e2e 静态服务器、angular-attach）被删除，只剩 dev-rxdb-bom 与 bom-demo-static 两条。影响所有非 BOM 会话的浏览器预览入口，与 BOM 工作无关。
- **修复方向**：恢复 main 版本并**追加** BOM 两条配置。

---

## P1（17 条）

### 核心引擎

- **P1-1 备选头（alternativeNo）三引擎语义互相矛盾**：`resolve/expansion.ts:290-364`（expandBom 忽略 alternativeNo，多备选静默合并全部发生项且不标 unresolved）、`quantity/explosion.ts:370-385`（子级多备选时即使已指定也抛「需要裁决」，根级 :455-464 却正确处理）、`resolve/resolver.ts:120-134`（指定不存在的编号静默返回空 occurrences）。同一合法数据（US-508 AC#11）在树显示 / 数量列 / 解析三处给出三种结论。统一裁决口径：三处都尊重 context.alternativeNo、零匹配显式抛 BomResolutionError、未指定且多备选标 unresolved。
- **P1-2 十进制指数展开无上限（DoS）**：`decimal.utils.ts:76-85`——`normalizeDecimalString('1e1000000000')`（12 字符）→ `'0'.repeat(1e9)` → RangeError / 约 500MB 分配（非 BomDecimalFormatError）；有效数字检查（:117）在展开之后。importBomDraft 接受外部载荷可达。入口限制 |exponent| 上限（如 ≤ 100）统一抛 BomDecimalFormatError。
- **P1-3 二次换算复用行级率（计划量被除两次）**：`quantity/explosion.ts:642`——第 6 步 occ→stock 用含 lineRate 的 rates 除一次是对的；第 7 步 phantom 穿透把**同一个 rates 对象**传给 convertUom，lineRate 优先 → 行 UoM m、库存 kg、lineRate=2、itemRate=0.5 时净需求 10 m → 5 kg ✓ → childPlanned = 5÷2 = 2.5 pcs，正确应为 5÷0.5 = 10 pcs。`quantity/cost.ts:632/643/853/869` 同病且方向还反。第二跳只允许物料级率（`{ itemRate }`）。
- **P1-4 bom-map 消费截断结构**：`resolve/bom-map.ts:532-545`（confirmMapping 不检查 truncated/unresolved）、`:317-401` / `:586-600`（coverage/gaps 只查 truncated）——预算触顶时把截断展开当完整基线持久化 → 后续报虚假缺口；与 :550 自身注释「unresolved / truncated 标无法判定」矛盾。三处统一走 assertCompleteResolution 口径。
- **P1-5 formulaGrammarVersion 惰性列**：`entities.ts:325`、`quantity/explosion.ts:298`——写入期（repository / import / history-loader）零断言、求值期无条件按当前语法。导入通道写 `grammarVersion='9'` 照常求值；语法升 v2 后旧公式按新语法求值，违背 formula.ts 头注。对照 CONDITION_GRAMMAR_VERSION 双侧断言（repository.ts:93 + config-validate.ts:185）。写入期断言 `=== FORMULA_GRAMMAR_VERSION`。
- **P1-6 ECN 影响面 / 差异硬编码 ebom/org-x 作用域**：`resolve/ecn.ts:127`（ecnImpact context）、`:195`（ecnDiff base）——多组织 / 多类型数据静默错结果（org-y MBOM 的 ECN 被按 org-x EBOM 反查，误报顶层整机或空 diff），测试只覆盖 org-x。API 增加 bomType/orgId 入参或按成员头作用域分组。
- **P1-7 unionOnly 标记口径与判环触发器不一致**：`resolve/cycle-analysis.ts:56-61`（readEdgeIntervals 只按物料对 JOIN，跨全部 org/type/备选）、`:97-99`（attempted 仅在 stored 为空时并入）——真环可能被误标 unionOnly（低估严重性）。错误路径携带 (bomType, orgId) 或按作用域拆分区间；闭合边并集恒含 attempted。
- **P1-8 import 裸异常逃逸**：`resolve/import-contract.ts:132-139`（lotCodes 非数组 → TypeError、坏 JSON → SyntaxError、非法日期 → RangeError）、`resolve/integration.ts:341-349` 无 try/catch——违反模块自述「诊断按自然键点名」。附带 V8 行为：epoch 数字 0 经 `new Date("0")` 静默解析为 2000-01-01。naturalKeyFor / decode 包 try/catch 统一转 BomImportContractError。

### 存储层与核心包

- **P1-9 BOM 仓储适配器轴注册不随插件下发，接线遗漏延迟到首次读写才炸**：`plugin.ts:111` 只注册门面；app 用 `use(rxDBPluginBom)` 但没给适配器 options 传 `repositories: { BomRepository }` → 连接 / 建表 / 装触发器全部成功，第一次 `getRepository(BomItem).find()` 才抛 `Unsupported repository type`。插件 install 期主动校验适配器轴已注册，fail-fast。
- **P1-10 SQLite 触发器升级不替换**：`bom-trigger-ddl.ts:71-79`（sqliteTrigger 只用 IF NOT EXISTS；全文件仅 4 处 DROP+CREATE；PG 侧全部 CREATE OR REPLACE）——发布后升级插件，旧触发器体静默保留、新旧语义并存。SQLite 统一改 DROP+CREATE。

### 三框架绑定

- **P1-11 `useBomView` 同名同签名 API 语义三端不同**：React 端自动以内容 identity 跟踪 input/db 并重建 handle（`packages/rxdb-plugin-bom-react/src/use-bom-view.ts:49-64`）；Angular / Vue 端只读一次、须手动 `commands.setInput`（`packages/rxdb-plugin-bom-angular/src/use-bom-view.ts:24-42`、`packages/rxdb-plugin-bom-vue/src/use-bom-view.ts:19-39`）。从 React 迁移心智的消费者静默展示旧数据。收敛方向（推荐对齐 search 先例）：Angular 收 `input: BomViewInput | Signal<BomViewInput>`、Vue 收 `MaybeRefOrGetter<BomViewInput>`，内部自动 setInput。
- **P1-12 Vue BomTree 键盘可达性依赖哨兵巧合**：`packages/rxdb-plugin-bom-vue/src/BomTree.vue:8,136`——`focused = ref('[]')` 恰好等于根节点 key（core `view-projection.ts:3` 的 `JSON.stringify(path)`）；无根节点的视图（如 where-used）全树 tabindex -1，键盘进不去；Angular / React 有 `!hasFocused && index === 0` 兜底。哨兵改 `null` + 与另两端对齐的兜底。
- **P1-13 Vue 两个 SFC 无 TSDoc**：`BomTree.vue`、`BomLineEditor.vue` 的 `<script setup>` 顶部无组件级文档，违反「新包/新导出必须补齐 TSDoc」铁律；三端 index.ts 也缺 `@packageDocumentation`。

### demo / e2e / parity

- **P1-14 parity 性能阈值放宽 2.5~2.7 倍**：`modules/e2e-parity/bom-view-parity.mjs:518-520`（firstDataMs 1500→4000、p95 100→250，提交 a2709cfe）——CI 实测 2128ms 超限后放宽，今后 2~3.5 秒级真实退化永远绿灯。只放宽到能解释观察值的量级（如 firstDataMs<2500），或 firstDataMs 降级为纯记录、保留 p95<250 硬断言。
- **P1-15 e2e 断言放水 `toBeVisible → toBeAttached`**：`apps/dev-rxdb-bom-e2e/src/bom-demo.spec.ts:447,456`（提交 7d8072ea）——`<details>` 折叠态下 code 仍 attached，面板从未展开也能过。修实现 / 等待条件（openDetails 对 `open` 属性 retry）而非修断言。
- **P1-16 bom-demo.service.ts 上帝服务 + 「catch → return String(error)」反模式**：`apps/dev-rxdb-bom/src/app/bom-demo.service.ts`（1161 行，约 40 个公开方法跨七个领域；`deleteDemoInstanceSource` / `publishDemoHeader` / `rawCycleInsert` 等 10+ 处吞错转字符串）——意外错误与预期校验错误混为一谈，ecn-panel.ts:94 已靠字符串前缀猜成功，与「无 fallback」铁律精神相悖。返回 `{ ok } | { ok: false; error }` 判别联合。
- **P1-17 并行会话 e2e 未入账**：`bom-product-workflow.spec.ts`（6 条）+ `bom-redesign.spec.ts`（4 条）全仓 specs/ 与 requirements/ 零命中；demo e2e 目标实跑 34 条，各切片反复引用的「24/24」「原 23 条」只统计前两者。补记任务账并校准口径。

---

## P2（30 条，按域合并）

### 核心引擎

- **P2-1 decimalDiv 两个已复现的舍入缺陷**（`quantity/decimal.ts:124-135`）：① 余数符号象限 bug——`absRemainder = negative ? -remainder : remainder` 假定余数跟随商负标志，实际跟随被除数：`2/-3`、`-2/-3` 两象限 half-even 退化为向零截断（node 复现；当前内部路径不可达，但属公开导出 API 合同违约）；② 双重舍入——35 位商先按余数上浮再 34 位收敛，可差 1 ulp（`a = 41×10^32 + 6`、`b = 41` 复现）。
- **P2-2 cost 错误类型逃逸**：`quantity/cost.ts:492,715`（裸 Error / BomQuantityError 原样透出），替代组错误 :551-579 却做了 BomCostError 包装——`instanceof BomCostError` 判卷算失败的消费方漏判。
- **P2-3 coproduct 过滤口径漂移**：`coproduct.ts:81-92` 缺 unit/lot/selectionCondition 三维过滤，展开侧 produce 行却经 filterResolutionRows 过滤——序列门控的 produce 行会让份额校验与产出行口径不一致。
- **P2-4 bom-map 基线收集系列**（`resolve/bom-map.ts`）：M5 行级分支收整棵树 + revisionId 被 null 覆盖（改版漏报、兄弟分支假缺口，:448-463）；M6 rootLineSteps 无 unit/lot/条件过滤（:487-496）；M7 ecnDiff 不检查 manifest.unresolved（`resolve/ecn.ts:198-241`）；M8 saveMapping 用 `new BomMap()` 直存绕过多实例构造门面（:237-248）。
- **P2-5 裸字符串内插 SQL**：`quantity/cost.ts:176,223,274,290` + `resolve/bom-map.ts` / `resolve/ecn.ts` 十余处（UUID/日期直拼）——同文件其它 SQL 均走占位符绑定，防御纵深不一致。
- **P2-6 公式括号深度无上限**：`quantity/formula.ts` 递归下降解析——超深嵌套在爆炸期抛 RangeError 而非 BomQuantityError；qtyFormula 写入期零校验（见 P1-5）。
- **P2-7 配置歧义原因误报**：`resolve/config-validate.ts:295-297`——配置条件并存（非 unit/lot 问题）时 reason 兜底 'lot'，用户按提示指定也无济于事。
- **P2-8 decimal.spec 偏薄**：手写十进制内核仅 14 例（`__tests__/quantity/decimal.spec.ts`），无性质测试对拍参考实现。

### 存储层与核心包

- **P2-9 canonicalGlob 两后端不一致（已实证）**：`bom-trigger-ddl.ts:502-508`——SQLite 接受 `'1.'`/`'0.'` 尾点串，PG 正则与 DECIMAL_CANONICAL_RE 拒绝，「非规范串直连 SQL 也被拒」的契约在 SQLite 侧不成立。
- **P2-10 位号级联不对称**：SQLite 装级联触发器、PGlite 明确不装（:2339-2340，FK CASCADE 探针不生效）——非 BomRepository 路径删除发生项留孤儿位号，发布校验会数到旧位号。
- **P2-11 发布门与 ECN 投影门的替代组比例口径不一致**：头发布按 (group, from, to) 三元组分桶（:925-935 / :2444-2454）、ECN 投影按检查点切片（:1374-1408 / :2094-2125）——同组两成员 1.0/1.0 跨期重叠时头发布通过、ECN 发布拒绝；ECN **取消**路径无历史豁免而发布有（:1241 vs :1155）。
- **P2-12 入口 / 存储层域校验分工不对称**：DECIMAL_FIELDS 只规范化不校验域（lotsize 34 位入口放行、存储层拒绝）；DECIMAL_FIELDS 不含 setupTime/runTime/fixedTime/overheadRate/unitPrice/creditPrice/operationScrap——`'1.50'` 在 qty 规范化、在这些列被存储层拒绝，行为不对称。
- **P2-13 CTE 版判环 UPDATE 不覆盖 flowDirection 翻转**：`bom-trigger-ddl.ts:228`（WHEN 只查 childItemId 变化）——草稿头下 by_product→consume 反向边经 UPDATE 引入不被判环；reach 版 cycle-ddl 已覆盖。
- **P2-14 漂移检查 `changed` 分支基本不可达**：`check-storage-declarations.ts`（pglite :79-123 / sqlite-core :56-101）——托管对象名内嵌定义哈希，定义变化即改名 → 实际总走 missing+extra，`changed` 与 `Changed definitions` 文案是死逻辑（功能正确，API 面误导）。
- **P2-15 热字段不支持增量演进**：`ext-storage.ts:169-175` 对声明全集无条件 ADD COLUMN——「新增热字段 + 旧全集 + 新迁移名」= duplicate column 永久失败；纯热字段应用也被 sqlite 3.47 门槛拦且报错文案只提 remove 'checks'（`constraint-drift.ts:90-96`）。
- **P2-16 三维重叠守卫对 NULL effectiveFrom 的三值逻辑脆弱**：`unit-lot-trigger-ddl.ts:66-68` 日期维不像序列维那样 COALESCE NULL 下界——当前 `entities.ts:318` NOT NULL 不可达，schema 放宽即静默失效。
- **P2-17 部分实体配置不可用**：cycle 触发器引用四张表，缺任一 SQLite 在 CREATE TRIGGER 即报 no such table（实证）→ connect 失败；PG 侧延迟到首次执行才报——失败时点两后端不一致，`reach/system.ts`「部分主数据配置仍保持可用」实际不成立。
- **P2-18 其它**：operation_seq 与分摊行互斥只挡一侧（:970-990）；已发布头守卫的「开放批次」全局豁免无行级绑定（:1110 / :1875-1876）；plugin.ts 安装原子性缺口（每实体一个 bootstrapTransaction + scope 中途退出留部分安装，:249-262）；PG split 错误消息整数段还原无 9 位补零（:2083-2085，纯展示）；硬编码 `'bom'` 命名空间（:1675）。

### 三框架绑定

- **P2-19 bom-react 缺 `'use client'`**（对照 search-react 惯例）；三端 index.ts 均不透传 core 共享类型（BomViewInput/State/Commands/Handle 须双包导入）。
- **P2-20 ArrowLeft 无父节点时焦点三端不同**（Angular clamp 到首行、React/Vue no-op）；`readOnlyReason` Vue 用 truthy、另两端 `!== null`；fixtures 三端默认值不等价（Vue effectiveFrom null vs 另两端 Date 等）；各端独有行为用例未镜像（aria-selected / 交互错误清除 / 校验错误文案）。

### demo / e2e / 规格收口

- **P2-21 e2e 脆弱点**：种子行数 / 确定性 id 三处独立硬编码（`bom-demo.spec.ts:49,55,86-89` + service + 页面文案，改种子需人肉同步，历史提交 4e1ad182 为证）；`page.once('dialog')` 提前注册的残留吞弹窗风险（:42）；`clickButton` 的 `new RegExp(text)` 不转义；selectOption 绑定含日期的完整文案；`demoCreateAndReleaseEcn` 原始 SQL 不查 affected rows + 非事务序列（service:728-816，种子改动后 UPDATE 落空静默退化）。
- **P2-22 计时 / 临时产物卫生**：`benchmarks/reports/working-tree-ui-first-visible-*.json` 被 10-18 一次 e2e 改写（收尾还原 origin/main 版本）；`bom-reach-*.json`（含 16,783 行 comparison）与 `browser-git-latest.json` 每跑覆盖写但未 gitignore；`bom-hot-fields*.json` 含 `/private/tmp/...` 机器私有路径；验收证据链引用 20+ 个已消失的 `/private/tmp/bom-*.log`（不可复核，关键日志应归档 CI artifact）。
- **P2-23 规格收口**：`specs/020-bom-slice-10/spec.md:5` 状态仍 Draft（唯一未收口切片）；capability-matrix / release-plan 漏 BOM 四包登记；US-514/515/516 三个故事缺验收依据章节；019 规模回归降级（1000 台→100 台硬编码）与任务文字「精确 100000 节点」不符；013 quickstart 的 `EXPLOSION_ALGORITHM_VERSION = '1'` 与实现 `'2'` 漂移；benchmarks/README 未文档化 bom-reach / bom 两个新 bench；BOM bench target 不在 CI 门禁（16/100ms 预算仅靠手动运行）。
- **P2-24 占位提交信息**：`8bd135d3`「12」（62 文件 +6,382 行）、`2472bdd5`「324324」（内容均被后续重构吸收）——squash 时改写。

---

## P3（提示级，精选）

- `entities.ts:823` 错位的重复文档注释（「BOM 实体全集」出现在 BomActivityType 上方，:1119 才是真身）。
- `BomConfigConstraint.kind` 无存储层兜底（实体装饰器 string 类型、仅仓储入口校验）——求值期对未知 kind 按违约报告（fail-safe），建议补 DDL CHECK。
- `quantity/cost.ts:390-396,975-977` 显式 batchQty 救不了 cost_lot_qty 缺失，rootL 三元分支是死路。
- `quantity/explosion.ts:573-583` 悬空 routingId 静默按无工序损耗、cost 侧抛「路线不存在」——两端不一致（数量静默偏小）。
- `instance.ts:194-200 vs 266-269` 同一 maxDepth 两种口径（expandInstance 含 depth==maxDepth 节点、tracePath 丢弃并置 truncated）。
- `quantity/layer.ts` 零份额成员仍产出 qty=0 需求行（消耗 paths 预算）。
- `view-fields.ts:17-22` UTC 时间进 datetime-local 本地控件，东八区编辑生效窗口平移 8 小时（round-trip 无损、仅编辑错位）。
- `view-state.ts:66-80` #expanded 跨 setInput 不清（不同输入共享展开状态，建议注释或重置）；:82-94 refresh 双触发；:134-144 calculate 无输入代际校验。
- 死导出（`BOM_DEMO_DB_NAME` / `ImportedDraftSummary` / `BomWorkspaceContext` / `DecimalFormatOptions` 等）；死代码（`bom-map.ts:480-495` 查 rows 随即 void）。
- 三端 `itemId.slice(0, 8)` 展示兜底（cost-panel.ts:506 / ecn-panel.ts:175 / req-tree.ts:368）——铁律「无 fallback」，改 `?? '未知物料'`。
- reach `witness` 路径级不去重的残余枚举风险（窗口远窄于 CTE 版，:cycle-ddl.ts）；深图（>128 层）删除 consume 行硬限需对外文档化（reach-sql.ts）。
- `gc_`/`sx_` 前缀保留侵占用户存量对象（Extra 报错无可操作文案）。

---

## 已排除的疑似项（复核通过，勿再报）

- 联合成本负尾差：误报——最小正份额 1e-9、每份额 half-even 上浮 < 1 个 amount 单位，尾差恒 > 0（40 万组随机穷举 + 解析下界双证）。
- ext-attr 数值字面量指数记法跨方言：SQLite 实测支持 `1e-7`/`1e+21` 且 json_extract 等值比较正确。
- 展开死循环：写入期并集图判环保证存储图恒为 DAG，BFS 无 visited 集安全。
- ext-attr SQL 注入面：code/value 走 JSON.stringify/翻倍转义，GIN 表达式来自编译产物——核对通过。
- filterByAttr / resolveBom / expandBom 快照一致性：全部读取在单事务内。
- uom 换算方向 / 60 进制 / 跨量纲缺率报错：正确（二次换算的率配对问题见 P1-3）。
- assertCompleteResolution 自身完备：问题只在调用面不全（P1-4 / P2-4）。
- 环检测 witness / depthExceeded：判定正确（作用域混读见 P1-7）。
- 存储层实证无问题：SQLite 同事件触发器逆创建序执行、`IS NOT` ≡ `IS DISTINCT FROM`、批量 INSERT 逐行触发器可见同语句先前行、`date('now')` 两后端口径一致、RAISE 消息前缀与 normalizeBomError 逐字段对齐、触发器名不落入漂移检查前缀、reach 闭包维护（增量祖先×后代 / 删除否定证明 / 迁移回填）数学正确、备份恢复 roundtrip 覆盖触发器/函数/生成列。

---

## 合并前检查清单（按优先级）

1. 修 P0-1 / P0-2 / P0-3（P0-3 建议删 CTE 版统一闭包版）；P0-4 还原 launch.json 为追加
2. P1-1 三引擎 alternativeNo 口径统一（牵动 P1-4 / P2-4 的消费方）；P1-2 指数上限；P1-3 二次换算
3. P1-14 / P1-15 放宽收回或改为有依据的防线；P1-17 的 10 条 e2e 补入账
4. P1-11 useBomView 语义收敛；P1-12 Vue tabindex 哨兵；P1-13 TSDoc
5. P2-24 占位提交 squash；P2-22 first-visible 三文件还原；P2-23 规格收口批次
6. 发布前处理：P1-10 SQLite 触发器 DROP+CREATE、P1-9 适配器轴注册 install 期 fail-fast
