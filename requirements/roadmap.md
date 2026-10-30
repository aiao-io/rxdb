# 路线图（Roadmap）

> 本文回答下一步顺序、前置与当前准入条件，是排期建议，不改变 story 的 YAML 状态。
> 状态见 [status-overview](status-overview.md)，当前能力见 [capability-matrix](capability-matrix.md)，发布执行见 [release-plan](release-plan.md)。

## 现状快照

| 状态           | 数量   |
| :------------- | :----- |
| ✅ Done        | 105    |
| 🚧 In Progress | 2      |
| 👀 In Review   | 5      |
| 📝 Backlog     | 9      |
| 🚫 Blocked     | 0      |
| **未完成合计** | **16** |

仓库还剩 **16 条**未关闭故事（2 In Progress + 5 In Review + 9 Backlog + 0 Blocked）。
数字由 story YAML 推导；Backlog 包括已授权任务与价值待证候选，不能把全部未关闭故事都当作可开工项。

## 未完成需求全景

| Story                                                                                                                                                                                                                              | 状态           | 剩什么                                                                  | 排期位置   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------- | ---------- |
| [US-032](stories/core/US-032-cross-tab-update-live-query.md)                                                                                                                                                                       | 👀 In Review   | 改了读取列而缓存补不齐时回 SQL，核心与真实双连接回归通过；待代码评审 | 独立核心 PR |
| [US-223](stories/adapter/US-223-supabase-mutations-update-semantics.md) / [US-224](stories/adapter/US-224-supabase-cascade-delete-change-log.md)                                                                                   | 👀 In Review   | 直写 UPDATE 返回服务器最终行、级联删除写完整隐式日志已实现；待代码评审 | 批次 3 |
| [US-211](stories/adapter/US-211-multi-miniprogram-platforms.md)                                                                                                                                                                    | 🚧 In Progress | 按平台矩阵核对剩余设备验证、demo 走查与公开支持边界                     | 批次 3     |
| [US-219](stories/adapter/US-219-taro-plugin.md)                                                                                                                                                                                    | 👀 In Review   | 当前 Taro 版本的外部安装与开发者工具验收证据                            | 批次 3     |
| [US-518](stories/domain/US-518-bom-unit-lot-effectivity.md) / [epic-009 BOM](epics/epic-009-bom-domain-model.md)                                                                                                                   | 🚧 In Progress | 既有功能已实现；新增 AC#12 的空批次集合写入拒绝与兼容性验收             | 批次 4     |
| [US-528](stories/domain/US-528-admin-consumer-example.md)                                                                                                                                                                          | 👀 In Review   | 仓外发布 tarball 消费与按文档独立重搭；workspace 证据不能替代           | 批次 5     |
| [US-403](stories/ui/US-403-entity-components-headless.md)                                                                                                                                                                          | 📝 Backlog     | 按现有公开逻辑与 #152 列表能力界定入口/依赖隔离，保留默认 UI            | 立项池     |
| [US-029](stories/core/US-029-rbac-owner-role-permission.md)                                                                                                                                                                        | 📝 Backlog     | 价值待证，等待具名多用户写授权症状；解锁时重验当前 API 前提             | 立项池     |
| [US-910](stories/future/US-910-data-i18n.md)                                                                                                                                                                                       | 📝 Backlog     | 先证明语言启停入口、删除判据与迟到子行合入；不能只归因于缺夹具          | 立项池     |
| [US-911](stories/future/US-911-client-i18n.md)                                                                                                                                                                                     | 📝 Backlog     | 先冻结偏好持久化/通知与唯一 fallback 合同，再做三端文案                 | 立项池     |
| [US-704](stories/future/US-704-p2p-manifest-discovery.md) / [US-705](stories/future/US-705-p2p-byte-transfer.md) / [US-706](stories/future/US-706-p2p-fallback-auth.md) / [US-707](stories/future/US-707-p2p-cross-runtime-e2e.md) | 📝 Backlog     | 价值待证；先证明离线发现/连接与认证宿主，明确 Tauri 验收归属            | 立项池     |
| [US-603](stories/tooling/US-603-manual-release-preflight.md)                                                                                                                                                                       | 📝 Backlog     | 手工发布前置校验结果与提交/产物绑定，当前仅有手工要求                   | 立项池     |

## 即办清单

当前没有独立于下列故事的即办项。US-223/224 是已有用户症状的修复，不与仍价值待证的新增抽象混排。

## 排期批次

### 批次 3：能力补齐（可并行开 PR）

| 顺序         | 范围            | 关闭条件                                                                  |
| ------------ | --------------- | ------------------------------------------------------------------------- |
| 待评审       | US-223 / US-224 | 代码评审通过（复现已翻为正向断言，RLS、级联、重试和双端收敛边界回归及各自 AC 均已通过）；保持两条独立故事 |

