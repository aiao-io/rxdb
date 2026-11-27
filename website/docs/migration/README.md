# 迁移指南

本节汇总跨版本、跨框架、跨适配器与跨插件的迁移操作。按你的场景选择：

- [v0 → 1.0 升级](/migration/v1.md)：破坏性变更清单与升级步骤
- [框架绑定迁移](/migration/frameworks.md)：Angular / React / Vue 之间或版本升级
- [适配器切换与数据迁移](/migration/adapters.md)：更换存储后端
- [Supabase 传输失败错误类型迁移](/migration/supabase-network-errors.md)：连不上远端时改抛 core 的 `NetworkOfflineError`，请用 `isNetworkError` 判离线
- [Supabase 修改推送语义迁移](/migration/supabase-update-push.md)：本地修改改走普通 `UPDATE`（`rxdb_mutations` 新参数 `p_updates`），须先执行新版 SQL 再升级客户端
- [Supabase 变更日志提交顺序修复](/migration/supabase-change-log-order.md)：`rxdb_change` 加触发器让日志 `id` 顺序等于提交顺序，拉取不再漏掉晚提交的变更；重跑一次新版 02 SQL，客户端无需升级
- [Supabase 远端身份与远端重置](/migration/supabase-remote-backend.md)：远端新增身份值 `rxdb_backend_id()`，客户端把它和拉取游标存在一起，远端重建后停止同步并报 `RemoteBackendMismatchError`，由应用显式改绑；须先执行新版 SQL 再升级客户端，自定义远端适配器须实现 `backendId()`
- [Supabase 日志同步只对已登录身份开放](/migration/supabase-sync-access.md)：anon 不能再拉取、推送与登记分支，非 main 分支由首个写入者认领，实时通知改为只带元数据的私有频道广播；应用须先改用已登录的客户端，再执行新版 SQL，旧分支要补登所有者
- [Supabase 远端变更历史](/migration/supabase-change-history.md)：新表 `rxdb_change_history` 记每次生效写入的完整前后快照与操作者，只经 `rxdb_entity_history` 对能编辑这一行的成员开放；执行与日志访问收口同一条升级命令，之后重新加载自己的 `rxdb_caller_can_edit` 覆盖，客户端无需升级
- [Supabase 成员权限](/migration/supabase-member-permissions.md)：新函数 `rxdb_caller_grants()` 与 `rxdb_caller_scopes()` 说明调用者在各作用域上的成员权限，写策略与历史判定都能按 `edit` 区分管理员与员工；在同一事务里执行新版 04、自己的 `rxdb_caller_can_edit` 覆盖与生产权限脚本，平台默认不改变任何人的权限，客户端无需升级
- [多对多关联行的确定性 id](/migration/many-to-many-junction-id.md)：关联行 id 由两端派生、连接表的同步跟随两端；远端中间表补 `id` 与时间戳列并登记同步，已有行先改成派生 id 再升级客户端
- [Supabase 外键成环的推送](/migration/supabase-fk-cycle-push.md)：互相持有外键的实体（双向一对一）能推拉了，`rxdb_mutations` 新增第七个参数 `p_deferred_columns`、旧签名被删掉；先在同一事务里执行新版 04 与生产权限脚本、重新加载自己的 `rxdb_caller_can_edit` 覆盖，再升级客户端。没有环的模型不受影响
- [Supabase 推送回执迁移](/migration/supabase-push-receipts.md)：`mergeChanges` 返回值从 `changeIdMapping` 改为必填的 `results`，自定义远端适配器须跟着改；被拒变更不再拖垮整批，须先执行新版 SQL 再升级客户端
- [HTTP 适配器翻页键改名](/migration/http-page-token.md)：`ctx.cursor` → `ctx.pageToken`、`nextCursor` → `nextPageToken`，与 core 的 keyset 游标区分开
- [桌面适配器拆包](/migration/desktop-split.md)：`rxdb-adapter-desktop` 拆成 `-electron` / `-tauri` 两个包
- [工作树拆包](/migration/working-tree-split.md)：工作树与提交历史从核心拆成 `@aiao/rxdb-plugin-working-tree`，能力守卫取代版本号锁
- [树结构拆包](/migration/tree-split.md)：树实体、`TreeRepository` 与增量 merge 从核心拆成 `@aiao/rxdb-plugin-tree`，四个树 hook 搬进 `@aiao/rxdb-plugin-tree-{angular,react,vue}`
- [插件升级与启用](/migration/plugins.md)：启用/升级插件（如全文搜索）
- [插件作用域契约迁移](/migration/plugin-scope.md)：`install(scope)` 新契约、`destroy()` 废弃与随之而来的行为变化
- [历史与同步拆包](/migration/history-sync-plugins.md)：历史/分支搬进 `@aiao/rxdb-plugin-history`、推拉同步搬进 `@aiao/rxdb-plugin-sync`，同步方法从 `versionManager` 移到 `syncManager`
- [QueryCache 读引擎拆包](/migration/querycache-plugin.md)：`SyncType.QueryCache` 的读路径搬进 `@aiao/rxdb-plugin-querycache`，用到该策略须装齐 history + sync + querycache 三个包
- [`RemoteSyncOptions` 移除](/migration/remote-sync-options.md)：孤立类型删除，冲突解决器改经 `PullOptions.conflictResolver` 传入，`autoSync` 无替代
- [跨 realm writer lease 移除](/migration/writer-lease-removal.md)：16 个 writer lease / upgrade guard 符号删除且无替代，跨 realm 排他交给发布系统
- [`RxDBBranch` 去树化](/migration/branch-detree.md)：分支系统表不再是树实体，四个树查询方法与 `RxDBBranchTreeRuleGroup` 移除，表结构不变
- [生成器 `default` 语义迁移](/migration/generator-default.md)：函数 `default` 从静默丢弃改为生成期报错，bigint / `Uint8Array` / `Date` 不再被改写
- [操作列删除判定](/migration/actions-column-can-delete.md)：`actionsColumn` 第三位新增必填 `canDelete`，查看文案顺延到第四位，删除能力不再由只读推断
- [表名与 SQL 生成函数改为必传表集](/migration/table-set-parameter.md)：sqlite-core 与 PGlite 推物理名、生成建表 / 读写 / 触发器 SQL 的公开函数多了必填的 `WorktreeTableSet`，只有主检出位的代码补 `WorktreeTableSet.MAIN` 即可
- [Schema 迁移](/migration/schema.md)：实体结构变更时的数据迁移

> 版本策略与兼容承诺见[版本与 API 稳定性策略](/versioning.md)，各包版本对应关系见[兼容矩阵](/compatibility.md)。
