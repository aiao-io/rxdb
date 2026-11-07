# Feature Specification: 双交互模式 Web 桌面产品

**Feature Branch**: `012-web-desktop-product`

**Created**: 2026-11-07

**Status**: Draft（运行基础实现中，完整产品尚未验收）

**Input**: 参考 awesome-web-desktops，建设同时支持 macOS 与 Windows 交互的 Web 桌面；所有软件为 Web 应用，使用无界式隔离；无界必须重构到本仓库并为产品优化；本轮完成产品用户故事编写。

应用需求目录为 [apps/web-desktop/requirements](../../apps/web-desktop/requirements/README.md)。本规格描述用户旅程与产品约束；原子故事、数字 AC、硬依赖和状态唯一维护在该目录。共有 42 条故事、8 个 Epic，当前 7 条 In Progress、35 条 Backlog。运行内核来源与重构约束属于用户明确要求，已开始的实现及取舍见 [运行基础实施记录](runtime-implementation.md)。

## User Scenarios & Testing

### User Story 1 - 用熟悉的桌面完成文件工作（Priority: P1）

日常使用者无需安装客户端或注册账号，选择熟悉的 macOS / Windows 方式进入桌面，打开文件管理器和文本编辑器，编辑并保存一份文件，再关闭并重新打开继续使用。

**Why this priority**: 能保存实际工作内容，才有一个可使用的桌面产品。

**Independent Test**: 在一个全新受支持浏览器中，只启用内置应用，分别完成两种模式的“进入→新建→编辑→保存→关闭→重开”旅程，并核对文件字节。

**Acceptance Scenarios**:

1. **Given** 新用户首次访问，**When** 选择一种交互模式并打开内置应用，**Then** 看见相应菜单与窗口操作，可不依赖账号完成编辑保存。
2. **Given** 已保存的文档和布局，**When** 关闭窗口并重新打开，**Then** 已保存内容正确，关闭与退出的行为符合所选模式。
3. **Given** 文档尚未保存，**When** 请求关闭并取消，**Then** 编辑内容、窗口和焦点仍可继续使用。

责任故事：[DESKTOP-US-001](../../apps/web-desktop/requirements/stories/shell/DESKTOP-US-001-first-run.md)、[002](../../apps/web-desktop/requirements/stories/shell/DESKTOP-US-002-macos-interaction.md)、[003](../../apps/web-desktop/requirements/stories/shell/DESKTOP-US-003-windows-interaction.md)、[104](../../apps/web-desktop/requirements/stories/window/DESKTOP-US-104-close-quit-dirty.md)、[601](../../apps/web-desktop/requirements/stories/files/DESKTOP-US-601-file-manager.md)、[602](../../apps/web-desktop/requirements/stories/files/DESKTOP-US-602-text-editor.md)。

### User Story 2 - 多任务与双模式切换（Priority: P1）

用户同时打开多个工具和文档，用窗口移动、贴靠、最小化与恢复安排工作；切换 macOS / Windows 交互方式后继续操作原内容。

**Why this priority**: 双交互和多窗口是用户明确要求，需要保持真实行为与工作连续性。

**Independent Test**: 用两个标准应用和一份未保存文档完成窗口切换与模式往返，不需要应用市场、云账号或团队协作。

**Acceptance Scenarios**:

1. **Given** 两个相互遮挡窗口，**When** 激活、移动和缩放，**Then** 输入只落在目标窗口，窗口始终可找回。
2. **Given** 未保存文档、最小化窗口和活动对话框，**When** 切换交互模式，**Then** 实例与内容不重载，按钮和入口按新模式变化。
3. **Given** 只使用键盘，**When** 启动、切换、移动和关闭窗口，**Then** 能完成任务且没有焦点陷阱。

责任故事：[窗口 Epic](../../apps/web-desktop/requirements/epics/DESKTOP-EPIC-002.md)、[DESKTOP-US-004](../../apps/web-desktop/requirements/stories/shell/DESKTOP-US-004-switch-mode.md)。

### User Story 3 - 安装并运行受信 Web 应用（Priority: P1）

用户从受控目录选择应用，理解来源和所需能力，安装后可启动单实例或多个文档实例；应用之间不因普通样式、路由或事件冲突而串扰。

**Why this priority**: 桌面需要持续承载不同应用，而不只是一组内置界面。

**Independent Test**: 使用受控目录中的示例应用验证安装、拒绝授权、启动、实例隔离与退出，不依赖公开市场。

**Acceptance Scenarios**:

