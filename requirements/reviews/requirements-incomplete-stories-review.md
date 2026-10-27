# 未完成需求整体评审（剩余项）

范围：`main` 上全部未完成故事，减去开着的 PR 在做的（#129 BOM 的 US-507～525 与 US-030 阶段 D、#152 后台的 US-526～528）。
共 17 条故事与 epic-003 / 006 / 007 / 011。方式：逐条读故事，到源码、测试、npm 产物里核对承重断言；只凭文档推理的标「推断」。

本文件只留**尚未处理**的条目。随评审 PR 一起修掉的不再列出：7 条已合入故事（US-221 / 222 / 311～315）翻 Done、
US-222 补 AC#6、US-313 补价值待证、US-314 的假断言与 schema 8、`0.0.28` 按迁移发布追认（补打 `v0.0.28` tag、CHANGELOG 补记、
迁移门禁拦「常量变了却声明 normal / bridge」）、小程序适配器退回 sqlite-wasm 1.3.1 与工作区补丁门禁、零散收尾项 #8 / #12 立项为
US-223 / US-224、`log: false` 事件契约的注释、审计脚本读错 README。

严重度：**P1** 断言为假或会误导决策；**P2** 文档质量与一致性。

## 小程序（US-211 / US-219）

- **P1 US-211 剩余项挂错地方，状态卡死。** Android 真机不是任何一条 AC 的关闭条件（AC#14 操作列要求 Android / iOS 走查、预期列又写
  「Android 暂缓」，判不了），也没有设备和日期；AC#18（逐平台结论）在 `website/docs/adapters/miniprogram.md` 已齐，仍标 ⚠️。
  改法：照 US-904 先例加「移出承诺范围」，Android 只留为矩阵 caveat；AC#14 改成「开发者工具 + iOS 走查，写明工具、基础库、客户端版本」；
  AC#18 改 ✅；在当前构建上补一次抖音、支付宝 iOS 走查后改 Done。
- **P1 US-219 的门禁被绕过。** AC#10（阶段 A 的门禁：local-registry 真实安装路径）微信半边已做、仍标 ⬜，`@aiao/rxdb-taro@0.0.28`
  已于 2026-10-23 发布（`npm view @aiao/rxdb-taro versions`）。demo 已升到 Taro 4.3.1，故事自己的规则要求「升级 Taro 后重跑 AC#9 / AC#10」。
  改法：AC#10 改 ⚠️；在 Taro 4.3.1 上重跑 AC#9 / AC#10；AC#9 / #17 的「与改前一致」没有基线，改写成在当前构建上走查三家开发者工具。
- **P2 US-211 AC#17 有一半是空转。** `MINI_PROGRAM_UNSUPPORTED_PLATFORMS`（`host.ts`）是 `Object.freeze({})`，
  `unsupported-platform.spec.ts` 里在这张表上循环的用例一次断言都不执行；`MiniProgramUnsupportedPlatformError` 没有任何路径会抛。
  改法：把百度 / QQ 登记进拒绝表，让错误带出原因；不登记就把这个错误类标 `@deprecated`。
- **P2 锚点失效。** `examples/README.md` 已在 #131 删除（US-211 AC#14 与实现文件、US-219 实现文件都还指向它）；
  `patches/@tarojs__vite-runner@4.3.0.patch` 已改名为 `@4.3.1.patch`。反引号里的路径审计脚本查不到。
- **P2 公开文档先于阶段关闭写了「实验性支持」**，违反 US-211 自己的「阶段没关，文档就不许写支持该平台」与 roadmap 约束 7；
  标题仍挂百度 / QQ（只剩拒绝路径）。US-219 里唯一的 iOS 真机待办挂在「不属本故事范围」的一节里，应移交 US-209 或另立。
- **P2 演进叙述**：US-211「2026-10-04 凭探针 v7 改判」、Boatman 排障过程、「一个 PR 只许交付一个阶段」（与 #87「阶段 B+C」不符）；
  US-219「2026-10-07 AC#10 推翻原判断」「原阶段 C 删除」。status-overview 对 US-211 前后不一（进行中表写三项剩余，按 Epic 索引只写 AC#18）。

## 已合入的工作树故事（正文与实现不符的部分）

- **P1 US-314 正文是交付日志。** 439 行，技术笔记约 280 行；16 个子阶段号（B1.1～B2.6、C1、C2.x）漏进 CHANGELOG（「US-314 C2.2」）；
  AC 没按阶段分段（B 的 3、4、8～10 中间夹着 C 的 5～7）。改法：收敛到 150 行内，技术笔记按主题写现行事实，AC 按阶段重排。
