---
kind: review-execution
object: rxdb-adapter-tauri
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# rxdb-adapter-tauri：实际评审执行记录

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

Tauri TypeScript transport 与 Rust SQLite/file host；双语言共享协议和 conformance。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

入口/配置已读取并核对：

- [`packages/rxdb-adapter-tauri/src/RxDBAdapterTauri.ts`](../../../../packages/rxdb-adapter-tauri/src/RxDBAdapterTauri.ts)
- [`packages/rxdb-adapter-tauri/src/tauri-host-transport.ts`](../../../../packages/rxdb-adapter-tauri/src/tauri-host-transport.ts)
- [`packages/rxdb-adapter-tauri/src/desktop-json-codec.ts`](../../../../packages/rxdb-adapter-tauri/src/desktop-json-codec.ts)
- [`packages/rxdb-adapter-tauri/rust/src/router.rs`](../../../../packages/rxdb-adapter-tauri/rust/src/router.rs)
- [`packages/rxdb-adapter-tauri/rust/src/session.rs`](../../../../packages/rxdb-adapter-tauri/rust/src/session.rs)
- [`packages/rxdb-adapter-tauri/rust/src/paths.rs`](../../../../packages/rxdb-adapter-tauri/rust/src/paths.rs)
- [`packages/rxdb-adapter-tauri/conformance/rust-adapter-factory.ts`](../../../../packages/rxdb-adapter-tauri/conformance/rust-adapter-factory.ts)
- [`packages/rxdb-adapter-tauri/package.json`](../../../../packages/rxdb-adapter-tauri/package.json)
- [`packages/rxdb-adapter-tauri/project.json`](../../../../packages/rxdb-adapter-tauri/project.json)
- [`packages/rxdb-adapter-tauri/src/index.ts`](../../../../packages/rxdb-adapter-tauri/src/index.ts)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/lint.txt)      |
| `typecheck` | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/typecheck.txt) |
| `test`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/test.txt)      |
| `build`     | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/build.txt)     |

当前确认意见：本轮基线阶段尚无新增确认问题；不能据此给全对象通过结论。

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 TS / Rust 协议对齐：逐字段对照共用协议、codec、Rust protocol/router/value，核查版本协商、类型范围与错误码。
- [ ] C2 会话、事务与 engine：追踪 session、engine、script 的串行化、所有权与 cleanup，检查请求失败后的事务状态。
- [ ] C3 Rust 文件边界：审查 paths/file/locks 和恢复目标，检查目录边界、逻辑路径、链接和锁释放。
- [ ] C4 真实 Rust conformance：检查 conformance factory/transport 和 build-test-host 的依赖，再跑真实宿主而非 TS mock。
- [ ] C5 加密与备份：核查 TS codec、Rust value 与 encrypted/backup harness 的数据来回，不泄露历史敏感值。
- [ ] C6 发布与应用权限：对照 crate、JS exports、Tauri 应用 commands/capabilities；区分适配器允许与应用授权。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 专项任务核销

- [Rust 三目标通过](../../evidence/2026-10-03/full-run/cargo.txt)。
- [真实宿主 conformance 通过](../../evidence/2026-10-03/full-run/tauri-conformance.txt)。

上述只是对应任务/平台的证据，专项 C 项/其它宿主未自动完成。
