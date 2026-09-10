# 与 rxdb.info 的区别

npm 上的 [`rxdb`](https://rxdb.info) 是一个成熟的 NoSQL 文档数据库，和本项目（`@aiao/rxdb` 及 `@aiao/*` 系列包）**没有任何关系**：
不是 fork、不是插件、不共享代码或协议。两个项目名字相近，但解决的问题和取舍不同。选型前先看这张表。

| 维度         | `rxdb`（rxdb.info）                                   | `@aiao/rxdb`（本项目）                                                                                                                     |
| ------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 数据模型     | JSON 文档 + JSON Schema，集合（collection）           | TypeScript 装饰器实体（`@Entity` / `@TreeEntity` / `@GraphEntity`），关系与索引在声明里                                                    |
| 存储引擎     | 可插拔 storage（IndexedDB / Dexie / SQLite / 内存等） | 关系型引擎：浏览器内 SQLite（wa-sqlite / sqlite-wasm / sqliteai）或 PostgreSQL（PGlite），桌面走 Electron `node:sqlite` / Tauri `rusqlite` |
| 查询         | Mango 风格文档查询                                    | 类型安全的 `RuleGroup` 条件 + 排序 / 分页 / 游标，落到真实 SQL；树、图查询内建                                                             |
| 关系         | 文档引用，`population` 手工展开                       | 1:1 / 1:N / N:1 / M:N 自动中间表，级联查询与变更                                                                                           |
| 响应式       | RxJS Observable                                       | RxJS Observable → Angular Signals / React Hooks / Vue Composables，三端 API 对称                                                           |
| 同步         | 自带 replication 协议 + 多种远端插件                  | 适配器层：Supabase、HTTP（远端权威 + 本地行缓存）、自定义 remote adapter                                                                   |
| 版本与协作   | 无内建版本图                                          | Git 式分支 / 合并 / 撤销重做（epic-006 的工作树与提交历史在路线图上）                                                                      |
| 加密         | 加密插件                                              | 字段级 AES-GCM-256 内建于 SQLite / PGlite 适配器                                                                                           |
| 许可与商业化 | 核心开源，部分插件为付费                              | 全部 MIT                                                                                                                                   |
| 成熟度       | 多年生产使用                                          | 0.x，API 尚未冻结，见[版本策略](../versioning.md)                                                                                          |

## 什么时候该用哪个

- 你的数据天然是文档、想要现成的多端 replication 与庞大的生态 → 用 `rxdb`。
- 你要在浏览器 / 桌面里跑**关系型**模型（外键、中间表、事务、SQL 级索引），想用一份 TypeScript 声明同时驱动 schema、类型、查询和三框架 UI → 用 `@aiao/rxdb`。

> 关于 rxdb.info 的描述取自其公开文档，可能随其版本变化；以对方官网为准。