- **P1 US-314 的 B2 / C 没有解锁记录。** 唯一记录是「阶段 B1 由 owner 2026-10-21 先行解锁」；epic-006 场景一仍写「价值待证、没有具名诉求」。
  改法：owner 补豁免记录（格式照 epic-009「解锁记录」），或如实标「价值待证（已交付，owner 豁免）」。
- **P2 US-314 辅助文件 `US-314-storage-options.md`**：37 处 `路径:行号` 单用，抽查 4 处全部漂了（如 `core/RxDB.ts:1114-1119` 现在是
  `isLocalAdapter`）；「表名只从元数据来」「事件带上 branchId」等现状已被实现推翻。改法：只留结论、5 条理由与 A 方案的否决证据（约 25 行），
  或并入 US-314「设计决定」后删除。
- **P2 藏在故事里的 main 缺陷修复**，按症状找不到：US-313 的多对多解绑重复删中间行；US-314 的 SharedWorker 共用连接事务交错、
  一个标签页断开关掉别人的连接；PGlite 的 QueryCache 回填被记进变更日志再推回远端。改法：各补一条直接 Done 的故事（先例 US-221 / US-222）。
- **P2 现在时写着修复前的代码**：US-311 根因 1 的 `SYSTEM_ENTITY_IDENTITIES` 在 `RxDBPluginWorkspace.ts` 已不存在，grep 会命中核心
  `system-entities.ts` 里的同名活集合；US-315 的 `current_branch$` 已删、「删分支后都不刷新」被 US-222 推翻；US-221 的「`sqliteLoad()`
  失败原样抛出，没有重试」已改为 `openOpfsWithRetry`。改法：统一钉到修复前的提交（`git show 23d8a098:<路径>`）。
- **P2 US-313 技术笔记过时**：登记表字段缺 `mode` / `tableSetSuffix` / `name`，In Scope「仓库里今天没有任何删库 API」已不成立
  （六个后端都有 `dropStorage()`）。改法：改成符号锚点 `Worktree`（`checkout/worktree.entity.ts`），不再枚举字段。
- **P2 US-312 实现文件不全**：漏了 `shared-version-branch.suite.ts` 的 US-312 用例与 `table-set-scope.ts`；`previewMerge()` 传
  `table_set_scope`、`compareBranches()` 不传，挂在可写检出位上时对比可能列出合并带不过去的 QueryCache 实体（推断）。
- **P2 US-222 剩余**：「两条路」对 PGlite 不准（`RxDBAdapterPGlite.removeMany` 自己拼 SQL 派发，PGlite 是三条路）；
  `StorageFileMeta` 等表的新增 / 修改仍不派事件，只写在修法 A 正文里，应挪进 Out of Scope；「同条件的活查询共用、把旧缓存下发给新订阅者」
  这个缺口没有任何故事或 roadmap 条目认领，应登记进 roadmap「epic-006 评审顺延的架构项」。
- **P2 US-315 后端数口径不一**：故事写「六个后端」，实现文件写「五个」，同一套件实际被 6 个 SQLite 系入口调用、加 PGlite 是 7 个；
  AC#2 / #3 / #5 只在 PGlite 上验。随包发布的 `packages/rxdb-plugin-history/README.md` 没有 `undoBarrier$` 与「撤销停在子分支分叉点」，
  `website/docs/collaboration/undo-redo.md` 也没提。
- **P2 CHANGELOG 分类口径不一**：给公开接口加必选成员，`TransactionExecutor.tableSet` 归 Breaking，`HistoryScopeAPI.undoBarrier$`
  归 Features、`WaSqliteClientRuntime.open()` 归 Fixes。
- **P2 US-221 风险没写进故事**：`releaseOpfsCoopSyncHandles()` 用 `Reflect.get` 读上游 VFS 的实例字段
  （`persistentFiles` / `unboundAccessHandles` / `releaser`），字段缺失会 fail-fast、有单测，但升级上游时才会冒出来。

## epic 级

- **P1 epic-006 关不了。** 目标「后台写入方写进自己的线」写着「尚无故事认领」，违反本 epic 自己「没有归属的条目就是缺口」的规则；
  「现状」一节是「阶段 2 / 3 / 5A 之后」的演进结构，现状 4「没有任何路径往非 active 分支写」已不成立（可写检出位正在写）；
  分期第 5 行没写 B2 / C 的交付与解锁依据；「为什么是 Epic」仍写「切成四条 story」，实际 10 条。
  改法：阶段 4 / 场景三移出 epic（进 vision.md 或另立 epic）——有了 US-314，「隔离写入方」大半可由独立实例挂一个可写检出位满足（推断）；
  「现状」改写成当前事实。
