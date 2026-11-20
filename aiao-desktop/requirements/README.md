# Aiao Desktop 产品需求

当前交付：[44/46 已交付]；1 条进行中、1 条待评审、0 条待开发。状态真相源为 `stories/<domain>/ADESK-US-*.md` 的 YAML `status`，其余视图由故事派生。

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

2026-11-20 新增 [US-128 浏览器关闭后恢复工作区](stories/desktop/ADESK-US-128-browser-session-restore.md)，当前进行中，定义最近活跃工作区的浏览器关闭重进恢复边界。

2026-11-20 新增并完成 [US-129 Finder 仿真文件操作、虚拟列表与本地邮件分享](stories/desktop/ADESK-US-129-finder-parity-and-mail.md)，覆盖拖动移动/复制、剪切粘贴、列表与分栏虚拟滚动、列宽调整及 Finder Share 本地草稿。

2026-11-17 按用户“完成所有不需要人工干预的任务”的授权启动[自动完成计划](plans/2026-11-17-autonomous-completion.md)，首先实施 [US-109 文档保存与内容保护](stories/desktop/ADESK-US-109-document-workflow.md)。A01～A03 已完成，见 [US-110 文件管理](stories/desktop/ADESK-US-110-file-management.md)与 [US-111 完整备份恢复](stories/desktop/ADESK-US-111-backup-and-storage-health.md)。已完成 [US-207 批准应用目录](stories/application/ADESK-US-207-approved-app-catalog.md)。已完成本地正式构建验收的 [US-112 运行状态](stories/desktop/ADESK-US-112-runtime-activity.md)与 [US-113 离线资源和真实网络状态](stories/desktop/ADESK-US-113-offline-resources.md)。[US-208 Aiao Code 显式文件复制](stories/application/ADESK-US-208-aiao-code-file-copy.md)已完成本地自动验收，A01～A05 完成。A06 的 [US-114 实际复制与打印](stories/desktop/ADESK-US-114-content-actions.md)、[US-115 提醒草稿保护](stories/desktop/ADESK-US-115-reminder-drafts.md)、[US-116 备忘录编辑保护](stories/desktop/ADESK-US-116-note-drafts.md)、[US-117 本地会话草稿保护](stories/desktop/ADESK-US-117-local-messages.md)、[US-118 本地邮件草稿](stories/desktop/ADESK-US-118-local-mail-drafts.md)、[US-119 日历事件草稿](stories/desktop/ADESK-US-119-calendar-drafts.md)、[US-120 联系人搜索与本地编辑](stories/desktop/ADESK-US-120-contacts-workflow.md)、[US-121 备忘录置顶](stories/desktop/ADESK-US-121-notes-pin.md)、[US-122 提醒事项筛选](stories/desktop/ADESK-US-122-reminder-filters.md)和 [US-123 备忘录新建文件夹](stories/desktop/ADESK-US-123-notes-folders.md)、[US-124 Freeform 笔迹保存与失败保护](stories/desktop/ADESK-US-124-freeform-workflow.md)和 [US-125 Stocks 本地搜索与演示数据声明](stories/desktop/ADESK-US-125-stocks-search-and-demo-data.md)和 [US-126 Font Book 字体族搜索](stories/desktop/ADESK-US-126-fontbook-search.md)和 [US-127 Settings 分区搜索](stories/desktop/ADESK-US-127-settings-search.md)已完成本地自动验收；媒体、书架等应用的主要流程、A07～A09 和人工验收仍按计划继续。

