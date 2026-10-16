---
title: packages 全量代码评审汇总
status: StaticReview
baseline: main@94df0a04
reviewed: 2026-10-16
secondPass: 2026-10-16
---

# packages 全量代码评审汇总

## 结果

本轮覆盖 `packages/` 下 51 个包，每包一份报告。首轮静态评审确认 6 条问题（2 P1 + 4 P2）并在 `codex/packages-review` 分支完成修复；二次评审独立复核了全部修复，并扩展检查了 sqlite 家族、Tauri(Rust+TS)、Electron、HTTP、encrypted、miniprogram、Taro、search/querycache 与 core+三端绑定，新确认 24 条问题（1 P1 + 10 P2 + 13 P3）。

### 首轮 6 条问题：全部修复并经二次评审复核

| 等级 | 包 | 问题 | 复核结论 |
| --- | --- | --- | --- |
| P1 | `rxdb-adapter-pglite` | 关系 JOIN SQL 硬编码主键物理列 `id` | ✅ 已修。`get_primary_key_column` 覆盖三种 JOIN 两侧；嵌套路径语义经推演正确；JOIN spec 8/8 通过（Node 26.7 node 模式） |
| P1 | `rxdb-adapter-supabase` | CRUD/分页/树查询硬编码 `id` | ✅ 主键列映射已修（单实体 CRUD/find/分页/树/行转换）。批量写路径残留见下 S2；`updatedBy` 行见下 S1；unit spec 67/67 通过 |
| P2 | `rxdb-adapter-supabase` | 数值/BigInt parentId 被 `hasChildren` 丢弃 | ✅ 已修（`String()` 归一），两侧判据一致 |
| P2 | `rxdb-model` | 缩写被标题生成器拆成单字母 | ✅ 已修（两步分词正则），文档示例全部符合；本包 996/996 通过。残留边界见 M1 |
| P2 | `rxdb-plugin-querycache` | history/sync 硬依赖未进 peerDependencies | ✅ 已修（peers + eslint ignore + tsconfig refs + lockfile importers）；本包 205/205 通过 |
| P2 | `rxdb-plugin-replay-vue` | 挂载前 `seek()` 丢失目标 | ✅ 已修（`pendingSeek`），与 Angular/React 语义逐项对齐；本包 11/11 通过 |

### 二次评审新确认问题（尚未处理）

