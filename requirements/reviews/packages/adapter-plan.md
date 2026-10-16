# 适配器组评审计划

## 覆盖范围

本组覆盖 13 个包：`rxdb-adapter-electron`、`rxdb-adapter-encrypted`、`rxdb-adapter-http`、`rxdb-adapter-miniprogram`、`rxdb-adapter-pglite`、`rxdb-adapter-sqlite`、`rxdb-adapter-sqlite-core`、`rxdb-adapter-sqlite-wasm`、`rxdb-adapter-sqliteai`、`rxdb-adapter-supabase`、`rxdb-adapter-tauri`、`rxdb-adapter-wa-sqlite`、`rxdb-taro`。

## 评审方法

- 以 `main` 基线源码为准，核对每包 `package.json` 的入口、exports、依赖与发布文件，再核对 `project.json`、Vite/测试配置和 README 的使用入口。
- 走读 `src/`（以及 Tauri 的 `rust/`）公开入口、生命周期、错误处理、数据编码、并发/锁、分页和跨进程边界；用 `src/__tests__`、`conformance/`、`public-contract/` 反查关键契约是否有回归覆盖。
- 发现只记录可定位、可复现且影响用户行为的问题，按 P0（阻断/数据损坏）、P1（主要功能或数据正确性）、P2（边界行为/可维护性）、P3（文档或低风险）分级；无问题的包也记录检查范围与未发现结论。
- 本轮不修改生产代码、不提交。验证建议优先使用对应 Nx target（build/typecheck/test、Tauri cargo/conformance、Supabase test-env），并补齐未覆盖的边界用例。

## 验证限制

当前工作树的 Nx daemon 目录返回 `EPERM`，且执行环境 Node 22.14 低于仓库要求 Node >=26，因此本轮以静态源码和现有测试审查为主；各包报告列出后续应执行的验证命令。
