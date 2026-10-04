---
kind: review-execution
object: rxdb-devtools
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# rxdb-devtools：实际评审执行记录

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

开发态 connector、线协议、事件缓冲、序列化和浏览器/原生 provider。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

入口/配置已读取并核对：

- [`packages/rxdb-devtools/src/connector.ts`](../../../../packages/rxdb-devtools/src/connector.ts)
- [`packages/rxdb-devtools/src/connector-runtime.ts`](../../../../packages/rxdb-devtools/src/connector-runtime.ts)
- [`packages/rxdb-devtools/src/connector-mask.ts`](../../../../packages/rxdb-devtools/src/connector-mask.ts)
- [`packages/rxdb-devtools/src/serializer.ts`](../../../../packages/rxdb-devtools/src/serializer.ts)
- [`packages/rxdb-devtools/src/provider/limits.ts`](../../../../packages/rxdb-devtools/src/provider/limits.ts)
- [`packages/rxdb-devtools/src/provider/logical-path.ts`](../../../../packages/rxdb-devtools/src/provider/logical-path.ts)
- [`packages/rxdb-devtools/src/native/native-files-provider.ts`](../../../../packages/rxdb-devtools/src/native/native-files-provider.ts)
- [`packages/rxdb-devtools/package.json`](../../../../packages/rxdb-devtools/package.json)
- [`packages/rxdb-devtools/project.json`](../../../../packages/rxdb-devtools/project.json)
- [`packages/rxdb-devtools/src/index.ts`](../../../../packages/rxdb-devtools/src/index.ts)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/lint.txt)      |
| `typecheck` | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/typecheck.txt) |
| `test`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/test.txt)      |
| `build`     | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/build.txt)     |

当前确认意见：本轮基线阶段尚无新增确认问题；不能据此给全对象通过结论。

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 协议与信任边界：从 connector 到 transport/wire 核查版本、session、source、能力协商和消息严格校验。
- [ ] C2 数据脱敏与序列化：审查 mask、entity info、snapshot、错误与日志，不让调试便利绕过敏感字段保护。
- [ ] C3 缓冲、序号与反压：核查 buffer/sequence、慢消费者、断开重连与订阅一次语义。
- [ ] C4 provider 权限与文件：逐项对照 browser/native/settings provider 的 descriptor、只读限制、logical path 与 limits。
- [ ] C5 环境与生产隔离：对照 extension/Electron/Tauri 接线和开发态 gating，核查运行时包是否增加生产攻击面。
- [ ] C6 生命周期与 conformance：核查 reconnect、provider 注册/注销、testing driver 与跨宿主 relay conformance。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 2026-10-04：树查询与 DevTools 第三批深审

🔴 C2 确认 [RV-047](../../RV-047-devtools-mask-circular-changes-overflow.md)。maskEmbeddedChangeValue 在 changes 数组自引用上无限递归，发生在循环安全 serialize 之前；query 丢兄弟字段，event 监听向生产者抛 RangeError。新增 2 failed /2 self 环对照通过，boundary 单文件 **2 failed /77 passed**：[日志](../../evidence/2026-10-04/tree-devtools/devtools-circular-changes.txt)。实际 connector/预处理/序列化，RxDB 为项目接缝，不冒充持久化 JSON 环。

先前整包实际 **44 files /994 passed**：[基线](../../evidence/2026-10-04/tree-devtools/rxdb-devtools-baseline.txt)。人工检查三层授权、session/envelope 路由、provider 请求结算、脱敏与 buffer 顺序；一个 endpoint 构造时铸 session、dispose 终态，因此“同 endpoint 新 session 复用 requestId 被旧结果抢占”的初始猜测没有成立，未生成无证据 RV。

这不是完整协议/权限矩阵或真实全部宿主已审完。C1/C3/C4/C6 的其它输入和资源关闭组合继续；不以已有 conformance 绿覆盖新增 mask preprocessor 故障。
