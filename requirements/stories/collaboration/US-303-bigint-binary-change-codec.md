---
id: US-303
title: bigint/binary change codec 与系统迁移
status: Done
priority: High
epic: epic-005-type-system-evolution
created: 2026-07-31
updated: 2026-08-16
tags: [collaboration, change-tracking, migration, history, cross-tab]
---

<!--
INVEST 检查清单:
- [ ] Independent: 依赖 US-011 的类型契约和 US-206 的本地存储能力
- [x] Negotiable: codec envelope 与系统表物理表示可以调整
- [x] Valuable: 防止 change、历史和跨 Tab 路径丢精度或字符串化
- [x] Estimable: 范围集中在 change 边界、系统迁移和本地协作能力
- [x] Small: 不包含远程同步、加密和 DevTools
- [x] Testable: codec、迁移、历史和跨 Tab 均有独立 AC
-->

# 用户故事：bigint/binary change codec 与系统迁移

> **迁移路径尚未被真实发布行使过。** 0.0.x 线的 `RXDB_SYSTEM_SCHEMA_VERSION`(3) 与
> `RXDB_CHANGE_CODEC_VERSION`(1) 从未抬升，`migrateSystemSchema()` 在生产中始终走
> 「版本已是最新，无事可做」的分支。AC10–AC14 的正确性由旧库 fixture 与注入失败的测试担保，
> 首次真实迁移发布时应重新过一遍。

## 作为/我想要/以便

**作为** 使用版本历史的 Local-first 开发者
**我想要** change 系统无损记录 bigint/binary 和异构主键
**以便** 撤销、重做、分支和跨 Tab 不会改变值或类型

## 范围边界

### In Scope

#### 统一 change codec

- INSERT/UPDATE/DELETE trigger 生成的 patch / inversePatch 对 bigint、binary 无损
- entityId 使用 `RxDBEntityId`，change 存储保留 string、number、bigint 原始类型
- 使用带版本、无歧义、JSON-safe 的统一 codec；旧普通 JSON patch 保持可读
- codec 按实体元数据编码字段，普通 JSON 中形似 envelope 的对象不得被误解码
- 未知 codec/schema 版本 fail-fast，不猜测、不降级
- 解码在 QueryManager、HistoryManager、事件派发和跨 Tab 广播之前完成
- binary patch 和历史快照复制当前视图字节，不持有调用方可变引用
- query fingerprint、history scope key 和 change action key 必须区分 bigint、number 与 string

#### 系统 schema 迁移

- SQLite family 与 PGlite 的旧 RxDBChange 数据库自动升级到可承载异构 entityId 的表示
- 内建系统迁移在业务 trigger 和 Repository 启用前执行，不要求应用手写 migration
- 迁移和 watermark 在同一事务提交；失败不得留下半迁移 schema
- 迁移可安全重试；重复启动不得二次改写已迁移 change
- 迁移开始前获取后端排他锁，排除当前活跃写事务
- 迁移是单向的；已迁移数据库不承诺由旧版本重新打开，公开升级文档必须说明该限制
- 当前客户端遇到高于自身支持范围的 schema/codec 版本时必须 fail-fast

#### 本地协作能力

- undo / redo、branch switch / merge 和跨 Tab 保持新类型与 entityId
- binary 原地修改不触发 change；重新赋值后保存才产生 patch
- 旧 UUID entityId 和普通 JSON change 的查询、历史和分支行为不变

### Out of Scope

- Supabase push / pull、PostgREST、RPC 与 Realtime；含新类型实体不得配置远程同步
- 加密字段 envelope（US-804）
- DevTools wire/display 表示（US-903）
- bigint[]、binary[] 和内嵌新类型
- 自动 down migration 或允许旧客户端写入已升级数据库
- 跨 realm/进程 writer lease、drain barrier 与 epoch fencing（已取消，见下方「AC13 说明」）

## 验收标准

### Codec 与身份键

| #   | 前置条件                                       | 操作                              | 预期结果                                          | 状态 |
| --- | ---------------------------------------------- | --------------------------------- | ------------------------------------------------- | ---- |
| 1   | SQLite 实体含 binary                           | INSERT/UPDATE/DELETE              | trigger 不把 raw BLOB 交给 JSON1，change 写入成功 | ✅   |
| 2   | PGlite 实体含超安全 bigint/bytea               | INSERT/UPDATE/DELETE              | trigger 不经 JSON number/string 退化              | ✅   |
| 3   | bigint `9007199254740993n`                     | 读取 change                       | patch 中仍为相同 bigint                           | ✅   |
| 4   | binary `subarray()`                            | 读取 change                       | patch 为独立 Uint8Array，只含视图内字节           | ✅   |
| 5   | string、number、bigint entityId                | 产生并读取 change                 | entityId 恢复原始类型                             | ✅   |
| 6   | 普通 JSON 字段包含与 codec envelope 同形的对象 | change round-trip                 | 对象内容不变，不被误解码                          | ✅   |
| 7   | change 含未知 codec/schema version             | 解码                              | 抛明确 unsupported-version 错误                   | ✅   |
| 8   | 旧普通 JSON patch 和 UUID entityId             | 新版本读取                        | 行为与升级前一致                                  | ✅   |
| 9   | ID 值分别为 `1`、`1n`、`'1'`                   | 生成 fingerprint/scope/action key | 三种键不碰撞                                      | ✅   |

