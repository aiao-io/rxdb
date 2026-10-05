# 路线图（Roadmap）

> 本文回答「接下来做什么、什么必须排在什么前面」。故事当前状态见 [status-overview.md](status-overview.md)，
> 发布执行见 [release-plan.md](release-plan.md)，能力缺口见 [capability-matrix.md](capability-matrix.md)。
>
> 本文是**排期建议**，不改变各 story frontmatter 中的 `status`；实现时以对应 story 的验收标准（AC）为准。

## 现状快照

| 状态           | 数量   |
| :------------- | :----- |
| ✅ Done        | 70     |
| 🚧 In Progress | 2      |
| 👀 In Review   | 0      |
| 📝 Backlog     | 26     |
| 🚫 Blocked     | 0      |
| **未完成合计** | **28** |

仓库还剩 **28 条**未关闭故事（3 In Progress + 1 In Review + 24 Backlog + 0 Blocked）。

> 口径与 [status-overview 状态汇总](status-overview.md#状态汇总) 一致：YAML `status` 字段 `grep` 推导。
> rxdb-model 实体模型库与三框架 UI 组件集没有故事文件，三框架代码已随 #62 合入；剩下的跨框架对拍、三端对称复核与文档
> 不在故事计数内，登记在[零散收尾项](#零散收尾项不成故事随手可带)第 2～4 条，原规格见
> `git show 41ce2181:specs/002-rxdb-model-port/spec.md`。US-027 / US-028 / US-029 的 UI 侧改动都落在这组包上，
> 一律三端对称交付，见[排期约束](#排期约束)第 4 条。

## 未完成需求全景

下表只列**进了批次或立项池**的未完成故事的「剩什么」与「排期位置」。
[epic-009 BOM 领域模型](epics/epic-009-bom-domain-model.md) 的 19 条整体标价值待证、不进任何批次，
与同标价值待证的 [US-030](stories/core/US-030-declarative-storage-constraints.md) 一起
单独列在[明确不排期](#明确不排期)里，不混进本表。

| Story                                                                                                | 状态           | 剩什么                                                                                                                                                                                                                                                                                                                                                                                                                   | 排期位置 |
| ---------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| [US-211 多端小程序宿主](stories/adapter/US-211-multi-miniprogram-platforms.md)                       | 🚧 In Progress | 阶段 A 已交付（宿主契约 + [可行性矩阵](stories/adapter/miniprogram-platform-feasibility.md)）；阶段 B 已登记抖音（v9 实验在开发者工具与 iOS 全 pass），Taro tt demo 开发者工具走查已通过、iOS 真机走查通过，剩 Android 真机；支付宝 / 百度 / QQ 已判 `unsupported`，阶段 C 支付宝拒绝路径已交（探针在模拟器与 iOS 真机调试复核，判定不变），剩百度 / QQ 的拒绝路径与文档口径                                             | 批次 3   |
| [US-220 Supabase 推送 UPDATE 的落库语义](stories/adapter/US-220-supabase-update-push-semantics.md)   | 👀 In Review   | 实现完成、PR 审核中（[specs/006](../specs/006-us220-update-push-semantics/tasks.md)）；原症状：推送把 UPDATE 当 INSERT … ON CONFLICT 落库，拟插入行要过 NOT NULL、INSERT 与 SELECT 策略：只改部分列在 NOT NULL 列上报 23502（参考 demo 勾选 Todo 即中招），owner 型 RLS 下改自己的行、INSERT 比 UPDATE 窄的表上改别人的行都误报 42501，整批卡住。改走普通 UPDATE，单个 PR，是 US-218 阶段 B 的前置                       | 批次 3   |
| [US-218 Supabase 远端启用 RLS 时的推送完整性](stories/adapter/US-218-supabase-rls-push-integrity.md) | 📝 Backlog     | 未开工；业务表开 RLS 后被策略过滤的删除仍写日志，其它端拉到幽灵 DELETE（SQL 回归 `rls-filtered-delete` 红；连 SELECT 也看不到的行同样中招），`rxdb_mutations` 也不校验日志与业务写是否配对。A 不写幽灵日志 + 配对校验 → B 逐实体回执、被拒实体本地对齐（破坏性契约变更，前置 US-220）→ C 日志表收口与部署指引                                                                                                            | 批次 3   |
| [US-219 Taro 插件一行接入小程序 adapter 的构建配置](stories/adapter/US-219-taro-plugin.md)           | 📝 Backlog     | 未开工；npm 用户今天只能照抄未发布的 demo 构建插件（wasm 拷贝、glue `import.meta.url`、抖音 realm）。A 构建插件 → B 运行时入口 → C webpack5（价值待证）                                                                                                                                                                                                                                                                  | 批次 3   |
| [US-029 多用户 RBAC：角色与所有权写权限](stories/core/US-029-rbac-owner-role-permission.md)          | 📝 Backlog     | 未立项；**价值待证**（[RV-022](reviews/RV-022-us-029-readiness-review.md)：已去掉多租户，仍无具名使用方）。阶段 A / B / D 依赖 US-027 阶段 A / B / C，阶段 C 依赖 US-218                                                                                                                                                                                                                                                 | 立项池   |
| [US-031 树形实体迁移到排序模块](stories/core/US-031-tree-sortable-migration.md)                      | 📝 Backlog     | 未立项；价值待证。树兄弟域按 `parentId` 分组迁到 US-028 排序模块，三端 demo 拖放改用 core API；前置 US-028 阶段 A + D，不新增抽象，今天无可复现症状                                                                                                                                                                                                                                                                      | 立项池   |
| [US-909 会话录制回放与失败现场数据还原](stories/future/US-909-session-replay-debugging.md)           | 🚧 In Progress | 已立项：owner 2026-10-01 决定 A / B / C 全做，B / C 的价值门禁豁免；阶段 A（六个 Playwright 配置的 trace 改为 `retain-on-failure`）已交付，开销上限经 owner 裁决改为 +33%；阶段 B 的传输限制经主线程 IDB 第二连接绕开（spike 2026-10-02 通过，AC#4 经 owner 裁决改为逻辑不变式），实现中；阶段 C 是新包 `rxdb-plugin-replay` 加三框架 Replayer，实现中（独立录制库、体积上限与门面 `commits$` 由 owner 2026-10-02 冻结） | 批次 3   |
| [US-602 发布产物面向 AI 的可理解性](stories/tooling/US-602-ai-comprehensible-artifacts.md)           | 📝 Backlog     | 未立项（立项评审已回写，待 owner 定批次）；A1（语义事实源 + 漂移门禁 + 可运行样例）无硬前置、可单独合并，A2（`@aiao/*` peer 统一，`BREAKING CHANGE`；桥接区间已冻结，合入时点不再受约束 12 牵制）单独关闭，B/C 只吃 A1                                                                                                                                                                                                   | 立项池   |

## 即办清单

不进批次、随手可完成的事：

当前无。上一条「桥接锚点出路由 owner 先定」已于 2026-10-01 定案（出路 1：从 `de70a1a9` 切发布分支、
版本 `0.0.26`、真 merge 并回 `main`，同时修订[约束 12](#排期约束)），见 [release-plan 桥接锚点定案](release-plan.md#桥接锚点定案)；
线 A 已于 2026-10-01 执行完毕，`v0.0.26` 已发布。

## 排期批次

### 批次 3：能力补齐（可并行开 PR）

同一批内的行彼此无依赖，可各开各的 PR；批次之间才是顺序。例外：US-220 与 US-218 须两者 plan 全部完成后再开工，且 US-220 先于 US-218 阶段 B 合入（[约束 16](#排期约束)）。

| 故事                                                                                                               | 为什么排这里                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 关闭判据                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [US-026](stories/core/US-026-instance-sync-override.md) 实例级实体同步配置覆盖（✅ Done 2026-09-27）               | HTTP demo 的前后端仍以两个实体类表达不同同步策略（schema 已共用 `RECIPE_SCHEMA`，重复的是类壳与 `declare` 字段类型），存在可复验的重复；无桥接发布前置。**改动面比标题大**：同步配置由 core（`getEntitySync`、`Repository` 构造、`validateSyncStrategy`、`EntityManager.init()`）与 sync / working-tree / history / search / storage / devtools / http / supabase 共 9 个包直接读取，实例覆盖要收口到单一解析点                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 实例隔离、三框架契约和前后端单类 demo 全部通过                                                                                                                                                                                                                                          |
| [US-217](stories/adapter/US-217-local-database-backup-restore.md) 本地数据库一致性备份与恢复（✅ Done 2026-09-29） | US-207 / US-208 / US-210 都把导入导出与热备份排除在范围外，桌面端唯一路径是退出应用后整目录复制，不是可由应用调用的一致性备份接口；浏览器侧连这条路都没有——DevTools 的数据库下载已被 US-904 作为不安全热拷贝停用，并写明一致性导出须另立故事，即本故事。不依赖工作树 / commit graph，无桥接发布前置。阶段 A 的第一件事是验证 PGlite 的 `dumpDataDir()` 能否满足有界内存、事务一致与原子恢复——故事 INVEST 的 Estimable 未勾就卡在这里                                                                                                                                                                                                                                                                                                                                                                                                                                 | 阶段 A → B → C；一个 PR 只交付一个阶段；尚未交付的组合必须**明确拒绝**备份与恢复，拒绝行为通过测试不等于该组合已支持                                                                                                                                                                    |
| [US-211](stories/adapter/US-211-multi-miniprogram-platforms.md) 多端小程序宿主（建议 P3）                          | Taro 有 `build:alipay/tt/qq/swan`，适配器已登记 `wechat` 与 `douyin`（抖音实验性，Android 未验证），其余平台判 `unsupported`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | B/C 只吃矩阵里 `decision: supported` 的平台（约束 7）；未关闭的阶段不得改支持声明                                                                                                                                                                                                       |
| [US-909](stories/future/US-909-session-replay-debugging.md) 会话录制回放与失败现场数据还原                         | owner 2026-10-01 决定 A / B / C 全做，B / C 的价值门禁豁免（原解锁条件：一次 trace 不够、必须带出失败时刻数据的真实 e2e 失败；写出「今天用户踩得到的具体症状」）。阶段 A 的病灶是实的：五个 web e2e 配置都是 `retries: isCI ? 2 : 0` 叠 `trace: 'on-first-retry'`，本地失败从不产生 trace，CI 只录第一次重试、首次失败那次没有；`rxdb-devtools-extension-e2e` 同样重试却完全不录，六个配置改 `retain-on-failure` 即关，不引入 rrweb；已交付（`screenshots: false`，开销实测 +32.7%，上限经 owner 裁决由 +10% 改为 +33%，B / C 须继续守住）。阶段 B 原定的前提「等 US-217 阶段 B 的 SQLite 共享层导出」不成立：US-217 只交付主线程连接，三个 demo 的 OPFS 专用 Worker 与 IDB SharedWorker 两条分支都返回 `unsupported_combination`（Angular e2e 走 8200 端口强制 IDB）；但 IDB 档的存储与传输无关，同库名的主线程 IDB 第二连接能备份同一个库（spike 2026-10-02 通过） | A → B → C，一阶段一 PR，每个阶段单独 plan；AC#1～3 每个阶段都须继续通过；B 的 spike 不过则另需传输侧备份恢复另立故事（owner 决定）；C 的事件流不得落进默认追踪的版本化域，三框架 parity                                                                                                 |
| [US-027](stories/core/US-027-entity-permission-model.md) 实体操作权限模型（✅ Done 2026-10-03）                    | 阶段 0 的症状踩得到：只读行没有「查看」、详情固定以 edit 模式打开。阶段 A / B / C 病灶数 < 抽象数（程序化误写系统表是潜在风险），owner 决定不等 US-029 立项一并交付，下游 US-029 阶段 A / B / D 依赖的权限类型、判定原语、`PermissionDeniedError` 与 UI 能力派生随之就绪（约束 4）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | 三框架同交；AC#1～16 全 ✅：公开写入口越权抛 `PermissionDeniedError`、批量整批预检、适配器 / 执行器层不判定，三端 `EntityList` 按 `deriveEntityCapabilities()` 派生入口，三端 e2e 绿                                                                                                    |
| [US-220](stories/adapter/US-220-supabase-update-push-semantics.md) Supabase 推送 UPDATE 的落库语义                 | 症状今天踩得到且已复现：本地 UPDATE 的 patch 只含变更列，`rxdb_batch_upsert` 的拟插入行把其余列填成 NULL，参考 schema 的 `todos.title NOT NULL` 直接 23502；拟插入行还要过 INSERT 与 SELECT 策略，owner 型 RLS 下改自己的行、共享编辑表上改别人的行（整行载荷也一样）都误报 42501；远端行已删时则复活一条残缺行。用当前行补齐载荷修不了共享编辑表，落库方式定为普通 UPDATE。连真实数据库的推送 spec 恰好都带了 `title`，demo e2e 只测新建，没拦住。评审 US-218 时发现，无桥接发布前置                                                                                                                                                                                                                                                                                                                                                                                | 单个 PR；普通 UPDATE 的零行生效须区分被拒（42501）与已不存在（另一 SQLSTATE），不得静默成功（AC#4、AC#5）；与 US-218 阶段 A 共用存在性判定原语；与 US-218 的 plan 全部完成后再开工，先于 US-218 阶段 B 合入（约束 16）                                                                  |
| [US-218](stories/adapter/US-218-supabase-rls-push-integrity.md) Supabase 远端启用 RLS 时的推送完整性               | 症状今天踩得到且已复现：`rxdb_mutations` 先写 `rxdb_change` 再删业务行，DELETE 被 RLS 过滤成零行时不报错也不回收日志，推送方和其它端都删掉本地行，远端行仍在；目标行连 SELECT 都看不到时同样如此。该 RPC 还接受不配对的 main 分支日志，只回收客户端直写关不掉伪造删除。适配器的 `rxdb_check_rls` 自检本就引导部署方给业务表开 RLS。出自 RV-022，不依赖 US-029 的任何声明，无桥接发布前置                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 阶段 A → B → C，一个 PR 一个阶段；A 只动参考 SQL，以 `rls-filtered-delete` 与新增用例转绿为门禁；A 单独发布会把幽灵删除变成卡住推送的拒绝，推荐与 B 同版本发布；B 改 `RemoteMergeResult` 契约，过 API 基线并附迁移说明，以 US-220 为前置；与 US-220 的 plan 全部完成后再开工（约束 16） |
| [US-219](stories/adapter/US-219-taro-plugin.md) Taro 插件一行接入小程序 adapter 的构建配置                         | adapter README 把 npm 用户指向 `apps/dev-rxdb-miniprogram/config/`，该目录不随包发布；三个构建前提漏任何一个都在开发者工具或真机上才炸；「npm 安装 + Taro 构建」路径从未被验证。只依赖已 Done 的 US-209 与 US-211 已登记的 `douyin`，与 US-211 剩余阶段无先后                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 不扩大平台支持面（约束 7）：只放行 `weapp` / `tt` + vite，其余构建期报错；阶段 A 以 local-registry 真实安装路径（AC#10）为门禁；阶段 C 价值待证                                                                                                                                         |
| [US-028](stories/core/US-028-sortable-entity.md) 可排序实体（✅ Done 2026-10-03）                                  | owner 确认三端 Todo 列表需要手动排序：四个 todo 页今天按 `[completed, id desc]` 排、没有拖拽，新建只能出现在最前。进行中与已完成各一条序列，正是按 `completed` 分组的排序域。新增抽象至少 5 个，症状来自具名需求而非缺陷，与 US-027 同属 owner 决定的能力补齐。共享 `Todo` 被约 17 个项目引用、supabase demo 以 Full 同步到无 `sortOrder` 列的远端 `todos` 表，直接声明可排序会让远端缺列、让不带 `orderBy` 的查询改序，所以阶段 E 用独立的可排序待办实体。US-027 已交付，重排 API 在开事务前调用 `assertEntityOperationAllowed`（约束 4）；无桥接发布前置                                                                                                                                                                                                                                                                                                           | A → D → E 一阶段一 PR，E 三框架同交、三端 Playwright 真实拖拽后 DB 重查（AC#18），现有 `Todo` 消费方行为不变（AC#19）；B / C 可在 E 之后单独交付，全部阶段完成才关闭                                                                                                                    |

### 线 A：桥接版本发布（owner 门控）

> **✅ 已完成（2026-10-01）**：`v0.0.26` 打在 B = `852f3b20`，经 [#77](https://github.com/aiao-io/rxdb/pull/77) 的
> merge commit `8597bddf` 并回 `main`，34 个包已发到 npm。五条关闭判据全部成立，证据与执行记录见
> [release-plan「迁移发布的关闭条件」](release-plan.md#迁移发布的关闭条件)。下面保留启动前的排期记录。
>
> 线 A 是一次对外的不可逆动作（推 tag + `pnpm publish`），由 owner 手动发起、手动决定时点。
> 线 A 只挡**迁移发布**，不挡任何故事的代码与合入；桥接版本本身的清单 `bridge.tag` 保持 `null`，
> 由下一次 `kind=migration` 发布填成 `v0.0.26`。
> 执行时按 [release-plan.md](release-plan.md) 的执行顺序与两条硬前提走（执行顺序已按出路 1 重写）。

**启动前置**——三项 owner 决定**均已定案**；启动线 A 本身（切分支、临时放开线性历史、推 tag、`pnpm publish`）仍需 owner 逐项确认：

1. **桥接锚点出路（2026-10-01 定案）**：出路 1，从 `main` 上最后一个 schema 3 的提交 `de70a1a9` 切发布分支，
   bump 提交 B 以**真 merge** 并回 `main`、tag 打在 B 上。代价是临时关一次 `main` 的线性历史保护，
   见 [release-plan 桥接锚点定案](release-plan.md#桥接锚点定案)。
2. **[约束 12](#排期约束) 已定案并修订**：US-018 的 `BREAKING CHANGE` 已随 0.0.25 的产物发出，桥接版本的 changelog
   不宣告它；区间内六组**首发**的破坏性改动（writer lease / `RemoteSyncOptions` / US-025 抽包 / 桌面拆包 / 插件作用域 / Supabase 错误类型）则必须如实声明。
3. **显式版本号（2026-10-01 定案）**：`0.0.26`。`--dry-run` 推算出来的是禁用的 `0.0.25`，必须显式传参，
   见[零散收尾项](#零散收尾项不成故事随手可带)第 1 条。

**关闭判据**——发一个 `kind=bridge` 的**非迁移**版本，下面五条**全部**成立才算完（2026-10-01 五条全 ✅）：

- ✅ ① `release.version` = **`0.0.26`**（**≠ `0.0.25`**）。今天清单里的 `bridge/0.0.25` 是 0.0.25 那次发布的如实记录，不是本次成果，
  不许当判据用、不许改写；
- ✅ ② 与 `packages/rxdb/package.json` 同值；
- ✅ ③ `v0.0.26` 打在 B（不是 merge commit）上并已推送，`git merge-base --is-ancestor v0.0.26^{commit} origin/main`
  人工跑过并留证；`main` 的线性历史保护已恢复并用 `gh api` 复查留证；
- ✅ ④ `migration-release-gate --release-tag=v0.0.26` 全绿；
- ✅ ⑤ 回写 [release-plan「迁移发布的关闭条件」](release-plan.md#迁移发布的关闭条件)（US-305 AC14 的绿半边在那里关闭）。

**④ 单独没有区分力**：四条 bridge 钩子只对 `kind=migration` 生效，桥接发布走不到它们。真正有区分力的是 ① 和 ③，
这两条在**发布当下没有任何自动化在守**。另有一条隐含判据：桥接**不得抬升** `RXDB_SYSTEM_SCHEMA_VERSION` /
`RXDB_CHANGE_CODEC_VERSION`。门禁只比对布尔位、从不读源码常量，须按 [release-plan 硬前提 1](release-plan.md) 的
两条 `git log -G` 人工复测（`-S` 恒空、会给出假清白）；区间是 `v0.0.24..B`，在锚点 `de70a1a9` 与 B 上实测均为空。

**启动前必读**：changelog 会同时**多报**（0.0.25 已发内容再写一遍，判断发没发过只能 `npm pack` 拉产物搜）与
**漏报**（squash 进 `chore(aiao): update deps (#53)` 的 US-908 修复与 US-906 交付，以及按[约束 12](#排期约束) 必须声明的六组破坏性改动）；非规范提交信息一律记为 `none`、
等于零 bump 量。区间已冻结在 `de70a1a9`，但发布分支上为跑绿补的提交会进区间，补了就要复测，细则见[零散收尾项](#零散收尾项不成故事随手可带)第 1 条与
[release-plan.md 硬前提 2](release-plan.md)。

### 立项池（待 owner 决策，未进任何批次）

| 故事                                                                                       | 依赖                                                                    | 入场条件 / 建议顺序                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [US-029](stories/core/US-029-rbac-owner-role-permission.md) RBAC：角色与所有权写权限       | 阶段 A / B / D 依赖 US-027 阶段 A / B / C，阶段 C 依赖 US-218（约束 4） | **价值待证**（[CONVENTIONS](CONVENTIONS.md#价值待证)），`priority: Low`，经 [RV-022](reviews/RV-022-us-029-readiness-review.md) 评审后**移出多租户**，只做写授权：`access.owner` 声明、`roles` 与一实例一身份、角色 / 所有权谓词、测试 RLS fixture、三框架能力派生，新增抽象 5 项、已知病灶 0。同步实体不限读（`rxdb_change` 不受业务表读策略约束），限读数据走 remote / QueryCache。评审中复现的真实病灶（RLS 下的幽灵 DELETE）与权限无关，已拆为 US-218 进批次 3。**解锁条件**：出现具名多用户使用方，并写出今天踩得到的症状                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| [US-031](stories/core/US-031-tree-sortable-migration.md) 树形实体迁移到排序模块            | US-028 阶段 A + D                                                       | **价值待证**，`priority: Low`。不新增抽象，收益是删掉三端 demo 22 个文件里的重复算键与三份 `sortOrder` 比较器、让树写入获得事务边界与锚点校验；比较规则已在应用内统一，键碰撞 / 邻居失效导致的错位未复现。**解锁条件**（同时满足）：US-028 阶段 A 与 D 已交付；且 demo 树拖放出现可复现的错序 / 键碰撞缺陷，或有外部调用方需要树实体经排序模块写入。`rxdb-test` 四个树实体的 `sortOrder` 改非空并按父节点回填；`ISortableTreeEntity` 是否收窄为非空（破坏性，走 api-baseline）留 plan 定                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| [US-602](stories/tooling/US-602-ai-comprehensible-artifacts.md) 发布产物面向 AI 的可理解性 | 无硬前置                                                                | A1（语义事实源 + 漂移门禁 + 可运行样例 + 入口 TSDoc）独立可交付；A2 消除兄弟包声明的不一致——最显眼的是一处三框架不对称：`rxdb-react` / `rxdb-vue` 把 `@aiao/rxdb` 放 `dependencies`（`workspace:*`），`rxdb-angular` 放 `peerDependencies`（`*`）。已定案：`@aiao/rxdb` 一律进 `peerDependencies`、写 `workspace:^`，提交标注 `BREAKING CHANGE` 并在 `website/docs/migration/v1.md` 留迁移说明；关系图登记边界是门禁范围（`packages/*`），`rxdb-test` 以 tool 层进图；投递边界是最近 `v*` tag 树（今 34 个包），B/C 不给未发布包安装命令；`listPublicPackages()` 仍只管 API 基线范围。**A2 是真正首发的破坏性改动**，验收在工作区外用真实 tgz 做 npm / pnpm 隔离消费，但合入时点已不受[约束 12](#排期约束) 牵制：桥接区间冻结为 `v0.0.24..de70a1a9`（[桥接锚点定案](release-plan.md#桥接锚点定案)），之后合入 `main` 的提交进不了桥接版本，它的 `BREAKING CHANGE` 随其后的迁移发布声明。B（站点 `llms.txt`）/ C（主包单份 Skill）只吃 A1 的事实源。随包 Skill 的生态约定尚未统一（antfu/skills-npm 按 `skills/` 目录发现、onmax/npm-agentskills 用 `agents.skills`，字段与命令不可互换），C 开始前锁定一个 exporter 做探针，定位为低成本期权，探针失败按「C 延期」关闭，不构成 A1/A2/B 的前置 |

### epic-006 评审顺延的架构项

epic-006 两份评审报告（`next-0912` 与 `review` 分支复核）收口时顺延的架构项，不挡 epic-006 任何故事关闭。
**每一项的判据、修法与「不做的理由」都写在对应代码的 TSDoc 里**，这里只登记「它挡着什么」和「谁来定」。
两份报告都已删除，代码注释是唯一副本。

| 项                                                                                | 挡着                                                                                                                                                                           | 前置决策 / 判据位置                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 提交图校验的「最后已验证 HEAD」水位（BFS 剪枝）＋ `list-commits` 的按分支派生结构 | 每次 commit / discard / restore / 切分支都全量重哈希整张可达图，O(N)                                                                                                           | **这是一次规格变更，不是性能重构**：剪枝直接违反 [US-305](stories/collaboration/US-305-commit-graph-head.md) FR-051「MUST 遍历**完整**可达父链」与原规格 SC-013「可达祖先损坏时三条入口各自报 `commit_graph_corrupted`」（`git show f9528e8f:specs/001-working-tree-commits/spec.md`），要先改 US-305 的 FR-051 与 epic-006 的验收。两条共用同一份 ref 状态，必须一起做。判据见 `packages/rxdb-plugin-working-tree/src/commit/commit-graph-guard.ts` 与 `commit/list-commits.ts` 的 `@remarks` |
| `IRepository` 要不要长出聚合能力（`GROUP BY` / `COUNT`）                          | `working-tree/status.ts` 的两次顺序 `COUNT(*)`                                                                                                                                 | core ↔ plugin 公开面决策。另一条路（插件走 `executor.query()` 裸 SQL）会是本插件第一处生产裸读，方言返回类型与列名大小写不一致、测试替身只认结构化查询。判据见 `status.ts` 的 `readOriginBreakdown` `@remarks`                                                                                                                                                                                                                                                                                 |
| 跨后端公共层落在哪个包 ＋ 语句收集协议统一（数组 vs `---STATEMENT_SEPARATOR---`） | 两个 `version/switch-result.utils.ts`、两个 `version/switch_branch.ts`、两处 `ensureBranchActiveKey`                                                                           | 两个适配器互不依赖，公共层放任一端都新增跨适配器边；核心拥有方言 SQL 等于让核心知道方言。**抽完只剩骨架**（类型口径、绑定与批量、值编解码、客户端协议四处都是方言原语），判据逐条写在这四个文件的 `@fileoverview` / `@remarks` 里。合一之前**任何改动必须两端同改**                                                                                                                                                                                                                            |
| `activeKey` 改由 schema 表达（生成列或 `WHERE activated` 部分唯一索引）           | 约 10 处生产写点手工共写 `activated ? '*active*' : null`                                                                                                                       | 要动 6 个适配器的 system schema 迁移并给既有库写迁移步骤；只改写点不改 schema 等于把十处手写换成十处调用。判据见 `packages/rxdb/src/system/branch.ts` 的 `RxDBBranch` `@remarks`                                                                                                                                                                                                                                                                                                               |
| 适配器长出「批量取现存表名」的公开能力                                            | `RxDB.ts` 每次 `connect()` 十几次顺序 `isTableExisted` 探测                                                                                                                    | 一次适配器公开面扩张（6 个后端两种方言各一遍），且落在全仓都走的连接路径上。判据见 `#ensureSystemTables` 的 `@remarks`                                                                                                                                                                                                                                                                                                                                                                         |
| 物化 staging 页 payload 的加密信封校验                                            | 来源方把加密列交成明文时，明文照样落进 `rxdb_working_tree_materialization_page.payload`；失败 / 中断的 attempt 刻意不删，残留到调用方 `discardMaterializationAttempt` 为止     | 本模块不认识业务实体、分不出哪一格该是加密包，校验只能落在来源方的 `projectPage` 一侧或快照来源的登记处；今天来源是同步插件自动登记的那一个，页里是远端变更记录的原样 patch。判据见 `packages/rxdb-plugin-working-tree/src/working-tree/working-tree-materialization-page.entity.ts` 的 `payload` `@remarks`，门禁边界见 `git show f9528e8f:specs/001-working-tree-commits/threat-model.md` §7                                                                                                 |
| `WorkingTreeEntry.fingerprint` 要不要从 FNV-1a/32 换成 SHA-256                    | 今天不挡——没有生产代码比较这一列（US-308 交付的冲突检测也不读它）；有消费者按身份逐对比较之后才生效，误判相等约 2⁻³² / 对                                                      | 由首个比较这一列的消费者定。代价是捕获热路径上每次写多算一遍纯 JS 摘要、列宽 8 → 64 位；同步的 `sha256Hex` 现成，不需要异步也不需要新依赖。判据见 `packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts` 的 `fingerprintOf` `@remarks`                                                                                                                                                                                                                                        |
| 活 count 查询的刷新成本                                                           | 热表上每一条命中 where 的 CREATE / REMOVE 与跨 where 边界的 UPDATE 都打一次整表 `COUNT`；`refresh$` 走 `switchMap`，只丢弃过时那一轮、不合并刷新                               | count 结果没有 id 级基线，本地 ± 调整不安全；要降成本得先给 count 结果配一个能与事件对齐的水位，或者给刷新加合并窗口。判据见 `packages/rxdb/src/query/merge_create.ts` 的 count 分支注释                                                                                                                                                                                                                                                                                                       |
| 同步跳过的远端分支没有持久标记                                                    | 远端不修，`invalid-id` 的分支连同它的子孙每轮重拉、重跳，一直占位                                                                                                              | 要不要记「已知坏行」、记在本地还是只上报，由同步层定；调用方今天已能用 `SyncBranchesResult.skipReasons` 区分会自愈的跳过与永久跳过。判据见 `packages/rxdb-plugin-sync/src/sync-branches.ts` 的 `skipped` TSDoc                                                                                                                                                                                                                                                                                 |
| supabase 只把 main 的变更落实体表                                                 | 在 feature 分支上激活时的编辑推上去只留 `RxDBChange` 记录、不进实体表，与本地「任意分支可激活」的语义不一致                                                                    | 先定服务端按什么判定「激活」（按连接、按用户还是全局）。判据见 `packages/rxdb-adapter-supabase/src/supabase.merge-changes.ts` 的 `isMainBranch` 注释                                                                                                                                                                                                                                                                                                                                           |
| UPDATE 门控在实体缓存未命中时判不出 where 跨界                                    | 他 tab 转来的增量 UPDATE 落到没缓存该实体的 tab（只挂 count 的 tab 最典型）时，复合 where 的其余字段两侧同为缺失：count 跨界与 find 系的「新匹配」都判不出来，结果静默停在旧值 | 修法二选一：门控改判「where 用到的字段是否齐全」，或跨 tab 事件改带整行。「缓存命中与否」当不了判据——未命中时 `serialize` 会把残缺实体写进缓存。判据见 `packages/rxdb/src/query/need_refresh_update.ts` 的 `count_boundary_crossed` 注释                                                                                                                                                                                                                                                       |

## 零散收尾项（不成故事，随手可带）

1. ✅ **线 A 启动前先跑 `nx release version --dry-run` 看真实版本号**（2026-10-01 已随[线 A](#线-a桥接版本发布owner-门控)执行，下次发布仍适用）。
   几条坑与处置（区间已冻结为 `v0.0.24..de70a1a9`；发布分支上补了提交就要复测）：

   - **默认推算出来的就是 `0.0.25`**——正好是线 A 关闭判据 ① 的禁用值，且 npm 上已被占用。
     specifier 解析成 `minor`，但 nx 的 `adjustSemverBumpsForZeroMajorVersion` 默认 `true`，
     major 为 0 时把 `minor` 降级成 `patch`，于是 `0.0.24 → 0.0.25`。**线 A 必须显式指定版本号**，
     已定案为 `0.0.26`。机制与命令见 [release-plan.md 硬前提 2](release-plan.md)。
   - **`preVersionCommand` 红了就跑不到版本计算**，只报一句 `The pre-version command failed`。
     `code-editor-angular:build` 会因本机 `node_modules` 残留 codemirror 旧副本而红
     （lockfile 是干净的，属安装态漂移）；`pnpm install --frozen-lockfile` 会跳过，需要加 `--force`。
     别把这种红误读成「没有可发布的变更」。
   - 区间（桥接定案后固定为 `v0.0.24..de70a1a9`）**包含已随 0.0.25 发布过的内容**，changelog 会再写一遍，定稿前需人工裁剪
     （[release-plan.md 硬前提 2](release-plan.md) 的 ②）。
     判断「发没发过」**不能看 tag 祖先链**——`v0.0.25` 的 tag 树与已发布产物对不上，
     唯一可信口径是 `npm pack` 拉产物搜，见 [release-plan.md 版本漂移开项第三条](release-plan.md)。
   - **同一份 changelog 还会漏报**：`f4e0778 chore(aiao): update deps (#53)` 是一次 squash 合并，
     标题写升级依赖，实际带走的是 [US-908](stories/future/US-908-devtools-transfer-session-defects.md)
     的**两条缺陷修复**与 [US-906](stories/future/US-906-electron-devtools-developer-path.md) 的交付。
     标题是 `chore`，这两条 `fix` 既不贡献 bump 也不进 Bug Fixes。该提交已推送**不得重写**，
     只能在 changelog 生成后人工补写。**多报和漏报要一起过**，细则见 [release-plan.md 硬前提 2](release-plan.md) 的 ② 与 ④。
     US-018 是反方向的一条：自动 changelog 里本来没有它，补漏报时也不补，定案见[约束 12](#排期约束)。

2. **rxdb-model 跨框架对拍补上「查看 / 编辑已有记录」**（T049）。三个 e2e 应用跑的是同一份
   `entity-model.spec.ts`（Angular 那份只多一行注释），已覆盖目录切换、新建对话框、undo / redo 与筛选；
   缺的是在表单里查看与编辑一条已有记录。VTable 的行画在 canvas 上、DOM 定位不到，先要定一个 DOM 可达的入口，
   再三端同改。
3. **rxdb-model 三端对称复核**（T050）：对 `rxdb-model-angular` / `-react` / `-vue` 跑一遍
   `.claude/skills/tri-framework-check`，核对命名、签名与行为。
4. **rxdb-model 文档页**（T051）：`website/docs/` 还没有 rxdb-model 的使用文档
   （`grep -rl rxdb-model website/docs | grep -v /api/` 无输出），补核心、三框架用法、样式接入与迁移说明。
5. **Angular 绑定包的 `@angular/*` peer 被钉成精确版本**。`0.0.26` 的 `rxdb-angular` / `rxdb-plugin-search-angular` /
   `code-editor-angular` 发出去的 peer 是 `"22.1.6"`，`0.0.25` 是 `^22.0.0`——消费者装 22.1.7 起即报 peer 冲突。
   源头在各包 `package.json` 的 `peerDependencies`，改回 caret 区间随下一次发布生效。
6. **`dev-rxdb-tauri-e2e` 的 `devtools-provider-gear.spec.ts`「fake 档 expired 场景」偶发失败**。
   `fake-provider-gear.ts` 的 `createScenarioClock` 把空闲计时器设成 `setTimeout(…, 0)`，与下一次分页请求竞态（#58 引入）；
   线 A 的 PR 上重跑才过。修法是让场景时钟由测试显式推进，而不是赌事件循环顺序。
7. **`ci / benchmarks` 缺 Xeon 8370C 的参考档**。该 CPU 上报 `benchmark_environment_mismatch`，线 A 的 PR 上重跑两次才落到
   有档的机型；按 epic-006 的规则，同一机型再出现就冻结一份新档（`benchmarks/reports/working-tree-reference/`）。
8. **待评估：`mutations()` 直写路径的 UPDATE 语义**。[US-220](stories/adapter/US-220-supabase-update-push-semantics.md)
   只改推送路径（`mergeChanges`），`RxDBAdapterSupabase.mutations()`（仓库 `save()` 直写）仍把 `options.update` 的整实体放进
   `p_upserts`，走 `INSERT … ON CONFLICT`。**推断**：owner 型与共享编辑型 RLS 上同样会误拒（US-220 症状 2、3）；
   先在这两种策略上各写一条复现，再决定是否立项。
9. **待评估：SQL 安全回归接入 nx target / CI**。`packages/rxdb-adapter-supabase/src/__tests__/run-supabase-sql-security-regressions.sh`
   今天只能手跑（需要本机 `supabase-db` 容器），CI 不跑，参考 SQL 的回归只靠 PR 作者自觉。US-220 新增的 `update-*` 与
   `existence-probe` 用例同样如此；`rls-filtered-delete` 按设计红到 US-218 阶段 A，接入时须先定「已知红」的登记方式，
   不能让整个 target 恒红。来源：[US-220 quickstart](../specs/006-us220-update-push-semantics/quickstart.md) 末注。

第 5～7 条是线 A 执行时发现的后续项。第 2～4 条的原任务清单见 `git show 41ce2181:specs/002-rxdb-model-port/tasks.md`（T049～T051）。

## 排期约束

1. US-012 已 Done。其 DTO 不得重新定义 `bigint/binary` 的值 wire codec——该不变量随 DTO 发布而永久成立。
2. US-207 已锁定 Electron SQLite 的真实连接语义并抽出共享桌面 host 契约
   （`rxdb-adapter-sqlite-core/desktop-host` 子路径，US-208 / US-210 复用）。「无法保证单连接事务时应
   fail-fast、不得降级成伪事务」作为长期铁律保留，对所有复用该契约的后端同样成立。
3. US-208 事务方案**已冻结**为「IPC 事务 ID 协议」（「adapter 完整托管在主进程」因接口面随业务事务数线性
   增长、且崩溃后事务仍照跑照提交被否决）；US-210 事务方案**已冻结**为「Rust command 持有
   `rusqlite::Connection`」（「配置单连接池」因 `sqlx` 池连续调用可能落在不同物理连接被否决）。
4. **权限链的顺序**：US-027 阶段 A 先于 US-029 阶段 A，US-027 阶段 B（公开写入口判定与 `PermissionDeniedError`）先于 US-029 阶段 B，US-027 阶段 C 先于 US-029 阶段 D；US-218 先于 US-029 阶段 C（日志由真实生效的写推导、逐实体回执都由 US-218 交付，US-029 只在其上追加 owner / 角色策略 fixture）。US-028 不受 US-027 阻塞（后者已交付），但重排不会被自动覆盖：
   重排在主适配器事务内经执行器写，属 US-027 不判定的那一层，US-028 的重排 API 须在开事务前显式调用 `assertEntityOperationAllowed(…, 'update')`；UI 侧由阶段 C 的 `_readonly` 派生关手柄。三条故事的 UI 侧都落在
   rxdb-model 三框架包上，一律三端对称交付——`rxdb-model-react` / `rxdb-model-vue` 与 Angular 端同时存在，
   不接受只交 Angular。
5. US-305 的提交竞争只使用领域 `headRevision` CAS，不引入 writer lease 或迁移 epoch。US-305 的
   schema migration 前必须从当前发布主线产生新的有效 bridge ancestor；历史 `v0.0.25` 已脱离当前 ancestry；`main` 自 #55 起已是 schema 6，
   锚点定为 #55 之前的 `de70a1a9`，见 [release-plan 桥接锚点定案](release-plan.md#桥接锚点定案)。
6. 搜索改动复用现有搜索公开 API 和跨框架 parity fixture，不为某个后端借用另一后端专属的 fallback
   （US-703 的 PGlite 全文搜索按此交付）。
7. **小程序路径的能力上限**（US-209）：WAL、多页面并发、崩溃恢复保证在微信路径上不得扩大；
   文档一律写「实验性」。**平台集合**的扩展由 US-211 认领：宿主契约与可行性矩阵已就位；
   阶段 B/C 只吃矩阵里 `decision: supported` 的平台，未关闭的阶段不得改公开支持声明。
8. **epic-008（生命周期作用域）追加故事的准入**：每一条都必须写出「今天用户踩得到的具体症状」才允许排期，
   写不出就留在 Backlog，判据细则见约束 9。`IRxDBPlugin` 的成员签名由类型契约测试守住，
   不扩大 epic-007 的范围。
9. **过度设计判据，不是建议。** 进入 epic-008 的两条要同时满足：是「资源获取与释放拆成两处」的问题，
   且能写出今天用户踩得到的具体症状。**状态变量复位不算病灶**——`#shutdown()` 里 `#transaction_stack = []`、
   `#connected_sub.next(false)` 这类复位，作用域原语按定义碰不到。
10. **HTTP 适配器（US-212）按 `stable` 发布，与 US-020 之间没有门禁**（包本体不标 `experimental`，
    只有 `changeFeed` 标实验性）。协议不变量是硬的：HTTP 是独立 `adapter:remote`，sqlite 是独立
    `adapter:local`，**禁止 HTTP 内部拥有 sqlite**；v1 changelog 方法（`pullChanges` / `mergeChanges` /
    `getChangeCount`）必须 throw unsupported，**不得假空**；`pullChangesBatch` 是 optional 成员，调用点做
    特性探测，不实现即可，实现了也不得返回空数组。
11. **HTTP 适配器与 epic-006 的关系由一条结构隔离不变量表达**：
    > **US-212 MUST NOT 实现或调用 `upsertMany()` / `deleteByIds()` / `getMetadataByIds()`，
    > MUST NOT 持有任何 `QueryCacheLocalAdapter`，构造函数 MUST NOT `new` 任何本地存储。**
    > 该不变量由 US-212 阶段 A 的 AC#19 契约测试冻结。SC-004 漂移扫描（`pnpm audit:callsite-drift`）
    > 递归扫整个 `packages/`，HTTP 包在其核对范围内。
12. **线 A 的桥接版本如实声明区间内的破坏性改动（2026-10-01 修订）。** 原文是「桥接版本不得对外宣告破坏性改动」，
    理由是「只做迁移锚点」的版本带着 `BREAKING CHANGE` 是错误的对外信号。它在**任何锚点上都满足不了**：
    `v0.0.24..de70a1a9` 里已有六组首发的破坏性改动（`@aiao/rxdb` 导出删除：writer lease 16 个 / `RemoteSyncOptions` / US-025 抽包 13 个；包级：桌面拆包 / 插件作用域 / Supabase 错误类型），
    都在锚点之前就进了 `main`，自动 changelog 却一字不提（区间内没有 `!` 或 `BREAKING CHANGE:` 脚注）。
    owner 定案修订为：**桥接区间可以带锚点之前已在 `main` 上的破坏性改动，但定稿 changelog 必须逐条声明并附迁移说明**；
    悄悄发出去比声明更糟。桥接的硬不变量仍然只有一条：**不抬系统版本常量**（[release-plan 硬前提 1](release-plan.md)）。
    判据是发布区间的提交范围，不是故事状态；区间已冻结为 `v0.0.24..de70a1a9`，此后合入 `main` 的破坏性提交
    （如 [US-602](stories/tooling/US-602-ai-comprehensible-artifacts.md) 阶段 A2）进不了桥接版本，随其后的迁移发布声明。
    六组的名字、去向与迁移页见 [release-plan 约束 12 修订](release-plan.md#约束-12-修订破坏性改动如实声明)。

    **US-018 这一条已触发，已定案：桥接版本的 changelog 不宣告它。** 三个事实同时成立：
    ① US-018 的破坏性实现（`unsupportedDefaultFactory`）落在 `a63321c`，**在 `v0.0.24..main` 区间内**；
    ② 它**已经随 `0.0.25` 的产物发出去了**——`npm pack @aiao/rxdb-client-generator@0.0.25` 拉下来的包里
    含该实现。注意 `git merge-base --is-ancestor a63321c v0.0.25^{commit}` 为 **false**，据此会得出
    「尚未发布」的**错误**结论，原因是 tag 树与已发布产物对不上（见
    [release-plan.md 版本漂移开项第三条](release-plan.md)）；
    ③ `a63321c` 的提交信息只有一行 `feat(rxdb): 添加 rxdb-adapter-http 适配器 (#39)`，没有 `!` 也没有
    `BREAKING CHANGE:` 脚注，而 nx 只凭这两处判破坏性（`nx/dist/src/command-line/release/utils/git.js` 的
    `isBreaking`）：自动生成的 changelog 里**没有** US-018 的条目，也不因它抬 bump；它生成的是 HTTP 适配器那一行，
    `@aiao/rxdb-adapter-http` 从未发布过（`npm view @aiao/rxdb-adapter-http versions` 返回 404），那一行是真新增，照留。

    所以桥接版本不会把这条破坏性改动首次推给用户，自动生成的 changelog 也不会宣告它；唯一会把它写进去的是
    [release-plan 硬前提 2](release-plan.md) ④ 的人工补漏报——`a63321c` 的标题恰好盖住了 US-018，补漏报时最容易顺手补上。
    **定案：④ 不补 US-018。** 另两条出路否决：当成新变更再宣告一次，是把假事实写进公开记录；
    把该提交移出发布区间，要改写已推送历史或 revert。
    **执行**：owner 在 changelog 生成后、发布前核对——没有 US-018 / `unsupportedDefaultFactory` 的破坏性条目，
    `a63321c` 的 HTTP 适配器那一行保留；留证为定稿 changelog 的相应片段与
    `npm pack @aiao/rxdb-client-generator@0.0.25` 产物里 `unsupportedDefaultFactory` 的 grep 输出。
    **不得**以「tag 祖先链显示未发布」为由把 US-018 当漏报补回去。

13. **US-213 暴露的协议缺陷不在该故事内修。** 若参考后端按文档逐字实现后暴露出协议本身不自洽，US-213
    MUST NOT 改 `src/`、也 MUST NOT 改参考后端去迁就客户端。处置是：该用例标 `it.fails` 或单列
    `describe.skip`，在故事里记为「协议缺陷 → 另开 US」，由新故事带着自己的 breaking-change 与迁移表走
    发布流程。本条对后续接入方仍然有效。
14. **US-214 同样不改 `src/`，唯一例外是 `http-protocol.md` 的「跨源（CORS）」一节**：那**不是改协议**，
    是把一个客观存在、只是没写下来的浏览器前置补进文档，且**只增不改**。demo 后端的 `__control/*` 是演示
    开关**不是协议的一部分**，MUST NOT 出现在 `http-protocol.md`。
15. **Electron 打包里凡被 esbuild 标成 `external` 的运行时包，MUST 声明进
    `apps/dev-rxdb-electron/package.json` 的 `dependencies`**（不是 `devDependencies`）。
    electron-builder 26 只走 **production** 依赖图收集 node_modules（`pnpm list --prod`；回退遍历
    也只读 `dependencies` + `optionalDependencies`），放错位置在本机 dev 与 Linux/macOS 打包下都
    碰巧能跑，**只在 Windows 产物里**炸成 `Cannot find module '<包名>'`。防回归已就位：
    `desktop-sqlite-bridge.spec.ts` 两条单测把搬运清单同时钉在 `dependencies` 与 esbuild 的 `external` 上，
    三者任一处漂移即红。本条**不随 US-208 关闭而失效**，对后续每一个新增 external 依赖同样成立。
16. **US-220 与 US-218 的 plan 全部完成后再开工；合入时 US-220 先于 US-218 阶段 B。** 两者同在批次 3，但不是互相独立的两行：
    - **开工**：US-220 与 US-218（阶段 A～C）都要先完成 plan，任何一方都不提前写代码。两者都要在零行生效时区分「被 RLS 拒绝」与「行已不存在」，
      判定都须绕开调用方 RLS，只交付一个判定原语；US-220 的「已不存在」SQLSTATE 又是 US-218 阶段 B 错误分类的输入。这几处拆开定会返工。
    - **合入**：US-218 阶段 B 要把被拒原因暴露给用户，UPDATE 按 INSERT 语义落库带来的 23502 / 误报 42501 不先修掉，会被当成真实拒绝标成 rejected。
      US-218 阶段 A 与 US-220 之间不定先后；US-220 不得把「UPDATE 被拒即抛 42501」退化成静默零行。

## 明确不排期

| 项                                                                                            | 判定                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `US-016` 连接纪元与停机收敛                                                                   | **不排期，不再解锁**——原症状由 US-015 阶段 A 覆盖，剩余的资源降级路径已按 bugfix 补齐                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `US-017` 三框架宿主作用域                                                                     | **不排期**。三端各自已有原生作用域（Angular `DestroyRef` / React `useEffect` cleanup / Vue `onScopeDispose`）。**解锁条件 = 三端任一出现可复现的清理泄漏**                                                                                                                                                                                                                                                                                                                                                                            |
| US-212 AC#30 行缓存 eviction                                                                  | **不在 US-212 范围内**。执行面只有 core 有、HTTP 包按约束 11 的结构隔离碰不到。**解锁条件 = 出现可复现的缓存膨胀症状（具体实体 + 量级）**                                                                                                                                                                                                                                                                                                                                                                                             |
| `npm deprecate @aiao/rxdb-adapter-desktop`（US-207 E6）                                       | **判定不做**。`@aiao/rxdb-adapter-desktop@0.0.25` 保留在 registry 上，未来仍可更新；迁移路径由 `website/docs/migration/desktop-split.md` 指路                                                                                                                                                                                                                                                                                                                                                                                         |
| `packages/rxdb-adapter-tauri/rust/` 发 crates.io                                              | **本轮不发**（US-210 T7，`publish = false`）。README 已写清 path / git 依赖的用法与限制                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 桌面安装包（installer / bundle）的自动化验证                                                  | **人工验收，不排自动化**。`release-desktop.yml` 跑 `tauri build --ci --no-bundle`，只验编译与 smoke、不产安装包；装包能否安装启动由人工过一遍                                                                                                                                                                                                                                                                                                                                                                                         |
| 受信写调用点漂移门禁改用 AST（epic-006 评审顺延项）                                           | **判定不做**。收益与代价不成比例：要给一条秒级 pre-commit 门禁配一份覆盖全仓的类型化 Program。扫描器的三张词表每次运行前都与 `TrustedWritePrimitive` / `METHOD_NAMES` 机械对照，已知失败形态都会报红而不是静默。**解锁条件 = 给出一处现有词法判据放过、AST 能拦住的实例**。全部失败形态见 `scripts/audit/working-tree-callsite-drift.mjs` 的文件头注释                                                                                                                                                                                |
| [epic-009](epics/epic-009-bom-domain-model.md) BOM 领域模型全 19 条                           | **整条 Epic 不排期**，全部 `priority: Low`。约 15 项新增抽象对应**零个已知病灶**，不满足 [CONVENTIONS 价值待证](CONVENTIONS.md#价值待证) 的「病灶数 ≥ 抽象数」判据。**解锁条件 = 出现真实驱动场景**（拿到客户 BOM 数据，或有 BOM 应用要上线）。解锁后先拿真实样本复核默认决策，见 [epic-009 解锁前须先处理](epics/epic-009-bom-domain-model.md#解锁前须先处理)。逐条：US-507 / US-508 / US-510 / US-511 / US-512 / US-513 / US-514 / US-515 / US-516 / US-517 / US-518 / US-519 / US-520 / US-521 / US-522 / US-523 / US-524 / US-525 |
| [US-509](stories/plugin/US-509-bom-dag-cycle-detection.md) DAG 约束与环路检测下沉存储层       | **不排期，解锁条件与 Epic 其余各条相同**——它没有脱离 BOM 场景的独立病灶。`@aiao/rxdb-plugin-graph` 允许成环与自环是既定语义（循环交易检测与自环都有用例钉住），读侧由 `query_graph_sql.ts` 的 `cycle` 判定与 `GRAPH_MAX_PATH_EXPANSIONS` 上限保证终止；「写入期拒绝成环」是 BOM 的领域约束，不是图插件的缺陷。首轮切片只验收它的部分 AC：AC#2 等 US-030 阶段 A 的 CHECK，AC#4 等 US-513 的 `flow_direction`，AC#8 等 US-510 阶段 B，AC#13 等真实 PostgreSQL 环境                                                                      |
| [US-030](stories/core/US-030-declarative-storage-constraints.md) 实体元数据层的声明式存储约束 | **不排期，但解锁条件低一档**——从 epic-009 拆出，归 [epic-004](epics/epic-004-future-features.md)。四类引擎缺口今天确实不存在（`EntityMetadataOptions` 无 CHECK 落点，`EntityIndexMetadataOptions` 自有字段只有 `properties` 与 `normalized`，`unique` 来自继承的 `IEntityObject`），但当前消费方全是 BOM 故事，无独立病灶。**解锁条件 = 任意一条需要「不变量在存储层成立」的故事**，不限 BOM 场景                                                                                                                                     |
| [US-524](stories/plugin/US-524-routing-master-model.md) 工艺路线本体                          | **不排期，解锁条件与 Epic 相同**。它是 [US-514](stories/plugin/US-514-bom-cost-rollup.md) 的硬前置（加工项的 `setup` / `run` / `rate` 只来自路线本体），也是 [US-520](stories/plugin/US-520-bom-routing-operation.md) 的前置（阶段 A 先行）；路线一律落在本仓，不存在「外部系统提供」的半支持态。解锁后排在 US-520 与 US-514 之前，不在首轮切片内                                                                                                                                                                                     |
| [US-525](stories/plugin/US-525-bom-end-to-end-demo.md) BOM 端到端 demo                        | **不排期，且不得反过来当解锁依据**——demo 需要插件先存在，拿它论证 Epic 该启动是循环论证。它不新增抽象，是解锁**之后**首轮切片的验收手段。**解锁条件 = epic-009 已解锁且首轮切片开工**                                                                                                                                                                                                                                                                                                                                                 |

## 建议补充的验收维度

- **故障恢复**：迁移者、桌面 host 或搜索索引初始化中途崩溃后，重试结果必须可预测且不可产生半状态。
- **能力矩阵**：SQLite family、PGlite、Electron、Tauri、Angular、React、Vue 的支持/不支持组合必须在 story 和公开文档中显式列出。
- **发布门禁**：新增公开 API 同步更新 API baseline、TSDoc、覆盖率门禁和跨框架 parity 测试。
- **可观测性**：连接、迁移、索引回填失败应提供稳定错误码和可诊断上下文，不静默回退到 memory、OPFS 或 IndexedDB。