1. **Given** 未安装应用，**When** 查看详情并确认安装，**Then** 明确来源、版本与能力；失败时不产生可启动的半安装记录。
2. **Given** 同一多实例应用的两个文档，**When** 分别输入和导航，**Then** 状态与路由独立，桌面能力调用绑定正确实例。
3. **Given** 应用未获文件授权，**When** 请求读取托管文件，**Then** 先征求对应范围的授权，拒绝没有副作用。

责任故事：[应用 Epic](../../apps/web-desktop/requirements/epics/DESKTOP-EPIC-003.md)、[运行内核 Epic](../../apps/web-desktop/requirements/epics/DESKTOP-EPIC-004.md)、[协作 Epic](../../apps/web-desktop/requirements/epics/DESKTOP-EPIC-005.md)。

### User Story 4 - 断网、更新与数据带出（Priority: P2）

用户在网络中断后继续使用已准备的应用与本地文件，在更新前保护未保存内容，并可导出、恢复或重置自己的托管数据。

**Why this priority**: 桌面承担实际工作后，需要清楚的数据可用性和恢复路径。

**Independent Test**: 在已完整准备的本地桌面中断网，编辑保存，再导出并在独立配置中恢复；同时用受控失败版本验证回退，不依赖远程业务服务。

**Acceptance Scenarios**:

1. **Given** 桌面与应用完整资源已准备，**When** 断网后重新进入，**Then** 支持离线的应用和已保存文件仍可使用，需联网功能明确不可用。
2. **Given** 新应用版本下载中断，**When** 继续打开旧版本，**Then** 使用完整旧版本而不是混合资源。
3. **Given** 有效或损坏备份，**When** 导入，**Then** 有效备份经确认完整恢复，损坏备份不改变当前数据。

责任故事：[本地连续性 Epic](../../apps/web-desktop/requirements/epics/DESKTOP-EPIC-006.md)、[文件 Epic](../../apps/web-desktop/requirements/epics/DESKTOP-EPIC-007.md)。

### User Story 5 - 接入和维护自己的桌面运行内核（Priority: P1）

应用开发者以等价契约接入不同框架应用；平台维护者能直接在本仓修复隔离运行内核，并验证正式产物和原有使用入口。

**Why this priority**: 以 Wujie 为基线、仓内独立维护 Orbit 是用户硬要求，也是后续持续维护桌面行为的前提。

**Independent Test**: 用仓内构建运行内核与三框架夹具执行并行装载、多实例路由、隐藏恢复及销毁，再验证原文档站的主题与路由。

**Acceptance Scenarios**:

1. **Given** 仓内源码及可追溯的上游基线，**When** 独立构建桌面内核，**Then** 正式产物不需要外部无界运行时包或 CDN 才能隔离运行应用。
2. **Given** 三个不同框架的等价样例，**When** 执行同一套接入与生命周期任务，**Then** 可用能力、结果与错误保持对称。
3. **Given** 应用反复启动和退出，**When** 核对资源，**Then** 已登记监听、实例与动态节点回到基线，不产生幽灵实例。

责任故事：[DESKTOP-US-301](../../apps/web-desktop/requirements/stories/runtime/DESKTOP-US-301-in-repository-runtime.md)、[303](../../apps/web-desktop/requirements/stories/runtime/DESKTOP-US-303-lifecycle-cleanup.md)、[308](../../apps/web-desktop/requirements/stories/runtime/DESKTOP-US-308-framework-parity.md)、[质量 Epic](../../apps/web-desktop/requirements/epics/DESKTOP-EPIC-008.md)。

### Edge Cases

- 资源失败、跨源限制、登录页、超时和迟到回调：明确失败与重试，不复活已经关闭的实例。
- 多个窗口退出时某一个取消或保存失败：整次销毁停止，不悄悄丢弃其他文档。
- 同一文件被两个实例保存：按版本检测冲突，允许重新加载或另存为，不静默覆盖。
- 断网发生在安装、更新或资源准备中间：不标记为完整可用，不混合版本。
- 本地存储额度不足、损坏或模式版本不兼容：保留已有数据并解释失败，不自动清空或假装已保存。
- 两个标签页同时启动或旧页在接管后恢复：一个可写拥有者，失效拥有者的后续写入被拒绝。
- 工作区删除、模式切换、浏览器缩放和小视口：窗口可找回、内容不重载、状态不被错误展开。
- 授权撤销、新增权限和来源变化：旧授权不自动扩大，迟到调用与引用仍受当前服务授权约束。
- 浏览器拒绝全屏、剪贴板或快捷键：可见替代入口与准确状态，不报告操作已成功。
- 同源恶意访问、同步死循环、浏览器崩溃：不属于本轮模型的强隔离保证；首版通过受信应用准入约束范围。

