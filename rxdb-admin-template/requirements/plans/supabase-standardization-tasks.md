# Supabase 接入标准化：评估与实施计划

> 日期：2026-11-28。状态：评估完成、故事已登记、尚未实施。方向见 [D-11](../decisions.md#d-11supabase-接入走平台标准层)；Admin 故事 ADMIN-US-222～224 归 [ADMIN-EPIC-005](../epics/ADMIN-EPIC-005.md)；平台故事在根 requirements 的[批次 13 与立项池](../../../requirements/roadmap.md)。

起因：`dev-rxdb-supabase` 及相关库随 #226 更新、对应故事全部关闭之后，owner 要求核对它对 Admin 的影响，并定下方向——Admin 连 Supabase 要有一套标准逻辑，`rxdb-adapter-supabase` 能解决的由它解决，Admin 里有而平台没有的场景列故事补齐成可复用能力。

## 1. 结论

**连接层可以标准化，数据层不能、也不该。**

- **连接层**（会话、身份与按身份分库、授权快照与三端按权限显隐）：适配器与平台核心已经覆盖大半——复用应用传入的客户端（`SupabaseAdapterOptions.client`）、`callerIdentity()`（US-035）、`callerGrants()` → `rxdb.grants` → `deriveRowCapabilities` 与三端 `EntityList`（US-029，六项权限就是 Admin 的定义）。缺的三块已在平台立项：会话层 US-237、整库一个作用域 US-039、只接身份与授权 US-238。Admin 改用之后，协作包不再维护平行实现。
- **数据层**（团队共享数据仅经 PR 合并）：适配器的日志同步加 RLS 直写满足不了 D-06 与协作契约 C02～C06。日志同步按行传最终状态，不保留提交 ID、父链与原作者，拉取方把变化落成自己的本地写入；直写模式下有 `edit` 就能改共享数据，与「管理员也不能直写」冲突。平台 epic-015 也把「改写 Admin 的 PR 链路、对团队数据双写」列为非目标。Admin 独有的这部分登记为平台 epic-017（价值待证），平台交付之前协作包保持现状。
- **本次合并有一处回归**：三端 app e2e 各有 1 条失败，根因在平台 US-318 的删除判据，已在平台修复，见第 3 节。

## 2. 对照：Admin 需求 × 平台标准做法

| Admin 需求                                                                | Admin 现状                                                                                                 | 平台标准做法（适配器与 dev-rxdb-supabase）                                                                        | 结论                                                     |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 一页一个客户端、邮箱验证码、会话恢复、离线身份、跨标签页退出（D-10、C01） | 协作包 `AuthSession` 自写                                                                                  | 适配器只收 `client`；会话与登录写在 demo 里（访客、匿名、前端写死密码的账号），换号靠整页刷新                     | 平台缺 → US-237；Admin 由 ADMIN-US-223 接入              |
| 本机库按账号隔离（D-10 第 4 条）                                          | 工作台按设备共用，库名经 `@aiao/rxdb-test` 的 `getE2eDbName()` 取；团队库按 cyrb128 散列分库，没有身份绑定 | US-035：`getRxDBIdentityDatabaseName()` 加 `RxDBOptions.identity`，打开时核对                                     | 平台已有 → ADMIN-US-222 直接改用                         |
| 六项权限，界面与服务端同一权限结果（ADMIN-US-203）                        | 引擎 `authorize()` 裁决；界面按内存成员列表 `hasPermission()`；团队编辑的 `EntityList` 不判权限            | `rxdb_caller_grants()` → `callerGrants()` → `rxdb.grants`（落库、离线沿用）→ 三端 `EntityList` 按行显隐（US-029） | 缺库级作用域 US-039 与只接身份授权 US-238 → ADMIN-US-224 |
| PostgREST 读取不被 `max-rows` 截断                                        | 每页 500 行（`readPageSize`），提交图走返回 JSON 的读取函数                                                | 适配器按主键 keyset 分页                                                                                          | 已满足，不改                                             |
| 实时通知只给团队成员                                                      | 私有频道 `collab:<team>:<app>`，`realtime.messages` 按成员授权，服务端只经 `admin_private.broadcast()` 发  | 私有频道 `rxdb:changes` 与各分区主题；未分区主题对全部 authenticated 开放（PR #226 评审遗留，owner 另定）         | Admin 更严，不改；可作平台收口的参照（US-239）           |
| 在线成员（ADMIN-US-215）                                                  | Realtime Presence                                                                                          | 没有                                                                                                              | 平台缺 → US-239（价值待证）                              |
| 跨设备续作保留提交身份、分叉另存（C02、C03）                              | 提交交换协议加 working-tree 导入（平台 US-319）                                                            | 日志同步按行拉取，不保留提交身份                                                                                  | 不满足 → US-321（价值待证）                              |
| 共享数据只经 PR、候选绑定审核、三方字段合并、原子合并（C04～C06）         | 领域引擎加 Edge Function / Node 命令入口                                                                   | `rxdb_mutations` 按 RLS 直写；没有 PR、没有三方合并                                                               | 不满足 → US-322（价值待证）                              |
| 邀请绑定已验证邮箱、撤权即时生效（C01、ADMIN-US-202）                     | 引擎的成员命令与撤权广播                                                                                   | 演示 SQL：自助加入只得 `read`，`demo_set_member_permissions` 改权限，没有邀请                                     | 平台缺 → US-239（价值待证）                              |

## 3. 本次合并对 Admin 的影响（`23107f5ac`）

合并带进 #226：US-225、epic-015（US-029、US-033～036、US-234 等）、epic-016（US-316～318 等）。Admin 没有调用任何改了签名的接口。

| 检查                            | 复验命令                                                                                                                                                           | 结果                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| typecheck / lint / 单测         | `pnpm nx run-many -t typecheck lint test -p admin-collaboration rxdb-admin-template rxdb-admin-template-react rxdb-admin-template-angular rxdb-admin-template-vue` | 通过                                      |
| 三端构建                        | `pnpm nx run-many -t build -p rxdb-admin-template-react rxdb-admin-template-angular rxdb-admin-template-vue`                                                       | 通过，只有原有的第三方 ESM 与分包体积告警 |
| 三端 app e2e                    | `pnpm nx run-many -t e2e -p rxdb-admin-template-react-e2e rxdb-admin-template-angular-e2e rxdb-admin-template-vue-e2e --parallel=1`                                | 每端 1 条失败，其余通过                   |
| 协作 e2e 与 PostgreSQL 集成用例 | 需要本地 Supabase 栈（`pnpm nx dev rxdb-admin-template`），本次未跑                                                                                                | —                                         |

**回归**：`apps/react-e2e/src/dashboard.spec.ts`「最近活动按增删改时间倒序展示五条，刷新后保留」。删除一个资产分类之后，第一条活动应是「删除资产分类」，实际是 `TRANSACTION`「批量变更 1 条记录」。原因：US-318 让 `EntityManager.remove()` 对 `schemaManager.isReferenced()` 为真的实体一律改走带事务号的批量写；`AssetCategory` 被 `Asset` 以 `RESTRICT` 外键引用，根本不会级联，删一行也成了「一条变更的事务」；三端 `dashboard-model.ts` 与 `dashboard-activity-query.ts` 见到事务号就按批量变更显示。US-318 的范围只承诺「会级联（`CASCADE`）或置空（`SET NULL`）子记录时」记成一个事务，判据比故事范围宽。**已修（2026-11-28，owner 选平台）**：判据换成 `SchemaManager.cascadesOnDelete()`——有指向它的外键带 `CASCADE`、`SET NULL` 或 `SET DEFAULT` 时才开事务，关系外键按解析后的 `onDelete`、实体级外键（`foreignKeys`）按声明的 `onDelete` 判，首版漏算的实体级外键一并补上。先写的红测试：核心 `SchemaManager.spec.ts`、SQLite 共享级联套件与 PGlite 的 US-318 用例里「只被 RESTRICT 外键引用的删除不记事务号」。复验：三端 app e2e 全部通过；`rxdb`、`rxdb-plugin-history`、`rxdb-adapter-pglite` 与 US-318 证据里的六个 SQLite 包回归通过；`dev-rxdb-angular` 构建通过。US-318 的范围与技术笔记已同步。

这条不属于 ADMIN-US-102 的三条 AC（页面、导航与偏好），影响的是能力矩阵里「真实数据 Dashboard 与最近活动」的本地验证。

**其他变化：**

- 新核心系统表 `rxdb_grant_state`：已有的本机库（工作台与团队库）第一次打开时走一次完整升级路径，不升 schema 版本；三端 e2e 里的刷新重开与备份恢复用例通过。
- 三端 `EntityList` 订阅了 `rxdb.grants.snapshot$`：Admin 的实体没有声明规则形式的权限，行为不变。
- 附带发现：三端 `setup_rxdb.ts` 在生产代码里从测试包 `@aiao/rxdb-test` 引 `getE2eDbName()` 取库名；ADMIN-US-222 改用平台库名工具时一并去掉。

## 4. 平台故事（根 requirements）

| 故事                                                                                            | 归属              | 内容                                                           | Admin 消费方                        |
| ----------------------------------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------- | ----------------------------------- |
| [US-237](../../../requirements/stories/adapter/US-237-supabase-session-layer.md)                | epic-015，批次 13 | 会话层：登录、会话恢复、离线身份、跨标签页、按身份换库         | ADMIN-US-223                        |
| [US-039](../../../requirements/stories/core/US-039-instance-access-scope.md)                    | epic-015，批次 13 | 整库一个作用域：不带作用域列也能按授权快照判定写入、三端显隐   | ADMIN-US-224                        |
| [US-238](../../../requirements/stories/adapter/US-238-supabase-adapter-identity-grants-only.md) | epic-015，批次 13 | 只接身份与授权：不订阅变更频道、不探日志表，服务端只需授权函数 | ADMIN-US-224                        |
| [US-321](../../../requirements/stories/collaboration/US-321-supabase-commit-exchange.md)        | epic-017，立项池  | 提交图远端交换                                                 | 协作服务端迁移（尚未立 Admin 故事） |
| [US-322](../../../requirements/stories/collaboration/US-322-pr-only-write-mode.md)              | epic-017，立项池  | 仅经 PR 写入：数据 PR、绑定候选的审核、三方合并、原子合并      | 同上                                |
| [US-239](../../../requirements/stories/adapter/US-239-supabase-team-membership-realtime.md)     | epic-017，立项池  | 团队成员、邀请与协作实时（业务通知、撤权广播、在线成员）       | 同上                                |

epic-017 三条都价值待证：具名使用方只有 Admin，而它已有可用的产品实现；解锁信号写在各故事的「解锁条件」节。

## 5. Admin 实施顺序

| 步   | 内容                                    | 前置                              | 说明                                                                            |
| ---- | --------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------- |
| 0    | 修合并回归（第 3 节）                   | —                                 | ✅ 2026-11-28 已修（平台收窄判据），三端 app e2e 全部通过                       |
| 1    | ADMIN-US-222 本机库按账号隔离           | 平台 US-035（已交付）             | 建议在 ADMIN-US-217 正式上线前完成：上线之后再改库名，就要给真实设备写迁移      |
| 2    | ADMIN-US-223 全局会话改用平台会话层     | 平台 US-237                       | 平台交付后做；部署后的三端协作验收（ADMIN-US-217 AC#5）最好排在它之后，免得重跑 |
| 3    | ADMIN-US-224 团队库标准授权与按权限显隐 | 平台 US-039、US-238，ADMIN-US-222 | —                                                                               |
| 后续 | 协作服务端迁到平台的仅经 PR 能力        | epic-017 解锁并交付               | 迁移之前协作包保持现状                                                          |

ADMIN-US-217 / 220 的部署与真实邮箱证据不依赖以上各步，可以并行。

## 6. 决策记录

1. 合并回归修在平台（2026-11-28 owner 定）：已修，见第 3 节。
2. 旧的设备共用工作台库直接弃用（2026-11-28 owner 定，见 ADMIN-US-222「已定的决策」）。
3. 工作台审计身份仍写 `'userId'`（2026-11-28，沿用 D-10 第 4 条的口径）。
4. 待定：epic-017 的服务端形态（TypeScript 引擎还是 PL/pgSQL RPC），只在解锁时需要。

## 7. 风险

- 会话层替换（ADMIN-US-223）碰的是全站登录与 C01 矩阵，回归面大：以 ADMIN-US-201 / 204 / 205 的现有 AC 与三端 e2e 为回归基线，不改断言。
- 团队库连上适配器之后多一条连接路径：断网、令牌过期时 `callerGrants()` 失败要按平台 US-029「连接时离线沿用快照」处理，不能挡住 C01 的离线热续作。
- 库名长度：sqlite-wasm idb VFS 的上限比平台文档写的 wa-sqlite 更紧（约 41 字节），ADMIN-US-222 的团队库名要先按这个上限设计。
