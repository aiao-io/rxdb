---
title: packages 全量代码评审汇总
status: StaticReview
baseline: main@94df0a04
reviewed: 2026-10-16
secondPass: 2026-10-16
---

# packages 全量代码评审汇总

## 结果

本轮覆盖 `packages/` 下 51 个包，每包一份报告。首轮静态评审确认 6 条问题（2 P1 + 4 P2）并在 `codex/packages-review` 分支完成修复；二次评审独立复核了全部修复，并对 51 个包的源码做了第二轮走查（适配器家族与 utils/devtools 全文件，core/框架/插件为高风险路径 + 深扫补齐），新确认 43 条问题（4 P1 + 24 P2 + 15 P3）。

### 首轮 6 条问题：全部修复并经二次评审复核

| 等级 | 包                       | 问题                                       | 复核结论                                                                                                                 |
| ---- | ------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| P1   | `rxdb-adapter-pglite`    | 关系 JOIN SQL 硬编码主键物理列 `id`        | ✅ 已修。`get_primary_key_column` 覆盖三种 JOIN 两侧；嵌套路径语义经推演正确；JOIN spec 8/8 通过（Node 26.7 node 模式）  |
| P1   | `rxdb-adapter-supabase`  | CRUD/分页/树查询硬编码 `id`                | ✅ 主键列映射已修（单实体 CRUD/find/分页/树/行转换）。批量写路径残留见下 S2；`updatedBy` 行见下 S1；unit spec 67/67 通过 |
| P2   | `rxdb-adapter-supabase`  | 数值/BigInt parentId 被 `hasChildren` 丢弃 | ✅ 已修（`String()` 归一），两侧判据一致                                                                                 |
| P2   | `rxdb-model`             | 缩写被标题生成器拆成单字母                 | ✅ 已修（两步分词正则），文档示例全部符合；本包 996/996 通过。残留边界见 M1                                              |
| P2   | `rxdb-plugin-querycache` | history/sync 硬依赖未进 peerDependencies   | ✅ 已修（peers + eslint ignore + tsconfig refs + lockfile importers）；本包 205/205 通过                                 |
| P2   | `rxdb-plugin-replay-vue` | 挂载前 `seek()` 丢失目标                   | ✅ 已修（`pendingSeek`），与 Angular/React 语义逐项对齐；本包 11/11 通过                                                 |

### 二次评审新确认问题（尚未处理）

| 等级 | 包                                  | 问题                                                                                                                                                                | 证据锚点                                                                                                            |
| ---- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| P1   | `rxdb-adapter-sqlite-core`          | 加密列 + 自定义主键 `columnName`：写入 AAD 用空串、读取用真实 id → 行**永久不可读**，写入无报错（影响全部 sqlite 家族适配器）                                       | `sqlite-core.utils.ts:391/711`、`insert_sql.ts:66`、`inserts_sql.ts:67`（对照 `update_sql.ts:46-47`）               |
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
| P2   | `rxdb`（+三端绑定）                 | 游标分页重锚只比 id 不比排序键值：排序键编辑 → 边界行跨页重复、后续行丢失                                                                                           | `Repository.ts:391-401`；`useInfiniteScroll.ts:205`（React）/`238`（Vue）/`InfiniteScrollingList.ts:304`（Angular） |
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
| P3   | `rxdb-model` (M1)                   | 缩写分词对 `IPv4Address`/`2FAuth` 形态仍有边界（已执行复现）                                                                                                        | `schema-parser.service.ts:88-89`                                                                                    |
| P3   | `rxdb-plugin-search`                | success 订阅内重入 `loadMore()` 顶掉待执行 page-0 数据变更刷新                                                                                                      | `search-handle.ts:164-171、253-257、197-199`                                                                        |
| P3   | `rxdb-adapter-sqlite-core`          | binary 种子值被内联成未加引号的 `1,2,3`，建表 SQL 语法错误                                                                                                          | `sqlite-core.utils.ts:588、601`、`create_tables_sql.ts:52`                                                          |
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

## 验证结论（二次评审，Node v26.7.0）

- 修复相关测试均以 node 模式复跑通过：PGlite JOIN spec 8/8、Supabase unit（transform + applyRuleGroup）67/67、rxdb-model 996/996、replay-vue 11/11、querycache 205/205；受影响包 `typecheck` 通过。
- `nx test` 的 browser runner 在本 worktree 因 @vitest/browser-playwright 环境崩溃（与首轮记录一致），不能据此判定代码失败；Supabase 全量 612 例需 Docker `test-env`（本机不可用）未复跑。
- 二次评审新确认的 43 条全部为静态证据定位 + 触发条件推演（utils/devtools/serializer 等算法类发现经构建产物直接执行复现；StrictMode 与 TextDecoder 类发现经执行/原生对照），未做修复，也未把静态结论冒充动态测试通过。

## 修复顺序建议

1. 先修 P1（4 条）：sqlite-core 加密 AAD 取主键值（`insert_sql`/`inserts_sql` 显式传 `primaryKey: entity.id`），补「自定义主键列 + 加密列」共享套件；rxdb-model-react `EntityTable` 销毁清理复位 `tableReady`（补 StrictMode 双挂载回归）；rxdb-model 枚举编辑器记录并恢复原值；rxdb-devtools OPFS 上传探测同名与 commit 失败清理。
2. 修 P2：按包独立可并行——Supabase 三处口径统一（S1 一行、S2 批量映射或契约声明、S5 父列口径）；三端 search 错误处理器对称；QueryCache `findById` 代次守卫；Tauri `batchTimeout` 上界与锁毒化；HTTP 回执时区门禁；encrypted 写侧严格性；Electron 恢复 commit 可重试；core 游标重锚比投影值与 reachability 零订阅方守卫；rxdb-model-react 的 initialQuery/草稿补建、rxdb-model-angular 的空回退、rxdb-model 日期未变更判据；utils 六个算法修复（rmb/urlJoin/isEqual/原型污染/路径往返/分词）；devtools serializer 与 v2 transfer 两处释放语义。
3. P3 批次：regex 锚定、尺寸前置检查、解码宽度、错误类别包装、登记回收等小修，多数有明确改法。
4. 在 Node 26+ 环境串行执行 51 个包 lint/typecheck/test/build，补跑浏览器、真实 Supabase/PostgREST、PGlite JOIN、桌面/Tauri/小程序宿主测试；全部条目复核修复后按 `requirements/reviews/README.md` 规则删除条目。

## 文档导航

- `plan.md`：总计划、分组、分级和执行步骤。
- `core-plan.md`、`adapter-plan.md`、`plugin-plan.md`：三组评审方法和验证限制。
- `cross-framework.md`：Angular/React/Vue 交叉 API 对照（含二次评审新确认的不对称项）。
- 51 个 `<package>.md`：逐包检查范围、发现、风险和验证建议；首轮已修复条目保留复核结论与验证证据。