US-211/219 有人工宿主验收，不用单元测试通过替代。US-030 A～D 在本分支已有实现，不再列为待办。

### 批次 4：BOM 新增验收收尾

结构、解析、数量、联产、路线成本、ECN、映射、热字段、实例和三框架绑定已在本分支实现，
验收材料见 [epic-009](epics/epic-009-bom-domain-model.md)。剩余 [US-518](stories/domain/US-518-bom-unit-lot-effectivity.md)
AC#12 要求 API 与直连 SQL 都拒绝空批次集合；当前显式合同接受 `[]` 并按永不匹配处理，
需要写入守卫与兼容性验收，不能仅修改文档关闭。
查询闭包剪枝没有进入默认读路径，不把尚未证明的优化收益写成已交付承诺。

### 批次 5：模型驱动后台首版（epic-010 已解锁）

当前剩余为 US-528 的真实发布消费证据。以仓外安装、样式/WASM 资源、CRUD 和重开闭环证明独立接入；
再记录一个真实任务的接入成本，不能只靠 workspace 应用代码量推导用户收益。

### 线 A：桥接版本发布（owner 门控）

当前下一次迁移的桥接锚点是 v0.0.28。此处仅保留引用入口，不重跑 v0.0.26 的历史操作；执行以 [发布计划](release-plan.md)为准。

### 立项池（待 owner 决策，未进任何批次）

