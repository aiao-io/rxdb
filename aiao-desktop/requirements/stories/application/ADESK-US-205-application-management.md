---
id: ADESK-US-205
title: Applications 目录、预装应用与 Dock 管理
status: Backlog
priority: High
epic: ADESK-EPIC-003
created: 2026-11-13
updated: 2026-11-13
tags: [application, applications, preinstalled, dock, drag-drop, persistence]
dependsOn: [ADESK-US-101, ADESK-US-102, ADESK-US-106, ADESK-US-201, ADESK-US-202]
capabilities: []
---

# 用户故事：Applications 目录、预装应用与 Dock 管理

## 作为/我想要/以便

**作为** 在浏览器里使用 Aiao Desktop 的人
**我想要** 看到一个像 macOS 一样由系统维护的 Applications 目录，里面有随桌面预装、不能删除的应用，也能看到通过远程 iframe 运行的预装应用，并把其中的应用拖到 Dock
**以便** 应用从哪里来不影响使用方式，桌面看起来和行为上都像一个真正的系统

## 当前代码问题

- `apps/web/src/app/apps/app-manifests.ts` 是应用描述的来源，但 `apps/web/src/app/disk/disk-seed.ts` 又维护了一份独立的 `APPLICATIONS` 数组；两个列表可能漂移。
- `apps/web/src/app/components/dock.ts` 通过 `DOCK_ITEMS` 硬编码 Dock，Launchpad 的 `Add to Dock` 菜单目前没有动作，Applications 里的条目不能拖入 Dock。
- `FileSystem` 只按卷根、`System` 和主目录标准目录判断受保护路径，不能根据应用清单阻止删除、移动或改名预装应用。
- `.app` 文件名通过 `FileOpener` 反查显示名，缺少稳定的 `appId` / bundle 标识；显示名变化或同名应用会造成错误启动。
- 当前集成应用不进入 Applications，而用户期望所有可启动的预装应用都具有一致的 Applications、Launchpad、Spotlight 与 Dock 入口。
- 已有的本地库里，`/Applications` 的 `.app` 包由旧的手写列表种子生成，没有 appId，也没有几猫3A大作与 Aiao Code 的包；升级必须补齐，不能覆盖用户内容。

## 范围边界

本故事分四个交付阶段（见「交付阶段」表），全部是当前承诺。

### In Scope

- **单一应用目录**：应用清单是唯一真相源。每个可见应用有稳定 `appId`、显示名、图标、显示位置、运行类型、安装来源、窗口策略和受保护状态；Applications、Launchpad、Spotlight、Dock 与菜单栏都从清单派生。
- **三种运行来源**：
  - `builtin-component`：随桌面发布的 Angular 应用。按需动态加载由 [ADESK-US-206](ADESK-US-206-lazy-app-runtime-and-host-capabilities.md) 交付，本故事不改变加载时机。
  - `bundled-html`：随桌面发布的同源 HTML 入口，例如 `apps/web/public/saltline.html`；入口只在打开应用时装载到窗口 iframe。
  - `remote-web`：独立部署的 Web 应用，例如 `https://vscode.aiao.io/`；继续经 Orbit 在窗口 iframe 里运行，只在打开应用时请求远程地址。