| 等级 | 包 | 问题 | 证据锚点 |
| --- | --- | --- | --- |
| P1 | `rxdb-adapter-sqlite-core` | 加密列 + 自定义主键 `columnName`：写入 AAD 用空串、读取用真实 id → 行**永久不可读**，写入无报错（影响全部 sqlite 家族适配器） | `sqlite-core.utils.ts:391/711`、`insert_sql.ts:66`、`inserts_sql.ts:67`（对照 `update_sql.ts:46-47`） |
| P2 | `rxdb-adapter-supabase` (S1) | `update()` 的 `updatedBy` 仍按物理列名写入属性名键 patch（`7ff0bc8c` 回退引入） | `SupabaseRepository.ts:208` |
| P2 | `rxdb-adapter-supabase` (S2) | 批量写路径（`saveMany`/`mutations`/`mergeChanges`）无主键列映射；服务端 `rxdb_batch_upsert` 硬编码 `ON CONFLICT (id)` | `RxDBAdapterSupabase.ts:729-740`、`RxDBAdapterSupabase.utils.ts:35-78`、`docker/sql/04-rxdb-utils-functions.sql:39` |
| P2 | `rxdb-adapter-supabase` (S5) | 树查询 `parent_column_name()` 用 columnName、CRUD 用属性名，父列口径不一致 | `SupabaseTreeRepository.ts:389-395` vs `SupabaseRepository.ts:37-48` |
| P2 | `rxdb-plugin-search-react` / `-vue` | 桥接流四订阅无 error 处理器（Angular 有 `reportStreamFailure`），流损坏走 RxJS `reportUnhandledError` 崩应用 | `use-search.ts:124-127` / `164-167`；对照 `inject-search.ts:183-191` |
| P2 | `rxdb-plugin-querycache` | `findById` 绕过作废代次检查，过期远端响应可回退已确认写入 | `QueryCacheEngine.ts:373-382` vs `806-819`、`785-792` |
| P2 | `rxdb-adapter-tauri` | `batchTimeout` 无上界 → `Instant + Duration` 溢出 panic 毒化 pending 互斥锁，经 SQLite 回调 `expect` 升级为宿主进程 abort | `engine.rs:197、593、636-642`、`protocol.rs:169-177` |
| P2 | `rxdb-adapter-http` | create/update 回执绕过 `updatedAt` 时区门禁，无时区串进本地缓存 → 新鲜度比较依赖机器时区 | `RxDBAdapterHttp.ts:651-668` vs `metadata.ts:29-49` |
| P2 | `rxdb-adapter-encrypted` | 序列化写侧宽松/读侧严格：类型不符值写入后永久不可读或静默写错（boolean truthiness） | `serialize.ts:41-50` vs `107-133`（回退行为被 spec 固化） |
| P2 | `rxdb-adapter-electron` | 恢复标记清除失败 → 已完整落盘的恢复目录被当半成品删除 | `pglite-host-restore.ts:379-383、417-419、385-392、190-201` |
| P2 | `rxdb`（+三端绑定） | 游标分页重锚只比 id 不比排序键值：排序键编辑 → 边界行跨页重复、后续行丢失 | `Repository.ts:391-401`；`useInfiniteScroll.ts:205`（React）/`238`（Vue）/`InfiniteScrollingList.ts:304`（Angular） |
| P3 | `rxdb-model` (M1) | 缩写分词对 `IPv4Address`/`2FAuth` 形态仍有边界（已执行复现） | `schema-parser.service.ts:88-89` |
| P3 | `rxdb-plugin-search` | success 订阅内重入 `loadMore()` 顶掉待执行 page-0 数据变更刷新 | `search-handle.ts:164-171、253-257、197-199` |
| P3 | `rxdb-adapter-sqlite-core` | binary 种子值被内联成未加引号的 `1,2,3`，建表 SQL 语法错误 | `sqlite-core.utils.ts:588、601`、`create_tables_sql.ts:52` |
| P3 | `rxdb-adapter-supabase` (S3) | `#findByIdsInChunks` 回填 `id` 保留物理键且绕过 `transform_row_to_entity` | `RxDBAdapterSupabase.ts:1023-1028` |
| P3 | `rxdb-adapter-tauri` | `open` 失败错误消息向 renderer 泄露应用数据绝对路径 | `paths.rs:91-98`（AC#4 契约） |
| P3 | `rxdb-adapter-tauri` | base64 载荷先完整解码再比限长，尺寸上限形同虚设（可重复内存耗尽） | `file/protocol.rs:279-288`、`protocol.rs:161-166`、`value.rs:106-136` |
| P3 | `rxdb-adapter-electron` | `disconnect()` 在 `await #lock` 后才置 `#closed`，并发 query 排在 `pg.close` 后报 `session_closed` | `desktop-pglite-client.ts:442-452`（对照 sqlite-core 兄弟实现） |
| P3 | `rxdb-adapter-electron` | `writeChunk` 忽略 `bytesWritten`，短写静默损坏已提交文件 | `electron-file-host.ts:667-674` |
| P3 | `rxdb-adapter-electron` | `pg.commit` 传输失败留下僵尸事务独占 PGlite 连接，后续查询永久挂起 | `desktop-pglite-client.ts:466-469、511-515`、`electron-pglite-host.ts:733-741` |
| P3 | `rxdb-adapter-encrypted` | `unlock()` 对损坏 keyring 存储泄漏 `EncryptedDecryptError`，破坏解锁错误契约 | `keyring.ts:418、466` |
| P3 | `rxdb-adapter-miniprogram` | UTF-8 polyfill 对无效多字节序列只发 1 个 U+FFFD（WHATWG 应逐字节），已与原生实测对照 | `text-encoding-polyfills.ts:113-120` |
| P3 | `rxdb-adapter-miniprogram` | `Factory(module)` 抛错不回收活动库登记，同库重连误报并发连接 | `create-client.ts:65`、`wechat-file-vfs.ts:623` |
| P3 | `rxdb-taro` | 抖音 `use strict` 检查匹配整个 app.js 文本，依赖内字符串字面量误杀构建 | `realm-plugin.ts:83`（对照 `56` 锚定写法） |

## 验证结论（二次评审，Node v26.7.0）

- 修复相关测试均以 node 模式复跑通过：PGlite JOIN spec 8/8、Supabase unit（transform + applyRuleGroup）67/67、rxdb-model 996/996、replay-vue 11/11、querycache 205/205；受影响包 `typecheck` 通过。
- `nx test` 的 browser runner 在本 worktree 因 @vitest/browser-playwright 环境崩溃（与首轮记录一致），不能据此判定代码失败；Supabase 全量 612 例需 Docker `test-env`（本机不可用）未复跑。
- 二次评审新确认的 24 条全部为静态证据定位 + 触发条件推演（部分经执行复现，如 TextDecoder 对照、缩写分词），未做修复，也未把静态结论冒充动态测试通过。

## 修复顺序建议

1. 先修 P1：sqlite-core 加密 AAD 取主键值（`insert_sql`/`inserts_sql` 显式传 `primaryKey: entity.id`），补「自定义主键列 + 加密列」共享套件。
2. 修 P2：按包独立可并行——Supabase 三处口径统一（S1 一行、S2 批量映射或契约声明、S5 父列口径）；三端 search 错误处理器对称；QueryCache `findById` 代次守卫；Tauri `batchTimeout` 上界与锁毒化；HTTP 回执时区门禁；encrypted 写侧严格性；Electron 恢复 commit 可重试；core 游标重锚比投影值。
3. P3 批次：regex 锚定、尺寸前置检查、解码宽度、错误类别包装、登记回收等小修，多数有明确改法。
4. 在 Node 26+ 环境串行执行 51 个包 lint/typecheck/test/build，补跑浏览器、真实 Supabase/PostgREST、PGlite JOIN、桌面/Tauri/小程序宿主测试；全部条目复核修复后按 `requirements/reviews/README.md` 规则删除条目。

## 文档导航

- `plan.md`：总计划、分组、分级和执行步骤。
- `core-plan.md`、`adapter-plan.md`、`plugin-plan.md`：三组评审方法和验证限制。
- `cross-framework.md`：Angular/React/Vue 交叉 API 对照（含二次评审新确认的不对称项）。
- 51 个 `<package>.md`：逐包检查范围、发现、风险和验证建议；首轮已修复条目保留复核结论与验证证据。
