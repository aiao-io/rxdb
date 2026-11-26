# 路线图（Roadmap）

> 本文回答下一步顺序、前置与当前准入条件，是排期建议，不改变 story 的 YAML 状态。
> 状态见 [status-overview](status-overview.md)，当前能力见 [capability-matrix](capability-matrix.md)，发布执行见 [release-plan](release-plan.md)。

## 现状快照

| 状态           | 数量   |
| :------------- | :----- |
| ✅ Done        | 100    |
| 🚧 In Progress | 17     |
| 👀 In Review   | 9      |
| 📝 Backlog     | 32     |
| 🚫 Blocked     | 0      |
| **未完成合计** | **58** |

仓库还剩 **58 条**未关闭故事（17 In Progress + 9 In Review + 32 Backlog + 0 Blocked）。
数字由 story YAML 推导；Backlog 包括已授权任务与价值待证候选，不能把全部未关闭故事当成可开工项。

## 未完成需求全景

| Story                                                                                                                                                                   | 状态           | 剩什么                                                                                                                                                                           | 排期位置 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| [US-030](stories/core/US-030-declarative-storage-constraints.md)                                                                                                        | 👀 In Review   | 当前承诺 A～C 的评审收尾；候选 D 不参与本轮关闭                                                                                                                                  | 批次 3   |
| [US-211](stories/adapter/US-211-multi-miniprogram-platforms.md)                                                                                                         | 🚧 In Progress | 按平台矩阵核对剩余设备验证、demo 走查与公开支持边界                                                                                                                              | 批次 3   |
| [US-403](stories/ui/US-403-entity-components-headless.md)                                                                                                               | 🚧 In Progress | 独立构建产物消费、Angular secondary entry 与三框架质量门禁待收口                                                                                                                 | 批次 3   |
| [US-219](stories/adapter/US-219-taro-plugin.md)                                                                                                                         | 👀 In Review   | 当前 Taro 版本的外部安装与开发者工具验收证据                                                                                                                                     | 批次 3   |
| [epic-009 BOM](epics/epic-009-bom-domain-model.md)（19 条）                                                                                                             | 📝 Backlog     | 先首轮切片与贯穿应用，再按前置推进；候选优化不自动解锁                                                                                                                           | 批次 4   |
| [US-528](stories/domain/US-528-admin-consumer-example.md)                                                                                                               | 📝 Backlog     | 由 React Admin 模板承接公开包消费与成本验证；仓外闭环和实际业务增量均待验，本轮仅仓内孵化                                                                                        | 批次 5   |
| [US-537](stories/domain/US-537-board-backup-restore.md)                                                                                                                 | 🚧 In Progress | 恢复中配额不足、关闭页面后重开的注入分支（AC#9）                                                                                                                                 | 批次 6   |
| [US-540](stories/domain/US-540-board-end-to-end-demo.md)                                                                                                                | 🚧 In Progress | demo 既有库初态（AC#7）与无搜索插件构建（AC#12）                                                                                                                                 | 批次 6   |
| [US-541](stories/domain/US-541-board-team-sync.md)                                                                                                                      | 📝 Backlog     | 具名团队触发后冻结身份、成员权限、RLS 与冲突规则                                                                                                                                 | 立项池   |
| [US-226](stories/adapter/US-226-supabase-pull-count-records.md)                                                                                                         | 📝 Backlog     | 远端日志补记 `transactionId`、广播带上它、按记录重算；先定旧服务端的处理方式                                                                                                     | 立项池 |
| [US-037](stories/core/US-037-push-order-by-foreign-key.md)                                                                                                              | 👀 In Review   | AC 全部通过（单测、PGlite、Supabase 真栈），待 owner 评审后合入                                                                                                                  | 批次 9   |
| [US-038](stories/core/US-038-bidirectional-one-to-one-sync.md)                                                                                                          | 👀 In Review   | AC 全部通过（依赖图与推送拉取单测、PGlite、SQL 回归、真栈两客户端），待 owner 评审                                                                                               | 批次 9   |
| [US-228](stories/adapter/US-228-supabase-many-to-many-sync.md)                                                                                                          | 👀 In Review   | AC 全部通过（核心单测、SQLite 与 PGlite 套件、真栈两客户端、SQL 回归），待 owner 评审                                                                                            | 批次 9   |
| [US-227](stories/adapter/US-227-supabase-relational-sync-demo.md)                                                                                                       | 👀 In Review   | AC 全部通过（订单页三个阶段、两身份远端 e2e、表权限真栈用例），待 owner 评审                                                                                                     | 批次 9   |
| [US-034](stories/core/US-034-bucketed-entity-local-writes.md)                                                                                                           | 👀 In Review   | AC 全部通过（PGlite、Supabase 真栈、demo 组件单测与成员、访客两条远端 e2e），待 owner 评审                                                                                       | 批次 8   |
| [US-229](stories/adapter/US-229-supabase-change-history.md)                                                                                                             | 👀 In Review   | AC 全部通过（SQL 回归 `change-history`、真栈读取、demo 单测与成员 e2e），待 owner 评审                                                                                           | 批次 8   |
| [US-029](stories/core/US-029-rbac-owner-role-permission.md) | 📝 Backlog | 已授权：按作用域的成员写权限，A 声明 → B 授权快照与本地判定 → C Supabase 授权来源 ∥ D 三端按行派生 | 批次 11 |
| [US-234](stories/adapter/US-234-supabase-tenant-member-permissions.md) | 📝 Backlog | 已授权：A 服务端成员权限与 `dev-rxdb-supabase` 演示（演示部分排在 epic-016 的页面骨架之后）→ B 演示接入引擎声明（前置 US-029 阶段 C） | 批次 11 |
| [US-910](stories/future/US-910-data-i18n.md)                                                                                                                            | 📝 Backlog     | 先证明语言启停入口、删除判据与迟到子行合入；不能只归因于缺夹具                                                                                                                   | 立项池   |
| [US-704](stories/future/US-704-p2p-manifest-discovery.md) / [US-705](stories/future/US-705-p2p-byte-transfer.md) / [US-706](stories/future/US-706-p2p-fallback-auth.md) | 🚧 In Progress | 协议层已实现；先选定认证宿主，再接信令、mDNS 与桌面握手，按 AC 在真实宿主上验收                                                                                                  | 批次 7   |
| [US-707](stories/future/US-707-p2p-cross-runtime-e2e.md)                                                                                                                | 🚧 In Progress | 认证宿主已选定（Supabase + Cloudflare）；本轮做独立 demo 与浏览器半边，Electron 下一轮，Tauri 归阶段 B                                                                           | 批次 7   |
| [US-713](stories/future/US-713-p2p-admin-console.md)                                                                                                                    | 👀 In Review   | 管理接口、信令踢下线与管理页已在真栈上验收 AC#1～#10；AC#11 待首次 CI 运行确认                                                                                                   | 批次 7   |
| [epic-012 P2P 会话与局域网协作](epics/epic-012-p2p-lan-collaboration.md)（US-709 / US-710 / US-711 / US-712）                                                           | 📝 Backlog     | 价值待证；以 US-708 为前置，owner 已定先做 US-709 整库克隆                                                                                                                       | 立项池   |
| [epic-016 本机修改工作台](epics/epic-016-local-change-workbench.md) 核心四条：[US-318](stories/collaboration/US-318-cascade-delete-one-transaction.md) / [US-316](stories/collaboration/US-316-multi-repository-history-scope.md) / [US-317](stories/collaboration/US-317-pushable-histories.md) / [US-233](stories/adapter/US-233-supabase-pullable-count-accuracy.md) | 🚧 In Progress | 代码与用例已在分支上；故事 AC 随 epic-016 收尾一起回填，US-233 的真栈 e2e 待补 | 批次 10 |
| [epic-016 本机修改工作台](epics/epic-016-local-change-workbench.md) 应用层：[US-232](stories/adapter/US-232-supabase-catalog-server-drawer.md) / [US-230](stories/adapter/US-230-supabase-header-sync.md) / [US-231](stories/adapter/US-231-supabase-unified-undo-history.md) | 📝 Backlog | 页面登记、顶栏编辑组与同步组、同步中心、操作历史面板、商品页服务端抽屉；排在核心四条之后 | 批次 10 |
| [US-603](stories/tooling/US-603-manual-release-preflight.md)                                                                                                            | 🚧 In Progress | 两个手工发布入口已接入共享 preflight；待受控 registry 替身验收                                                                                                                   | 本轮执行 |