浏览器范围按[D-19](decisions.md#d-19只验收桌面-chrome)收敛为桌面Chrome，两项历史基线例外已按[D-20](decisions.md#d-20接受两项回溯基线例外并批准本次正式发布)接受，本次正式发布与线上对账已完成，物理键盘已逐项记录并关闭 US-107，历史发布范围中仅剩 US-108 的 VoiceOver AC（按用户要求延期）；新增 US-207 已完成本地正式构建验收，未发布，详见[验收台账](verification-report.md)。

### 已验收能力

以下能力都有正式构建上的浏览器冒烟或线上验收作证据，细节与边界见[能力矩阵](capability-matrix.md)：

- **桌面外壳**：菜单栏、Dock、窗口（打开、关闭、最小化与还原）、启动台、聚焦搜索、通知中心；启动台里的每个内置应用都能打开（[ADESK-US-101](stories/desktop/ADESK-US-101-desktop-shell-baseline.md)）。
- **本地数据与真实磁盘**：磁盘的目录树与元数据存在浏览器本地的 SQLite，文件体由 storage 插件放在 OPFS；Finder、桌面图标、聚焦搜索、TextEdit、预览与终端读写同一块磁盘；系统设置与部分内置应用（备忘录、提醒事项等）的记录刷新后还在；磁盘工具的「抹掉」只重置磁盘卷，不动系统设置与各应用的记录（[ADESK-US-102](stories/desktop/ADESK-US-102-local-data-and-real-disk.md)、[D-07](decisions.md#d-07系统数据存在本地-sqlite)、[D-08](decisions.md#d-08文件体由-storage-插件放在-opfs)）。其余内置应用的初始内容写在代码里，首次打开写入本地库，之后的修改会保留，但它们的内部功能没有逐项验收。
- **终端**：[Vivari](https://vivari.run) 在页面里运行 Node、npm 与 Python，打开时复制磁盘，与桌面双向同步（[D-09](decisions.md#d-09终端按需复制磁盘)）。
- **几猫3A大作**：随桌面发布的单文件 3D 游戏，同源 iframe 运行（[ADESK-US-103](stories/desktop/ADESK-US-103-saltline-game.md)）。
- **集成应用**：独立部署的 B/S 应用经仓库里的 `@aiao/orbit` 隔离在窗口里，应用统一登记；第一个是 Aiao Code（vscode.aiao.io），支持应用自绘标题栏的透明窗口，见 [ADESK-EPIC-003](epics/ADESK-EPIC-003.md)（US-201～204）。
- **PWA**：本地正式构建支持安装为独立窗口、缓存完成后的离线重开、内置应用与 SQLite 数据、用户刷新后切换已缓存新版；终端大资源按需缓存，远程内容仍需联网。本次没有生产发布（[ADESK-US-009](stories/platform/ADESK-US-009-pwa.md)、[验收证据](evidence/2026-11-16/pwa.md)）。
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
- 数据按当前浏览器的 Origin 隔离；清除站点数据、换浏览器或换域名看不到原数据。已有文件导入下载、完整桌面备份与跨 Origin 恢复；配额不足、OPFS 不可用和存储中断已通过 US-111 自动验收。账号或跨设备实时同步不在当前范围。TextEdit 新建保存和未保存保护已通过 US-109 自动验收。
- 窗口布局按标签页恢复；多页文件、设置与应用数据按提交顺序收敛，TextEdit 保存会检查打开时版本，冲突保留草稿，支持重新加载与另存副本；终端原始写入仍最后提交生效。删除、改名、抹掉后的旧编辑器保存必须失败，保留编辑内容。
- 集成应用不能弹窗或调用受限的文件句柄 API。桌面内不能弹 GitHub OAuth 登录窗口；能否读到直接访问时已有的登录状态另行实测，不用同站规则推断。
- 纯键盘与无障碍树已进自动冒烟；真实物理键盘截获与真实 VoiceOver 逐步播报独立记录。
- 六张自带壁纸及缩略图已本地分发并通过真实断网切换验收（US-113）。地图与天气仍需网络，已验证真实失败状态、响应校验与重试；受控响应不代表外网实况准确性。来源与隐私说明在 About 提供。

完整边界见[能力矩阵](capability-matrix.md)和[验收台账](verification-report.md#尚未证明)。

### 产品边界

产品只有前端：没有服务端、账号或密钥，发布到 Cloudflare Pages 的静态站点；系统与应用数据存在浏览器本地的 SQLite 与 OPFS 里，刷新后还在，游戏「几猫3A大作」自己的设置存在 localStorage（[D-15](decisions.md#d-15随桌面发布的单文件游戏在同源-iframe-里运行)）。「刷新后还在」是验收过的测试结论，不是数据永久安全：浏览器可以清理站点数据。

### 本目录的覆盖范围

本目录是产品根 `aiao-desktop/` 的产品级需求唯一真相源，覆盖两个 Nx 应用：`apps/web`（Angular 桌面）与 `apps/e2e`（正式构建上的浏览器冒烟），见 [D-02](decisions.md#d-02产品根目录与应用拆分) 与 [ADESK-US-001](stories/platform/ADESK-US-001-product-root.md)；本地开发入口 `pnpm nx dev aiao-desktop` 与开发导航见 [ADESK-US-002](stories/platform/ADESK-US-002-local-dev-dashboard.md)；发布到 Cloudflare Pages 的一键命令 `pnpm nx run aiao-desktop:deploy` 见 [ADESK-US-003](stories/platform/ADESK-US-003-cloudflare-pages-deploy.md)。

旧版 Web Desktop（`DESKTOP-US-*`）已退役。[历史规格](../../specs/001-web-desktop-product/spec.md)

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

当前实施 [US-208 Aiao Code 文件复制与嵌入边界](stories/application/ADESK-US-208-aiao-code-file-copy.md)，复用现有文件授权，不扩展共享目录或自动同步。

[US-116 备忘录编辑保护](stories/desktop/ADESK-US-116-note-drafts.md)、[US-121 备忘录置顶](stories/desktop/ADESK-US-121-notes-pin.md)和 [US-123 备忘录新建文件夹](stories/desktop/ADESK-US-123-notes-folders.md)已完成本地自动验收；文件夹重命名、删除和云端同步仍未接入。

[US-117 本地会话与草稿保护](stories/desktop/ADESK-US-117-local-messages.md)已完成；真实远程通讯未接入。

[US-118 本地邮件草稿](stories/desktop/ADESK-US-118-local-mail-drafts.md)已完成自动验收；真实邮件收发服务仍未接入。

[US-119 日历事件草稿](stories/desktop/ADESK-US-119-calendar-drafts.md)已完成本地自动验收；远程日历账号、邀请和同步仍未接入。

[US-120 联系人搜索与本地编辑](stories/desktop/ADESK-US-120-contacts-workflow.md)、[US-121 备忘录置顶](stories/desktop/ADESK-US-121-notes-pin.md)、[US-122 提醒事项筛选](stories/desktop/ADESK-US-122-reminder-filters.md)、[US-123 备忘录新建文件夹](stories/desktop/ADESK-US-123-notes-folders.md)和 [US-124 Freeform 笔迹保存与失败保护](stories/desktop/ADESK-US-124-freeform-workflow.md)已完成本地自动验收；远程账号、跨设备同步和自定义列表仍未接入。

[US-124 Freeform 笔迹保存与失败保护](stories/desktop/ADESK-US-124-freeform-workflow.md)已完成自动验收：笔迹真实持久化、INSERT/DELETE 失败保留、Retry 恢复和刷新恢复均有正式构建证据。

[US-125 Stocks 本地搜索与演示数据声明](stories/desktop/ADESK-US-125-stocks-search-and-demo-data.md)已完成自动验收：本地自选股支持代码和公司名搜索、空结果与清空恢复，页面明确标出无实时行情源；实时行情、交易和远程同步仍未接入。

[US-126 Font Book 字体族搜索](stories/desktop/ADESK-US-126-fontbook-search.md)已完成自动验收：本地字体族支持名称搜索、空结果和清空恢复，筛选后的字体标题与示例文字保持一致；系统字体安装、删除和冲突管理仍未接入。

[US-127 Settings 分区搜索](stories/desktop/ADESK-US-127-settings-search.md)已完成自动验收：本地设置分区支持名称搜索、空结果、清空恢复和面板联动；各面板完整系统 API、远程账号、权限中心和跨设备同步仍未接入。