## Requirements

### Functional Requirements

| 编号   | 功能要求                                                                                       | 责任故事                 |
| ------ | ---------------------------------------------------------------------------------------------- | ------------------------ |
| FR-001 | 产品 MUST 无账号进入本地桌面，支持手动选择与保存 macOS / Windows 模式                          | DESKTOP-US-001、004      |
| FR-002 | 两种模式 MUST 提供各自应用入口、窗口按钮、菜单与关闭/退出语义                                  | DESKTOP-US-002、003、104 |
| FR-003 | 模式切换 MUST 保留实例、未保存内容、路由和可达窗口                                             | DESKTOP-US-004           |
| FR-004 | 用户 MUST 能保存主题、缩放和减少动效偏好                                                       | DESKTOP-US-005           |
| FR-005 | 用户 MUST 能创建、激活、移动、缩放、最小化、最大化、贴靠和还原窗口                             | DESKTOP-US-101～103      |
| FR-006 | 未保存内容 MUST 在关闭、退出、更新和卸载前得到一致保护                                         | DESKTOP-US-104、204、205 |
| FR-007 | 用户 MUST 通过键盘完成主任务，并能从概览与工作区找回窗口                                       | DESKTOP-US-105～107      |
| FR-008 | 应用 MUST 经受控目录与有效描述完成安装，不接受任意 URL 默认运行                                | DESKTOP-US-201、202      |
| FR-009 | 应用 MUST 按单实例/多实例策略启动，区分应用、运行实例和窗口身份                                | DESKTOP-US-203、304      |
| FR-010 | 更新与回退 MUST 保持完整版本、授权差异和数据迁移边界                                           | DESKTOP-US-204           |
| FR-011 | 卸载 MUST 让用户选择私有数据去留，不默认删除共享文件                                           | DESKTOP-US-205           |
| FR-012 | 用户 MUST 能搜索、固定、排序及取消固定应用入口                                                 | DESKTOP-US-206           |
| FR-013 | 运行内核 MUST 以 Wujie 为基线在本仓独立维护为 Orbit，来源及声明可追溯，不能只包装外部依赖      | DESKTOP-US-301           |
| FR-014 | 受信应用 MUST 保持协议内的样式、普通全局状态、实例路由和消息作用域，明确强安全隔离不承诺的范围 | DESKTOP-US-302、304、305 |
| FR-015 | 实例 MUST 有显式生命周期和幂等清理，启动失败及可捕获异常可诊断、可重试                         | DESKTOP-US-303、306      |
| FR-016 | 资源预取 MUST 不默认执行应用，挂起必须经应用支持且不销毁脏状态                                 | DESKTOP-US-307           |
| FR-017 | 三框架接入 MUST 保持功能与契约对称，迁移 MUST 保持原有用户行为                                 | DESKTOP-US-308           |
| FR-018 | 桌面服务 MUST 默认拒绝未授权调用，提供窗口协议、定向消息、文件关联、通知与受限剪贴板           | DESKTOP-US-401～405      |
| FR-019 | 桌面 MUST 持久保存已声明的配置和会话，离线标识 MUST 对应完整可验证资源                         | DESKTOP-US-501、502      |
| FR-020 | 用户 MUST 能导出文件字节及托管数据，恢复前验证，重置前明确确认范围                             | DESKTOP-US-503、603      |
| FR-021 | 同一数据集 MUST 只有一个可写桌面宿主，接管后旧拥有者不能继续写入                               | DESKTOP-US-504           |
| FR-022 | 文件管理和编辑 MUST 覆盖新建、打开、保存、并发冲突、导入导出与回收站恢复                       | DESKTOP-US-601～604      |
| FR-023 | 产品 MUST 在支持环境完成无障碍、双模式、三框架、性能和现有消费方回归验证                       | DESKTOP-US-701、702      |
| FR-024 | 正式产物 MUST 可在 HTTPS 静态部署，提供去敏的本地诊断与可追溯版本信息                          | DESKTOP-US-703           |

### Key Entities

