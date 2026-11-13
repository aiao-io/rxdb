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
  - `filesystem`：指桌面的虚拟磁盘，不是用户机器上的文件。打开 / 保存由桌面自己的面板（Finder 风格）提供，这是产品给出的文件授权与交互，不依赖也不替代浏览器的文件选择器：`showOpenFilePicker()`、`showDirectoryPicker()` 这类句柄 API 在跨源 sandbox iframe 里被浏览器拒绝（[ADESK-US-203](ADESK-US-203-aiao-code.md) 对 `showDirectoryPicker` 实测为 `SecurityError`），应用自己的 `<input type="file">` 不属于本能力，能否使用没有验收。应用只拿到用户在面板里选定的文件内容，以及只能把内容写回该文件的实例绑定凭证；远程应用不能拿到 RxDB repository、OPFS 原始句柄或任意宿主对象。目录选择、多选与拖放数据通道不在第一批内（见 [future-requirements](../../future-requirements.md)）。
- **权限与错误**：应用清单逐项声明 capabilities，默认拒绝；请求未登记能力、参数非法、窗口已关闭、用户取消或浏览器拒绝时返回稳定错误码。remote-web 只通过 Orbit 请求，不能通过 `window.parent`、DOM 查询或任意 `postMessage` 绕过权限。能力协议带版本号和实例 ID；应用声明的协议版本高于桌面支持的版本时，明确报告不兼容，不能静默缺少能力后继续运行。
- **能力契约**：每项能力的请求、授权主体、影响范围、用户确认、超时、取消与窗口关闭后的行为和错误码，写在下面的「能力契约」一节，接入方不读宿主内部类就能实现。登记表的浏览器权限（iframe 的 `allow`）与清单的 `capabilities` 是两层：宿主的默认拒绝只约束经 Orbit 的请求，不是对浏览器所有访问路径的保证。
- **远程 iframe 边界**：沿用 Orbit 的精确 Origin、sandbox、COEP/CORP、ready 超时和失败重试约束；能力调用有超时、来源校验和实例绑定。远程应用的业务数据留在它自己的来源，桌面只提供明确授权的系统能力。
- **bundled HTML 边界**：`public/saltline.html` 等随桌面发布的入口属于受信任构建资产；同源 iframe 不是安全隔离边界。纳入统一运行时的目的是生命周期一致，以后若提供 bridge，也不能把它描述成防恶意代码的沙箱。非受信任内容不得使用 bundled-html 类型。
- **性能验收**：以正式构建和 Chromium 网络记录验收：启动桌面（含自动打开的 Finder 窗口）、打开 Launchpad 与 Spotlight 时，不请求 Finder 以外的应用实现 chunk、应用独有的种子或 remote-web URL；打开一个应用时只加载它所需的 chunk / iframe；打开应用 A 不执行应用 B 的构造函数、订阅或独有的数据种子。首屏 initial 体积不超过实现前的实测值，并把 `project.json` 的 initial 预算收紧到实测结果附近作为回退门槛。基线不沿用 [ADESK-US-001](../platform/ADESK-US-001-product-root.md) 验收记录里的 1.09 MB（那是更早的构建）：阶段 A 动手之前，在固定的提交上用同一条正式构建命令实测一次，原始字节与压缩后的传输大小都记入验收台账并附短 SHA，之后的比较沿用同一命令与配置。initial 体积只证明打包边界，不证明「更快」：首屏可交互时间、首次打开某个应用的耗时、最小化后的资源占用另按 [CONVENTIONS 的测量口径](../../CONVENTIONS.md#测量口径)记基线，阈值由基线定，基线出来之前本故事不宣称首屏更快。
- **向后兼容**：现有内置应用的窗口、菜单、Dock 最小化动画、Aiao Code Orbit 握手和 `saltline.html` 的指针锁定行为保持不变；只有能力接口和加载边界改变时才更新对应接入故事与冒烟。

### Out of Scope

- 运行时安装任意第三方代码、应用市场审核、代码签名、恶意应用防护和跨租户安全隔离。
- 把所有已有内置应用一次性改成远程微前端；运行类型仍由清单决定。
- 自动把任意系统服务开放给应用，或提供桌面级 root 权限、任意文件读写和原始数据库访问。
- 后台冻结、应用进程级别隔离、Service Worker 级别的应用卸载；浏览器标签页仍是共享渲染环境。
- bundled-html 的能力 bridge；目录选择、多选与拖放数据通道；OAuth 弹窗等扩展宿主能力（见 [future-requirements](../../future-requirements.md)）。

## 验收标准

| #   | 前置条件                                                                                           | 操作                                                                                                     | 预期结果                                                                                                                                                                                     | 状态 |
| --- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | `saltline` 已登记                                                                                  | 打开再关闭 `几猫3A大作`                                                                                  | 只在窗口打开时创建同源 iframe；关闭后 iframe、监听器和窗口实例销毁；重新打开是新实例且游戏行为保持                                                                                           | ⬜   |
| 2   | Aiao Code 的远程入口可用                                                                           | 从 Dock 打开 Aiao Code                                                                                   | 只在打开时创建 Orbit iframe；报告 ready 后窗口变为可用；最小化、还原和关闭不重复加载入口                                                                                                     | ⬜   |
| 3   | Aiao Code 的远程入口超时或主动 fail                                                                | 打开、等待超时，再点击重试                                                                               | 当前窗口显示失败原因；重试创建新实例；其他窗口和桌面没有进入失败状态                                                                                                                         | ⬜   |
| 4   | 正式构建，清空浏览器缓存与站点数据（所以没有已保存的窗口布局）                                     | 启动桌面并依次打开 Launchpad、Spotlight                                                                  | 首屏只下载桌面 shell、清单、Finder 和公共资源；没有其他应用的组件 chunk、应用独有的种子或 remote-web 请求                                                                                    | ⬜   |
| 5   | 应用 A 与应用 B 都已登记                                                                           | 只打开应用 A                                                                                             | 只加载 A 的组件或入口；B 的组件构造函数、独有的数据种子和网络入口都没有执行                                                                                                                  | ⬜   |
| 6   | 日历、天气、股票、提醒事项应用从未打开过                                                           | 分别在全新的库和已有数据的库上打开通知中心                                                               | 两种库上对应的小组件都显示内置初始数据（种子在首次被读取时触发，不在首次打开应用时才触发），网络记录里没有这四个应用的组件 chunk                                                             | ⬜   |
| 7   | 阶段 A 前在固定提交上记下的基线；实现后的正式构建                                                  | 用同一条构建命令与配置比较 initial 体积                                                                  | 不大于基线，`project.json` 的 initial 预算已收紧到基线附近；基线（原始字节与传输大小）与短 SHA 已记入验收台账                                                                                | ⬜   |
| 8   | 应用只声明部分 capabilities                                                                        | 分别调用已声明和未声明能力                                                                               | 已声明能力按统一接口成功或返回浏览器层错误；未声明能力稳定返回 `CAPABILITY_DENIED`，窗口里有一句可见原因，不能通过 parent DOM 或任意消息绕过；remote-web 拿不到 RxDB repository 与 OPFS 句柄 | ⬜   |
| 9   | 应用窗口获得和失去焦点                                                                             | 设置标题、登记菜单、最小化、还原、关闭                                                                   | 菜单栏只显示前台应用的登记内容；关闭后菜单、订阅和能力上下文全部解绑                                                                                                                         | ⬜   |
| 10  | 应用声明的协议版本高于桌面支持的版本                                                               | 打开应用                                                                                                 | 应用收到明确的不兼容错误，窗口显示原因；不会缺能力后继续运行                                                                                                                                 | ⬜   |
| 11  | 应用请求 clipboard、notification、appearance                                                       | 在用户手势和非用户手势下分别调用；未授权时写 appearance                                                  | 权限与用户手势规则一致；权限拒绝和窗口关闭都有可识别错误；未授权的写入被拒绝                                                                                                                 | ⬜   |
| 12  | 应用请求 filesystem                                                                                | 请求打开文件、保存文件；用户各选定一次、取消一次                                                         | 桌面弹出自己的打开 / 保存面板；选定后应用拿到该文件内容（打开）或保存成功的结果（保存）；取消返回 `USER_CANCELLED`，桌面不弹错误提示，也不写盘；应用拿不到面板之外的任何文件                 | ⬜   |
| 13  | 运行已有完整冒烟                                                                                   | 执行桌面、Aiao Code 和 saltline 验收                                                                     | 既有内置应用、Orbit 远程应用、同源游戏、窗口最小化 / 还原和跨源隔离检查保持通过                                                                                                              | ⬜   |
| 14  | Aiao Code 的替身应用可控制 ready 的时机                                                            | 加载中关闭窗口后再放行旧 ready；另一场景：超时后点「重试」，再让旧实例补发 ready                         | 已关闭的窗口不会重新出现，窗口与 Dock 状态不变；旧实例的 ready 按实例 ID 丢弃，不会让新实例误判就绪                                                                                          | ⬜   |
| 15  | 登记表的 `allow` 与清单的 `capabilities` 对 clipboard 的声明不一致（只授一层），以及一致的两种情形 | 校验登记表                                                                                               | 不一致的登记逐项报出应用与能力，桌面启动即失败；两层一致的通过                                                                                                                               | ⬜   |
| 16  | 应用经 `filesystem.open` 拿到文件 A 的凭证                                                         | ①用凭证保存；②不带凭证请求保存到文件 B；③A 被另一处改动、删除或改名后再用凭证保存；④关闭窗口后再用旧凭证 | ①写回 A 并返回新版本；②弹出保存面板，用户选位置并确认覆盖，不会静默写 B；③`FILE_CHANGED` 或 `FILE_NOT_FOUND`，磁盘不变，不在原路径新建；④`HANDLE_INVALID`，磁盘不变                          | ⬜   |
| 17  | 打开 / 保存面板还开着                                                                              | 关闭应用窗口，再放行旧实例迟到的 `filesystem.save`；另一场景只用键盘操作面板                             | 面板随窗口关闭，请求以 `WINDOW_CLOSED` 结束；迟到的 save 被丢弃，没有写盘；只用 Tab、方向键、Enter 和 Esc 就能选择、确认和取消                                                               | ⬜   |
| 18  | Aiao Code 的替身应用可控制消息的时机                                                               | 超时后点「重试」，再让旧实例补发 `window.setTitle`                                                       | 旧实例的 RPC 按实例 ID 丢弃，新实例的窗口标题不变                                                                                                                                            | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：#1～#3、#13 复用并扩展 `aiao-desktop-e2e`；#4～#7 由正式构建的网络记录、chunk 图和应用初始化探针覆盖（#7 对照阶段 A 前记下的基线）；#8～#11、#15 由应用上下文、Orbit 协议、登记校验和窗口生命周期单测及浏览器测试覆盖；#12、#16、#17 另有文件能力的单测和冒烟里的面板操作；#14、#18 在冒烟里用可控制消息时机的替身应用覆盖（#17 里迟到的 save 同理）。性能验收必须在正式构建上进行，开发服务器的模块加载不能代替生产 chunk 证据。

## 交付阶段

| 阶段 | 交付                                                                                                           | 关闭条件                                                             | 依赖                | AC 区段           | 状态 |
| ---- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------- | ----------------- | ---- |
| A    | 应用运行时与生命周期：`ApplicationRuntime`、`WindowManager` 与载荷解耦、三种运行类型的实例创建与销毁、失败重试 | 打开 / 关闭 / 失败重试都只影响当前实例；旧实例的迟到消息被丢弃       | ADESK-US-205 阶段 A | AC#1～3、14       | ⬜   |
| B    | 按需加载与首屏预算：每个应用独立的 dynamic import、种子在首次读取时触发、initial 预算                          | 启动不请求 Finder 以外的应用载荷；initial 体积不回退                 | A                   | AC#4～7           | ⬜   |
| C    | 宿主上下文与 window / menu / app 能力：`DesktopAppContext`、权限默认拒绝、错误码与协议版本                     | 未声明能力稳定被拒；菜单与订阅随窗口解绑；两层权限声明一致           | A                   | AC#8～10、15、18  | ⬜   |
| D    | notification / clipboard / appearance / filesystem 能力与打开保存面板                                          | 四项能力的手势、权限与取消语义一致；文件凭证与面板的退出行为符合契约 | C                   | AC#11～12、16～17 | ⬜   |

四个阶段都是当前承诺；AC#13 是每个阶段合并前都要跑的回归，不属于单一阶段；故事在 AC#1～18 都有证据后才 Done。

「依赖」列管**启动时机**：本故事阶段 A 在 ADESK-US-205 阶段 A 完成后即可开始，允许两个故事的阶段交错；frontmatter 的 `dependsOn` 管**关闭条件**：本故事 Done 要求 ADESK-US-205 已 Done。

## 能力契约

接入方读这一节和 Orbit 的协议文档就能实现，不需要读宿主的内部类。通用规则对每个能力生效；超时、大小上限、频率上限这类数值在阶段 C、D 实现前定下，写成协议常量并由单测断言，本节不预设。

**通用规则**

1. **两层权限，各管各的**：登记表的浏览器权限（iframe 的 `allow`）决定应用能否直接调用浏览器 API，清单的 `capabilities` 决定应用能否经 Orbit 请求宿主。宿主的默认拒绝只约束第二层，不是对浏览器所有访问路径的保证。两层都存在的能力（现在是 `clipboard`：[ADESK-US-203](ADESK-US-203-aiao-code.md) 已授予 Aiao Code 直接读写剪贴板）要求两层声明一致，登记校验与单测都检查（AC#15）；升级任一层时同时核对另一层。
2. **结果分类，不合并成一句「失败」**：成功，或 `CAPABILITY_DENIED`（清单没声明）、`INVALID_ARGUMENT`（参数非法）、`USER_CANCELLED`（用户取消）、`BROWSER_PERMISSION_DENIED`（浏览器层拒绝）、`TIMEOUT`（超时）、`WINDOW_CLOSED`（窗口已关闭）。用户取消是正常结果：调用方收到取消码后安静结束，桌面不弹错误提示；拒绝、参数非法、超时由桌面在窗口里给出一句可见的原因。
3. **超时只计宿主处理请求的时间**：用户在桌面面板里选文件、确认覆盖的停留时间不计入超时。
4. **实例绑定与退出**：每个请求带实例 ID。窗口关闭、实例销毁或重试之后，未完成的请求以 `WINDOW_CLOSED` 结束，还开着的桌面面板随之关闭且不再提交任何写入；旧实例迟到的 ready、RPC 与回调按实例 ID 丢弃，既不会让已关闭的窗口重新出现，也不会写盘（AC#14、#17、#18）。重试创建的是新实例 ID。
5. **协议版本**：应用声明的版本高于桌面支持的版本时报告不兼容，不缺能力继续运行（AC#10）。

**逐项契约**

| 能力         | 请求（输入 → 输出）                                                                                                                                                                   | 授权主体与影响范围                                                                                                                                                                                                                                                                              | 用户确认                                                                                                                                                                    | 取消与关闭后                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| window       | `getState()`、`setTitle(title)`、`minimize()`、`restore()`、`toggleMaximize()`、`close()`、`setDragRegions(rects)`、`onStateChange`                                                   | 清单 `window`；只作用于调用方自己的窗口实例，不能操作其他窗口                                                                                                                                                                                                                                   | 否                                                                                                                                                                          | 窗口关闭后订阅自动取消，后续调用 `WINDOW_CLOSED`                                                                                                                                                                                                                                                                                                                                                   |
| menu         | `menu.set(menus)` 登记前台应用菜单与窗口级命令；`onCommand(commandId)`                                                                                                                | 清单 `menu`；菜单只在所属窗口在前台时显示。命令 ID 按 `<appId>:<commandId>` 加命名空间，同一次登记里 ID 重复 → `INVALID_ARGUMENT`；多窗口应用每个窗口各自登记，切换前台窗口时菜单跟着切换；单窗口应用重复打开时聚焦已有窗口，不新建                                                             | 否                                                                                                                                                                          | 窗口关闭或应用退出时菜单与命令自动解绑，之后的登记 → `WINDOW_CLOSED`                                                                                                                                                                                                                                                                                                                               |
| app          | `app.open(appId)`、`app.focus()`、`app.quit()`                                                                                                                                        | 清单 `app`；`open` 只能打开清单里已登记的 appId（未登记 → `INVALID_ARGUMENT`），不接受 URL，也不携带文件或命令参数，所以应用 A 不能让应用 B 自动执行带参数的动作；`focus` / `quit` 只作用于调用方自己的应用                                                                                     | 否（只是打开一个已登记应用的普通窗口）                                                                                                                                      | 单窗口应用已在运行时聚焦它并返回成功；窗口关闭后 → `WINDOW_CLOSED`                                                                                                                                                                                                                                                                                                                                 |
| appearance   | `appearance.get()`、`onChange`；`appearance.set(patch)`                                                                                                                               | 读取需 `appearance`，写入需另外声明 `appearance:write`；写入改的是全局系统设置（所有窗口可见、持久化到本地库），值只接受登记的取值集合，超出 → `INVALID_ARGUMENT`                                                                                                                               | 否（授权已在运营批准的清单里）                                                                                                                                              | 订阅随窗口取消；已写入的设置保留，因为它是用户的系统设置                                                                                                                                                                                                                                                                                                                                           |
| notification | `notification.post({ title, body, icon?, dedupeKey? })` → `{ id }`                                                                                                                    | 清单 `notification`；条目归属调用方 appId，显示该应用的名称与图标，应用不能冒名；标题、正文有长度上限，图标只能是登记图标或内联图片，非法 → `INVALID_ARGUMENT`；同一 appId 的相同 `dedupeKey` 覆盖旧条目；频率有上限，超限 → `RATE_LIMITED`                                                     | 否                                                                                                                                                                          | 已提交的通知留在通知中心由用户清除，不随窗口关闭撤回；未完成的请求 → `WINDOW_CLOSED`                                                                                                                                                                                                                                                                                                               |
| clipboard    | `clipboard.readText()`、`clipboard.writeText(text)`                                                                                                                                   | 清单 `clipboard`（读、写分别声明）加登记表 `allow` 里对应的 `clipboard-read` / `clipboard-write`，两层一致；影响范围是用户机器的系统剪贴板，不是虚拟磁盘                                                                                                                                        | 读取由浏览器的权限提示决定；写入要求请求落在用户手势的有效期内，没有手势 → `BROWSER_PERMISSION_DENIED`                                                                      | 用户在浏览器权限提示里拒绝 → `BROWSER_PERMISSION_DENIED`；窗口关闭后未完成的请求 → `WINDOW_CLOSED`                                                                                                                                                                                                                                                                                                 |
| filesystem   | `filesystem.open({ accept? })` → `{ name, mime, size, bytes, handle, version }`；`filesystem.save({ handle?, suggestedName, bytes, expectedVersion? })` → `{ name, version, handle }` | 清单 `filesystem`（读、写分别声明）；只作用于用户在桌面面板里选定的那一个文件：`open` 返回内容快照和实例绑定的凭证 `handle`，凭证只能把内容写回这个文件，不能读别的文件、列目录或换目标；不带 `handle` 的 `save` 一律弹出保存面板，由用户选位置，目标已存在时面板要求用户确认覆盖，应用不能跳过 | 是：`open` 选文件，不带 `handle` 的 `save` 选位置并确认覆盖。带 `handle` 的 `save` 写回已授权的同一个文件，不再弹确认，但先比对 `expectedVersion`（打开时的修改时间与大小） | 用户取消 → `USER_CANCELLED`，不返回内容、不写盘。磁盘上的文件已被改动 → `FILE_CHANGED`（不写入，应用可改走另存）；已被删除或改名 → `FILE_NOT_FOUND`（不写入，也不在原路径新建）；超过大小上限 → `FILE_TOO_LARGE`（面板里就禁用选择并说明）；凭证在窗口关闭、实例销毁或重试后失效，再用 → `HANDLE_INVALID`，磁盘不变；同一实例同一时刻只开一个面板，重复请求 → `BUSY`；面板可只用键盘操作，Esc 取消 |

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
