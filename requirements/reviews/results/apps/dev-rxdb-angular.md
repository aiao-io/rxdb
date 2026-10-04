---
kind: review-execution
object: dev-rxdb-angular
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# dev-rxdb-angular：实际评审执行记录

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

Angular 浏览器综合演示，验证核心、多个 SQLite 档位及 UI/插件接线。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

入口/配置已读取并核对：

- [`apps/dev-rxdb-angular/src/main.ts`](../../../../apps/dev-rxdb-angular/src/main.ts)
- [`apps/dev-rxdb-angular/src/app/app.routes.ts`](../../../../apps/dev-rxdb-angular/src/app/app.routes.ts)
- [`apps/dev-rxdb-angular/src/app/app.service.ts`](../../../../apps/dev-rxdb-angular/src/app/app.service.ts)
- [`apps/dev-rxdb-angular/src/app/pages/file-manager/file-manager-lazy/file-manager-lazy.store.ts`](../../../../apps/dev-rxdb-angular/src/app/pages/file-manager/file-manager-lazy/file-manager-lazy.store.ts)
- [`apps/dev-rxdb-angular/src/app/components/branch-manager.ts`](../../../../apps/dev-rxdb-angular/src/app/components/branch-manager.ts)
- [`apps/dev-rxdb-angular/project.json`](../../../../apps/dev-rxdb-angular/project.json)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/lint.txt)      |
| `typecheck` | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/typecheck.txt) |
| `test`      | 失败，已留原日志              | [执行日志](../../evidence/2026-10-03/full-run/test.txt)      |
| `build`     | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/build.txt)     |

当前确认意见：本轮基线阶段尚无新增确认问题；不能据此给全对象通过结论。

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 业务路由与依赖接线：逐个 route 对照实体、生成客户端、插件、backend 和页面；大示例也要审初始化/关闭，不只截屏。
- [ ] C2 数据库启动与持久化：追踪 setup→connect→provider→destroy、Worker/SharedWorker、DB 命名和 storage 选择；刷新不应偷偷换库。
- [ ] C3 业务写入与一致性：核查拖拽移动/批量添加/删除、文件路径、undo/redo、工作树和草稿的真实调用链。
- [ ] C4 输入安全与可访问性：逐页审查文件/剪贴板/JSON/snippet 渲染、ObjectURL、键盘、焦点和错误提示。
- [ ] C5 演示 API 与发布边界：核查开发测试接口、fake provider、测试注入与生产 build 的分界，确保应用不是包发布对象。
- [ ] C6 Angular 特有边界：核查 Signal/service provider/路由复用、OnPush 更新，以及本应用特有 failure-archive/replay 等页面的真实流程。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 续执行：2026-10-03 边界取证

### TestBed 异常的隔离复跑

全包独立串行仍 **3 failed / 330 passed**，仅 opfs-file-grid.component.spec.ts 失败：[日志](../../evidence/2026-10-03/follow-up/dev-rxdb-angular-isolated.txt)。该文件单独 **3 passed**：[日志](../../evidence/2026-10-03/follow-up/angular-opfs-grid-alone.txt)。失败在 configureTestingModule 的环境初始化阶段，尚不足以证明缩略图释放的业务实现有缺陷。

已读 test-setup 与本机安装的 Analog setupTestBed：其 Symbol.for('testbed-setup') 全局守卫与每次模块求值后的 TestBed 状态可能脱节，但尚无运行时身份/顺序观测完成归因，不新增已确认 RV、不擅自修图片组件。继续补 TestBed platform / setup 标记和文件顺序的证据。