## 即办清单

当前分支 `supabase-log-access-baseline` 上的计划，按先后：

1. 批次 8、9 的 6 条故事（US-034、US-229、US-037、US-038、US-228、US-227）AC 全部通过，待 owner 评审合入。
2. 批次 10（epic-016 本机修改工作台）进行中：核心四条（US-318、US-316、US-317、US-233）的代码与用例已在分支上，下一步是 `dev-rxdb-supabase` 的应用层。
3. 批次 11（租户内成员权限）排在批次 10 之后；US-029 阶段 A、B 只动核心包，可以与批次 10 的应用层并行。

US-603 的共享 preflight 仍待受控 registry 替身验收。

## 排期批次

### 批次 3：能力补齐（可并行开 PR）

| 顺序     | 范围            | 关闭条件                                                       |
| -------- | --------------- | -------------------------------------------------------------- |
| 并行收尾 | US-030 A～C     | 当前承诺的双后端 AC 与评审完成；D 保留未验状态和独立准入       |
| 并行收尾 | US-211 / US-219 | 当前构建/工具/设备矩阵可复验，未验证的设备与平台不扩大支持声明 |

US-211/219 有人工宿主验收，不用单元测试通过替代。US-030 的候选 D 不阻塞已授权范围。

### 批次 4：BOM 首轮切片（epic-009 已解锁）

