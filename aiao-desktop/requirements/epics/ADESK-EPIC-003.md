---
id: ADESK-EPIC-003
status: In Progress
startDate: 2026-11-13
targetDate: TBD
owner: jimmy
---

# 应用体系与集成应用

## 愿景

Aiao Desktop 除了随桌面构建的内置应用，还能把独立部署的 B/S 应用当作桌面应用来用：所有应用登记在同一张表里，从同样的入口打开、在同样的窗口里运行。外部应用经仓库自己的 `@aiao/orbit` 以微前端方式隔离运行，不并进桌面的构建，也拖不垮桌面。第一个集成应用是 Aiao Code（[apps/aiao-vscode](../../../apps/aiao-vscode/README.md) 的线上发布版本 <https://vscode.aiao.io>）。

## 为什么单列一个 Epic

[ADESK-EPIC-002](ADESK-EPIC-002.md) 的判据是「桌面外壳与内置应用」，范围随桌面一起构建、一起发布。集成应用来自另一个来源、另一条发布线，接入契约（托管响应头、握手协议、权限）跨越两个应用，验收也要用真实的线上地址，所以单列。

## 目标

- [ ] 应用分为系统入口、内置应用与集成应用三类，登记在同一张表里，启动台、聚焦搜索、Dock 与菜单栏一视同仁（[ADESK-US-201](../stories/application/ADESK-US-201-application-system.md)）。
- [ ] 集成应用经 Orbit 在窗口里运行：加载、就绪、最小化、还原、关闭、焦点与失败重试由桌面统一处理，接入契约写清楚（[ADESK-US-202](../stories/application/ADESK-US-202-integrated-app-runtime.md)）。
- [ ] Aiao Code 作为第一个集成应用接入，用 vscode.aiao.io 的线上发布版本（[ADESK-US-203](../stories/application/ADESK-US-203-aiao-code.md)）。

## 故事

> 本清单只列范围，**不带状态**。状态见 [status-overview](../status-overview.md)（真相源是各 story 的 YAML `status`）。

- [ADESK-US-201 应用体系与统一登记表](../stories/application/ADESK-US-201-application-system.md) (High)
- [ADESK-US-202 集成应用的运行宿主](../stories/application/ADESK-US-202-integrated-app-runtime.md) (High)
- [ADESK-US-203 接入 Aiao Code](../stories/application/ADESK-US-203-aiao-code.md) (High)

## 非目标

- 应用目录：运行时安装、卸载、更新与回退，或让用户自己填网址添加应用。登记表随桌面构建发布（[D-10](../decisions.md#d-10应用分三类登记在同一张表里)）。
- 宿主服务：桌面经 Orbit 向应用提供磁盘文件、通知、主题联动、剪贴板与文件选择等能力，见 [future-requirements](../future-requirements.md)。
- 正式部署与同站托管：仍按 [future-requirements](../future-requirements.md) 另行立项。
