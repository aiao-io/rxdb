# `@aiao/rxdb-adapter-sqliteai` 代码评审

> ## ⚠️ 本报告已作废（superseded）
>
> **不要引用本报告的结论。** 它的 🔴 判据已不成立，而真正开放的问题它没写。
>
> - **失效原因**（SQLAI-006）：报告称「OPFS 默认静默回退内存」——
>   当前 `opfsFallback` 默认已经是 `throw`，该问题**已关闭**；
>   报告同时把仍开放的全局事务根因挂在过期行号与旧编号下。
> - **实际状态**：后续评审提出 SQLAI-001 ~ 007，其中 SQLAI-001
>   （模块缓存忽略首次之外的加载配置 —— 不同 `wasmPath` 会静默拿到首个模块）是 P1，
>   已于 2026-08-04 修复（与 `rxdb-adapter-sqlite` 的 SQLI-001 是同一缺陷，共用 sqlite-core 的指纹实现）。
> - **当前基线**：`code-reviews/incomplete/SQLAI-*.md` 与 `code-reviews/incomplete/TRIAGE.md`。
>
> 保留原文仅为存档：旧证据可查，但已关闭 / 已迁移项以本声明为准。

## 结论（已作废）

🔴 不通过。自身实现很薄，但继承 oo1 基类的 OPFS 静默内存 fallback，会把“持久化数据库”降级成易丢失数据的内存库。

## 评审基线

- 基线提交：`03a46a5d5992a958c19ae33d5fed15c9c3322021`
- 评审日期：2026-07-14
- 范围：SqliteAI 客户端、加载器、工厂、测试和公开入口；24 个文件，约 972 行 TS
- 自动校验：`lint`、`test`、`typecheck`、`build` 全部通过

## 问题

| ID           | 级别       | 位置                                                              | 问题与影响                                                                                                       | 建议                                                                              |
| ------------ | ---------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| SQLITEAI-001 | P1（继承） | `@aiao/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts:179`         | `SqliteaiClient` 直接使用 oo1 基类。请求 OPFS 而运行环境不支持时默认转为 `:memory:` 并继续运行，重启后数据丢失。 | 修复 sqlite-core 默认行为；在 SqliteAI 工厂增加 OPFS 失败必须 reject 的集成测试。 |
| SQLITEAI-002 | P0（继承） | `@aiao/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:275` | 适配器继承全局事务锁，独立并发 query 可进入活跃事务。                                                            | 修复 sqlite-core 并在 SqliteAI 运行时覆盖事务隔离测试。                           |

## 其余观察

- 加载器、factory 和 client 只负责差异化模块加载，其余敏感生命周期逻辑集中在 core，未发现重复实现偏差。
- 未发现 `any`、TypeScript 抑制指令或 ESLint 忽略。
