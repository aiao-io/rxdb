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

## 2026-10-04：第二批实际深审

### TestBed 原因仍未确认，不能凭猜测修组件

保持原源文件 SHA：临时观测 setup/config 读取 getTestBed platform 与全局 setup 标记；观察版与 marker-reset 对照均 **41 files / 333 passed**。两组各 41 次初始化前都是 marker=false / platform=false，0 个 marker=true/platform=false；候选 reset 条件没有被触发，不能称“改 marker 修好了”。[轨迹分析](../../evidence/2026-10-04/angular-testbed-trace-analysis.json)。

删除临时文件后原配置再次 **333 passed**：[原配置日志](../../evidence/2026-10-04/angular-original-after-observer.txt)。没有复现上轮 TestBed 失败，不能因此删除历史失败、认定真实缩略图组件有/无问题或宣称某缓存机制已归因。

观测 setup 的 import 顺序/模块图与原 setup 不完全相同，本轮对照不具有修复因果证明；所有临时源码已删除，原 setup 未修改。继续通过原配置/文件顺序和模块身份取证，不新增无证据 RV。Angular CLI 指向范围外 Angular21 example，best-practices 工具仍 Unexpected response type；使用实际 Nx 项目，不冒充已从工具验证当前 Angular22。

## 2026-10-04：编辑器与预览第七批

沿代码编辑器/Generator/OPFS 预览消费入口联审，生成输出与预览 readonly，不把其猜成可编辑输出污染。确认 [RV-057](../../RV-057-preview-late-blob-text-overwrites-current-file.md)：previewFile 后的路径检查覆盖不到 Blob.text，显示 B 标题/A 文本；**1 failed /1 passed**。原组件、TestBed 与真实 Blob 参与，服务/文本交付是接缝；不是实际 OPFS/VFS 或整个应用已通过。

[本轮实际范围、门禁与剩余项](../../execution-2026-10-04-editor-frameworks.md) · [三端观测](../../evidence/2026-10-04/editor-frameworks/final-observations.json)。七对象严格零警告 lint/typecheck 通过；新红保留，业务实现未改。happy-dom 不是浏览器/辅助技术验收，所有完整 C 项仍需逐项核销。
