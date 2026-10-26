---
title: packages 增量代码评审汇总
status: IncrementalReview
baseline: ffed57da
incrementalFrom: 18ea576f
reviewed: 2026-10-26
---

# packages 增量代码评审汇总

## 当前结果

覆盖原有 51 份逐包报告，检查区间 `18ea576f..ffed57da`。51 个包均有路径变化，其中 23 个包有实现/测试工具源码增量，28 个包仅测试、配置、文档或版本变化。目录共 605 个变更文件，新增 31,580 行、删除 2,447 行；主体是 PR #122 的检出位重构。

**去重后待处理 45 条：4 P1 + 26 P2 + 15 P3。** 上轮 43 条没有新的关闭证据；本轮新增 2 条 P2。Search 的 React/Vue 同源缺陷、INC-002 的两后端同源缺陷均只计一次。

上轮首批 6 条已修复记录从待处理报告中移除，历史证据可用 `git show 18ea576f:requirements/reviews/packages/summary.md` 获取。模型缩写项只保留 `2FAuth` 残留，删除已经过时的 `IPv4Address` 待处理描述。未把版本发布、知识产物刷新或依赖升级当成问题修复。

## 本轮新增

| 等级 | 包                                                           | 问题                                                                     | 证据                                                                            |
| ---- | ------------------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| P2   | `rxdb-plugin-working-tree` (INC-001)                         | `attach()` 失败后的断连清理再失败，跳过 Web Lock 释放，后续持续 `in_use` | `checkout/worktree-manager.ts:276-279`；Chromium 已复现                         |
| P2   | `rxdb-adapter-pglite` / `rxdb-adapter-sqlite-core` (INC-002) | 无日志删除在外层事务提交前发出通知；回滚后行仍在却已发删除事件           | `PGliteRepository.ts:97-98` / `SqliteRepository.ts:113-114`；真实 PGlite 已复现 |

具体触发、失败断言与建议分别见 [working-tree](./rxdb-plugin-working-tree.md)、[PGlite](./rxdb-adapter-pglite.md)、[sqlite-core](./rxdb-adapter-sqlite-core.md)。本轮只更新评审文档，生产代码未修。

## 上轮保留的 43 条

以下问题以旧报告为起点核对当前增量：问题代码未变化的沿用原证据；sqlite-core 加密辅助函数抽取、核心 Repository 行号移动、小程序工厂接口变化的路径重新核对。没有逐条重跑 43 个缺陷的动态复现。

