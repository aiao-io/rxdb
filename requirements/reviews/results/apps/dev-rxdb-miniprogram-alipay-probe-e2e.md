---
kind: review-execution
object: dev-rxdb-miniprogram-alipay-probe-e2e
created: 2026-10-05
execution: partial
---

# dev-rxdb-miniprogram-alipay-probe-e2e：实际评审记录

[本对象计划](../../apps/dev-rxdb-miniprogram-alipay-probe-e2e.md) · [源码区间与摘要](../../evidence/2026-10-05/parallel/app-scope-addendum/dev-rxdb-miniprogram-alipay-probe-e2e/file-inspection.json) · [本轮CLI门禁](../../evidence/2026-10-05/parallel/validation/added-apps-strict-lint.txt) / [typecheck](../../evidence/2026-10-05/parallel/validation/added-apps-typecheck.txt)

## 当轮实际证据与结论

**🟡 部分执行，未完成全对象评审。** 旧计划漏了本对象：它在任务开始的resolved Nx graph里已经存在，不是本轮新创建；现在补正 scope。不能用原70对象/19应用数字代表当前全仓。

| 编号 | 专题 | 源码/实际结论 | 锚点 | 状态与必要补证 |
| --- | --- | --- | --- | --- |
| C1 | 真实GUI范围与隔离 | Nx e2e-devtools 依赖 producer build；workers=1/retries=0/no webServer，未伪装通用CI e2e。 | `playwright.config.ts:22–40；resolved e2e-devtools target` | 部分执行；实际IDE、正确项目身份、macOS/Windows端点及失败退出未动态运行 |
| C2 | CDP协议与资源 | id/sessionId关联、命令30秒超时与withSession finally detach已读；close未主动结算pending、Runtime.enable失败路径listener释放仍需复验。 | `src/cdp.ts:26–101；src/simulator.ts:65–75,159–167` | 部分执行；用可控WebSocket验证关闭、错误JSON、挂起、重复session事件；不把静态关闭调用算无泄漏 |
| C3 | 重新编译与报告新鲜性 | 停/启开关后以startedAt区别前轮报告，支持终态失败报告；schema由测试单独强断言。 | `src/simulator.ts:133–144,176–201；src/simulator-probe.spec.ts:26–39` | 部分执行；多IDE窗口/同标题target与最初读失败情况下旧报告排除、真实产物内容指纹未测 |
| C4 | 宿主能力与版本 | v7报告与v3e形态断言并存；WASM尺寸断言727646仍锁旧资产，当前读取器/依赖不一致见RV-068。 | `src/simulator-probe.spec.ts:2–9,73–89；RV-068` | 部分执行；先修旧WASM版本一致性，再验证新版报告，不能通过IDE未跑隐藏已知依赖问题 |
| C5 | 持久化、配额与清理 | 报告断言包含重开、完整性、quota-unobserved和cleanup，不把未撞配额写成上限通过；每个失败case可重跑beforeAll。 | `src/simulator-probe.spec.ts:96–150；playwright.config.ts:14–20` | 部分执行；模拟器写数十MiB、失败报告与强制中断后的文件清理未执行，不擅自操作用户IDE/目录 |
| C6 | 构建、类型与平台证据 | 本项目有lint/typecheck/e2e-devtools，未猜test/e2e目标；9受控文件读取、当前协议与schema有独立结论。 | `resolved alipay-probe-project.json；tsconfig.json` | 部分执行；本轮lint/typecheck结果单列，GUI/SIM/真机不以原注释实测日期冒充当前 |

没有运行 e2e-devtools：它会重启 IDE 编译并写大量探针数据，需要专用模拟器/正确工程与明确清理条件。本轮只做源码与CLI门禁，不把代码里的旧实测日期当作本次GUI/真机通过。
