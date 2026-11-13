---
id: ADESK-US-205
title: Applications 目录、预装应用与 Dock 管理
status: Backlog
priority: High
epic: ADESK-EPIC-003
created: 2026-11-13
updated: 2026-11-13
tags: [application, applications, preinstalled, dock, drag-drop, persistence]
dependsOn: [ADESK-US-101, ADESK-US-102, ADESK-US-201, ADESK-US-202]
capabilities: []
---

# 用户故事：Applications 目录、预装应用与 Dock 管理

## 作为/我想要/以便

**作为** 在浏览器里使用 Aiao Desktop 的人
**我想要** 看到一个像 macOS 一样由系统维护的 Applications 目录，里面有随桌面预装、不能删除的应用，也能看到通过远程 iframe 运行的受管应用，并把其中的应用拖到 Dock
**以便** 应用从哪里来不影响使用方式，桌面看起来和行为上都像一个真正的系统

## 当前代码问题

- `apps/web/src/app/apps/app-manifests.ts` 是应用描述的来源，但 `apps/web/src/app/disk/disk-seed.ts` 又维护了一份独立的 `APPLICATIONS` 数组；两个列表可能漂移。
- `apps/web/src/app/components/dock.ts` 通过 `DOCK_ITEMS` 硬编码 Dock，Launchpad 的 `Add to Dock` 菜单目前没有动作，Applications 里的条目不能拖入 Dock。
- `FileSystem` 只按卷根、`System` 和主目录标准目录判断受保护路径，不能根据应用清单阻止删除、移动或改名预装应用。
- `.app` 文件名通过 `FileOpener` 反查显示名，缺少稳定的 `appId` / bundle 标识；显示名变化或同名应用会造成错误启动。
- 当前集成应用不进入 Applications，而用户期望所有可启动的受管应用都具有一致的 Applications、Launchpad、Spotlight 与 Dock 入口。

## 范围边界

### In Scope

- **单一应用目录**：应用清单是唯一真相源。每个可见应用有稳定 `appId`、显示名、图标、显示位置、运行类型、安装来源、窗口策略和受保护状态；Applications、Launchpad、Spotlight、Dock 与菜单栏都从清单派生。
- **三种运行来源**：
  - `builtin-component`：随桌面发布的 Angular 应用，代码按需动态加载。
  - `bundled-html`：随桌面发布的同源 HTML 入口，例如 `apps/web/public/saltline.html`；入口只在打开应用时装载到窗口 iframe。
  - `remote-web`：独立部署的 Web 应用，例如 `https://vscode.aiao.io/`；继续经 Orbit 在窗口 iframe 里运行，只在打开应用时请求远程地址。