| 等级 | 包                                  | 问题                                                                                                                                                                | 证据锚点                                                                                                            |
| ---- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| P1   | `rxdb-adapter-sqlite-core`          | 加密列 + 自定义主键 `columnName`：写入 AAD 用空串、读取用真实 id → 行**永久不可读**，写入无报错（影响全部 sqlite 家族适配器）                                       | `sqlite-core.utils.ts:383/675`、`insert_sql.ts:67`、`inserts_sql.ts:68`（对照 `update_sql.ts:46-47`）               |
| P1   | `rxdb-model-react`                  | StrictMode 开发模式下 `EntityTable` 永久空白：`tableReady` 卸载不复位，重挂后初始化守卫恒 false（Vue/Angular 均复位）                                               | `entity-table.tsx:253-257、471-490`；对照 `EntityTable.vue:387`                                                     |
| P1   | `rxdb-model`                        | 枚举编辑器对「值不在选项列表」的单元格静默改写为第一项，Escape/点击外部不恢复（文档承诺恢复原值；`IconListEditor` 是正确范本）                                      | `entity-table/editors/enum-editor.ts:76-84`；基类 `global-overlay-editor.ts:119-125`                                |
| P1   | `rxdb-devtools`                     | OPFS 上传静默覆盖同名既有文件；commit 中途失败留下截断目标（与临时文件设计承诺相悖）                                                                                | `browser/opfs-files-provider.ts:302-314`（对照 `create-directory` 的 `resource_conflict`）                          |
| P2   | `rxdb-adapter-supabase` (S1)        | `update()` 的 `updatedBy` 仍按物理列名写入属性名键 patch（`7ff0bc8c` 回退引入）                                                                                     | `SupabaseRepository.ts:208`                                                                                         |
| P2   | `rxdb-adapter-supabase` (S2)        | 批量写路径（`saveMany`/`mutations`/`mergeChanges`）无主键列映射；服务端 `rxdb_batch_upsert` 硬编码 `ON CONFLICT (id)`                                               | `RxDBAdapterSupabase.ts:729-740`、`RxDBAdapterSupabase.utils.ts:35-78`、`docker/sql/04-rxdb-utils-functions.sql:39` |
| P2   | `rxdb-adapter-supabase` (S5)        | 树查询 `parent_column_name()` 用 columnName、CRUD 用属性名，父列口径不一致                                                                                          | `SupabaseTreeRepository.ts:389-395` vs `SupabaseRepository.ts:37-48`                                                |
| P2   | `rxdb-plugin-search-react` / `-vue` | 桥接流四订阅无 error 处理器（Angular 有 `reportStreamFailure`），流损坏走 RxJS `reportUnhandledError` 崩应用                                                        | `use-search.ts:124-127` / `164-167`；对照 `inject-search.ts:183-191`                                                |
| P2   | `rxdb-plugin-querycache`            | `findById` 绕过作废代次检查，过期远端响应可回退已确认写入                                                                                                           | `QueryCacheEngine.ts:373-382` vs `806-819`、`785-792`                                                               |
| P2   | `rxdb-adapter-tauri`                | `batchTimeout` 无上界 → `Instant + Duration` 溢出 panic 毒化 pending 互斥锁，经 SQLite 回调 `expect` 升级为宿主进程 abort                                           | `engine.rs:197、593、636-642`、`protocol.rs:169-177`                                                                |
| P2   | `rxdb-adapter-http`                 | create/update 回执绕过 `updatedAt` 时区门禁，无时区串进本地缓存 → 新鲜度比较依赖机器时区                                                                            | `RxDBAdapterHttp.ts:651-668` vs `metadata.ts:29-49`                                                                 |
| P2   | `rxdb-adapter-encrypted`            | 序列化写侧宽松/读侧严格：类型不符值写入后永久不可读或静默写错（boolean truthiness）                                                                                 | `serialize.ts:41-50` vs `107-133`（回退行为被 spec 固化）                                                           |
| P2   | `rxdb-adapter-electron`             | 恢复标记清除失败 → 已完整落盘的恢复目录被当半成品删除                                                                                                               | `pglite-host-restore.ts:379-383、417-419、385-392、190-201`                                                         |
| P2   | `rxdb`（+三端绑定）                 | 游标分页重锚只比 id 不比排序键值：排序键编辑 → 边界行跨页重复、后续行丢失                                                                                           | `Repository.ts:401-411`；`useInfiniteScroll.ts:205`（React）/`238`（Vue）/`InfiniteScrollingList.ts:304`（Angular） |
| P2   | `rxdb-model-react`                  | StrictMode 下 `initialQuery` 被静默丢弃：服务重建后 `lastAppliedInitialQueryRef` 不复位，新服务收不到初始条件（subquery-builder 同形）                              | `query-builder.tsx:68、89-115、126-133`；`subquery-builder.tsx:47、62-84、94-101`                                   |
| P2   | `rxdb-model-react`                  | create 模式草稿只在首帧创建，异步 `rxdb`（Promise/工厂 source）就绪后不补建——保存退化为 emit-only、关系绑定失效（Angular effect 补建 / Vue watch immediate 均覆盖） | `entity-detail.tsx:166-175、347-359、368-399`                                                                       |
| P2   | `rxdb-model-angular`                | `metadataValue`/`formFieldsValue` 回退链以 `#dialogData!` 收尾：独立使用 + namespace/name 解析失败时模板变更检测抛 TypeError（React/Vue 降级为空标题）              | `entity-detail.ts:240-242、245`                                                                                     |
| P2   | `rxdb`                              | `ReachabilityMonitor` 构造期离线时以零订阅方启动退避节拍，空转整个页面生命周期（模块自述不变量相悖）                                                                | `network/reachability.ts:151-160、246-249、286-298`                                                                 |
| P2   | `rxdb-model`                        | 日期字段永不判「未变更」（ISO 串 vs Date 实例比较），每次保存重写日期 → 虚假 UPDATE                                                                                 | `entity-form/form-data.ts:33-53`、`entity-value.utils.ts:19-22`                                                     |
| P2   | `utils`                             | `rmbUppercase` 浮点噪声：0.59 → 伍角捌分、0.09 → 玖分玖厘、0.9999 → 零元整（已执行复现）                                                                            | `string/rmb.ts:29-40`                                                                                               |
| P2   | `utils`                             | `urlJoin` 非末位段的查询串吞掉后续路径段（已执行复现）                                                                                                              | `string/urlJoin.ts:127-135`                                                                                         |
| P2   | `utils`                             | `isEqual` 稀疏数组与稠密数组判等且不对称（已执行复现）                                                                                                              | `object/isEqual.ts:65-67`                                                                                           |
| P2   | `utils`                             | `zipObject`/`pick` 自有 `__proto__` 键触发原型 setter——原型污染（已执行复现；`set.ts` 已屏蔽）                                                                      | `object/zipObject.ts:44`、`object/pick.ts:28`                                                                       |
| P2   | `utils`                             | `set`/`flattenPathObjectToPlainObject` 路径→容器推断静默丢数据、违背往返契约（已执行复现）                                                                          | `object/set.ts:43`、`object/flattenPathObjectToPlainObject.ts:13-16`                                                |
| P2   | `utils`                             | `getWords` 分词丢组合标记与 emoji，camelCase 等转换吞字符（已执行复现）                                                                                             | `string/getWords.ts:11`                                                                                             |
| P2   | `rxdb-devtools`                     | `serializer` 过滤 undefined 数组元素致索引错位；自有 `__proto__` 键被丢弃且输出对象原型被替换（已执行复现）                                                         | `serializer.ts:161、186-192`                                                                                        |
| P2   | `rxdb-devtools`                     | v2 endpoint 出站传输登记被拒时无条件释放删掉对端存活入站槽（并发上限绕过、tombstone 缺失）                                                                          | `v2/endpoint.ts:444-448`、`v2/session.ts:241-244`                                                                   |
| P2   | `rxdb-devtools`                     | v2 panel-endpoint `params` 回调抛错时永久泄漏传输槽与 10 分钟计时器                                                                                                 | `v2/panel-endpoint.ts:388、393-408`                                                                                 |
| P3   | `rxdb-model` (M1)                   | 缩写分词对 `2FAuth` 的数字嵌入形态仍有边界；`IPv4Address` 子情形已从待处理描述移除                                                                                  | `schema-parser.service.ts:88-89`                                                                                    |
| P3   | `rxdb-plugin-search`                | success 订阅内重入 `loadMore()` 顶掉待执行 page-0 数据变更刷新                                                                                                      | `search-handle.ts:164-171、253-257、197-199`                                                                        |
| P3   | `rxdb-adapter-sqlite-core`          | binary 种子值被内联成未加引号的 `1,2,3`，建表 SQL 语法错误                                                                                                          | `sqlite-core.utils.ts:552、565`、`create_tables_sql.ts:56`                                                          |
| P3   | `rxdb-adapter-supabase` (S3)        | `#findByIdsInChunks` 回填 `id` 保留物理键且绕过 `transform_row_to_entity`                                                                                           | `RxDBAdapterSupabase.ts:1023-1028`                                                                                  |
| P3   | `rxdb-adapter-tauri`                | `open` 失败错误消息向 renderer 泄露应用数据绝对路径                                                                                                                 | `paths.rs:91-98`（AC#4 契约）                                                                                       |
| P3   | `rxdb-adapter-tauri`                | base64 载荷先完整解码再比限长，尺寸上限形同虚设（可重复内存耗尽）                                                                                                   | `file/protocol.rs:279-288`、`protocol.rs:161-166`、`value.rs:106-136`                                               |
| P3   | `rxdb-adapter-electron`             | `disconnect()` 在 `await #lock` 后才置 `#closed`，并发 query 排在 `pg.close` 后报 `session_closed`                                                                  | `desktop-pglite-client.ts:442-452`（对照 sqlite-core 兄弟实现）                                                     |
| P3   | `rxdb-adapter-electron`             | `writeChunk` 忽略 `bytesWritten`，短写静默损坏已提交文件                                                                                                            | `electron-file-host.ts:667-674`                                                                                     |
| P3   | `rxdb-adapter-electron`             | `pg.commit` 传输失败留下僵尸事务独占 PGlite 连接，后续查询永久挂起                                                                                                  | `desktop-pglite-client.ts:466-469、511-515`、`electron-pglite-host.ts:733-741`                                      |
| P3   | `rxdb-adapter-encrypted`            | `unlock()` 对损坏 keyring 存储泄漏 `EncryptedDecryptError`，破坏解锁错误契约                                                                                        | `keyring.ts:418、466`                                                                                               |
| P3   | `rxdb-adapter-miniprogram`          | UTF-8 polyfill 对无效多字节序列只发 1 个 U+FFFD（WHATWG 应逐字节），已与原生实测对照                                                                                | `text-encoding-polyfills.ts:113-120`                                                                                |
| P3   | `rxdb-adapter-miniprogram`          | `Factory(module)` 抛错不回收活动库登记，同库重连误报并发连接                                                                                                        | `create-client.ts:65`、`wechat-file-vfs.ts:623`                                                                     |
| P3   | `rxdb-taro`                         | 抖音 `use strict` 检查匹配整个 app.js 文本，依赖内字符串字面量误杀构建                                                                                              | `realm-plugin.ts:83`（对照 `56` 锚定写法）                                                                          |
| P3   | `rxdb-model`                        | `parseNumberArray` 把空段解析成 0（`'1,,3'` → `[1,0,3]`），违背「无法转换的项被丢弃」文档                                                                           | `entity-value.utils.ts:42-57`                                                                                       |
| P3   | `rxdb-model`                        | 整数解析截断而非拒绝（`12.9` → `12`），严格模式也放行                                                                                                               | `entity-value.utils.ts:126-133、198-201`                                                                            |

## 验证与后续

本轮 Node `26.12.0` / pnpm `10.34.9`，已有真实 Chromium 与 PGlite 运行证据；旧报告 Node 22 不能运行 Nx 的限制已撤销。完整任务命令、用例数、覆盖率及未覆盖项见 [增量记录](./incremental-2026-10-26.md#验证)。测试全绿不关闭未覆盖失败路径上的问题，两条临时反例均已证实当前代码仍有缺陷。

优先处理 4 条 P1；随后处理本轮 INC-002 的事务通知时机、INC-001 的还锁保证及旧 P2。真实宿主与 Supabase 集成、全工作区 lint/typecheck/build/e2e 仍需按对应变更补证。