### 系统迁移

| #   | 前置条件                                   | 操作           | 预期结果                                       | 状态 |
| --- | ------------------------------------------ | -------------- | ---------------------------------------------- | ---- |
| 10  | SQLite/PGlite 旧库含 UUID change           | 新版本 connect | 内建迁移自动完成，旧 change 可查询、切换和撤销 | ✅   |
| 11  | 迁移执行到任意 DDL/DML 步骤时注入失败      | 重新打开数据库 | 首次升级完整回滚；重试一次成功，无数据丢失     | ✅   |
| 12  | 已完成迁移的数据库                         | 重复 connect   | 不重复迁移或改写历史数据                       | ✅   |
| 13  | 另一 writer 持有旧数据库连接               | 尝试升级       | 获取升级锁失败并中止，业务 trigger 不启动      | ✅   |
| 14  | 数据库 schema/codec 版本高于客户端支持范围 | connect        | fail-fast，不读写未知格式                      | ✅   |

### History、Branch 与跨 Tab

| #   | 前置条件                              | 操作                      | 预期结果                                               | 状态 |
| --- | ------------------------------------- | ------------------------- | ------------------------------------------------------ | ---- |
| 15  | 修改 bigint / binary                  | undo 后 redo              | 值与运行时类型逐步恢复，updatedAt 保持单调             | ✅   |
| 16  | 保存 binary 后继续修改原输入数组      | 读取历史                  | 已保存 patch 不随外部数组变化                          | ✅   |
| 17  | 含新类型与 bigint ID 的分支           | switch / merge branch     | entityId、patch、inversePatch 与最终实体均无损         | ✅   |
| 18  | 两个同版本 Tab 使用同一数据库         | 保存新类型字段            | 另一 Tab 收到正确类型且查询缓存只刷新一次              | ✅   |
| 19  | binary 字段只发生原地修改             | save                      | 不产生隐式 change；重新赋值后 save 才产生可撤销 change | ✅   |
| 20  | 既有 PropertyType 和旧 change fixture | 运行 adapter/version 回归 | 用户可见行为不变                                       | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过 / ↪ 已转移至其他 story

### AC13 说明

AC13 由后端排他锁本身满足：迁移在 `BEGIN EXCLUSIVE`（SQLite）/ 表锁（PGlite）失败时抛
`RxDBSystemMigrationLockError` 并中止，业务 trigger 不启动。

原计划在此之上叠加的**跨 realm writer lease、drain barrier 与 epoch fencing 已取消**——
它需要一套持久化 lease/guard 表、桥接版本发布流程和多进程回归套件，而 0.0.x 线至今没有真实
迁移发布来验证它，成本与收益不成比例。该协议连同其代码与用户故事一并删除。
若未来出现真实的跨 realm 迁移需求，重新立项即可，本 story 的锁契约不受影响。

## 技术约束

- SQLite JSON1 不能表示 BLOB，JSON number 不能无损表示 64 位 bigint
- entityId 不在 patch 内，必须走同一版本化 codec
- codec 入口集中，trigger、branch 和 gateway 不各自发明格式
- identity key 必须带类型标签，禁止依赖 `String(id)` 作为唯一表示
- 新版本可以读旧格式；旧版本读新格式不在兼容承诺内
- SQLite 四个具体 adapter 和 PGlite 都必须跑旧库升级 fixture

## 实现文件

- `packages/rxdb/src/system/` — RxDBChange entityId、schema/codec 版本与生成类型
- `packages/rxdb/src/version/` — history、undo/redo、branch 和 identity key
- `packages/rxdb/src/gateway/` — 跨 Tab codec 边界
- `packages/rxdb/src/RxDB.ts` — 内建迁移顺序、锁与 watermark
- `packages/rxdb-adapter-sqlite-core/src/` — trigger codec 与 SQLite 系统迁移
- `packages/rxdb-adapter-pglite/src/` — trigger codec 与 PGlite 系统迁移
- `packages/rxdb-test/src/testing/` — 旧库 fixture 和跨 adapter change 套件

## References

- [US-011 类型与公共 API 契约](../core/US-011-property-type-bigint-binary.md)
- [US-206 本地适配器持久化与查询](../adapter/US-206-bigint-binary-adapter.md)
- [SQLite JSON1](https://www.sqlite.org/json1.html)