- **Applications 投影**：`/Applications` 显示所有 `showInApplications: true` 的可启动应用，包括预装的本地应用、随桌面发布的 HTML 应用和受管远程应用。Launchpad、Trash 等系统入口不伪装成 `.app`，由 `showInApplications: false` 明确排除。
- **预装应用**：清单中的 `installScope: 'preinstalled'` 应用在首次建库时以 `.app` 包元数据出现在 `/Applications`，并由清单中的稳定标识与 `Info.plist` 关联。预装应用不能被 Finder、终端同步层或文件系统 API 删除、移动、改名、覆盖或移进废纸篓；抹掉磁盘后重新生成。
- **`saltline.html`**：`saltline` 作为预装的 `bundled-html` 应用登记，Applications 中显示 `几猫3A大作.app`，打开时加载同源 `/saltline.html`，不把 HTML 游戏代码复制进 SQLite 磁盘，也不因为“预装”而在桌面启动时提前加载。
- **受管远程应用**：Aiao Code 以预装的 `remote-web` 应用出现在 Applications；它是一个由清单管理的 Web 应用包，不等于允许用户输入任意网址。远程入口、Origin、Orbit 权限和就绪时限继续经过 [ADESK-US-202](ADESK-US-202-integrated-app-runtime.md) 的校验。
- **稳定打开**：双击 `.app`、Dock、Launchpad、Spotlight 和终端 `open` 都通过 `appId` 或 `CFBundleIdentifier` 启动；不再只用显示名匹配。应用不存在、清单版本不兼容或远程不可达时，只影响本次窗口并显示可重试原因。
- **Dock 布局**：Dock 使用系统偏好中的有序布局保存固定项、分隔线与系统项。首次使用时由清单里的 `defaultPinned` 生成当前默认布局，之后用户的排序与固定状态持久化到本地 SQLite。
- **Dock 运行态**：固定应用始终显示；未固定但正在运行的应用临时出现在应用区并显示运行指示，退出后消失。运行态不能覆盖用户保存的固定顺序。
- **拖放与固定**：用户可以从 Finder 的 Applications 图标视图、列表视图和分栏视图把 `.app` 拖入 Dock，也可以从 Launchpad 的应用图标拖入 Dock；Dock 显示插入位置，松手后固定应用。已固定应用再次拖入不重复添加，拖动 Dock 内图标可以调整顺序。
- **移除规则**：可移除的固定项拖出 Dock 或选择 `Remove from Dock` 后只取消固定，不卸载应用；系统项和 `dockRemovable: false` 的预装项不能移除。右键菜单根据应用状态提供 `Add to Dock`、`Remove from Dock`、`Open`、窗口列表与 `Quit`。
- **持久化与修复**：Dock 布局保存后刷新仍保留。清单升级、应用下线或偏好内容损坏时，系统只移除无效项、补回受保护系统项并保持其余用户顺序；应用本体不会因 Dock 改动被删除。

### Out of Scope

- 用户通过网址安装任意 Web 应用、应用商店、运行时下载、更新、回退和版本切换；受管应用仍由构建清单或发布方控制。
- 用户上传 `.app` 包、执行任意本地二进制或把浏览器文件系统当成真实 macOS 安装器。
- 应用窗口位置与大小跨刷新恢复；这仍属于后续窗口布局故事。
- 远程应用申请未登记的 Orbit 权限，或绕过 Orbit 直接访问桌面服务。

## 验收标准

| # | 前置条件 | 操作 | 预期结果 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 当前应用清单 | 打开 Finder 的 Applications | 清单中所有 `showInApplications: true` 的应用都出现为 `.app`；Launchpad、Trash 等系统入口不出现；没有第二份手工维护的应用列表 | ⬜ |
| 2 | 首次创建本地库 | 查看 Applications 中的预装应用 | `saltline` 显示为 `几猫3A大作.app`，Aiao Code 显示为受管应用；每个包能通过稳定 `appId` / bundle 标识回到清单 | ⬜ |
| 3 | 选中任意预装 `.app` | 从 Finder、终端 `open`、Spotlight、Launchpad 和 Dock 分别打开 | 都启动同一个 `appId`；显示名修改或存在同名文件时仍不会打开错误应用 | ⬜ |
| 4 | 选中 `几猫3A大作.app` | 尝试 Finder 的 Move to Trash、改名、移动、覆盖，并从终端执行等价文件操作 | 操作被系统层拒绝并给出明确原因；预装包仍留在 Applications，不能通过清空废纸篓绕过 | ⬜ |
| 5 | `saltline` 已登记 | 双击 Applications 中的 `几猫3A大作.app` | 窗口按需加载同源 `/saltline.html`；应用关闭后 iframe 被销毁；桌面启动阶段没有提前请求游戏入口 | ⬜ |
| 6 | Aiao Code 已登记但网络被拦截 | 从 Applications 打开 Aiao Code | 它按 remote-web 运行，经 Orbit 显示加载或失败状态；失败不影响其他应用，提供重试；没有请求未登记的远程地址 | ⬜ |
| 7 | Applications 窗口与 Dock 可见 | 将一个未固定的 `.app` 拖到 Dock 的两个不同位置 | Dock 显示插入位置，松手后应用固定在对应位置；再次拖入不重复；刷新后顺序仍保留 | ⬜ |
| 8 | Dock 中有可移除固定项、系统项与受保护项 | 拖动固定项排序，尝试移除三类项，再从 Launchpad 选择 Add to Dock | 可移除项能取消固定但应用仍在 Applications；系统项和受保护项拒绝移除；Add to Dock 与拖放结果一致 | ⬜ |
| 9 | 有一个未固定但正在运行的应用 | 启动、最小化、退出该应用并观察 Dock | 运行时出现运行指示和临时图标，最小化可从 Dock 还原，退出后未固定图标消失；固定应用退出后仍保留 | ⬜ |
| 10 | Dock 布局已保存，清单增加或移除应用 | 刷新桌面并加载一份含未知 appId 或重复项的旧偏好 | 有效的用户顺序保留，未知和重复项被丢弃，受保护系统项补回，桌面无重复图标或错误窗口 | ⬜ |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：#1～#4 由应用目录、磁盘保护和 `FileOpener` 单测覆盖；#5、#6、#9 由正式构建上的 Chromium 冒烟覆盖；#7、#8、#10 由 Dock / Finder 拖放冒烟、刷新持久化与系统设置测试覆盖。所有应用来源、保护规则和 Dock 布局都必须在同一份应用级需求证据中可追溯。