| 实体                            | 业务含义与关系                                                         |
| ------------------------------- | ---------------------------------------------------------------------- |
| DesktopProfile                  | 当前用户的交互模式、主题、固定入口和桌面偏好；本轮不等于云账号         |
| Workspace                       | 同一桌面中的窗口分组、顺序与活动窗口                                   |
| AppDefinition / AppInstallation | 应用身份、批准来源、协议、能力、资源与已安装版本                       |
| AppInstance                     | 某应用版本的一次独立运行，拥有状态、实例路由和生命周期                 |
| Window                          | 应用实例的可操作外壳，含标题、工作区、边界、层级、显示状态和脏状态反馈 |
| CapabilityGrant                 | 某受信应用经用户批准的桌面服务范围及有效期，不代表强沙箱               |
| VirtualFile / Directory         | 稳定身份、父级、名称、类型、内容字节、版本与回收状态                   |
| SessionSnapshot                 | 可恢复的窗口与配置、路由和应用保存引用，不包含任意未持久内存           |
| ResourceVersion                 | 与应用版本对应的资源完整性、可用性和存活引用                           |
| DesktopOwnership                | 同一数据集当前可写宿主及拒绝旧拥有者写入的有效身份                     |
| DesktopBackup                   | 具有格式版本和范围的托管数据导出，不含默认权限和凭据                   |

## Success Criteria

### Measurable Outcomes

| 编号   | 可测结果                                                                                                   | 验收来源                           |
| ------ | ---------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| SC-001 | 每种模式的“进入→新建文本→保存→关闭→重新打开”任务均成功，100% 的测试文件字节一致                            | DESKTOP-US-001、601、602、702      |
| SC-002 | 10 名首次使用者中至少 8 名能在 3 分钟内不借助讲解完成启动编辑器并保存首份文档，样本覆盖两种模式各至少 5 人 | DESKTOP-US-001、702                |
| SC-003 | 两种模式往返切换 20 次后，标准样例的实例身份、未保存内容和路由保持一致，所有窗口控制可达                   | DESKTOP-US-004、702                |
| SC-004 | 在固定基准下 30 次桌面冷启动的可交互时间 p95 ≤ 3 秒，30 次标准应用热打开 p95 ≤ 1 秒                        | DESKTOP-US-702                     |
| SC-005 | 规定的多窗口负载下至少 100 次移动、缩放、切换动作，到可见反馈的时间 p95 ≤ 100 毫秒                         | DESKTOP-US-702                     |
| SC-006 | 全部未保存、取消、保存失败、冲突、半更新和损坏备份测试中，已保存文件无静默丢失或覆盖                       | DESKTOP-US-104、204、503、602、702 |
| SC-007 | 全部主旅程可只用键盘完成，无焦点陷阱；指定读屏环境正确识别主要操作，文字与交互符合 WCAG 2.1 AA 验收范围    | DESKTOP-US-105、701                |
| SC-008 | 对宣布离线可用的标准应用，完整准备后断网重开及编辑保存旅程全部成功，未准备应用全部准确报告不可用原因       | DESKTOP-US-502、702                |
| SC-009 | 当前发布范围全部故事有对应 AC 证据，缺真实环境、正式产物或失败分支证据时不发布为已支持                     | DESKTOP-US-702、703                |

测量环境、标准样例、采样和实机证据要求见 [分层验收台账](../../apps/web-desktop/requirements/verification-report.md)。这些是待实现的目标，不是已有测量结果。

## Assumptions

- 产品需求已完成，追加实施 Orbit 运行基础和既有演示迁移；7 条故事 In Progress、35 条 Backlog，完整产品验收尚未完成。
- 首版单人本地使用，默认无需账号；账号、云同步、公开市场和团队协作有独立进入条件。
- 默认接纳受控可信应用，不运行任意不可信网页；同源隔离模型不保证恶意代码、CPU 死循环与宿主完全隔离。
- 内置文件管理器、文本编辑器和设置提供最小真实任务；它们也是独立 Web 应用，不在宿主硬编码所有业务。
- 首版面向桌面浏览器。支持环境、视口、浏览器版本与真实宿主验收按 DESKTOP-US-701 执行，不承诺操作系统快捷键一定可被网页拦截。
- 不强制三个框架重写完整桌面；公共接入能力与演示保持三框架对称，宿主框架在实施设计确定，运行主包为 `@aiao/orbit`。
- 应用保存协议决定可恢复内容；会话布局恢复不是任意内存备份。浏览器站点数据可能被用户清理，产品提供显式数据带出路径。
- 各阶段边界、默认决策与未来准入分别见 [roadmap](../../apps/web-desktop/requirements/roadmap.md)、[decisions](../../apps/web-desktop/requirements/decisions.md) 和 [future-requirements](../../apps/web-desktop/requirements/future-requirements.md)。