- **P2 epic-003 被重开来挂 US-403**（`git show 09921798 -- requirements/epics/epic-003-ui-developer-tools.md`），
  与 epic-004 自己写的先例「Done 的 epic 不得持有未完成故事」相反。US-403 标价值待证后，建议 epic-003 退回 Done、US-403 改挂 epic-004。
- **P2 epic-007 目标无主**：「手工发布路径的前置校验：`pnpm test-all` 未跑绿即发布」写着「尚无故事认领」。
- **P2 epic-011 撞号**：#139 新增 `epic-011-task-board-domain-model.md`，`main` 已有 `epic-011-p2p-file-share.md`，后合的一方要改号。

## 价值待证与设计前提（US-029 / US-403 / US-910 / US-911 / P2P）

五组都写不出今天用户踩得到的症状，应同一口径标价值待证、`priority: Low`。现状不一：US-029、epic-011 标了；US-403（Medium）、
US-911（派生视图写「症状可复现、owner 立项即可开工」）、US-910（理由写成「夹具未就绪」）没标，P2P 四条却是 High / High / Medium / Medium。

- **P1 US-029 上游「已就绪」是假前提。** `deriveEntityCapabilities()`（`packages/rxdb-model/src/entity-capabilities.ts`）返回整表的
  `canEdit` / `canDelete` 布尔值、不接收 record，三端 `EntityList` 都写 `isRowReadonly = …canEdit === false`；
  `PermissionDeniedError.violations` 只有 `{ namespace, entity, operation }`，没有行 id 与原因。按行的 owner 判定要改公开 API 与三端组件。
  roadmap 批次 3 的 US-027 行「`PermissionDeniedError` 与 UI 能力派生均已就绪」同错。
- **P1 US-029 的身份前提在 #122 之后要从实例级改成库级**：快照实例 `new RxDB({ readOnly: true, … })` 不带 context；可写检出位上的写
  合并回 main 后由主实例按它的 `userId` 推送（`build_merge_changes_payload` 取 `this.rxdb.context.userId`），是同一库内的跨身份推送（推断）。
  另：`access.owner` 只许指向普通属性，排除了最常见的外键 owner（`Order.ownerId` 来自 `MANY_TO_ONE` 关系）；
  「只有 `rls_todos` 开了 RLS」已过时（还有 `rls_mutations_owner` / `rls_mutations_shared`）。
  改法：正文瘦身到约 80 行，只留背景、边界、未选方案、价值待证与「解锁时须重定」清单；从 `requirements/README.md` 大故事清单移除。
- **P1 US-403 问题陈述漏了已公开的逻辑层。** `createQueryBuilderService()`（`state$` / `query$` / `addRule` / `toRxDBQuery` …）与表单纯函数
  （`validateForm` / `buildFormFields` …）都已从 `@aiao/rxdb-model` 根入口导出，阶段 B 的核心已在 main；真正的现状证据反而没写：
  根入口 `export * from './entity-table/vtable/table-factory.js'` 值导入 `@visactor/vtable`，`exports` 只有 `.`，VTable 是必装 peer
  （没有 `peerDependenciesMeta`），只想用 `validateForm` 也得装 VTable。与 #152 正面重叠（同四个包 49 个文件），#152 往根入口加了
  `list-view*`（VTable 类型依赖与 `window` 监听），合入后就成了 US-403 要保兼容的面。改法：#152 先提取合入，再重写 US-403 现状。
- **P1 US-911 的「locale 存成库内一行实体」与 `log` 语义冲突**：默认开日志时切语言进撤销栈、随分支切换、出现在工作树 diff 里；
  关日志时 `setLocale()` 不派 UPDATE 事件，「响应式重渲染」「跨 Tab」两个卖点都不成立。三端现成的 `usePersistedState`
  （共享内核 `PersistedStateRegistry`）没进方案空间，缺口只有「不监听 `storage` 事件」。盘点数字「207」口径带噪：
  原命令 `grep -P` 在 macOS 上报错、注释过滤不生效、漏 Angular 内联模板，按 AST 口径 main 上是 366 处，#152 合入后 479 处。
- **P1 US-910 的同步前提不成立。** 拉取路径用 `executor.mergeChanges(applyActions, undefined, true)` 关触发器合入
  （`pull-batch.ts` / `pull-repository.ts`），远端来的删除在本地不留痕，「父行已本地删除（tombstone 已知）」不成立，迟到的子行更新会让
  这门语言的水位永久卡住（推断）；「`rxdb-plugin-sync` 无需任何改动」也不成立：拉取路径没有扩展点，`RxDBSync` 写权限全是 `system`，
  没有开关 `enabled`、重置水位的公开写入口。派生视图把「夹具未就绪」当主因，而 Supabase 栈已有接进 CI 的真 Full-sync 远端。
