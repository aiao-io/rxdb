# BOM 分支全量评审记录（第二轮）

- **评审对象**：`claude/bom-related-work-77235b`（相对 main 545 文件 / +110,560 / −790 行；merge-base `3ca26f7e` = main HEAD）
- **评审头**：`8672a2ae`（PR [#129](https://github.com/aiao-io/rxdb/pull/129) head）
- **评审方式**：10 角度 × 15 个并行 finder（逐行扫描 ×5 区域、删除行为审计、跨文件追踪 ×2、语言陷阱、包装器、复用、简化、效率、根因深度、规则符合性）→ 去重后 48 个候选 → 9 个验证 agent 独立 1 票三态裁决 → 1 个扫尾 finder。行号以评审头提取件为准（`git show 8672a2ae:<path>`）
- **上一轮**：`17a0ef5f` 深度评审（P0×4 / P1×17 / P2×24）已在 `6edd0130` 修复，本轮抽查复核并独立重审全分支
- **状态约定**：按 [README.md](./README.md)，整分支评审不占 RV 编号，修复一条删一条，剩几条就是几条

## 总评

上一轮修复质量高（抽查 7 处全部真实落位，见下节），且修复本身未引入新的 P0。**本轮未发现数据损坏级问题**——最坏方向仍是拒绝、展示错误与性能退化。但存在 7 个 P1，集中在五条脉络：

1. **写入校验集中在仓储门面、绕过通道无兜底**——history-loader 与 attr_def 自描述写入都不经 `validateBomWrite` 的完整校验面，存储层触发器对 ext/selectionConditionId/enumValues 零兜底（P1-2、P1-5、P2-4）。
2. **并发合并的方向不完整**——`6edd0130` 只保护了「本地编辑不被写回覆盖」，外部写方向（update 回填无陈旧性守卫）与校验-写入之间的时间窗仍裸奔（P1-1、P2-3）。
3. **验收诚实性**——三条标 ✅ 的 AC 的回归测试是空壳/重言式/缺正向场景（P1-6）。
4. **双后端镜像与三端复制**——协议列清单、DDL 工具套件、切片校验、十进制清单、树键盘导航等大量「同口径」只靠注释维持，无编译期或测试强制（P2 维护性簇）。
5. **连接热路径效率债**——每次连接全图闭包断言 + 百条级 DDL 串行删建；活视图批量写退化为 N 轮全量重建（P2 效率簇）。

## 上一轮修复复核（`6edd0130`）

抽查 7 处，全部真实落位：

- **P0-1** ✓：`quantity/layer.ts:293-294` priority 分流改为 `needed = decimalMul(remaining, equiv)`，替代成员耗尽即拒绝（`:311`）
- **P0-2** ✓：`ext-storage.ts:148-149` 缺表时 `readTableCatalog` 返回空列 → `pendingStorage` 跳过审计与 DDL
- **P0-3** ✓：`backend/bom-trigger-ddl.ts` 中 `WITH RECURSIVE` 计数为 0，CTE 版判环已删；SQLite 触发器改 `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER`（`:68`）
- **P0-4** ✓：`.claude/launch.json` 恢复 main 的 7 条配置并**追加** BOM 两条
- **P1-2** ✓：`decimal.utils.ts:26` `DECIMAL_MAX_EXPONENT = 6144`
- **P1-11** ✓：Angular `useBomView` 收 `T | Signal<T>`、Vue 收 `MaybeRefOrGetter`，自动 `setInput` 三端同语义
- **P2-22** ✓：`working-tree-ui-first-visible-*.json` 不在差异清单（已还原）；bom-hot-fields 报告无 `/private/tmp` 私有路径

---

## P0

无。

## P1（7 条）

### P1-1 update() 回填无陈旧性守卫，并发外部写被 RETURNING 旧行静默回退（两后端同口径）

- **证据**：`packages/rxdb-adapter-sqlite-core/src/repository/SqliteRepository.ts:99`（PGlite 侧 `PGliteRepository.ts:86`）`await this.mergeQueryCache(result, pending.apply);`——`pending.apply` 把 UPDATE 的 RETURNING 行无条件推进 origin 与可见值，整条链路无 `updatedAt` 比对、不走 `isStaleEventPayload`；`packages/rxdb/src/entity/entity-status.ts:461` 的 `applyExternal` 契约注释明确「调用方若可能收到迟到的事件，需先用 `isStaleEventPayload` 拦截」，该拦截只存在于外部事件路径，RETURNING 合并路径没有。
- **触发/后果**：两个标签页编辑同一实体：A 的 UPDATE 已提交（RETURNING 捕获旧行）、结果未合入缓存时，B 对另一字段写入并先合入缓存；随后 A 的 `pending.apply` 用不含 B 字段的旧行把 origin 与可见值回退——缓存与库分叉、界面持续显示旧数据、之后 `save()` 静默 no-op。`6edd0130` 保护的只是本地编辑方向（fieldEditVersions），外部写方向未设防。
- **修复方向**：`mergeQueryCache`/`addQueryCache` 的 applySaved 分支先按 `updatedAt`/版本戳与当前 origin 比对，迟到的 RETURNING 行丢弃或只补缺。

### P1-2 loadHistory 绕过仓储写入规则，跨组织条件/违约 ext 静默落库

- **证据**：`packages/rxdb-plugin-bom/src/resolve/history-loader.ts:249-250` `selectionConditionId: input.selectionConditionId ?? null,` / `ext: input.ext ?? null,`，随后经 `:350` `executor.getRepository(BomLineOccurrence).create(occurrence)`（适配器轴仓储）落库，全程不经过 `BomRepository.validateBomWrite`；仓储路径的 `repository.ts:152-153`（`validateExtWrite`）、`:172-178`（`conditionById` 比对 orgId）在历史通道零命中。存储层兜底不存在：`bom-trigger-ddl.ts` 中 ext/selectionConditionId/lotCodes 只出现在协议列清单，无内容校验；FK 只验 id 存在。
- **触发/后果**：`plugin.loadHistory` 传入 `selectionConditionId` 指向他组织条件的发生项 → 写入成功；此后该头任何 `resolveBom`/`expandBom` 在 `evaluateConfigConditions` 抛「选择条件不存在或不属于当前组织」，**该 BOM 永久读不出**。违反 required/枚举的 ext 静默入库，之后仓储 `update` 一旦触碰 ext 即被拒，行变得不可编辑。`write-rules.ts` 头注的「仓储 / 导入 / 历史装载同一口径」不成立（历史通道只复刻了十进制规范与公式语法两段）。
- **修复方向**：历史通道复用 `validateBomWrite` 的 ext/selectionConditionId/lotCodes 校验段（与导入通道同法），或把这三项校验下沉到存储层触发器。

### P1-3 无路由头挂 operationSeq：声明了投料工序却静默无损耗链，数量少算

- **证据**：`packages/rxdb-plugin-bom/src/quantity/explosion.ts:607-608` `if (headerRoutingId === null) continue;`——覆盖检查被跳过，`operationScrapChain` 空链原样返回，无错误、无 unresolved 记录。存储层两侧都放行该状态：`backend/bom-trigger-ddl.ts:981-985`（routingViolation 谓词含 `h."routingId" IS NOT NULL`）与 `:1015-1023`（发布校验 seqViolation 同前提；PGlite 版 `:2369-2372`/`:2424-2433` 同构）；`resolve/write-rules.ts` 全文无路由检查。
- **触发/后果**：行发生项写 `operationSeq: 3`、其头 `routingId` 为 NULL → 写入与发布全放行，`explodeBom` 静默按无损耗链计算——用户声明的工序损耗消失、需求量偏小，与「挂了必须可解析、不以 0 兜底」的口径相悖。`cost.ts` 的 `batchCostOf` 同路径静默忽略。上一轮 P3 提示过（「悬空 routingId 静默按无工序损耗」），修复轮未处理。
- **修复方向**：写入/发布守卫把「行有 operationSeq 且头无 routingId」判为违规；或爆炸期报「路线未覆盖」并计入 unresolved。

### P1-4 活视图 items 查询 IN 不分块，合法预算内先于截断机制炸掉

- **证据**：`packages/rxdb-plugin-bom/src/view.ts:42-45` 把全部展开节点+候选 id 一次性 `IN (?,?,...)`；默认预算 `paths=100_000`（`expansion.ts:94`）允许 10 万节点。仓库自身保守上限 `SQLITE_MAX_BIND_VARIABLES = 999`（`packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts:97`），其余所有 IN 查询均按 200 分块（`expansion.ts:96-97` 注释明言「避开两后端的绑定变量上限」）。
- **触发/后果**：默认预算下 ≥1000 个不同展开节点（多级展开的常态规模）的 BOM → items 查询抛 "too many SQL variables"，三框架共享的 `watchView` 路径在截断机制生效前崩溃。
- **修复方向**：按既有 `CHUNK_SIZE = 200` 分块取回后合并。

### P1-5 attr_def 的 dataType/appliesTo 写入期零校验：拼错 appliesTo 使必填/枚举约束静默失效

- **证据**：`packages/rxdb-plugin-bom/src/entities.ts:1101-1114` `dataType`/`appliesTo` 为普通 string 列，无 DDL CHECK、无触发器（`bom-trigger-ddl.ts` 对 attr_def 零写入守卫）；`repository.ts:107-137` 的 BomAttrDef 分支只调 `validateDictionaryStorageType`，`entities.get(data['appliesTo'])` 未命中时静默 return。
- **触发/后果**：写入 `appliesTo='bom_line'`（拼错）的声明可入库且永远不匹配任何实体——其 `required`/枚举约束静默不生效，**必填扩展属性从此不被强制**（完整性洞）；`dataType='foobar'` 可入库，任何带该字典的过滤查询才炸（`ext-attr.ts:163`），写入期本该拒。
- **修复方向**：写入校验对 dataType 枚举与应用目标实体名做白名单校验；或补 DDL CHECK 与存储层守卫。

### P1-6 三条标 ✅ 的 AC 回归测试零覆盖（验收诚实性）

- **P1-6a** `packages/rxdb-plugin-bom/src/__tests__/bom-cost.spec.ts:737-751`——AC#8「precise/imprecise 两版不串」测试是空壳：只建了一个修订 A、两条同子件同 qty 的普通行，没有 `childRevisionId`、没有第二修订；断言只有 `toHaveLength(2)`，卷算真串用了修订成本也照过。测试内注释自认「简化断言：……构造 D/E 修订的头成本不同需要两个头」，`void headerA`（`:748`）是未完成测试的残留。`requirements/stories/domain/US-514-bom-cost-rollup.md` 把 AC#8 标 ✅，实际零回归覆盖。
- **P1-6b** `packages/rxdb-plugin-bom/src/__tests__/bom-ecn-slice.spec.ts:125-152`——AC#23 用例名声称「单独发布都拒……合一张通过」，但只包含 ① 单独发布 E1 拒（`:148-149`）② 单独发布 E2 拒（`:150-151`）后即收尾，**没有任何「同时发布 E1、E2」的调用或成功断言**——切片校验若把另一张草稿的成员重复计入、合法合发场景被错误拒绝，此测试照常全绿。AC#23 的核心正向验收零覆盖。
- **P1-6c** `packages/rxdb-plugin-bom/src/__tests__/bom-snapshot.spec.ts:89-92`——AC#15 原子快照断言是重言式：单行数据下 `beforeIds` 已断言为 `''`、`afterIds` 恰为一行 id，`duringIds` 无论取哪个值都命中析取的一支——混时点读取（header 已见发布、occurrences 未见的中间态）**结构上不可检出**，`toHaveCount` 型断言与题目声称的原子性无关。
- **修复方向**：AC#8 补真实 D/E 双修订构造与成本断言；AC#23 补「两草稿同日合发通过」正向用例；AC#15 改用多行数据（或注入发布时刻）使混时点可观测。

### P1-7 Cargo 依赖整体回退 + CI action 固定 SHA 回退（合并即静默撤销 main 上的升级）

- **证据**：`apps/dev-rxdb-tauri/src-tauri/Cargo.toml:22` 分支为 `tauri-build = "=2.7.1"`，main 为 `=2.7.2`；Cargo.lock 中 serde_json `1.0.151`、uuid `1.27.0`（main：`1.0.154`/`1.28.0`）。时间序坐实：main 的 `7095aaad`（dependabot #134，2026-10-19 14:27）→ 分支合并 main → 分支提交 `6b05caf0`「1」（2026-10-19 15:27）整体回退。顺带被回退的还有 `.github/workflows/ci-template.yml` 的 `nrwl/nx-set-shas` 与 `codeql.yml` 的 codeql-action 固定 SHA。
- **触发/后果**：PR 合并进 main 后，Tauri 构建静默回到旧版 tauri-build/serde_json/uuid，dependabot 的升级意图被撤销；CI action 回到旧 SHA。属并行会话 WIP 漂移，非有意决策。
- **修复方向**：合并前把这三个文件恢复为 main 版本（与 BOM 工作无关）。

---

## P2（按域）

### 核心引擎

- **P2-1 `prepareUpdate`/`apply` 契约只对本地 SQL 仓储成立**：`packages/rxdb/src/repository/Repository.ts:464-469` 仅 `finally(pending.release)`，apply 的消费方只有 Sqlite/PGlite 仓储；Supabase 远端成功路径返回新建实例、QueryCache 主端 `Object.assign` 只改 target——调用方实体的 origin 永不前移、patch 不清空、`modified` 恒 true，断网重连后重复提交同一 patch（远端主端属既有行为，但本分支新增的机制把「本地保护、远端裸奔」的差距固化了下来）。建议接口层声明或补齐远端路径的 apply。
- **P2-2 patch 对象同一性是未入接口的隐式契约**：`packages/rxdb/src/entity/entity-status.ts:429` 快照 `WeakMap` 以 patch 对象为键，门面与适配器靠同一引用共享；`IRepository.update` 接口注释未声明，任何中间层克隆 patch 即静默失效（当前三个消费路径均不克隆，属潜在缺口）。
- **P2-3 校验读与写入不在同一事务**：`packages/rxdb-plugin-bom/src/repository.ts:239-247/282-292` `validateBomWrite` 经 `this.rawQuery.bind(this)` 读 attr_def（core `Repository.ts:528-534` 每次独立解析适配器），与 `super.create/update` 的写入无事务边界——并发改 attr_def 的窗口内违约 ext 静默落库（存储层只验格式不验形状）。
- **P2-4 attr_def.enumValues 无校验**：`repository.ts:148` 裸 `JSON.parse(String(def['enumValues']))`；坏 JSON 在任意 ext 实体写入时抛裸 SyntaxError，标量（如 `'5'`）解析后 `enumValues.length > 0` 恒假 → 枚举校验静默跳过。
- **P2-5 条件解析器无嵌套深度上限**：`resolve/config-condition.ts:353-403` 递归链无 depth 计数（对照 `quantity/formula.ts:31` `FORMULA_MAX_DEPTH = 64`），约 4KB 的数千层嵌套条件在保存期与求值期抛裸 RangeError，非 `BomConfigSyntaxError`。
- **P2-6 零换算率裸 Error 逃逸错误合同**：`quantity/uom.ts:146` 遇 `uomConversion='0'`（写入期合法规范串）时 `decimalDiv` 抛裸 `Error('十进制除法：除数为零')`；`formula.ts:195-199` 对同款除零有 BomQuantityError 包装，uom 路径漏了；`cost.ts` 的 `asCostError` 对裸 Error 原样上抛。
- **P2-7 ECN 影响面钻石路径丢失**：`resolve/ecn.ts:192` `topItemsOf` 的 `seen` 按物料去重，X 经 P→T 与 Q→T 到达 T 时 T 的 `paths` 只保留一条，违反 `paths: string[][]` 的复数契约；`ecn-panel.ts:189-190` 直接少渲染一行。
- **P2-8 空 `sourceLinePath` 存成 `'[]'`，映射静默失明**：`resolve/bom-map.ts:220-229` 对 `[]` 跳过 `assertSourcePath` 却照存 `'[]'`；`:611-615` 的 `[].join('>')` 得 `''`、`'' !== undefined` 恒真 → 完整展开下 `confirmMapping` 写空 baselineSteps、`mappingGaps` 恒空——该映射永远无缺口。仓库内无调用方传 `[]`，仅外部 API 误用可达；但 saveMapping 对此不拒绝正是缺陷本身。
- **P2-9 where-used 公式行用量成字符串 "null"**：`resolve/expansion.ts:339` `fetchParents` 对 qty 列 `String(row[...])` 无 null 守卫（对照 `:304-305` fetchChildren 有），契约注释「根节点与公式行为 null」被违反；当前面板不显示 qty，影响潜伏在 API 层。
- **P2-10 bom_map JSON 列裸解析**：`resolve/bom-map.ts:291-292` `storedMapping` 对 sourceLinePath/baselineSteps 直接 `JSON.parse`，无 try/catch、无形状校验；直连 SQL 写入坏 JSON 后覆盖率/缺口/确认全链路抛裸 SyntaxError，无行级点名（对照 `unit-lot.ts:58-70` 的 `parseLotCodes` 有归一）。
- **P2-11 编辑器保存/加载代次竞态**：`view-state.ts:111` 加载 `++#editorGeneration`、`:125` 保存只捕获不递增——保存进行中（读完之后、update 提交之前）加载同一发生项读到旧值、代次最新照常应用，保存完成时代次不匹配被丢弃：库已新值、编辑器显示旧值，用户看到保存「消失」（时间窗明确的真实竞态）。
- **P2-12 漂移检查对用户自建的普通 gc_ 列静默放行**：pglite `check-storage-declarations.ts:85-86`（`row.generated !== ''` 过滤）、sqlite-core `:63`（只解析带 AS 的列）——与 `RxDBError.ts:404`「库里未声明的同前缀对象一律算多余」的承诺矛盾，且与 sx_ 索引侧「前缀即算」不对称：用户自建 `gc_note` 列不报警，按消息排查找不到对象，前缀保留契约的列侧实际不设防。

### 三框架绑定

- **P2-13 树的行加载错误跨 setInput 残留（三端一致缺陷）**：`bom-tree.ts:136`（Angular，React `bom-tree.tsx:24`、Vue `BomTree.vue:23`）`interactionError` 只在编辑入口清除，绑定自动 `setInput` 后旧查询的错误仍显示在新树上（`role=alert`），直到再次点击某行。对照行编辑器的 `formError` 有随 editor 引用变化的重置，树缺对应机制。
- **P2-14 Angular `useBomView` 普通值 input 永不重同步**：`use-bom-view.ts:81-85` 的 effect 在 db 与 input 均为普通值时无响应式依赖、只跑一次；React 端普通值替换随重渲染自动 `setInput`。JSDoc「内容变化时自动 setInput」无限定、spec 只测 Signal 路径，与 README 的「signal 限定」措辞不一致——三端同语义的收敛还不完整。
- **P2-15 Vue 树焦点按索引取元素，重渲染窗口内落错行**：`BomTree.vue:25-29` 先写 `focused` 再 `nextTick` 按 `querySelectorAll(...)[index]` focus；按住 ArrowDown 穿过展开/折叠重渲染时 index 指向旧 nodes，焦点落错行（Angular/React 走真实 focus 事件/按 key 取元素）——同一按键三端三种行为。
- **P2-16 `setInput` 空态补丁缺 editor 字段，旧值跨目标残留**：`view-state.ts:75-83` 手写 7 字段 loading 补丁（恰缺 editor），`#publish` 展开合并——`BomViewState` 增字段须手工审计 4 处 patch 点，editor 残留是现存实例。

### demo / e2e / 配置

- **P2-17 demo 校验按钮非幂等，二次点击顶掉已展示的拒绝结果**：`apps/dev-rxdb-bom/src/app/bom-demo.service.ts:624`（固定 `lineNo = 77`，撞 `(headerId, lineNo)` 唯一约束；首次点击的草稿行不回滚）与 `:898`（固定 `id: deterministicId('item:SEAT-LIVE')` 撞主键）；`demo-checks.ts:148` 先 `result.set(null)` 清掉首轮拒绝详情，再显示裸约束错误串。注：替代组按钮的 `revisionNo='E'`（`:557`）不构成冲突（无该唯一约束），但会堆积垃圾草稿。
- **P2-18 tsconfig paths 缺 bom-react/vue 两条**：`tsconfig.base.json:119-121` 只有 bom / bom/testing / bom-angular；main 上所有绑定族（replay/search/tree/working-tree 等）三端齐备。react/vue 两 app 的 vite 开 `tsconfigPaths: true`、两包 exports 只指 `dist/*` 且无 `@aiao/source` 条件——干净 checkout 未构建 dist 时 TS/vite 解析断，CI 被 `targetDefaults.build.dependsOn: ["^build"]` 掩盖。
- **P2-19 BomMapScope 文档不变量零落点**：`entities.ts:892-899` docstring 声明「两侧 org 相同、父件同一物料」，装饰器无 checks、无触发器、`validateBomWrite` 无该实体分支——跨 org/不同父件的 scope 可入库，下游 saveMapping 才报困惑性拒绝、覆盖率查询静默返回空集。

### 存储层 / DDL 维护性（「同口径」只靠注释维持）

- **P2-20 发生项协议列清单双份**：`bom-trigger-ddl.ts:237-269`（SQLite）与 `:1519-1551`（PG）31 字段逐字节相同，仅比较算子不同（`IS NOT` vs `IS DISTINCT FROM`）；同文件 `DECIMAL_FORMAT_COLUMNS` 已有单份共享先例。写入协议列增删须双份同步，漏一份即两后端放行/拒绝字段集不同。
- **P2-21 DDL 工具套件 6 变体 + 4 处 DO 块内联**：`sqliteTrigger` 在 bom-trigger（带 when）/unit-lot（无 when）/coproduct（event 签名）/instance-node（自动派生名）/instance-source（再变一次）/reach-ddl 六种签名；`pgFunctionFooter` 两版（DELETE 分支有无）；PGlite 0.5.8 解析坑的 DO 块绕行复制 4 份。方言修复必须逐文件同步，升级幂等类修复极易漏改。
- **P2-22 替代组切片校验镜像复制**：`bom-trigger-ddl.ts:803-848`（sqliteSubstituteSliceChecks）与 `:1864-1911`（pgSubstituteSliceChecks）三个 HAVING 体逐字节相同，仅 CAST/::bigint/引号差异——切片语义修正须双份同步。
- **P2-23 十进制列清单三处真相源 + 正则两遍**：`write-rules.ts:31-53`（DECIMAL_FIELD_DOMAINS）、`bom-trigger-ddl.ts:431-453`（DECIMAL_FORMAT_COLUMNS）、`import-contract.ts:38`（DECIMAL_FIELDS）三份手写；`decimal.utils.ts:16` 与 `bom-trigger-ddl.ts:2006` 同文本正则两遍（另有 `canonicalGlob` 第三形态）——「子集/同定义」全靠注释自述。
- **P2-24 实体名字符串分叉 + ~70 处硬编码表名 + 正则扫描闭包补偿**：`bom-trigger-ddl.ts` 22 处 `metadata.name ===`（`:284` 等），SQLite `bom$...` 字面量约 54 处、PG 裸 `bom.` 16 处（绕过同文件 `pgNamedTable`）；`plugin.ts:171-176` 用正则扫 DDL 文本反推依赖闭包正是字符串内嵌的补偿。实体/表改名须同步改 ~70 处，漏配延迟到首次写入才炸「表不存在」。同文件 `STRUCTURAL_COLUMNS` 已有数据驱动替代写法。

### 效率

- **P2-25 每次连接全图闭包断言 + 百条级 DDL 串行删建**：`reach/system.ts:34-37` `bootstrapExisting` 每次 connect 无条件 `assertReachComplete`（递归 CTE 全图闭包 + 双向 EXCEPT，无水位/缓存），迁移 `up()` 闭包算 3 遍（`migration.ts:56/58/59`）；`plugin.ts:370-372` 每次连接逐条 await 执行全部 DROP+CREATE（每处产出两条，单次安装百条级），无「定义未变即跳过」比对——core 的 `storageExpressionIdentity` 漂移比对机制可用而未用，且多连接应用在第二个连接打开时与安装事务争锁。
- **P2-26 活视图批量写退化为 N 轮全量重建**：`repository.ts:221-223` 三个 merge 钩子全部 `task.refresh()`；`QueryTask.ts:375-377` 刷新计数器恒增使 `distinctUntilChanged` 永不合并、无节流；每次 refresh 全量重跑 `readBomViewSnapshot`（expandBom + explodeBom + items 三段读）。导入 N 行 = N 轮完整读事务。
- **P2-27 配置求值按 chunk×层重复拉 4 张组织级全表并重解析 AST**：`config-validate.ts:172-218` `evaluateConfigConditions` 每次调用无条件执行 4 条 orgId 全表查询（`asts` 缓存仅覆盖单次调用），`expansion.ts:294/332` 按 200 行 chunk 调用——配置型 BOM 每层 × 每 chunk 重复读同一批不可变数据。
- **P2-28 嵌套超 3 层（AGENTS.md 铁律）**：`quantity/cost.ts:656-661` for→if→if→if 四层、`quantity/explosion.ts:575/584/665/729/731` 五层（按块计六层）——违反 AGENTS.md「<3层缩进，嵌套>3层」禁止项。

---

## P3（提示级）

- 公式参数原型链查找：`quantity/formula.ts:182` `scope.params[factor.name]` 无 hasOwn 守卫，参数名 `constructor` 读到 `Object.prototype.constructor` → 误导性「必须是十进制字符串」而非「缺参数」（仅错误消息质量）。
- `apps/dev-rxdb-bom-e2e/src/bom-redesign.spec.ts:17` 断言不存在的文案「尚未装载种子」，恒真无保护（未装载回归实际由同文件 `toContainText('已有 N 项物料')` 覆盖）。
- `apps/dev-rxdb-react-e2e/src/opfs.spec.ts:30-31` 删除进目录后的「上传文件」按钮内容断言——目录页渲染局部失败不再被拦截（整页崩溃仍会经后续 `setInputFiles` 超时变红，信号延迟且不精确）。
- `bom-history.spec.ts:73-84` 注释声称「经插件 API 同样拒绝并归一错误类型」，实际同一 rawQuery 再跑一遍、不查错误类型——API 层回归无覆盖。
- Vue 行编辑器 `BomLineEditor.vue:62-71` 保存中且无 editor 时同时渲染两个 `role=status`（另两端一个）——对 status 区域的严格断言在 Vue 端多元素命中。
- 文档违规：`requirements/capability-matrix.md:81` 缺口清单保留「已交付」条目；`requirements/status-overview.md:178/181`「demo24/24（2026-10-18时点；现demo共34条）」「旧等待说明已纠正」等演进叙述——均违反 CONVENTIONS.md「派生视图回答现在」「改判就地覆盖」。
- parity 阈值机制（PLAUSIBLE）：`modules/e2e-parity/bom-view-parity.mjs:520-522` 首屏阈值按「最大观测 ×1.33 ≈ 3600ms」校准，25% 级劣化不可检出；但断言仍能抓 >33% 与崩溃级回退，相对基线替代的稳定性未经验证。
- BomError 家族不继承 `RxDBError`（PLAUSIBLE，潜在）：`types.ts:10`/`cost-error.ts:2` 直接 extends Error，偏离 working-tree 的 `CommitValidationError extends RxDBError` 先例；当前全树可触达的 `instanceof RxDBError` 判别点 BOM 错误走不到，代价停留在未来「已知/内部错误」判别路径。
- `reach/reach-sql.ts:63-75` `visited` CTE 缺 `AS MATERIALIZED`（PLAUSIBLE）：同链其余 CTE 均显式物化；是否按行重算取决于计划器（PGlite 上 EXPLAIN ANALYZE 可证实），且该 SQL 在 `bom_reach_maintain` 触发器内每次删除跑两遍 visited。
- 视图候选 label undefined（PLAUSIBLE，触发面窄）：`view-projection.ts:17` 合入 `explosion.manifest.unresolved` 候选但 `view.ts:33-45` 未预取其 childItemId——需 ≥10 万节点且含大量非 consume 行（expansion 先截断、explosion 继续）两遍遍历发散才复现；简单歧义场景 label 正常。
- 导入逐行 SAVEPOINT/RELEASE + 逐行 attr_def 无 WHERE 全扫（`integration.ts:617-620`、`repository.ts:140-143`）——单次成本小（|attr_def| 常数），批量导入放大。
- 实例反查逐边单行查询（`instance.ts:141-142/237-247/305-306`）——M 命中 × D 深串行，同文件 `readChildren` 有 200 行 IN 分块先例未用。
- 三端复制簇：`inputIdentity` 三份同文（angular:14/react:13/vue:18，Vue 实际 4 个使用点）、树键盘导航三份（~50 行 WAI-ARIA 语义）、测试夹具三份逐字节相同、行编辑器字段清单三份、`isGeneratedResultColumn` 适配器双份（仅方言串不同）——行为一致性靠注释互指维持，与「三框架对称」铁律的机制保障缺位。
- `gc_`/`sx_` 前缀字符串在 core 与两适配器 9 处手写内联（含 `constraint-drift.ts` 同数组内 gc_/sx_ 写死、其余引常量）——前缀是跨包存储命名契约，调整需全文 grep 找齐。
- PG 侧裸写 `bom.` 命名空间 16 处（`bom-trigger-ddl.ts:1512` 等，绕过同文件 `pgNamedTable`）——namespace 目前写死为 'bom'，属常量折叠，今天无害。
- 新提交 `8672a2ae` 的 `connectDevTools`：动态 `import('@aiao/rxdb-devtools')` 无 `.catch`（chunk 加载失败产生未处理拒绝）；demo 连接流程现会初始化 devtools 连接器（无扩展时惰性，parity e2e 兜底）。

---

## 已排除项（复核通过，勿再报）

- **sqlLiteral 数字科学计数法**：系统 sqlite3 3.54.0 实测 `SELECT 1e-7`、`1e+21`、`1.2345678901234568e+22` 全部正常解析、json_extract 等值比较正确——上一轮「已排除」项维持成立，`ext-attr.ts:218` 的 `String(value)` 渲染不是缺陷（JS Number 精度属 API 边界固有）。
- **demo 替代组按钮 revisionNo='E' 唯一键冲突**：`BomItemRevision` 无 `(itemId, revisionNo)` 唯一约束，二次点击不撞键、发布按 0.5+0.3=0.8 干净重拒（只堆积垃圾草稿行）——P2-17 已按修正后证据表述。
- **RxDB.ts:2083 错误消息漏点名生成列/高级索引**：main 上同消息（`origin/main` RxDB.ts:2077-2080 相同）——既存漂移，非本分支引入，另行处理。
- 三端 `useBomView` 参数形态差异（Angular `T | Signal<T>` / Vue `MaybeRefOrGetter` / React 纯值）已在上轮判为「三端同语义」并写入清理记录，维持。
- 上一轮「已排除」清单（联合成本负尾差、ext-attr 指数记法、展开死循环、注入面、快照一致性、uom 方向等）本轮复核未翻案。

---

## 合并前检查清单（按优先级）

1. **P1-1 / P1-2 / P1-3**：外部写回退、历史通道校验、无路由工序静默——三处数据正确性方向
2. **P1-4**：view items 分块（一行级修复）；**P1-5**：attr_def 写入校验；**P1-6**：三条空壳测试补真（故事 AC 状态同步复核）
3. **P1-7**：Cargo.toml/Cargo.lock 与两个 workflow 恢复 main 版本（与 BOM 无关）
4. P2-1~P2-12 按域批次；P2-13/14 三端语义收尾（README/JSDoc 限定词统一）
5. P2-17/18（demo 幂等、tsconfig paths 补两条）；P2-20~24 建议随「下一个实体/插件」或升级修复时一并收敛（不阻塞合并）
6. P3 文档违规（capability-matrix / status-overview）随手收口；三端复制簇可在下次对应组件演进时收敛
