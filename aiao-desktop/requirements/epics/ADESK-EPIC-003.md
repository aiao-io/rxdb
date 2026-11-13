---
id: ADESK-EPIC-003
status: In Progress
startDate: 2026-11-13
targetDate: TBD
owner: jimmy
---

# 应用体系与集成应用

## 愿景

Aiao Desktop 除了随桌面构建的内置应用，还能把独立部署的 B/S 应用当作桌面应用来用：所有应用登记在同一张表里，从同样的入口打开、在同样的窗口里运行。外部应用经仓库自己的 `@aiao/orbit` 以微前端方式隔离运行，不并进桌面的构建；加载失败、超时与协议失败只影响所在的窗口，桌面和其他窗口照常（资源耗尽或运行卡死不在这条保证内）。第一个集成应用是 Aiao Code（[apps/aiao-vscode](../../../apps/aiao-vscode/README.md) 的线上发布版本 <https://vscode.aiao.io>）。

## 为什么单列一个 Epic

[ADESK-EPIC-002](ADESK-EPIC-002.md) 的判据是「桌面外壳与内置应用」，范围随桌面一起构建、一起发布。集成应用来自另一个来源、另一条发布线，接入契约（托管响应头、握手协议、权限）跨越两个应用，验收也要用真实的线上地址，所以单列。

## 目标

- [x] 应用分为系统入口、内置应用与集成应用三类，登记在同一张表里，启动台、聚焦搜索、Dock 与菜单栏一视同仁（[ADESK-US-201](../stories/application/ADESK-US-201-application-system.md)）。
- [x] 集成应用经 Orbit 在窗口里运行：加载、就绪、最小化、还原、关闭、焦点与失败重试由桌面统一处理，接入契约写清楚（[ADESK-US-202](../stories/application/ADESK-US-202-integrated-app-runtime.md)）。
- [x] Aiao Code 作为第一个集成应用接入，用 vscode.aiao.io 的线上发布版本（[ADESK-US-203](../stories/application/ADESK-US-203-aiao-code.md)）。
- [x] 透明窗口：应用自己画标题栏与红黄绿，经窗口接口调用桌面的关闭、最小化与缩放，拖动区由桌面接管（参考 Tauri，[ADESK-US-204](../stories/application/ADESK-US-204-transparent-window.md)）。
- [ ] 应用清单是唯一真相源，Applications 是系统投影，预装应用受保护，Dock 布局可拖放并持久化（[ADESK-US-205](../stories/application/ADESK-US-205-application-management.md)）。
- [ ] 应用懒加载与统一宿主能力：shell-first 启动，窗口、菜单、通知、剪贴板与文件能力经统一接口授予（[ADESK-US-206](../stories/application/ADESK-US-206-lazy-app-runtime-and-host-capabilities.md)）。

## 故事

> 本清单只列范围，**不带状态**。状态见 [status-overview](../status-overview.md)（真相源是各 story 的 YAML `status`）。

- [ADESK-US-201 应用体系与统一登记表](../stories/application/ADESK-US-201-application-system.md) (High)
- [ADESK-US-202 集成应用的运行宿主](../stories/application/ADESK-US-202-integrated-app-runtime.md) (High)
- [ADESK-US-203 接入 Aiao Code](../stories/application/ADESK-US-203-aiao-code.md) (High)
- [ADESK-US-204 透明窗口与窗口接口](../stories/application/ADESK-US-204-transparent-window.md) (High)
- [ADESK-US-205 Applications 目录、预装应用与 Dock 管理](../stories/application/ADESK-US-205-application-management.md) (High)
- [ADESK-US-206 应用懒加载与统一系统能力](../stories/application/ADESK-US-206-lazy-app-runtime-and-host-capabilities.md) (High)

## 下一阶段

- [ADESK-US-205](../stories/application/ADESK-US-205-application-management.md) 把清单投影到 Applications，补预装应用保护、预装的远程应用包、Dock 固定/运行态/拖放与持久化。
- [ADESK-US-206](../stories/application/ADESK-US-206-lazy-app-runtime-and-host-capabilities.md) 把应用实现拆成按需载荷，并定义窗口、菜单、通知、剪贴板和文件等宿主能力的统一契约。

## 非目标

- 用户自己填网址添加任意应用、商店评分与付费、代码签名：批准边界仍是 [D-10](../decisions.md#d-10应用分三类登记在同一张表里)；运营批准的目录安装、更新与回退还没有立项，见 [future-requirements](../future-requirements.md)。
- 恶意第三方代码的安全隔离、浏览器进程级沙箱和桌面级 root 能力。
