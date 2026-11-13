# Aiao Desktop 产品需求

当前交付：[10/10 已交付]。状态真相源为 `stories/<domain>/ADESK-US-*.md` 的 YAML `status`，其余视图由故事派生。

## 当前范围

在浏览器里还原一套 macOS 风格的桌面：开机与锁屏、菜单栏、Dock、窗口管理、启动台、聚焦搜索、通知中心，以及启动台里的 30 个内置应用，其中「几猫3A大作」是随桌面发布的单文件 3D 游戏（[ADESK-US-103](stories/desktop/ADESK-US-103-saltline-game.md)）。除了内置应用，桌面还以微前端方式运行独立部署的 B/S 应用（集成应用），经仓库里的 `@aiao/orbit` 隔离在窗口里；第一个是 Aiao Code（vscode.aiao.io），见 [ADESK-EPIC-003](epics/ADESK-EPIC-003.md)。终端用 [Vivari](https://vivari.run) 在页面里运行 Node、npm 与 Python；其余应用展示写在代码里的演示内容。

产品只有前端：没有服务端、账号或密钥，发布到 Cloudflare Pages 的静态站点（[D-16](decisions.md#d-16发布到-cloudflare-pages一键发布命令)）；系统与应用数据存在浏览器本地的 SQLite 与 OPFS 里，刷新后还在（[D-07](decisions.md#d-07系统数据存在本地-sqlite)），游戏「几猫3A大作」自己的设置存在 localStorage（[D-15](decisions.md#d-15随桌面发布的单文件游戏在同源-iframe-里运行)）。壁纸、地图瓦片、天气等外网内容可以缺失，拿不到时页面不能报错，见 [D-04](decisions.md#d-04外网内容可缺失)。

本目录是产品根 `aiao-desktop/` 的产品级需求唯一真相源，覆盖两个 Nx 应用：`apps/web`（Angular 桌面）与 `apps/e2e`（正式构建上的浏览器冒烟），见 [D-02](decisions.md#d-02产品根目录与应用拆分) 与 [ADESK-US-001](stories/platform/ADESK-US-001-product-root.md)；本地开发入口 `pnpm nx dev aiao-desktop` 与开发导航见 [ADESK-US-002](stories/platform/ADESK-US-002-local-dev-dashboard.md)；发布到 Cloudflare Pages 的一键命令 `pnpm nx run aiao-desktop:deploy` 见 [ADESK-US-003](stories/platform/ADESK-US-003-cloudflare-pages-deploy.md)。

仓库里的 [Web Desktop](../../apps/web-desktop/requirements/README.md)（`DESKTOP-US-*`，React 宿主与 Orbit 运行内核）是另一个产品，目标、实现与需求各自独立，本目录不引用它的故事状态。

## 导航

| 文档                                                   | 用途                       |
| ------------------------------------------------------ | -------------------------- |
| [CONVENTIONS.md](CONVENTIONS.md)                       | 编号段、引用规则与产品门禁 |
| [status-overview.md](status-overview.md)               | 故事状态与统计             |
| [roadmap.md](roadmap.md)                               | 当前批次与立项前提         |
| [decisions.md](decisions.md)                           | 生效决策与执行条件         |
| [capability-matrix.md](capability-matrix.md)           | 当前能力与未验证的边界     |
| [verification-report.md](verification-report.md)       | 分层验收证据与待验项       |
| [future-requirements.md](future-requirements.md)       | 长期方向与准入条件         |
| [epics/ADESK-EPIC-001.md](epics/ADESK-EPIC-001.md)     | 产品工程结构               |
| [epics/ADESK-EPIC-002.md](epics/ADESK-EPIC-002.md)     | macOS 风格桌面             |
| [epics/ADESK-EPIC-003.md](epics/ADESK-EPIC-003.md)     | 应用体系与集成应用         |
| [stories/story.template.md](stories/story.template.md) | 新故事模板                 |
| [plans/README.md](plans/README.md)                     | 调研、实施计划与验收记录   |
| [reviews/README.md](reviews/README.md)                 | 旧 review 记录入口         |
| [code-scanning/README.md](code-scanning/README.md)     | CodeQL 告警工作集          |

## 平台与应用

根 [requirements](../../requirements/README.md) 管可复用的平台能力，本目录管 Aiao Desktop 的产品需求与集成，管理规则沿用 [app-template](../../requirements/app-template/README.md) 与[应用级需求与项目治理办法](../../requirements/application-governance.md)。目前没有故事依赖平台能力；以后接入时用 `capabilities: [rxdb:US-XXX]` 引用，不复制平台故事，也不继承它的完成状态。

产品结构与命令见[产品 README](../README.md)，目录边界与依赖方向见 [AGENTS.md](../AGENTS.md)。结构门禁只证明文档一致，不能代替浏览器里的验收。

## 术语

| 术语         | 含义                                                                                                                                   |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| 桌面         | `apps/web` 渲染的整个页面：菜单栏、桌面图标、窗口层、Dock 与各类浮层                                                                   |
| 应用         | 应用登记表 `registry.ts` 里的一项；Finder、Terminal、TextEdit 等可以同时开多个窗口                                                     |
| 内置应用     | 随桌面构建的 Angular 组件，直接用桌面的服务与本地库                                                                                    |
| 集成应用     | 独立部署的 B/S 应用，经 Orbit 在窗口的 iframe 里运行，只经 Orbit 协议与桌面往来（[D-10](decisions.md#d-10应用分三类登记在同一张表里)） |
| 窗口         | 应用的一次打开，带红黄绿三个窗口按钮，可以最小化进 Dock                                                                                |
| 虚拟文件系统 | Finder 浏览的目录树，写在代码里，只存在内存中                                                                                          |
| 冒烟         | `apps/e2e` 对正式构建跑的 Chromium 脚本，外网请求全部拦截，任何页面错误都判失败                                                        |