- **P2 US-910 / US-911 互相矛盾**：「fallback 链与用户显示偏好只实现一份」只在 US-911 一侧成立，US-910 正文仍认领设备 locale 探测与
  fallback 链；`defaultLocale` 一个是实体级、一个是单行设置字段；链的入参一个由调用方手工展开、一个自动降到父语言。两条都没有交付阶段表。
- **P1 P2P 隐藏前置：认证身份。** US-704 要求 `holderId` 由认证身份派生、US-706 要求信令复用「同步认证」，但同步插件没有认证概念，
  HTTP 适配器只有客户端的 `auth?: HttpAuthHook`，参考服务端 `apps/dev-rxdb-http-server` 没有认证（grep 只命中翻页 token），
  `RxDBContext.userId` 是可选字段；全仓只有 Supabase 栈有 `auth.uid()`。服务端强制 `holderId` 就是 US-029 那类服务端所有权授权。
- **P1 P2P 存活判定与核心承诺自相矛盾。** 持有者存活靠经同步上行的心跳 TTL（US-704 AC#7）；断外网时心跳传不过来，TTL 一到全部过期，
  「断外网局域网照传」恰在它要服务的场景失效；心跳经同步也是 epic 自己拒绝的写放大。改法：持久的「谁有」（经同步，只在获得 / 删除时写）
  与临时的「谁在线」（信令 presence / 桌面 mDNS，不同步）分开。
- **P2 P2P 其余**：清单实体把内容描述（`contentHash` / `chunkHashes` …）与持有声明（`holderId`）混在一行，`chunkHashes` 按持有者重复，
  同一 `contentHash` 可写出不同 `chunkSize`——拆成内容表与持有表，`contentHash` 取块 hash 的 Merkle 根，复用 `@aiao/rxdb` 的 `createSha256`；
  公司内网常屏蔽组播 / mDNS、又不做 STUN，先做实网 spike（推断）；epic 把「三框架对称」铁律误引成「三运行时」，US-707 又说只约束 UI
  却没有 UI 的 AC；US-707 以「US-505 成熟」为 Tauri 用例前置，US-505 早已 Done；US-705 AC#4「完成时间不劣于单源」是 CI 上必然不稳的计时断言；
  US-704 AC#5 谁拒绝、凭什么判定持有没写；信令「新端点」没说落在哪个后端。

## 跨故事与门禁

- **P1 rxdb-model 三端组件四方改写，没有一处写先后**：#152（在途）、US-403 阶段 A / C、US-911 阶段 C、US-029 阶段 D 都改 EntityForm /
  EntityList / EntityDetail。建议在 roadmap 排期约束加一条：#152 的 rxdb-model 改动先提取合入 → 先定「错误码 + 参数」与「按行能力派生」两份契约 →
  再做其余。
- **P1 #129 合入会打坏 US-314 已交付的能力**（读码确认，运行后果为推断）：BOM 分支 `create_table_sql.ts` 调
  `advancedIndexStatements(metadata, 'sqlite', …)` 不带表集，`sx_` 索引名由 `storageConstraintName('sx_', metadata, …)` 按逻辑元数据生成；
  SQLite 索引名全库唯一，带高级索引的实体一开可写检出位就撞名、整笔回滚。生成列也不在 `TABLE_SET_FINGERPRINT_KEYS` 里。
  另：US-030 阶段 D 改了 `packages/rxdb`，按 AGENTS.md 合并治理要先单独提取合入。
- **P2 包组合事实源登记的发布仍是 `v0.0.26`**（`requirements/package-graph.json` 的 `release`）：`0.0.28` 发布漏了 release-plan
  「包组合知识随发布更新」第 2 步，`llms.txt` 与 SKILL.md 仍按 0.0.26 的投递范围生成。
- **P2 审计脚本仍有的盲区**：`checkRoadmap` 不核对行内状态与表格列数；反引号里的路径与 `路径:行号` 写法不在锚点检查范围内；
  叙述词表抓不到「挪到 / 顺带修 / 此前 / 计划里…没做」；全称断言（「只有 X」「唯一的 Y」）符号还在、语义已假时照样通过。
- **P2 `audit:suite-callsites` 没接进 CI**（文件头仍写「还没接进 CI，因为它现在就是红的」），实跑 18 / 18 绿，US-313 的 AC 全靠这 18 个调用点。
- **P2 「零散收尾项」里未关的 owner 决策**：#5（7 个 Angular 包的 `@angular/*` peer 钉成精确版本）、#14（`@aiao/rxdb-model@0.0.26` 坏版本，
  deprecate 或覆盖）仍待处置；#10（23505 / 23502 / 23514 是否计为被拒）等真实部署反馈。
