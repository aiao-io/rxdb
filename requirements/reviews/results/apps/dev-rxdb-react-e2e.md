---
kind: review-execution
object: dev-rxdb-react-e2e
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# dev-rxdb-react-e2e：实际评审执行记录

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

React 浏览器综合演示的 Playwright 用户流程、跨框架对称和错误路径验证。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

入口/配置已读取并核对：

- [`apps/dev-rxdb-react-e2e/playwright.config.ts`](../../../../apps/dev-rxdb-react-e2e/playwright.config.ts)
- [`apps/dev-rxdb-react-e2e/src/entity-model.spec.ts`](../../../../apps/dev-rxdb-react-e2e/src/entity-model.spec.ts)
- [`apps/dev-rxdb-react-e2e/src/search-parity.spec.ts`](../../../../apps/dev-rxdb-react-e2e/src/search-parity.spec.ts)
- [`apps/dev-rxdb-react-e2e/src/storage.spec.ts`](../../../../apps/dev-rxdb-react-e2e/src/storage.spec.ts)
- [`apps/dev-rxdb-react-e2e/src/todo-cursor.spec.ts`](../../../../apps/dev-rxdb-react-e2e/src/todo-cursor.spec.ts)
- [`apps/dev-rxdb-react-e2e/src/working-tree.spec.ts`](../../../../apps/dev-rxdb-react-e2e/src/working-tree.spec.ts)
- [`apps/dev-rxdb-react-e2e/package.json`](../../../../apps/dev-rxdb-react-e2e/package.json)
- [`apps/dev-rxdb-react-e2e/project.json`](../../../../apps/dev-rxdb-react-e2e/project.json)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/lint.txt)      |
| `typecheck` | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/typecheck.txt) |
| `e2e`       | 失败，已留原日志              | [执行日志](../../evidence/2026-10-03/full-run/e2e.txt)       |

仅对已取证专题下结论，不代表全对象审完。

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 route / 能力到用例映射：逐个 spec 对照应用 routes 与三端能力矩阵；建立“真实用户流程→用例→backend/运行档位”表，不能仅凭 spec 名判断覆盖。
- [ ] C2 fixtures 隔离与真实性：核查建库/清库、test API、测试数据、storage scope 与共享 fixtures 的依赖；不允许 UI 与断言共用同一错误转换。
- [ ] C3 断言强度与异步等待：逐条检查是否验证可见状态和实际数据、错误路径与失败后无副作用；用事件/条件等待代替任意 sleep。
- [ ] C4 三框架语义对照：对照 rxdb-test shared fixtures、search-parity、working-tree 和模型场景，记录真实功能差异，不强制复制框架专属 demo。
- [ ] C5 平台与安全边界：核查 worker/OPFS、输入渲染、加密/权限和测试注入；跳过能力要写理由与替代证据。
- [ ] C6 可访问性与产物来源：核查 search/working-tree a11y、键盘/焦点、console/network error 与 webServer/build/config 一致性。
- [ ] C7 React 专项断言：对照 StrictMode root、drag/drop、异步 hook cleanup 与页面卸载，不能只验证首次挂载。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 专项任务核销

- [OPFS 两条用例上传后定位失败，取消路径尚未执行；根因未确认，不作为已复现删除/覆盖丢数据](../../evidence/2026-10-03/full-run/e2e.txt)。

上述只是对应任务/平台的证据，专项 C 项/其它宿主未自动完成。

## 续执行：2026-10-03 边界取证

### C3：OPFS 等待条件与磁盘断言

原取消覆盖/删除的两条 spec 单文件 **2 passed**：[日志](../../evidence/2026-10-03/follow-up/react-opfs-baseline.txt)。openIsolatedFolder 只等一直存在的上传按钮，不等目录读取完成，不能证明后续上传在目标目录执行。

新增 [真实浏览器导航竞态复验](../../../../apps/dev-rxdb-react-e2e/src/review-opfs-navigation.spec.ts)，通过实际按钮/file chooser 上传并检查实际父目录与内容，结果 **1 failed / 1 passed**；对应产品问题统一 RV-037（已修复）。未把上轮两个历史失败都追认为已证明同一原因，也未把两个单用例绿外推为完整 React E2E 绿。

还需逐条建立 route→spec 映射、验证三端取消后的文件内容和跨 context 隔离；完整 C3 / C7 不勾完成。
