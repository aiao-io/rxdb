# `@aiao/rxdb-adapter-sqlite` 代码评审

## 结论

🔴 不通过。官方 sqlite-wasm 实现复用 oo1 基类与 SQLite 基适配器，因此继承持久化静默降级和事务隔离问题。

## 评审基线

- 基线提交：`03a46a5d5992a958c19ae33d5fed15c9c3322021`
- 评审日期：2026-07-14
- 范围：官方 sqlite-wasm 客户端、加载器、工厂、测试和公开入口；22 个文件，约 891 行 TS
- 自动校验：`lint`、`test`、`typecheck`、`build` 全部通过

## 问题

| ID | 级别 | 位置 | 问题与影响 | 建议 |
| --- | --- | --- | --- | --- |
| SQLITE-001 | P1（继承） | `@aiao/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts:179` | `opfs: true` 失败后默认继续使用内存 DB，调用方没有失败信号，却失去持久化保证。 | 将默认 fallback 改为抛错；若显式选择内存模式，向调用方暴露实际后端。 |
| SQLITE-002 | P0（继承） | `@aiao/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:275` | 独立并发 query 会因全局 transaction lock 混入另一个事务。 | 修复 sqlite-core，并给官方运行时增加交错事务回归测试。 |

## 其余观察

- 工厂正确透传 OPFS、Worker、缓存和事件批处理选项；加载失败由 core 清理。
- 未发现本包独有的类型抑制或 SQL 拼接路径。