- **Applications 投影**：`/Applications` 显示所有 `showInApplications: true` 的可启动应用，包括预装的本地应用、随桌面发布的 HTML 应用和预装的远程应用。Launchpad、Trash 等系统入口不伪装成 `.app`，由 `showInApplications: false` 明确排除。唯一的例外是同名冲突：用户自己的同名非包条目占着位置时，投影让位，该应用在 Applications 里没有包（见「已有库升级」），Finder 要对此给出说明，应用仍可从其他入口打开。
- **预装应用**：清单中的 `installScope: 'preinstalled'` 应用在首次建库时以 `.app` 包元数据出现在 `/Applications`，并由清单中的稳定标识与 `Info.plist` 关联。预装应用不能被 Finder、终端同步层或文件系统 API 删除、移动、改名、覆盖或移进废纸篓；保护同时覆盖包里的子项，以及对 `/Applications` 或其祖先目录的递归操作（整目录删除、移动、覆盖），保护的是系统拥有的投影，不是按显示名匹配的任何条目；抹掉磁盘后重新生成。
- **已有库升级**：由旧版种子建成的库，打开新版时幂等补齐缺的预装包、补上稳定标识；不覆盖用户自己的文件，同名的非包条目保留，对应应用仍可从其他入口打开。没有标识的旧包按冻结的旧种子名单一次性认领，之后一律按标识。这是 [D-07](../../decisions.md#d-07系统数据存在本地-sqlite)「已有的库不会被覆盖」对 `.app` 包的例外（[D-17](../../decisions.md#d-17应用清单是唯一真相源applications-是系统投影)）。
- **清单生命周期**：清单里的应用改名、图标或 bundle 元数据更新、运行类型变更、应用下线，只处理系统拥有的投影——位于 `/Applications` 顶层、带清单标识的 `.app` 包。同一 `appId` 的包随显示名改名、就地更新 `Info.plist`；应用下线时只移除系统写入的投影文件（`Contents/Info.plist` 等），并清掉 Dock 与窗口恢复里的引用；包目录里还有用户放进去的文件时，目录保留为普通文件夹（不再是应用包），否则整个目录一并移除。用户复制到别处的包、同名的非包条目、包里用户放的文件都是用户文件，不因清单变化被改名或删除；复制出来的包在清单已没有它时再被打开，提示「应用已下线」。清单变化只能处理标识匹配的投影，不能按显示名删除用户文件。
- **`saltline.html`**：`saltline` 作为预装的 `bundled-html` 应用登记，Applications 中显示 `几猫3A大作.app`，打开时加载同源 `/saltline.html`，不把 HTML 游戏代码复制进 SQLite 磁盘，也不因为「预装」而在桌面启动时提前加载。
- **预装的远程应用**：Aiao Code 以预装的 `remote-web` 应用出现在 Applications；它是由清单管理的 Web 应用包，不等于允许用户输入任意网址。远程入口、Origin、Orbit 权限和就绪时限继续经过 [ADESK-US-202](ADESK-US-202-integrated-app-runtime.md) 的校验。
- **稳定打开**：双击 `.app`、Dock、Launchpad、Spotlight 和终端 `open` 都通过 `appId` 或 `CFBundleIdentifier` 启动；不再只用显示名匹配。应用不存在、清单版本不兼容或远程不可达时，只影响本次窗口并显示可重试原因。
- **Dock 布局**：Dock 使用系统偏好中的有序布局保存固定项、分隔线与系统项。首次使用时由清单里的 `defaultPinned` 生成当前默认布局，之后用户的排序与固定状态持久化到本地 SQLite。
- **Dock 运行态**：固定应用始终显示；未固定但正在运行的应用临时出现在应用区并显示运行指示，退出后消失。运行态不能覆盖用户保存的固定顺序。
- **拖放与固定**：用户可以从 Finder 的 Applications 图标视图、列表视图和分栏视图把 `.app` 拖入 Dock，也可以从 Launchpad 的应用图标拖入 Dock；Dock 显示插入位置，松手后固定应用。已固定应用再次拖入不重复添加，拖动 Dock 内图标可以调整顺序。
- **移除规则**：可移除的固定项拖出 Dock 或选择 `Remove from Dock` 后只取消固定，不卸载应用；系统项和 `dockRemovable: false` 的预装项不能移除。右键菜单根据应用状态提供 `Add to Dock`、`Remove from Dock`、`Open`、窗口列表与 `Quit`。
- **持久化与修复**：Dock 布局保存后刷新仍保留。清单升级、应用下线或偏好内容损坏时，系统只移除无效项、补回受保护系统项并保持其余用户顺序；应用本体不会因 Dock 改动被删除。

### Out of Scope

- 用户通过网址安装任意 Web 应用、应用商店、运行时下载、更新、回退和版本切换，以及运营目录安装：见 [future-requirements](../../future-requirements.md)；应用仍由构建清单控制。
- 用户上传 `.app` 包、执行任意本地二进制或把浏览器文件系统当成真实 macOS 安装器。
- 应用窗口位置与大小跨刷新恢复：见 [ADESK-US-104](../desktop/ADESK-US-104-window-layout-persistence.md)。
- 远程应用申请未登记的 Orbit 权限，或绕过 Orbit 直接访问桌面服务。
- 应用实现的按需加载、运行时抽象与宿主能力：由 [ADESK-US-206](ADESK-US-206-lazy-app-runtime-and-host-capabilities.md) 承接。

## 验收标准

| #   | 前置条件                                                                                                            | 操作                                                                                                  | 预期结果                                                                                                                                                                                            | 状态 |
| --- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 当前应用清单                                                                                                        | 打开 Finder 的 Applications                                                                           | 清单中所有 `showInApplications: true` 的应用都出现为 `.app`；Launchpad、Trash 等系统入口不出现；没有第二份手工维护的应用列表                                                                        | ⬜   |
| 2   | 首次创建本地库                                                                                                      | 查看 Applications 中的预装应用                                                                        | `saltline` 显示为 `几猫3A大作.app`，Aiao Code 显示为预装的远程应用（`remote-web`）；每个包能通过稳定 `appId` / bundle 标识回到清单                                                                  | ⬜   |
| 3   | 由旧版种子建成的库（`/Applications` 里是旧的手写列表、没有 appId），其中用户删过一个 `.app`，并在里面放过自己的文件 | 用新版打开桌面                                                                                        | 缺的预装包被补出，现有包补上 appId；用户自己的文件原样保留；同名的非包条目不被覆盖也不阻塞启动，Finder 对该应用没有包的情况有可见说明，对应应用仍可从启动台、聚焦搜索和 Dock 打开；刷新后不重复补写 | ⬜   |
| 4   | 选中任意预装 `.app`                                                                                                 | 从 Finder、终端 `open`、Spotlight、Launchpad 和 Dock 分别打开                                         | 都启动同一个 `appId`；存在同名文件、或清单里的显示名变化时仍不会打开错误应用                                                                                                                        | ⬜   |
| 5   | `saltline` 已登记                                                                                                   | 双击 Applications 中的 `几猫3A大作.app`                                                               | 窗口加载同源 `/saltline.html`（载荷的按需加载与销毁由 [ADESK-US-206](ADESK-US-206-lazy-app-runtime-and-host-capabilities.md) 验收）                                                                 | ⬜   |
| 6   | Aiao Code 已登记但网络被拦截                                                                                        | 从 Applications 打开 Aiao Code                                                                        | 它按 remote-web 运行，经 Orbit 显示加载或失败状态；失败不影响其他应用，提供重试；没有请求未登记的远程地址                                                                                           | ⬜   |
| 7   | 选中 `几猫3A大作.app`                                                                                               | 在 Finder 里 Move to Trash、改名、移动、覆盖，再清空废纸篓                                            | 操作被拒绝并给出明确原因；预装包仍留在 Applications，不能通过清空废纸篓绕过                                                                                                                         | ⬜   |
| 8   | 终端已打开，`/Applications` 里有预装包                                                                              | 在终端里对预装包执行删除、移动、改名                                                                  | 不论采用哪种拦截机制，结果都是：磁盘上的包保持不变（刷新后仍在 Applications 且能打开），用户得到可见反馈（终端里直接报错，或回写时撤销并提示）；Finder 与终端的结论一致                             | ⬜   |
| 9   | 没有已存的 Dock 布局                                                                                                | 打开桌面                                                                                              | Dock 的默认入口与顺序与升级前一致（对照实现前冒烟 `shell.dock` 记下的入口与顺序，见 [ADESK-US-201](ADESK-US-201-application-system.md) #4），由清单的 `defaultPinned` 生成，不再是硬编码数组        | ⬜   |
| 10  | Dock 中有可移除固定项、系统项与受保护项                                                                             | 对三类项分别选 `Remove from Dock`；再从 Launchpad 选 `Add to Dock`                                    | 可移除项取消固定但应用仍在 Applications；系统项和受保护项拒绝移除；`Add to Dock` 把应用固定到 Dock，已固定的不重复                                                                                  | ⬜   |
| 11  | 有一个未固定但正在运行的应用                                                                                        | 启动、最小化、退出该应用并观察 Dock                                                                   | 运行时出现运行指示和临时图标，最小化可从 Dock 还原，退出后未固定图标消失；固定应用退出后仍保留                                                                                                      | ⬜   |
| 12  | Dock 布局已保存，清单增加或移除应用                                                                                 | 刷新桌面并加载一份含未知 appId 或重复项的旧偏好                                                       | 有效的用户顺序保留，未知和重复项被丢弃，受保护系统项补回，桌面无重复图标或错误窗口；布局刷新后仍保留                                                                                                | ⬜   |
| 13  | Applications 窗口与 Dock 可见                                                                                       | 把未固定的 `.app` 从 Finder 的图标、列表和分栏视图分别拖到 Dock 的不同位置；再从 Launchpad 拖一个图标 | Dock 显示插入位置，松手后应用固定在对应位置；再次拖入不重复；刷新后顺序仍保留                                                                                                                       | ⬜   |
| 14  | Dock 中有可移除固定项                                                                                               | 拖动固定项调整顺序；把可移除项拖出 Dock                                                               | 顺序按拖放结果变化并保存；拖出后只取消固定、应用仍在 Applications；`Add to Dock` 与拖放得到相同的结果                                                                                               | ⬜   |
| 15  | 清单把一个预装应用改名并换了图标；用户在该应用的包里放过自己的文件，并把包复制到了 Desktop                          | 用新版打开桌面                                                                                        | 同一 `appId` 的包改成新名字、`Info.plist` 更新；包里用户的文件和复制到 Desktop 的包原样保留；所有入口仍按 `appId` 启动同一个应用                                                                    | ⬜   |
| 16  | 清单移除了一个预装应用；用户把它的包复制到了 Desktop，并在 `/Applications/<它>.app/` 里放过自己的文件               | 用新版打开桌面，再双击复制出来的包                                                                    | 系统写入的投影文件被移除，Dock 与窗口恢复里指向它的引用被清掉；用户放进去的文件还在（该目录成为普通文件夹，不再是应用包）；复制到 Desktop 的包原样保留，双击它提示「应用已下线」                    | ⬜   |
| 17  | 终端和 Finder 都已打开，`/Applications` 里有预装包                                                                  | 对 `/Applications` 整目录做删除、移动、覆盖；对包里的子项做删除、改名；对同名的用户文件做删除、改名   | 整目录操作与包内子项操作被拒绝或撤销，预装包保持不变且仍能打开，Finder 与终端的结论一致；用户自己的同名非包条目不受保护规则影响，可以正常删除、改名                                                 | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：#1、#2、#4 由应用目录与 `FileOpener` 单测加冒烟覆盖；#3、#15、#16 由 [ADESK-US-106](../desktop/ADESK-US-106-database-upgrade-path.md) 的升级检查组覆盖（旧种子建成的库 → 新版打开；清单改动用带不同清单的新旧产物验证）；#5、#6、#11 由正式构建上的 Chromium 冒烟覆盖；#7、#8、#17 由磁盘保护单测与冒烟（Finder 与终端各一组）覆盖；#9、#10、#12 由系统设置测试、刷新持久化与冒烟覆盖；#13、#14 由 Dock / Finder 拖放冒烟覆盖。所有应用来源、保护规则和 Dock 布局都必须在同一份应用级需求证据中可追溯。

## 交付阶段

| 阶段 | 交付                                                                   | 关闭条件                                                                                                         | 依赖                      | AC 区段         | 状态 |
| ---- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------- | --------------- | ---- |
| A    | 清单扩展、Applications 投影、稳定 appId 打开、已有库升级、清单生命周期 | Applications 与清单一一对应（同名冲突除外）；新库与旧库都补齐；所有入口按 appId 打开；清单改名、下线只动系统投影 | ADESK-US-106 的升级检查组 | AC#1～6、15～16 | ⬜   |
| B    | 预装保护：应用目录服务，FileSystem、终端同步与 Finder 共用一条规则     | 受保护的包在所有写路径下保持不变，包内子项与祖先目录的递归操作同样被拦                                           | A                         | AC#7～8、17     | ⬜   |
| C    | Dock 布局：清单默认布局、运行态临时项、固定 / 取消固定、持久化与修复   | 默认布局与升级前一致；偏好损坏时只清理无效项                                                                     | A                         | AC#9～12        | ⬜   |
| D    | Dock 拖放：Finder 与 Launchpad 拖入、拖动排序、拖出取消固定            | 拖放与菜单操作结果一致、刷新后保留                                                                               | C                         | AC#13～14       | ⬜   |

四个阶段都是当前承诺；故事在 AC#1～17 都有证据后才 Done。

## 技术笔记

- 当前 `app-manifests.ts` 保留为不依赖 Angular 的元数据；新增 `source`、`installScope`、`showInApplications`、`defaultPinned`、`dockRemovable`、`bundleId` 与运行入口描述。`registry.ts` 对延迟 loader 的绑定由 ADESK-US-206 交付，本故事不改变加载时机。
- `installScope` 本故事只有 `preinstalled`（随构建发布、受保护）。Aiao Code 是 `preinstalled` 加 `remote-web` 来源；目录安装（`managed`）与用户安装（`user`）不在本故事内。
- `disk-seed.ts` 删除独立的 `APPLICATIONS` 常量，改由应用目录服务根据清单生成 `.app` 元数据；种子必须幂等，不能覆盖用户已经存在的非系统文件。
- `FileSystem` 的保护判断交给应用目录服务：保护的是完整包路径，而不是只保护 `Applications` 文件夹。这样终端、Finder、移动、删除和未来的导入入口共享同一条规则。
- 终端里的删除发生在 Vivari 虚拟机自己的文件系统副本里（[D-09](../../decisions.md#d-09终端按需复制磁盘)），所以「终端侧保护」只有三种做法：虚拟机内只读挂载受保护的包；shell 补丁拦截并报错；回写时撤销并提示。三者的可见行为不同，实现前选定并写进本条；AC#8 只约束结果（包不变、有反馈）。选「回写时撤销」时要写清楚：被删的包在终端里会消失到下一次回写（输出停 0.3 秒后扫描、每 3 秒轮询，最长约 3.3 秒），撤销时桌面给出「预装应用不能删除」的提示，并把包恢复回虚拟机；这段时间用户看到的状态与恢复的时点要写进选定机制的说明里。
- Finder 的 `.app` 节点保留文件包表现，但节点需要携带稳定 `appId` 或可解析的 bundle 标识。应用包的内容由 `Info.plist` 提供展示元数据，真正的运行入口仍由清单决定。
- Dock 需要从固定数组改成 `DockLayoutStore` + `DockDragController`。固定布局、运行中的临时项和系统项分层计算，窗口最小化动画仍通过 `DockState.rectFor(appId)` 找到当前图标。
- HTML5 原生拖动会和桌面当前的全局 `dragstart.preventDefault()` 冲突；实现使用指针捕获的内部拖放协议，拖动结束后只提交 `appId` 与目标槽位，不把文件体或任意 URL 交给 Dock。

**未选的替代方案**：把 Applications 做成不落库的只读虚拟挂载（目录节点由清单实时投影，不存 `DesktopFile` 行）。它没有清单漂移，没有已有库迁移，也没有「绕过保护」的写路径；代价是终端复制进虚拟机的磁盘镜像里要单独投影这棵子树，Finder 的包内容查看要单独支持。本故事按 [D-17](../../decisions.md#d-17应用清单是唯一真相源applications-是系统投影) 的落库方案写；实现前评估后若改用虚拟挂载，AC#3、#7、#8 的机制随之改写，结果不变。

## 实现文件

| 阶段 | 文件                                                                                                                | 改动                                                 |
| ---- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| A    | `aiao-desktop/apps/web/src/app/apps/app-manifests.ts`                                                               | 纯数据清单与 Applications / Dock 元数据              |
| A    | `aiao-desktop/apps/web/src/app/apps/registry.ts`                                                                    | 清单到组件的绑定（延迟 loader 由 ADESK-US-206 交付） |
| A、B | `aiao-desktop/apps/web/src/app/services/desktop-apps.ts`                                                            | 应用来源、安装范围、保护与清单校验                   |
| A、B | `aiao-desktop/apps/web/src/app/services/application-catalog.ts`（新增）                                             | 清单、`.app` 投影、稳定标识和保护判断                |
| A、B | `aiao-desktop/apps/web/src/app/disk/disk-seed.ts`、`aiao-desktop/apps/web/src/app/services/file-system.ts`          | 预装包生成（含已有库补齐）与系统级保护               |
| C、D | `aiao-desktop/apps/web/src/app/services/dock-layout.ts`（新增）、`aiao-desktop/apps/web/src/app/components/dock.ts` | Dock 持久化、动态运行项、拖放与菜单                  |
| D    | `aiao-desktop/apps/web/src/app/apps/finder/finder.ts`、`finder.html`                                                | Applications 条目拖出与拖入 Dock 的交互              |
| A～D | `aiao-desktop/apps/e2e/src/smoke.mjs`                                                                               | Applications、保护、Dock 拖放和刷新验收              |

## References

- [ADESK-US-201 应用体系与统一登记表](ADESK-US-201-application-system.md)
- [ADESK-US-202 集成应用的运行宿主](ADESK-US-202-integrated-app-runtime.md)
- [ADESK-US-206 应用懒加载与统一系统能力](ADESK-US-206-lazy-app-runtime-and-host-capabilities.md)
- [ADESK-US-106 旧库升级路径](../desktop/ADESK-US-106-database-upgrade-path.md)
- [ADESK-US-103 内置游戏「几猫3A大作」](../desktop/ADESK-US-103-saltline-game.md)
- [D-07 系统数据存在本地 SQLite](../../decisions.md#d-07系统数据存在本地-sqlite)
- [D-17 应用清单与 Applications 投影](../../decisions.md#d-17应用清单是唯一真相源applications-是系统投影)
