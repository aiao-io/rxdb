# Implementation Plan: 双交互模式 Web 桌面产品

**Branch**: `012-web-desktop-product` | **Date**: 2026-11-07 | **Spec**: [spec.md](spec.md)

## Summary

实现全部 42 条当前范围故事；用户 2026-11-07 的 `/goal` 授权进入完整实施。使用 React 桌面外壳、仓内 Orbit iframe 内核和独立内置 Web 应用；沿用原有三框架绑定与文档站入口。原子 AC 唯一来源为 `apps/web-desktop/requirements/stories/`。不把历史需求文档中的“本轮仅编写需求”理解为对当前实施授权的限制。

## Technical Context

- Language/Version: TypeScript 6 strict，Node 26，pnpm 12，Nx 24（沿用当前锁文件）。
- Primary Dependencies: React 19、Vite 8、`@aiao/orbit`；不新增运行时沙箱依赖。
- Storage: IndexedDB 原子事务存储 v3 状态（含 v1/v2 原子迁移及应用资源指纹）、文件字节、元数据、应用安装、偏好及会话；Web Locks 协调单一可写宿主，BroadcastChannel 协商接管。能力缺失时明确阻止启动，不伪造持久成功。
- Testing: Vitest 单元测试、Playwright 正式产物浏览器测试；Nx 统一执行。
- Target Platform: 桌面 Chrome / Edge（macOS、Windows）及 Safari（macOS）；实机与读屏证据单独记录，自动化引擎测试不能代替。
- Project Type: HTTPS 静态多页面应用，支持配置部署基址。
- Scale/Scope: 42 stories / 256 AC / 8 epics；本地单人，无账号、公开市场或云服务。
- Performance: SC-004/005 冷启动 p95 ≤3s、热打开 ≤1s、20 个真实实例下 100 次交互 p95 ≤100ms；首绘 <1.5s，文件事务 <100ms，纯查询 <16ms；Orbit gzip <50KB。标准采样与正式基准设备以验收台账为准。

## Constitution Check

| Gate                        | 设计前与设计后结论                                                                                     | 证明方式                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| Code Quality                | 使用严格类型、单责模块、≤3 层嵌套；包导出有中文 TSDoc；无 any / 忽略警告                               | Nx lint / typecheck / build                   |
| Testing Standards           | 先红后绿，测试保存冲突、拒绝授权、事务失败、损坏备份与旧拥有者；应用核心逻辑四项 ≥80%，Orbit 四项 ≥90% | Nx test --coverage、真实浏览器旅程            |
| User Experience Consistency | 外壳只实现一种框架；共享 Orbit SDK 三框架同契约；所有界面提供空态、加载、错误、键盘和焦点行为          | 两模式与三框架测试、axe、人工读屏与中文输入法 |
| Performance Requirements    | 按上文预算测量，原始采样落盘；无测量或环境证据的 AC 不标完成                                           | production build、浏览器性能脚本、实机台账    |

设计后复核：上述约束保留；不豁免真实宿主、正式 HTTPS 部署和 10 名首次使用者任务研究。

## Project Structure

```text
apps/web-desktop/
  requirements/            原子需求与验收证据
  src/core/                类型、文件、事务、授权、安装、版本、备份
  src/host/                外壳、窗口、工作区、Orbit 桥接、接管
  src/apps/                独立文件管理、编辑器、设置、目录 Web 应用
  public/                  PWA 图标、版本及部署资源
  tools/                   需求一致性、正式资源清单与校验
  e2e/                     正式构建旅程、离线、故障与性能
specs/001-web-desktop-product/
  plan.md research.md data-model.md quickstart.md contracts/ tasks.md
packages/orbit/             已有框架无关内核与三端绑定
```

结构决定：领域逻辑留在应用内，避免为未复用能力新增公共包；桌面 SDK 通过 Orbit 的类型化 RPC 连接，不在宿主实现编辑器业务。每个运行实例保持固定 DOM 容器，模式、工作区及窗口变化只改变宿主样式，不能重挂载 iframe。

## Delivery Order

1. 注册项目、需求校验与正式构建，补全红测试。
2. 原子文件和会话模型、窗口状态机、授权、单一写入者。
3. US1 文件工作闭环；US2 双模式窗口、键盘和工作区。
4. US3 安装、授权、定向通信；US5 运行内核、三端与现有消费回归。
5. US4 完整资源版本、离线、更新卸载、备份恢复及导入回收站。
6. 全部质量门禁、逐 AC 证据和实机验收；最后用 converge 追加真实差距。

## Complexity Tracking

无需架构豁免。IndexedDB + Web Locks + BroadcastChannel 分别承担原子存储、排他拥有权和可取消接管协商，职责不互相替代。React 只用于外壳和独立应用 UI，Orbit 内核不引入 React。

## 预取与后台资源实施

US-307 使用独立调度、引用和挂起状态机，不在窗口状态中混入后台状态。宿主空闲 500ms 后只预取静态包，Worker 协议 2 统一限制并发 2、去重与前台抢占。资源清理串行，并保留持久安装 / 回退、实例、临时持有、任务和活 iframe 引用；文件数据库不参与清理。协作挂起先检查脏状态，再由声明协议的应用确认；恢复保留同实例内存与路由。自动化结果按逐 AC 台账登记，完整环境和发布验收不由单一 Chromium 结果替代。


## 实例导航实施

US-305 / US-501 在桌面 SDK 层维护每实例逻辑路由与内存历史，沿用 Orbit RPC 和 v3 会话 route 字段，不修改公共 Orbit API。完整 path/query/hash 在实例快照保存，顶层 URL 保持独立；凭据字段和跨来源位置明确拒绝。AppSession 统一处理宿主导航及位置同步，具体视图登记路由处理器并恢复目录、页面、文档与行号。导航期间阻止挂起，错误不推进历史，失败窗口重试保留完整布局。自动化旅程直接检查 IndexedDB 中的路由快照，再刷新验证真实恢复。