## 技术笔记

- 当前 `app-manifests.ts` 保留为不依赖 Angular 的元数据；新增 `source`、`installScope`、`showInApplications`、`defaultPinned`、`dockRemovable`、`bundleId` 与运行入口描述。`registry.ts` 只负责把 manifest 绑定到延迟 loader，不再静态 import 每个应用组件。
- `disk-seed.ts` 删除独立的 `APPLICATIONS` 常量，改由应用目录服务根据清单生成 `.app` 元数据；种子必须幂等，不能覆盖用户已经存在的非系统文件。
- `FileSystem` 的保护判断交给应用目录服务：保护的是完整包路径，而不是只保护 `Applications` 文件夹。这样终端、Finder、移动、删除和未来的导入入口共享同一条规则。
- Finder 的 `.app` 节点保留文件包表现，但节点需要携带稳定 `appId` 或可解析的 bundle 标识。应用包的内容由 `Info.plist` 提供展示元数据，真正的运行入口仍由清单决定。
- Dock 需要从固定数组改成 `DockLayoutStore` + `DockDragController`。固定布局、运行中的临时项和系统项分层计算，窗口最小化动画仍通过 `DockState.rectFor(appId)` 找到当前图标。
- HTML5 原生拖动会和桌面当前的全局 `dragstart.preventDefault()` 冲突；实现使用指针捕获的内部拖放协议，拖动结束后只提交 `appId` 与目标槽位，不把文件体或任意 URL 交给 Dock。

## 实现文件

- `apps/web/src/app/apps/app-manifests.ts` — 纯数据清单与 Applications / Dock 元数据。
- `apps/web/src/app/apps/registry.ts` — 清单到延迟 loader 的绑定。
- `apps/web/src/app/services/desktop-apps.ts` — 应用来源、安装范围、保护与清单校验。
- `apps/web/src/app/services/application-catalog.ts`（新增） — 清单、`.app` 投影、稳定标识和保护判断。
- `apps/web/src/app/disk/disk-seed.ts`、`apps/web/src/app/services/file-system.ts` — 预装包生成与系统级保护。
- `apps/web/src/app/services/dock-layout.ts`（新增）、`apps/web/src/app/components/dock.ts` — Dock 持久化、动态运行项、拖放与菜单。
- `apps/web/src/app/apps/finder/finder.ts`、`finder.html` — Applications 条目拖出与拖入 Dock 的交互。
- `apps/e2e/src/smoke.mjs` — Applications、保护、Dock 拖放和刷新验收。

## References

- [ADESK-US-201 应用体系与统一登记表](ADESK-US-201-application-system.md)
- [ADESK-US-202 集成应用的运行宿主](ADESK-US-202-integrated-app-runtime.md)
- [ADESK-US-103 内置游戏「几猫3A大作」](../desktop/ADESK-US-103-saltline-game.md)
- [D-17 应用清单与 Applications 投影](../../decisions.md#d-17应用清单是唯一真相源applications-是系统投影)
