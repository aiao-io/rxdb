---
kind: review-execution
object: rxdb-adapter-http
created: 2026-10-03
baseline: 58b4bbb61efa71d4591cafab6a4c92955a7760dd
execution: partial
---

# rxdb-adapter-http：实际代码评审记录

**状态：部分执行。** 已确认问题见下文；未穷举全部受控文件，未完成本对象全部 C 项，不给全包 🟢。

## 1. 实际范围与取证方式

仅完成上述模块的部分静态阅读。已核对“切换用户需 disconnect/connect”和“只有首个同身份查询的观测回调生效”等已明确文档化限制，未将其误报为新缺陷。没有执行该包完整网络/取消/SSE/缓存/浏览器套件，不能给整体通过结论。

以下是实际阅读/追踪的模块入口，包含专题片段，**不是声称逐行审完每个文件**：

- [`packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts`](../../../../packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts)
- [`packages/rxdb-adapter-http/src/transport.ts`](../../../../packages/rxdb-adapter-http/src/transport.ts)
- [`packages/rxdb-adapter-http/src/conditional-cache.ts`](../../../../packages/rxdb-adapter-http/src/conditional-cache.ts)
- [`packages/rxdb-adapter-http/src/pagination.ts`](../../../../packages/rxdb-adapter-http/src/pagination.ts)
- [`packages/rxdb-adapter-http/src/change-feed.ts`](../../../../packages/rxdb-adapter-http/src/change-feed.ts)
- [`packages/rxdb-adapter-http/src/http.interface.ts`](../../../../packages/rxdb-adapter-http/src/http.interface.ts)
- [`packages/rxdb-adapter-http/README.md`](../../../../packages/rxdb-adapter-http/README.md)

## 2. 评审意见

本次已读范围内没有新增确认问题；**不是全包无缺陷或门禁通过**。其余 C 项继续待核查。

## 3. 动态证据与复验

本包本轮无独立动态通过证据。

业务源码基线 `58b4bbb61efa71d4591cafab6a4c92955a7760dd`。SQL 复验明确关闭覆盖率；测试失败是预期的缺陷红灯，非 worker/service stopped 并发假失败。覆盖率未测量，也没有执行修复。

## 4. 尚未完成

- [ ] 原计划其余源码、C 项及真实运行环境补证。
- [ ] 针对确认问题先保持红测试，再最小修复、绿、重构。
- [ ] 适用的三框架/真实宿主及公开 API 兼容回归。
- [ ] 四项覆盖率、整包门禁与实际应用/E2E 链路。

原计划：[对应对象评审计划](../../packages/rxdb-adapter-http.md)；进度：[全范围执行台账](../../execution-2026-10-03.md)。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

QueryCache 的 HTTP remote adapter：规则查询、条件缓存、分页、变更流与 transport。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

入口/配置已读取并核对：

- [`packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts`](../../../../packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts)
- [`packages/rxdb-adapter-http/src/handler-contract.ts`](../../../../packages/rxdb-adapter-http/src/handler-contract.ts)
- [`packages/rxdb-adapter-http/src/rest.ts`](../../../../packages/rxdb-adapter-http/src/rest.ts)
- [`packages/rxdb-adapter-http/src/transport.ts`](../../../../packages/rxdb-adapter-http/src/transport.ts)
- [`packages/rxdb-adapter-http/src/pagination.ts`](../../../../packages/rxdb-adapter-http/src/pagination.ts)
- [`packages/rxdb-adapter-http/src/conditional-cache.ts`](../../../../packages/rxdb-adapter-http/src/conditional-cache.ts)
- [`packages/rxdb-adapter-http/src/change-feed.ts`](../../../../packages/rxdb-adapter-http/src/change-feed.ts)
- [`packages/rxdb-adapter-http/package.json`](../../../../packages/rxdb-adapter-http/package.json)
- [`packages/rxdb-adapter-http/project.json`](../../../../packages/rxdb-adapter-http/project.json)
- [`packages/rxdb-adapter-http/src/index.ts`](../../../../packages/rxdb-adapter-http/src/index.ts)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/lint.txt)      |
| `typecheck` | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/typecheck.txt) |
| `test`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/test.txt)      |
| `build`     | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/build.txt)     |

当前确认意见：本轮基线阶段尚无新增确认问题；不能据此给全对象通过结论。

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 端到端线契约：逐项对照 adapter、handler-contract、reference-server 与 HTTP 应用服务端；核查 RuleGroup 和错误映射。
- [ ] C2 分页与条件请求：检查 opaque page token、ETag/304、过滤排序与 cache identity 的一致性。
- [ ] C3 变更流生命周期：核查 reconnect、cursor、取消、订阅者清理和失效范围，不让断流被视为已同步。
- [ ] C4 写入与 outbox 衔接：追踪 bulk/chunking、条件失败和 QueryCache offline write 到 sync outbox，检查幂等和重试归属。
- [ ] C5 取消与不可信响应：检查 AbortSignal、晚到响应、响应体大小与类型转换。
- [ ] C6 CORS / 凭证 / 生产消费：审查 transport 凭证和日志边界，核查 server 配合而非只看 client 配置。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 2026-10-04：真实 HTTP /文件 SQLite 第六批联审

C1/C4/C5 **部分执行**。原 HTTP adapter、REST handlers、native fetch 对原应用/PGlite 发真实 metadata/by-ids/PATCH/删除请求，真实 401 映射和网络拒绝不是 Response 桩。失败状态的责任在 RV-052（已修复，见 README 2026-10-05 清理记录），缓存/共享结算在 RV-053（已修复，见 README 2026-10-05 清理记录）/RV-054（已修复，见 README 2026-10-05 清理记录），旧修复覆盖新写在 RV-055（已修复，见 README 2026-10-05 清理记录）。没有因此给 HTTP adapter 四条重复意见。SSE/ETag/分页、CORS 和打包 consumer 未由本轮验收。

[本轮实际链路与取证限制](../../execution-2026-10-04-sync-http-sqlite.md) · [完整日志](../../evidence/2026-10-04/sync-http-sqlite/final-full-app-tests.txt) · [提交/wire/队列观测](../../evidence/2026-10-04/sync-http-sqlite/final-observations.json)。六对象严格 lint 通过，新增 app/spec typecheck 通过；coverage 关闭，全部 C 专项和全对象完成度保持未核销。
