---
kind: review-execution
object: dev-rxdb-http-server
created: 2026-10-03
baseline: 58b4bbb61efa71d4591cafab6a4c92955a7760dd
execution: partial
---

# dev-rxdb-http-server：实际代码评审记录

**状态：部分执行。** 已确认问题见下文；未穷举全部受控文件，未完成本对象全部 C 项，不给全包 🟢。

## 1. 实际范围与取证方式

真实 Nx serve＋隔离文件 PGlite 目录＋回环端口。正常查询 200、超限 body 413 两条路径通过；null/数组 metadata 及非法 request-target 各有实际请求证据。未执行全套端点测试、SSE/备份/分页并发或生产部署审查。

以下是实际阅读/追踪的模块入口，包含专题片段，**不是声称逐行审完每个文件**：

- [`apps/dev-rxdb-http-server/src/server.ts`](../../../../apps/dev-rxdb-http-server/src/server.ts)
- [`apps/dev-rxdb-http-server/src/http-utils.ts`](../../../../apps/dev-rxdb-http-server/src/http-utils.ts)
- [`apps/dev-rxdb-http-server/src/page-token.ts`](../../../../apps/dev-rxdb-http-server/src/page-token.ts)
- [`apps/dev-rxdb-http-server/src/recipes-repository.ts`](../../../../apps/dev-rxdb-http-server/src/recipes-repository.ts)
- [`apps/dev-rxdb-http-server/src/config.ts`](../../../../apps/dev-rxdb-http-server/src/config.ts)
- [`apps/dev-rxdb-http-server/src/control.ts`](../../../../apps/dev-rxdb-http-server/src/control.ts)
- [`apps/dev-rxdb-http-server/src/change-feed.ts`](../../../../apps/dev-rxdb-http-server/src/change-feed.ts)
- [`apps/dev-rxdb-http-server/src/change-subscribers.ts`](../../../../apps/dev-rxdb-http-server/src/change-subscribers.ts)
- [`apps/dev-rxdb-http-server/src/rxdb-store.ts`](../../../../apps/dev-rxdb-http-server/src/rxdb-store.ts)
- [`apps/dev-rxdb-http-server/src/main.ts`](../../../../apps/dev-rxdb-http-server/src/main.ts)

## 2. 评审意见

- [RV-030：非法 HTTP 请求目标能让参考服务进程退出](../../RV-030-http-server-invalid-url-crash.md)
- [RV-031：metadata 接口未验证 JSON 对象形状，null 返回 500、数组被接受](../../RV-031-http-server-metadata-body-shape.md)

## 3. 动态证据与复验

[HTTP 实际请求结果](../../evidence/2026-10-03/http-body-probes.json)

业务源码基线 `58b4bbb61efa71d4591cafab6a4c92955a7760dd`。SQL 复验明确关闭覆盖率；测试失败是预期的缺陷红灯，非 worker/service stopped 并发假失败。覆盖率未测量，也没有执行修复。

## 4. 尚未完成

- [ ] 原计划其余源码、C 项及真实运行环境补证。
- [ ] 针对确认问题先保持红测试，再最小修复、绿、重构。
- [ ] 适用的三框架/真实宿主及公开 API 兼容回归。
- [ ] 四项覆盖率、整包门禁与实际应用/E2E 链路。

原计划：[对应对象评审计划](../../apps/dev-rxdb-http-server.md)；进度：[全范围执行台账](../../execution-2026-10-03.md)。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

隔离 HTTP 演示服务端，承载 RuleGroup 查询、ETag、分页 token、SSE/变更流和本地数据存储。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

入口/配置已读取并核对：

- [`apps/dev-rxdb-http-server/src/server.ts`](../../../../apps/dev-rxdb-http-server/src/server.ts)
- [`apps/dev-rxdb-http-server/src/recipes-repository.ts`](../../../../apps/dev-rxdb-http-server/src/recipes-repository.ts)
- [`apps/dev-rxdb-http-server/src/page-token.ts`](../../../../apps/dev-rxdb-http-server/src/page-token.ts)
- [`apps/dev-rxdb-http-server/src/change-feed.ts`](../../../../apps/dev-rxdb-http-server/src/change-feed.ts)
- [`apps/dev-rxdb-http-server/src/cors.ts`](../../../../apps/dev-rxdb-http-server/src/cors.ts)
- [`apps/dev-rxdb-http-server/src/rxdb-store.ts`](../../../../apps/dev-rxdb-http-server/src/rxdb-store.ts)
- [`apps/dev-rxdb-http-server/package.json`](../../../../apps/dev-rxdb-http-server/package.json)
- [`apps/dev-rxdb-http-server/project.json`](../../../../apps/dev-rxdb-http-server/project.json)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/lint.txt)      |
| `typecheck` | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/typecheck.txt) |
| `test`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/test.txt)      |

当前确认意见：[RV-030](../../RV-030-http-server-invalid-url-crash.md)、[RV-031](../../RV-031-http-server-metadata-body-shape.md)

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 请求与数据边界：从路由解析到 repository 审查请求 schema、方法、字段白名单、规则与 SQL 参数化。
- [ ] C2 鉴权、CORS 与控制接口：核查 demo control/seed/reset、origin/credentials、监听地址和部署假设，明确演示服务不等于生产安全模板。
- [ ] C3 ETag / token 完整性：检查 token 的作用域、过滤/排序绑定、有效期与条件请求缓存语义。
- [ ] C4 变更流与资源：审查 broadcaster/subscribers、重连 cursor、慢消费者和断开清理。
- [ ] C5 数据事务与进程生命周期：核查 rxdb-store、批写、seed/reset 的隔离、关库和错误映射。
- [ ] C6 client-server conformance：与 rxdb-adapter-http/reference server 和配套 E2E 逐请求对照；不能两边共用同一个错误假设。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。