| 故事            | 准入条件                                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------------------------- |
| US-403          | 明确使用方要替换的展示层；以现有逻辑 API 和独立消费闭环界定首个阶段                                         |
| US-029          | 具名多用户使用方与当前可复现写授权症状；解锁时重定库级身份、owner 外键和按行能力                            |
| US-910 / US-911 | 先完成故事中的能力/持久化合同验证；共享 locale/fallback 仅有一份定义，不预先承诺无需同步改动                |
| US-704～707     | 按 [epic-011](epics/epic-011-p2p-file-share.md#价值待证)解锁，先验证断服务器超过 TTL 的局域网路径与认证前置 |
| US-603          | owner 选择发布入口约束范围；已有门禁缺口按独立 tooling story 验收，不引入自动发布                           |

### epic-006 评审顺延的架构项

epic-006 两份评审报告（`next-0912` 与 `review` 分支复核）收口时顺延的架构项，不挡 epic-006 任何故事关闭。
**每一项的判据、修法与「不做的理由」都写在对应代码的 TSDoc 里**，这里只登记「它挡着什么」和「谁来定」。
两份报告都已删除，代码注释是唯一副本。

| 项                                                                                | 挡着                                                                                                                                                                           | 前置决策 / 判据位置                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 提交图校验的「最后已验证 HEAD」水位（BFS 剪枝）＋ `list-commits` 的按分支派生结构 | 每次 commit / discard / restore / 切分支都全量重哈希整张可达图，O(N)                                                                                                           | **这是一次规格变更，不是性能重构**：剪枝直接违反 [US-305](stories/collaboration/US-305-commit-graph-head.md) FR-051「MUST 遍历**完整**可达父链」与原规格 SC-013「可达祖先损坏时三条入口各自报 `commit_graph_corrupted`」（`git show f9528e8f:specs/001-working-tree-commits/spec.md`），要先改 US-305 的 FR-051 与 epic-006 的验收。两条共用同一份 ref 状态，必须一起做。判据见 `packages/rxdb-plugin-working-tree/src/commit/commit-graph-guard.ts` 与 `commit/list-commits.ts` 的 `@remarks` |
| `IRepository` 要不要长出聚合能力（`GROUP BY` / `COUNT`）                          | `working-tree/status.ts` 的两次顺序 `COUNT(*)`                                                                                                                                 | core ↔ plugin 公开面决策。另一条路（插件走 `executor.query()` 裸 SQL）会是本插件第一处生产裸读，方言返回类型与列名大小写不一致、测试替身只认结构化查询。判据见 `status.ts` 的 `readOriginBreakdown` `@remarks`                                                                                                                                                                                                                                                                                 |
| 跨后端公共层落在哪个包 ＋ 语句收集协议统一（数组 vs `---STATEMENT_SEPARATOR---`） | 两个 `version/switch-result.utils.ts`、两个 `version/switch_branch.ts`、两处 `ensureBranchActiveKey`                                                                           | 两个适配器互不依赖，公共层放任一端都新增跨适配器边；核心拥有方言 SQL 等于让核心知道方言。**抽完只剩骨架**（类型口径、绑定与批量、值编解码、客户端协议四处都是方言原语），判据逐条写在这四个文件的 `@fileoverview` / `@remarks` 里。合一之前**任何改动必须两端同改**                                                                                                                                                                                                                            |
| `activated` 改由 schema 从 `activeKey` 推出（生成列）                             | 17 处生产写点手工维护 `activated` 与哨兵同进同出（口径 `activated ⇔ activeKey = '*active*'`）                                                                                  | 要动 6 个适配器的 system schema 迁移并给既有库写迁移步骤；只改写点不改 schema 等于把手写换成同样多的调用。US-314 B1.2 起 `activeKey` 多了可写检出位的持有键、不再能由 `activated` 推出，原先的两种方向（`activeKey` 改生成列、`WHERE activated` 部分唯一索引）都装不下持有键，方向反过来。判据见 `packages/rxdb/src/system/branch.ts` 的 `RxDBBranch` `@remarks`                                                                                                                               |
| 适配器长出「批量取现存表名」的公开能力                                            | `RxDB.ts` 每次 `connect()` 十几次顺序 `isTableExisted` 探测                                                                                                                    | 一次适配器公开面扩张（6 个后端两种方言各一遍），且落在全仓都走的连接路径上。判据见 `#ensureSystemTables` 的 `@remarks`                                                                                                                                                                                                                                                                                                                                                                         |
| 物化 staging 页 payload 的加密信封校验                                            | 来源方把加密列交成明文时，明文照样落进 `rxdb_working_tree_materialization_page.payload`；失败 / 中断的 attempt 刻意不删，残留到调用方 `discardMaterializationAttempt` 为止     | 本模块不认识业务实体、分不出哪一格该是加密包，校验只能落在来源方的 `projectPage` 一侧或快照来源的登记处；今天来源是同步插件自动登记的那一个，页里是远端变更记录的原样 patch。判据见 `packages/rxdb-plugin-working-tree/src/working-tree/working-tree-materialization-page.entity.ts` 的 `payload` `@remarks`，门禁边界见 `git show f9528e8f:specs/001-working-tree-commits/threat-model.md` §7                                                                                                 |
| `WorkingTreeEntry.fingerprint` 要不要从 FNV-1a/32 换成 SHA-256                    | 今天不挡——没有生产代码比较这一列（US-308 交付的冲突检测也不读它）；有消费者按身份逐对比较之后才生效，误判相等约 2⁻³² / 对                                                      | 由首个比较这一列的消费者定。代价是捕获热路径上每次写多算一遍纯 JS 摘要、列宽 8 → 64 位；同步的 `sha256Hex` 现成，不需要异步也不需要新依赖。判据见 `packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts` 的 `fingerprintOf` `@remarks`                                                                                                                                                                                                                                        |
| 活 count 查询的刷新成本                                                           | 热表上每一条命中 where 的 CREATE / REMOVE 与跨 where 边界的 UPDATE 都打一次整表 `COUNT`；`refresh$` 走 `switchMap`，只丢弃过时那一轮、不合并刷新                               | count 结果没有 id 级基线，本地 ± 调整不安全；要降成本得先给 count 结果配一个能与事件对齐的水位，或者给刷新加合并窗口。判据见 `packages/rxdb/src/query/merge_create.ts` 的 count 分支注释                                                                                                                                                                                                                                                                                                       |
| 同步跳过的远端分支没有持久标记                                                    | 远端不修，`invalid-id` 的分支连同它的子孙每轮重拉、重跳，一直占位                                                                                                              | 要不要记「已知坏行」、记在本地还是只上报，由同步层定；调用方今天已能用 `SyncBranchesResult.skipReasons` 区分会自愈的跳过与永久跳过。判据见 `packages/rxdb-plugin-sync/src/sync-branches.ts` 的 `skipped` TSDoc                                                                                                                                                                                                                                                                                 |
| supabase 只把 main 的变更落实体表                                                 | 在 feature 分支上激活时的编辑推上去只留 `RxDBChange` 记录、不进实体表，与本地「任意分支可激活」的语义不一致                                                                    | 先定服务端按什么判定「激活」（按连接、按用户还是全局）。判据见 `packages/rxdb-adapter-supabase/src/supabase.merge-changes.ts` 的 `isMainBranch` 注释                                                                                                                                                                                                                                                                                                                                           |
| UPDATE 门控在实体缓存未命中时判不出 where 跨界                                    | 他 tab 转来的增量 UPDATE 落到没缓存该实体的 tab（只挂 count 的 tab 最典型）时，复合 where 的其余字段两侧同为缺失：count 跨界与 find 系的「新匹配」都判不出来，结果静默停在旧值 | 修法二选一：门控改判「where 用到的字段是否齐全」，或跨 tab 事件改带整行。「缓存命中与否」当不了判据——未命中时 `serialize` 会把残缺实体写进缓存。判据见 `packages/rxdb/src/query/need_refresh_update.ts` 的 `count_boundary_crossed` 注释                                                                                                                                                                                                                                                       |

## 零散收尾项（不成故事，随手可带）

仅登记仍有动作或决策的条目，完成的执行记录由 Git 历史回答。

1. Angular 包精确 peer 的兼容范围：下次统一发版前由 owner 定案，见 [发布计划](release-plan.md#开项版本漂移)。
2. `ci / benchmarks` 缺少 Xeon 8370C 参考档：同一机型再次出现时按既有基准冻结规则处理。
3. 23505 / 23502 / 23514 仍整批失败，不作为逐实体 rejected；只有真实部署反馈出现后才评估改判。
4. 被拒变更与 undo/redo 的交互：现有 `undo-redo-rejected-change.spec.ts` 固定了水位线行为；redo 后可能本地重放而不再推送、待推计数缺显式 rejected 过滤，仍待评估，不宣称已修复。
5. `@aiao/rxdb-model@0.0.26` 坏产物的处置与 GitHub Release 正文同步，见 [发布计划](release-plan.md#开项版本漂移)。

US-223/224 与 US-603 已有独立故事，不在这里另建一份待办。

## 排期约束

1. US-012 DTO 不得重新定义 bigint/binary 的 wire codec。
2. 桌面宿主必须保证真实单连接事务；无法保证时 fail-fast，不降级为伪事务。
3. Electron PGlite 使用 IPC 事务 ID 协议；Tauri 使用 Rust command 持有 rusqlite Connection，不用跨调用连接池伪装事务。
4. 权限链：US-027 是 US-029 的声明/写入口/UI 前置，US-218 是其日志与逐实体回执前置。排序 API 在开事务前显式判 update 权限；rxdb-model UI 一律 Angular/React/Vue 对称。
5. 提交竞争只使用 headRevision CAS，不引入 writer lease/迁移 epoch。当前已发布 schema 7、源码 8；下一次迁移以 v0.0.28 为锚点。
6. 搜索复用现有 API 与 parity fixture，不借另一后端专属 fallback。
7. 小程序能力上限仍为实验性、单连接，不扩大 WAL/多页面并发/崩溃恢复保证；支持平台与设备证据按 US-211 的可行性矩阵核对，未关闭验收不扩大公开声明。
8. 生命周期 Epic 的追加故事须有今天可复现的资源获取/释放症状，IRxDBPlugin 签名由类型契约守住。
9. 状态变量复位不算生命周期病灶；新增抽象不能仅凭 Epic 惯性排期。
10. HTTP 本体按 stable 交付，changeFeed 仍实验性；v1 changelog 方法不支持就明确抛错，不假空。
11. HTTP 不得内部拥有本地 adapter，不实现 upsertMany/deleteByIds/getMetadataByIds；本地行缓存独立注册。
12. 破坏性变更如实声明并附迁移页；桥接不得抬系统版本。当前区间从 v0.0.28 起，见 [发布计划](release-plan.md#约束-12-修订破坏性改动如实声明)。
13. US-213 暴露的协议缺陷另开故事，不改 src 或参考后端迁就客户端；回归中明确记录缺口。
14. US-214 的 CORS 文档补全不改变协议；`__control/*` 演示开关不得进入 HTTP 协议文档。
15. Electron 构建中 external 的运行时包必须声明在应用 dependencies，并与搬运清单和打包回归保持一致。
16. Supabase UPDATE 与回执共用实际生效判定原语：UPDATE 被拒仍抛 42501、行不存在使用 RX001，日志只来自真实生效写入。

## 明确不排期

| 项                               | 条件或边界                                                                 |
| -------------------------------- | -------------------------------------------------------------------------- |
| US-016（无故事文件）             | 原症状由 US-015 覆盖，不再独立解锁                                         |
| US-017（无故事文件）             | 三框架各有原生清理作用域，出现可复现泄漏才立项                             |
| US-212 行缓存 eviction           | 具体实体/量级出现缓存膨胀后再立项；HTTP 包不拥有本地执行面                 |
| `rxdb-adapter-desktop` deprecate | 当前不做，迁移文档提供拆包路径                                             |
| Tauri Rust crate 发布            | 当前不发 crates.io，维持 path/git 消费边界                                 |
| 桌面 installer 自动验收          | 当前人工验收；编译与 smoke 不冒充装包后启动验证                            |
| 漂移门禁改 AST                   | 出现现有词法判据漏掉、AST 能拦的实例再评估，不为空泛稳健性增加全仓 Program |

## 建议补充的验收维度

- 故障恢复：迁移/宿主/索引初始化中断后可预测，不留下半成功状态。
- 能力组合：框架对称与适配器/宿主支持范围分开记录，不从一种对称推导另一种支持。
- 证据层级：源码、构建产物、独立安装、真实设备各自验收，不互相冒充。
- 诊断：使用稳定错误码和上下文，不静默切换存储后端。
