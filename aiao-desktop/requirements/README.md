# Aiao Desktop 产品需求

当前交付：[20/22 已交付]；2 条待评审。状态真相源为 `stories/<domain>/ADESK-US-*.md` 的 YAML `status`，其余视图由故事派生。

## 产品定位

Aiao Desktop 是在浏览器里运行的 macOS 风格桌面，把本地文件空间、终端、内置应用和经 Orbit 接入的独立 Web 应用（现为 Aiao Code）放在同一个窗口环境里。

- **主要用户**：在浏览器里用文件、终端和 Aiao Code 做轻量开发与记录的个人用户，使用桌面尺寸的 Chromium。
- **核心任务**（评审与验收以这三条端到端流程为准）：
  1. 创建文件，在 Finder、TextEdit 与终端之间处理，保存、关闭、再次打开后内容不变。
  2. 在 Aiao Code 里新建项目、修改并运行；说得清项目数据（在 Aiao Code 自己的来源里）与桌面虚拟磁盘里的数据是两回事。
  3. 从启动台或聚焦搜索找到应用，完成一次操作，关闭后再次进入仍能继续工作。
- **明确不支持**：账号与跨设备同步、移动端的专门设计（窄屏只承诺最低限度的可用，见 [ADESK-US-005](stories/platform/ADESK-US-005-cross-browser-smoke.md)）、浏览器之外的原生应用能力；除上面的任务外，其余内置应用只有演示内容，不承诺完整的业务功能。
- **扩大使用范围的条件**：见[路线图](roadmap.md#扩大使用范围的条件)。三条任务现在各自闭环到哪一步，看下面的「当前范围」和[能力矩阵](capability-matrix.md)。

「像真正的系统」「完整的桌面」描述的是设计方向，不是完成条件；完成条件是上面的任务、各故事的验收标准，以及能力矩阵里写明的边界。

## 当前范围

浏览器范围按[D-19](decisions.md#d-19只验收桌面-chrome)收敛为桌面Chrome，两项历史基线例外已按[D-20](decisions.md#d-20接受两项回溯基线例外并批准本次正式发布)接受，本次正式发布与线上对账已完成，当前尚有2项AC待关闭，详见[验收台账](verification-report.md)。

### 已验收能力

以下能力都有正式构建上的浏览器冒烟或线上验收作证据，细节与边界见[能力矩阵](capability-matrix.md)：

- **桌面外壳**：菜单栏、Dock、窗口（打开、关闭、最小化与还原）、启动台、聚焦搜索、通知中心；启动台里的每个内置应用都能打开（[ADESK-US-101](stories/desktop/ADESK-US-101-desktop-shell-baseline.md)）。
- **本地数据与真实磁盘**：磁盘的目录树与元数据存在浏览器本地的 SQLite，文件体由 storage 插件放在 OPFS；Finder、桌面图标、聚焦搜索、TextEdit、预览与终端读写同一块磁盘；系统设置与部分内置应用（备忘录、提醒事项等）的记录刷新后还在；磁盘工具的「抹掉」只重置磁盘卷，不动系统设置与各应用的记录（[ADESK-US-102](stories/desktop/ADESK-US-102-local-data-and-real-disk.md)、[D-07](decisions.md#d-07系统数据存在本地-sqlite)、[D-08](decisions.md#d-08文件体由-storage-插件放在-opfs)）。其余内置应用的初始内容写在代码里，首次打开写入本地库，之后的修改会保留，但它们的内部功能没有逐项验收。
- **终端**：[Vivari](https://vivari.run) 在页面里运行 Node、npm 与 Python，打开时复制磁盘，与桌面双向同步（[D-09](decisions.md#d-09终端按需复制磁盘)）。
- **几猫3A大作**：随桌面发布的单文件 3D 游戏，同源 iframe 运行（[ADESK-US-103](stories/desktop/ADESK-US-103-saltline-game.md)）。
- **集成应用**：独立部署的 B/S 应用经仓库里的 `@aiao/orbit` 隔离在窗口里，应用统一登记；第一个是 Aiao Code（vscode.aiao.io），支持应用自绘标题栏的透明窗口，见 [ADESK-EPIC-003](epics/ADESK-EPIC-003.md)（US-201～204）。
- **发布**：Cloudflare Pages 上的静态站点，一键发布并线上对账（[ADESK-US-003](stories/platform/ADESK-US-003-cloudflare-pages-deploy.md)、[D-16](decisions.md#d-16发布到-cloudflare-pages一键发布命令)）。

### 本轮收尾与验收保留

2026-11-14 对已立项故事逐项复验。当前工作区已实现 Applications 投影与保护、Dock 管理、应用懒加载与宿主能力、窗口恢复、多标签页同步、升级保护、外网说明和覆盖率门槛；不能再把它们记为“尚未实现”。验收结果、失败样本、真实环境与提交见[验收台账](verification-report.md)，关闭条件仍以各故事的 AC 与依赖为准。

- [US-205](stories/application/ADESK-US-205-application-management.md) 的清单投影、Finder/终端保护、Dock 拖放和键盘等效入口已有实现与正式构建检查。
- [US-206](stories/application/ADESK-US-206-lazy-app-runtime-and-host-capabilities.md) 已使用动态组件入口、按读取触发的应用种子和统一 `DesktopAppContext`。体积的固定提交回溯比较与“实现前已记录基线”分开评审。
- 104、105、106、107、108、005、008 的自动检查已有实现；真实物理键盘、VoiceOver 播报、历史测量流程不能由构建或单测替代。
- `desktop.aiao.io` 已在 Pages 项目绑定。两个线上入口的内容和隔离头已只读核对；同站项目、已有 GitHub 登录状态、换域名的实际数据隔离与发布对账仍由 [US-004](stories/platform/ADESK-US-004-custom-domain.md) 逐条验收。

登记与运行边界见 [D-10](decisions.md#d-10应用分三类登记在同一张表里)、[D-17](decisions.md#d-17应用清单是唯一真相源applications-是系统投影)、[D-18](decisions.md#d-18应用懒加载与宿主系统能力统一)。未立项方向仍在[后续方向](future-requirements.md)，本轮不把它们自动变成工作承诺。

### 已知限制

- 本轮[只验收桌面 Chrome](decisions.md#d-19只验收桌面-chrome)，自动回归使用受控 Chromium；真实 Chrome 记录分别注明环境。[跨浏览器历史记录](evidence/2026-11-14/browser-support.md)保留成功、失败与未完成观察，Safari、Firefox与WebKit不在本轮必验或支持承诺内。390×844与触屏仿真不代表移动端真机支持。
- 数据按当前浏览器的 Origin 隔离；清除站点数据、换浏览器或换域名看不到原数据。没有备份、导出、账号或跨设备同步。配额不足等存储失败路径未完整验收；TextEdit 新建文档没有保存入口。
- 窗口布局按标签页恢复；多页文件、设置与应用数据按提交顺序收敛，同一文件最后提交生效，不提供合并或冲突提示。删除、改名、抹掉后的旧编辑器保存必须失败，保留编辑内容。
- 集成应用不能弹窗或调用受限的文件句柄 API。桌面内不能弹 GitHub OAuth 登录窗口；能否读到直接访问时已有的登录状态另行实测，不用同站规则推断。
- 纯键盘与无障碍树已进自动冒烟；真实物理键盘截获与真实 VoiceOver 逐步播报独立记录。
- 外网壁纸、地图、天气等的真实显示效果不在验收范围；请求失败时桌面不能报页面错误。来源与隐私说明已在 About 提供。

完整边界见[能力矩阵](capability-matrix.md)和[验收台账](verification-report.md#尚未证明)。

### 产品边界

产品只有前端：没有服务端、账号或密钥，发布到 Cloudflare Pages 的静态站点；系统与应用数据存在浏览器本地的 SQLite 与 OPFS 里，刷新后还在，游戏「几猫3A大作」自己的设置存在 localStorage（[D-15](decisions.md#d-15随桌面发布的单文件游戏在同源-iframe-里运行)）。「刷新后还在」是验收过的测试结论，不是数据永久安全：浏览器可以清理站点数据。

### 本目录的覆盖范围

本目录是产品根 `aiao-desktop/` 的产品级需求唯一真相源，覆盖两个 Nx 应用：`apps/web`（Angular 桌面）与 `apps/e2e`（正式构建上的浏览器冒烟），见 [D-02](decisions.md#d-02产品根目录与应用拆分) 与 [ADESK-US-001](stories/platform/ADESK-US-001-product-root.md)；本地开发入口 `pnpm nx dev aiao-desktop` 与开发导航见 [ADESK-US-002](stories/platform/ADESK-US-002-local-dev-dashboard.md)；发布到 Cloudflare Pages 的一键命令 `pnpm nx run aiao-desktop:deploy` 见 [ADESK-US-003](stories/platform/ADESK-US-003-cloudflare-pages-deploy.md)。

仓库里的 [Web Desktop](../../apps/web-desktop/requirements/README.md)（`DESKTOP-US-*`，React 宿主与 Orbit 运行内核）是另一个产品，目标、实现与需求各自独立，本目录不引用它的故事状态。

## 导航

| 文档                                                                             | 用途                       |
| -------------------------------------------------------------------------------- | -------------------------- |
| [CONVENTIONS.md](CONVENTIONS.md)                                                 | 编号段、引用规则与产品门禁 |
| [status-overview.md](status-overview.md)                                         | 故事状态与统计             |
| [roadmap.md](roadmap.md)                                                         | 当前批次与立项前提         |
| [decisions.md](decisions.md)                                                     | 生效决策与执行条件         |
| [capability-matrix.md](capability-matrix.md)                                     | 当前能力与未验证的边界     |
| [verification-report.md](verification-report.md)                                 | 分层验收证据与待验项       |
| [future-requirements.md](future-requirements.md)                                 | 长期方向与准入条件         |
| [epics/ADESK-EPIC-001.md](epics/ADESK-EPIC-001.md)                               | 产品工程结构               |
| [epics/ADESK-EPIC-002.md](epics/ADESK-EPIC-002.md)                               | macOS 风格桌面             |
| [epics/ADESK-EPIC-003.md](epics/ADESK-EPIC-003.md)                               | 应用体系与集成应用         |
| [stories/story.template.md](stories/story.template.md)                           | 新故事模板                 |
| [plans/README.md](plans/README.md)                                               | 调研、实施计划与验收记录   |
| [plans/application-management-design.md](plans/application-management-design.md) | Applications 管理设计拆解  |
| [reviews/README.md](reviews/README.md)                                           | 旧 review 记录入口         |
| [code-scanning/README.md](code-scanning/README.md)                               | CodeQL 告警工作集          |

## 平台与应用

根 [requirements](../../requirements/README.md) 管可复用的平台能力，本目录管 Aiao Desktop 的产品需求与集成，管理规则沿用 [app-template](../../requirements/app-template/README.md) 与[应用级需求与项目治理办法](../../requirements/application-governance.md)。产品依赖的平台包（`@aiao/rxdb` 及其适配器与插件、`@aiao/orbit`）目前没有对应的 `rxdb:US-XXX` 平台故事可引用，所以各故事的 `capabilities` 为空；Orbit 的使用与兼容约定见 [D-11](decisions.md#d-11集成应用经-orbit-隔离运行)。以后有平台故事时用 `capabilities: [rxdb:US-XXX]` 引用，不复制平台故事，也不继承它的完成状态。

产品结构与命令见[产品 README](../README.md)，目录边界与依赖方向见 [AGENTS.md](../AGENTS.md)。结构门禁只证明文档一致，不能代替浏览器里的验收。

## 术语

| 术语               | 含义                                                                                                                                                                                                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 桌面               | `apps/web` 渲染的整个页面：菜单栏、桌面图标、窗口层、Dock 与各类浮层                                                                                                                                                                                                                                                                  |
| 应用               | 应用清单里的一项；可由 Angular 组件、同源 bundled HTML 或远程 iframe 运行                                                                                                                                                                                                                                                             |
| 应用目录           | 由应用清单投影出来的 `/Applications`，`.app` 是可见元数据与稳定 appId 的载体（见 [D-17](decisions.md#d-17应用清单是唯一真相源applications-是系统投影)）                                                                                                                                                                               |
| 内置应用           | 随桌面构建发布的应用（登记类别 `builtin`），窗口内容是 Angular 组件，或同源的 bundled HTML（如几猫3A大作）；Angular 组件直接使用桌面的服务与本地库                                                                                                                                                                                    |
| 集成应用           | 独立部署的 B/S 应用，经 Orbit 在窗口的 iframe 里运行，只经 Orbit 协议与桌面往来（[D-10](decisions.md#d-10应用分三类登记在同一张表里)）                                                                                                                                                                                                |
| 宿主能力           | 应用经 `DesktopAppContext` 使用的窗口、菜单、应用启动、外观、通知、剪贴板和文件能力（见 [D-18](decisions.md#d-18应用懒加载与宿主系统能力统一)）                                                                                                                                                                                       |
| 登记类别与运行来源 | 登记表的 `kind`（system / builtin / web，[D-10](decisions.md#d-10应用分三类登记在同一张表里)）与目标形态的运行来源（builtin-component / bundled-html / remote-web，[D-17](decisions.md#d-17应用清单是唯一真相源applications-是系统投影)）是两个维度：builtin 包含 builtin-component 与 bundled-html，web 即 remote-web；对应表见 D-17 |
| 预装               | 安装来源的一个取值 `preinstalled`：随构建发布；保护规则见 D-17（实现与验收状态分别记录）。Aiao Code 是预装的 remote-web 应用。目录安装与用户安装不在已立项范围                                                                                                                                                                        |
| 标签页 / 终端标签  | 「标签页」指浏览器标签页，每个标签页各有自己的内存索引与虚拟机（[ADESK-US-105](stories/desktop/ADESK-US-105-multi-tab-sync.md)）；「终端标签」指 Terminal 窗口里的标签                                                                                                                                                                |
| 窗口               | 应用的一次打开，带红黄绿三个窗口按钮，可以最小化进 Dock                                                                                                                                                                                                                                                                               |
| 虚拟文件系统       | Finder 浏览的磁盘：目录树与元数据是本地 SQLite 里的 `DesktopFile` 行，文件体在 OPFS（[D-08](decisions.md#d-08文件体由-storage-插件放在-opfs)）                                                                                                                                                                                        |
| 冒烟               | `apps/e2e` 对正式构建跑的 Chromium 脚本，外网请求全部拦截，任何页面错误都判失败                                                                                                                                                                                                                                                       |
