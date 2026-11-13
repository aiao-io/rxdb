---
id: ADESK-US-206
title: 应用懒加载与统一系统能力
status: Backlog
priority: High
epic: ADESK-EPIC-003
created: 2026-11-13
updated: 2026-11-13
tags: [application, lazy-loading, iframe, host-capabilities, performance]
dependsOn: [ADESK-US-201, ADESK-US-202, ADESK-US-204, ADESK-US-205]
capabilities: []
---

# 用户故事：应用懒加载与统一系统能力

## 作为/我想要/以便

**作为** 使用或接入 Aiao Desktop 应用的人
**我想要** 桌面先启动一个轻量的系统外壳，应用在真正打开时才加载，并通过统一的系统能力接口使用窗口、菜单、通知、剪贴板和文件等能力
**以便** 首屏更快，内置应用、同源 HTML 应用和远程 iframe 应用都能获得一致的桌面体验，同时不把桌面内部状态直接暴露给远程页面

## 范围边界

本故事分四个交付阶段（见「交付阶段」表），全部是当前承诺。

### In Scope

- **Shell-first**：桌面首屏只急切加载菜单栏、桌面层、Dock、窗口管理、启动台、Spotlight、系统设置、应用清单元数据、图标、应用目录服务和 Finder。桌面启动后会自动打开一个 Finder 窗口（[`desktop-page.ts`](../../../apps/web/src/app/pages/desktop-page.ts) 里的 `this.wm.open('finder', { path: HOME_PATH })`），所以 Finder 的组件与磁盘服务随启动加载，按壳层处理，不算「应用实现 chunk」。其余应用的实现、应用专属样式、应用专属数据访问和远程 iframe 都不能因为注册而提前执行。
- **全应用按需加载**：
  - `builtin-component` 使用每个应用独立的 dynamic import；`registry.ts` 不再静态 import 所有组件。这一项只归本故事，[ADESK-US-205](ADESK-US-205-application-management.md) 不改加载时机。
  - `bundled-html` 只在窗口真正打开时创建 iframe 并请求入口；预装只代表可用和受保护，不代表已加载。
  - `remote-web` 只在窗口真正打开时创建 Orbit 实例和 iframe；桌面启动、打开 Finder 窗口、打开 Launchpad 或查看 Applications 时不请求远程入口。
  - 应用数据的实体、种子和重资源按应用或功能边界拆分。种子的触发点是该数据域**第一次被读取**，而不是第一次打开该应用：通知中心的小组件（日历、天气、股票、提醒事项）在壳层里读这些域，读取时触发对应域的种子（[D-07](../../decisions.md#d-07系统数据存在本地-sqlite) 的「每个域一次、与 `seed:<domain>` 标记同事务」不变）；打开应用 A 不触发应用 B 独有的数据域。已有数据仍存本地 SQLite / OPFS。
- **统一生命周期**：应用实例的生命周期是 `registered → loading → ready → closing → closed`，失败走 `failed`；最小化、前台 / 后台、缩放是窗口的呈现状态，与实例生命周期正交，由 `WindowManager` 管。加载失败、超时、应用自报失败和窗口关闭都只影响当前实例；重试创建新实例，不复用半初始化的 iframe 或组件。
- **统一宿主上下文**：每个应用得到一个绑定到 `appId` 与窗口实例的 `DesktopAppContext`。内置应用通过 Angular facade 使用它，remote-web 通过 Orbit RPC 使用它；两者的能力名称、参数校验、成功结果和错误码一致。bundled-html 本阶段只统一生命周期，不提供能力 bridge：唯一的 bundled-html 应用 `saltline.html` 原样发布、不调用任何桌面接口（[D-15](../../decisions.md#d-15随桌面发布的单文件游戏在同源-iframe-里运行)），出现第一个需要能力的 bundled-html 应用时再做。
- **第一批系统能力**：
  - `window`：读取窗口状态，设置标题，最小化、还原、缩放、关闭，登记拖动区和监听窗口状态。
  - `menu`：登记前台应用菜单与窗口级命令，应用退出或关闭时自动解绑。
  - `app`：打开已登记应用、聚焦或退出自己的窗口；不能打开未登记的 URL 作为桌面应用。
  - `appearance`：读取主题、强调色和系统显示模式；写入能力只按清单授予。
  - `notification`：向桌面通知中心提交标题、正文、图标和去重键；不能直接操作通知中心 DOM。
  - `clipboard`：按清单授予读写文本能力，并遵守浏览器手势与权限失败语义。
  - `filesystem`：指桌面的虚拟磁盘，不是用户机器上的文件。sandbox 里的 iframe 弹不出浏览器的文件选择器（[ADESK-US-203](ADESK-US-203-aiao-code.md) 已实测），所以打开 / 保存由桌面自己的面板（Finder 风格）提供，应用只拿到用户在面板里选定的文件内容或保存位置；远程应用不能拿到 RxDB repository、OPFS 原始句柄或任意宿主对象。目录选择、多选与拖放数据通道不在第一批内（见 [future-requirements](../../future-requirements.md)）。
- **权限与错误**：应用清单逐项声明 capabilities，默认拒绝；请求未登记能力、参数非法、窗口已关闭、用户取消或浏览器拒绝时返回稳定错误码。remote-web 只通过 Orbit 请求，不能通过 `window.parent`、DOM 查询或任意 `postMessage` 绕过权限。能力协议带版本号和实例 ID；应用声明的协议版本高于桌面支持的版本时，明确报告不兼容，不能静默缺少能力后继续运行。
- **远程 iframe 边界**：沿用 Orbit 的精确 Origin、sandbox、COEP/CORP、ready 超时和失败重试约束；能力调用有超时、来源校验和实例绑定。远程应用的业务数据留在它自己的来源，桌面只提供明确授权的系统能力。
- **bundled HTML 边界**：`public/saltline.html` 等随桌面发布的入口属于受信任构建资产；同源 iframe 不是安全隔离边界。纳入统一运行时的目的是生命周期一致，以后若提供 bridge，也不能把它描述成防恶意代码的沙箱。非受信任内容不得使用 bundled-html 类型。
- **性能验收**：以正式构建和 Chromium 网络记录验收：启动桌面（含自动打开的 Finder 窗口）、打开 Launchpad 与 Spotlight 时，不请求 Finder 以外的应用实现 chunk、应用独有的种子或 remote-web URL；打开一个应用时只加载它所需的 chunk / iframe；打开应用 A 不执行应用 B 的构造函数、订阅或独有的数据种子。首屏 initial 体积不超过实现前的实测值（[ADESK-US-001](../platform/ADESK-US-001-product-root.md) 的验收记录为 1.09 MB），并把 `project.json` 的 initial 预算收紧到实测结果附近作为回退门槛。
- **向后兼容**：现有内置应用的窗口、菜单、Dock 最小化动画、Aiao Code Orbit 握手和 `saltline.html` 的指针锁定行为保持不变；只有能力接口和加载边界改变时才更新对应接入故事与冒烟。

### Out of Scope

- 运行时安装任意第三方代码、应用市场审核、代码签名、恶意应用防护和跨租户安全隔离。
- 把所有已有内置应用一次性改成远程微前端；运行类型仍由清单决定。
- 自动把任意系统服务开放给应用，或提供桌面级 root 权限、任意文件读写和原始数据库访问。
- 后台冻结、应用进程级别隔离、Service Worker 级别的应用卸载；浏览器标签页仍是共享渲染环境。
- bundled-html 的能力 bridge；目录选择、多选与拖放数据通道；OAuth 弹窗等扩展宿主能力（见 [future-requirements](../../future-requirements.md)）。

## 验收标准

| #   | 前置条件                                     | 操作                                                    | 预期结果                                                                                                                                                   | 状态 |
| --- | -------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | `saltline` 已登记                            | 打开再关闭 `几猫3A大作`                                 | 只在窗口打开时创建同源 iframe；关闭后 iframe、监听器和窗口实例销毁；重新打开是新实例且游戏行为保持                                                         | ⬜   |
| 2   | Aiao Code 的远程入口可用                     | 从 Dock 打开 Aiao Code                                  | 只在打开时创建 Orbit iframe；报告 ready 后窗口变为可用；最小化、还原和关闭不重复加载入口                                                                   | ⬜   |
| 3   | Aiao Code 的远程入口超时或主动 fail          | 打开、等待超时，再点击重试                              | 当前窗口显示失败原因；重试创建新实例；其他窗口和桌面没有进入失败状态                                                                                       | ⬜   |
| 4   | 正式构建，清空浏览器缓存                     | 启动桌面并依次打开 Launchpad、Spotlight                 | 首屏只下载桌面 shell、清单、Finder 和公共资源；没有其他应用的组件 chunk、应用独有的种子或 remote-web 请求                                                  | ⬜   |
| 5   | 应用 A 与应用 B 都已登记                     | 只打开应用 A                                            | 只加载 A 的组件或入口；B 的组件构造函数、独有的数据种子和网络入口都没有执行                                                                                | ⬜   |
| 6   | 日历、天气、股票、提醒事项应用从未打开过     | 打开通知中心                                            | 对应的小组件仍显示内置初始数据（种子在首次被读取时触发，不在首次打开应用时才触发）                                                                         | ⬜   |
| 7   | 实现前后的正式构建                           | 比较 initial 体积                                       | 不大于实现前的实测值，`project.json` 的 initial 预算已收紧到实测结果附近                                                                                   | ⬜   |
| 8   | 应用只声明部分 capabilities                  | 分别调用已声明和未声明能力                              | 已声明能力按统一接口成功或返回浏览器层错误；未声明能力稳定返回拒绝错误，不能通过 parent DOM 或任意消息绕过；remote-web 拿不到 RxDB repository 与 OPFS 句柄 | ⬜   |
| 9   | 应用窗口获得和失去焦点                       | 设置标题、登记菜单、最小化、还原、关闭                  | 菜单栏只显示前台应用的登记内容；关闭后菜单、订阅和能力上下文全部解绑                                                                                       | ⬜   |
| 10  | 应用声明的协议版本高于桌面支持的版本         | 打开应用                                                | 应用收到明确的不兼容错误，窗口显示原因；不会缺能力后继续运行                                                                                               | ⬜   |
| 11  | 应用请求 clipboard、notification、appearance | 在用户手势和非用户手势下分别调用；未授权时写 appearance | 权限与用户手势规则一致；权限拒绝和窗口关闭都有可识别错误；未授权的写入被拒绝                                                                               | ⬜   |
| 12  | 应用请求 filesystem                          | 请求打开文件、保存文件；用户各选定一次、取消一次        | 桌面弹出自己的打开 / 保存面板；选定后应用拿到该文件内容或保存位置；取消返回可识别的取消错误；应用拿不到面板之外的任何文件                                  | ⬜   |
| 13  | 运行已有完整冒烟                             | 执行桌面、Aiao Code 和 saltline 验收                    | 既有内置应用、Orbit 远程应用、同源游戏、窗口最小化 / 还原和跨源隔离检查保持通过                                                                            | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：#1～#3、#13 复用并扩展 `aiao-desktop-e2e`；#4～#7 由正式构建的网络记录、chunk 图和应用初始化探针覆盖（#7 比较实现前后的 initial 体积）；#8～#11 由应用上下文、Orbit 协议和窗口生命周期单测及浏览器测试覆盖；#12 另有冒烟里的面板操作。性能验收必须在正式构建上进行，开发服务器的模块加载不能代替生产 chunk 证据。

## 交付阶段

| 阶段 | 交付                                                                                                           | 关闭条件                                             | 依赖                | AC 区段   | 状态 |
| ---- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------- | --------- | ---- |
| A    | 应用运行时与生命周期：`ApplicationRuntime`、`WindowManager` 与载荷解耦、三种运行类型的实例创建与销毁、失败重试 | 打开 / 关闭 / 失败重试都只影响当前实例               | ADESK-US-205 阶段 A | AC#1～3   | ⬜   |
| B    | 按需加载与首屏预算：每个应用独立的 dynamic import、种子在首次读取时触发、initial 预算                          | 启动不请求 Finder 以外的应用载荷；initial 体积不回退 | A                   | AC#4～7   | ⬜   |
| C    | 宿主上下文与 window / menu / app 能力：`DesktopAppContext`、权限默认拒绝、错误码与协议版本                     | 未声明能力稳定被拒；菜单与订阅随窗口解绑             | A                   | AC#8～10  | ⬜   |
| D    | notification / clipboard / appearance / filesystem 能力与打开保存面板                                          | 四项能力的手势、权限与取消语义一致                   | C                   | AC#11～12 | ⬜   |

四个阶段都是当前承诺；AC#13 是每个阶段合并前都要跑的回归，不属于单一阶段；故事在 AC#1～13 都有证据后才 Done。

## 技术笔记

- 当前 `registry.ts` 顶部静态 import 了全部应用组件；目标是保留纯元数据清单，并把每个组件改成 `loadComponent: () => import(...).then(...)`。应用组件仍可保持 standalone，不需要为了懒加载重新引入 NgModule。
- 当前 `data/seeds.ts` 静态 import 所有应用 seed；目标是把应用数据初始化入口挂到应用 loader 或数据域 manifest 上，数据域第一次被读取时才装载。种子版本和事务语义沿用 [D-07](../../decisions.md#d-07系统数据存在本地-sqlite)。
- `WindowManager.open` 应只创建统一的 `DesktopWindow` 和加载状态，实际 component / iframe 创建由运行时适配器完成；这样 `WindowManager` 不需要知道 Angular component、同源 HTML 和 Orbit 的差异。
- `DesktopAppContext` 不把 `FileSystem`、`DesktopData`、`Preferences` 或 `EnvironmentInjector` 暴露给 remote-web。内置应用可以暂时由 facade 适配现有服务，长期让两种需要能力的运行类型共享同一套能力语义。
- `OrbitHost` 是 remote-web 的适配器，不再承担整个应用系统的登记逻辑。来源、权限和 ready 超时仍从 manifest 推导，失败码向应用管理器归一化。
- 通知中心小组件对数据域的读取目前由各 Store 的 `liveQuery` 完成（[`widgets.ts`](../../../apps/web/src/app/components/widgets/widgets.ts) 里的 `CalendarStore`、`WeatherStore`、股票与提醒事项的 `liveQuery`）；种子触发点改成「首次读取」时，要保证这些读取在种子完成前不返回空结果（AC#6）。

## 实现文件

| 阶段 | 文件                                                                                                                   | 改动                                 |
| ---- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| A    | `aiao-desktop/apps/web/src/app/services/application-runtime.ts`（新增）                                                | 生命周期、loader、实例和失败状态     |
| A    | `aiao-desktop/apps/web/src/app/components/window-frame.ts`、`aiao-desktop/apps/web/src/app/services/window-manager.ts` | 窗口实例与应用运行时解耦             |
| A、C | `aiao-desktop/apps/web/src/app/services/orbit-host.ts`、`aiao-desktop/apps/web/src/app/apps/web-app/web-app.ts`        | remote-web 的 Orbit 适配与生命周期   |
| B    | `aiao-desktop/apps/web/src/app/apps/app-manifests.ts`、`aiao-desktop/apps/web/src/app/apps/registry.ts`                | 纯元数据、动态 loader 和运行类型     |
| B    | `aiao-desktop/apps/web/src/app/data/seeds.ts`、各应用 `*.seed.ts`                                                      | 按数据域在首次读取时初始化           |
| B    | `aiao-desktop/apps/web/project.json`                                                                                   | initial 预算收紧                     |
| C、D | `aiao-desktop/apps/web/src/app/services/app-context.ts`（新增）                                                        | 系统能力 facade、权限校验与统一错误  |
| D    | `aiao-desktop/apps/web/src/app/components/`（新增面板）                                                                | filesystem 的打开 / 保存面板         |
| A～D | `aiao-desktop/apps/e2e/src/smoke.mjs`、`aiao-desktop/apps/e2e/src/verify-aiao-code.mjs`                                | 正式构建网络、生命周期与系统能力验收 |

## References

- [ADESK-US-201 应用体系与统一登记表](ADESK-US-201-application-system.md)
- [ADESK-US-202 集成应用的运行宿主](ADESK-US-202-integrated-app-runtime.md)
- [ADESK-US-204 透明窗口与窗口接口](ADESK-US-204-transparent-window.md)
- [ADESK-US-205 Applications 目录、预装应用与 Dock 管理](ADESK-US-205-application-management.md)
- [D-07 系统数据存在本地 SQLite](../../decisions.md#d-07系统数据存在本地-sqlite)
- [D-18 应用懒加载与宿主系统能力统一](../../decisions.md#d-18应用懒加载与宿主系统能力统一)