owner 已授权以完整演示应用为驱动，见 [epic-009](epics/epic-009-bom-domain-model.md)；不重新要求具名客户才能推进已批准切片。
US-030 A～C 是首轮第 1 步前置；当前 Tauri rusqlite 已达 0.33，无需重复规划升级。

| 顺序 | 交付                                                                                                                            | 关闭条件                                                                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 0    | 复核默认决策 1～8 与演示种子/样本                                                                                               | 样本与决策无冲突，范围明确                                                                            |
| 1～4 | US-507 A/B/C、US-508、US-509 首轮 AC、US-510 A、US-511 A/C/B1、US-525 A                                                         | 按 [首轮切片表](epics/epic-009-bom-domain-model.md#首轮可开工切片)逐步验收，当前承诺未完成不提前 Done |
| 后续 | US-525 B～F 的消费方：US-512 / US-513 / US-514 / US-515 / US-516 / US-517 / US-518 / US-519 / US-520 / US-521 / US-523 / US-524 | 各按自身前置接入；US-524 在 US-520/514 前；US-522 三框架绑定单独排期                                  |

US-513 联产品、US-510 热路径优化、US-519 可选索引与 US-030 D 保留各自准入；候选阶段不扩大本轮承诺。

### 批次 5：模型驱动后台首版（epic-010 已解锁）

当前在 `apps/rxdb-admin-template-react` 孵化应用配置与扩展路径，范围见 [ADMIN 应用路线图](../apps/rxdb-admin-template-react/requirements/roadmap.md)。
US-528 保留 Backlog；待明确发布产物、具体业务任务与试用者后，再验证仓外安装、样式 / WASM、CRUD 和重开闭环及真实接入增量。
本轮不实施独立复制，workspace 模板代码量不能推导独立接入收益。

后台外壳扩展按 owner 已批准的 US-530 / US-531 / US-532 / US-533 推进，覆盖偏好中心、布局与页签、快捷键与命令面板、顶栏部件与通用设置。三框架公共包与 React 模板在同一 PR 中验证和评审，各故事验收通过后再关闭。

### 批次 6：看板首轮切片（epic-011 已解锁）

owner 已批准以完整单人演示应用驱动 US-534～US-540，范围与默认决策见
[epic-011](epics/epic-011-task-board-domain-model.md#首轮可开工切片)。
当前收尾按 US-537、US-540 的保留 AC 推进，组合验收由 `apps/dev-rxdb-board` 承接。
US-541 团队版没有随首轮解锁，仍按具名团队症状和身份/冲突合同准入。

| 范围   | 关闭条件                                                                                           |
| ------ | -------------------------------------------------------------------------------------------------- |
| US-537 | 三端宿主恢复入口已验；恢复异常分支（AC#9）按原承诺验收。                                           |
| US-540 | 独立 demo 的搜索隔离、升级重开组合证据齐全；剩 AC#7（demo 既有库初态）与 AC#12（无搜索插件构建）。 |

### 批次 7：局域网 P2P 大文件共享（P2P epic 已解锁）

owner 已决定推进 US-704～US-707，US-713 管理后台随独立 demo 交付，记录见 [epic-011 P2P](epics/epic-011-p2p-file-share.md#价值待证)。
框架无关的协议层 `@aiao/rxdb-plugin-p2p` 先行；它的内存协议测试不充当任何 AC 的验收证据。

| 范围            | 关闭条件                                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| US-704          | 先选定认证宿主、用户/设备标识与服务端授权合同（含离线凭据）；再接服务器信令、桌面 mDNS 与会话握手，持有断言按 US-708 在请求时做，并按 AC 验收    |
| US-705 / US-706 | 浏览器两上下文与桌面双进程的直传、续传、多源、坏 peer 退避与服务器回退按各自 AC 验收；桌面 TCP 以链路加密为前置                                  |
| US-707          | 阶段 A 浏览器双 context、Electron 双进程与服务器回退进 CI；阶段 B Tauri 双进程、离线局域网与大文件自动化                                         |
| US-713          | Worker 管理接口、信令踢下线与管理后台页面；AC 在真实 Supabase 栈与本地 Worker 上验收，处置结果以数据库与 R2 的实际状态为准；AC#11 待首次 CI 运行 |

### 批次 8：按授权分区同步（epic-015 已立项）

owner 明确了目标：不同用户同步到自己有权限的数据，没登录的用户能看到全部公开数据。本批的 US-033、US-035、US-036 已全部完成，
`dev-rxdb-supabase` 的 `/catalog` 在同一个后端上完整演示（见 [epic-015](epics/epic-015-identity-scoped-sync.md#演示)）；写入与实时刷新随后。

2026-11-25 owner 授权写入与变更历史两条后续（不分先后，可并行开 PR）：

| 范围   | 关闭条件                                                                                       |
| ------ | ---------------------------------------------------------------------------------------------- |
| US-034 | 商品在本地增删改可撤销/重做，推送后锁定；被拒按 US-218 对齐；Supabase 真栈与 demo 组件测试通过 |
| US-229 | 三个写入点都记历史、读取 RPC 只对能编辑的成员开放并按列脱敏；SQL 回归与生产升级通过            |

同步日志不带正文的规则不变，完整前后快照只进 US-229 的历史表。实时刷新仍在后续。

### 批次 9：关系数据同步

2026-11-25 owner 授权，按顺序推进，每个 PR 先写红测试：

| 顺序 | 范围                   | 关闭条件                                                                                        |
| ---- | ---------------------- | ----------------------------------------------------------------------------------------------- |
| 1    | US-037                 | 子实体先声明时 `push()` 不再被拒、不再删本地行；汇总与失败计全；PGlite 与 Supabase 真栈用例通过 |
| 2    | US-227 阶段 A          | demo 自有表与订单页；一对多、多对一、级联删除、外键被拒的两身份远端 e2e 通过                    |
| 3    | US-228 + US-227 阶段 B | 关联行 id 确定性派生、中间表同步类型跟随两端、DDL 契约；并发关联同一对只落一行                  |
| 4    | US-038 + US-227 阶段 C | 依赖图按可空外键断环、`rxdb_mutations` 延迟列、拉取补齐；shop 夹具全量注册后推拉正常            |

US-038 改 `rxdb_mutations` 的签名，随 PR 附迁移文档与 `production/rxdb-change-grants.sql` 的签名清单；US-229 若先合入，US-038 的重构要保留它加的历史写入。

### 批次 10：本机修改工作台（epic-016）

2026-11-26 owner 授权实现全部 7 条故事，在 `supabase-log-access-baseline` 上推进：先修核心缺口，再统一 `dev-rxdb-supabase` 三页的界面。
故事间的依赖见 [epic-016 交付顺序](epics/epic-016-local-change-workbench.md#交付顺序)，执行顺序如下：

| 顺序 | 范围                           | 现状                                         | 关闭条件                                                                                                   |
| ---- | ------------------------------ | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1    | US-318 级联删除记进同一个事务  | 代码与 SQLite、PGlite 用例在分支上，AC 待回填 | 删带证件的客户后一次撤销整组恢复，互相引用的也撤得回来                                                     |
| 2    | US-316 多仓库撤销作用域        | 代码与单测在分支上，AC 待回填                | 几个实体合起来撤，跨它们的事务整条撤，不撤到别的页面                                                       |
| 3    | US-317 待推送清单              | 代码与 PGlite 用例在分支上，AC 待回填        | 清单与待推数同一口径                                                                                       |
| 4    | US-233 待拉数准确              | 代码与单测在分支上，真栈 e2e 待补            | 推完一刷新不再虚高；分区按真实条数计                                                                       |
| 5    | 应用地基 + US-232              | 下一步                                       | 页面登记服务、整机推拉命令、右侧面板壳；商品「模拟服务端变更」收进右侧抽屉                                 |
| 6    | US-230 阶段 A → B → C          | 未开始                                       | 顶栏同步组与同步中心；待拉数接 US-233；待推送清单与字段级改前改后接 US-317                                 |
| 7    | US-231 阶段 A → B              | 未开始                                       | Todo 与商品登记撤销、重做与操作历史；订单页接入，接 US-316、US-318                                         |
| 8    | 收尾                           | 未开始                                       | 远端 e2e 改锚点并补新用例、本地 e2e；README、各故事 AC 与状态；`pnpm audit:requirements` 与 lint / typecheck / test / build |

e2e 锚点与界面改动在同一步迁移，场景一条不删。

### 批次 11：租户内成员权限（epic-015 续）

2026-11-26 owner 授权：按 epic-015 的成员权限区分管理员与员工，不做全局角色；服务端、本地判定与三端界面都做，`dev-rxdb-supabase` 完整演示。
员工看不到远端变更历史，能看成本价（列权限按数据库角色授予，分不出人）。

| 顺序 | 范围                   | 前置                                                                         | 关闭条件                                                                                                                                                                    |
| ---- | ---------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | US-234 阶段 A          | 服务端部分无新前置；演示部分要批次 10 的 US-230 阶段 A、US-231 阶段 A、US-232 | 参考 SQL：成员权限、`rxdb_caller_grants()`、写策略与历史可见性同口径、防自我提权、最后一个管理员；真栈普通身份用例；商品页的身份与权限、员工只读、成员与权限面板、降权后推送被拒；远端 e2e 与 README |
| 2    | US-029 阶段 A → B      | US-027（Done）、US-035（Done）                                               | 作用域声明与校验；授权快照与本地判定，本地后端结果一致                                                                                                                      |
| 3    | US-029 阶段 C ∥ 阶段 D | 阶段 B；C 还要 US-234 阶段 A                                                 | C：Supabase 授权来源与真栈用例；D：rxdb-model 行级能力，Angular / React / Vue 同一组 e2e                                                                                    |
| 4    | US-234 阶段 B          | US-029 阶段 C                                                                | `CatalogItem` 声明作用域，商品页改读引擎能力，员工本机写当场被拒，离线沿用授权快照                                                                                          |

本地判定只是快速失败，安全边界只在 RLS；每个阶段一个 PR，先写红测试。

### 线 A：桥接版本发布（owner 门控）

当前下一次迁移的桥接锚点是 v0.0.28。此处仅保留引用入口，不重跑 v0.0.26 的历史操作；执行以 [发布计划](release-plan.md)为准。

### 立项池（待 owner 决策，未进任何批次）

| 故事                                                         | 准入条件                                                                                                                                                                                                                         |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-910                                                       | 先完成故事中的能力/持久化合同验证；locale/fallback 复用 US-911 的同一份定义，不预先承诺无需同步改动                                                                                                                              |
| US-541                                                       | 具名团队离线协作症状出现后，先冻结身份、成员权限、RLS 与冲突合同                                                                                                                                                                 |
| US-226                                                       | owner 排期；实现前先定新客户端连旧服务端（没跑升级脚本）时计数怎么处理                                                                                                                                                           |
| US-709 / US-710 / US-711 / US-712                            | 以 US-708 为前置；各故事「解锁条件」出现后由 owner 解锁，排序上 US-709 整库克隆在先                                                                                                                                              |

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

US-603 已有独立故事，不在这里另建一份待办。

## 排期约束

1. US-012 DTO 不得重新定义 bigint/binary 的 wire codec。
2. 桌面宿主必须保证真实单连接事务；无法保证时 fail-fast，不降级为伪事务。
3. Electron PGlite 使用 IPC 事务 ID 协议；Tauri 使用 Rust command 持有 rusqlite Connection，不用跨调用连接池伪装事务。
4. 权限链：US-027 是 US-029 的声明/写入口/UI 前置，US-218 是其日志与逐实体回执前置，US-234 阶段 A 是其 Supabase 授权来源前置。排序 API 在开事务前显式判 update 权限；rxdb-model UI 一律 Angular/React/Vue 对称；本地判定只做快速失败，安全边界只在 RLS。
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

| 项                               | 条件或边界                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------ |
| US-030 D、US-519 可选索引        | 真实故事必须生成列/表达式索引/索引方法才能达标时再解锁；不阻塞当前基础查询合同 |
| US-016（无故事文件）             | 原症状由 US-015 覆盖，不再独立解锁                                             |
| US-017（无故事文件）             | 三框架各有原生清理作用域，出现可复现泄漏才立项                                 |
| US-212 行缓存 eviction           | 具体实体/量级出现缓存膨胀后再立项；HTTP 包不拥有本地执行面                     |
| `rxdb-adapter-desktop` deprecate | 当前不做，迁移文档提供拆包路径                                                 |
| Tauri Rust crate 发布            | 当前不发 crates.io，维持 path/git 消费边界                                     |
| 桌面 installer 自动验收          | 当前人工验收；编译与 smoke 不冒充装包后启动验证                                |
| 漂移门禁改 AST                   | 出现现有词法判据漏掉、AST 能拦的实例再评估，不为空泛稳健性增加全仓 Program     |

## 建议补充的验收维度

- 故障恢复：迁移/宿主/索引初始化中断后可预测，不留下半成功状态。
- 能力组合：框架对称与适配器/宿主支持范围分开记录，不从一种对称推导另一种支持。
- 证据层级：源码、构建产物、独立安装、真实设备各自验收，不互相冒充。
- 诊断：使用稳定错误码和上下文，不静默切换存储后端。
