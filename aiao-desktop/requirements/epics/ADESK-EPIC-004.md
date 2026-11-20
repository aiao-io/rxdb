---
id: ADESK-EPIC-004
status: Done
startDate: 2026-11-20
targetDate: 2026-11-21
owner: jimmy
---

# GitHub 开发工作台

## 愿景

Aiao Desktop 提供一个可直接打开的 GitHub 应用。用户在浏览器里看到熟悉的 GitHub Desktop 工作区，代码仓库和 `.git` 元数据持久化在 OPFS，通过 GitHub 登录和 API 完成本地工作区与远端仓库之间的受控交接。

## 为什么单列一个 Epic

[ADESK-EPIC-003](ADESK-EPIC-003.md) 解决应用登记、窗口运行时和远程集成应用宿主。GitHub 应用还需要独立的本地 Git 存储、工作区状态、提交图、OPFS 故障恢复和 GitHub 远端认证，这些行为不属于应用宿主本身。

## 目标

- [x] 在 Aiao Desktop 中提供 GitHub 应用入口和 GitHub Desktop 形态的工作区（[ADESK-US-209](../stories/application/ADESK-US-209-github-opfs-workbench.md)）。
- [x] 把工作区文件、`.git`、refs、index 和对象存入独立 OPFS 根，并支持刷新与重开后继续工作（[ADESK-US-209](../stories/application/ADESK-US-209-github-opfs-workbench.md)）。
- [x] 通过 GitHub 登录与 GitHub API 打开、拉取和推送仓库，并对认证失败、网络失败和远端冲突给出可恢复反馈（[ADESK-US-209](../stories/application/ADESK-US-209-github-opfs-workbench.md)）。

## 故事

> 本清单只列范围，不带状态。状态见 `status-overview.md`，真相源是各 story 的 YAML `status`。

- [ADESK-US-209 GitHub 应用与 OPFS Git 工作区](../stories/application/ADESK-US-209-github-opfs-workbench.md) (High)

## 非目标

- GitHub Issues、Pull Requests、Projects、Actions、Releases、组织管理和通知中心。
- 其他 Git 服务、任意远端 URL、Git Smart HTTP 直连和公共代理传递私库凭据。
- 把 Git 仓库挂到 Finder 虚拟磁盘，或在 Git 工作区与桌面虚拟磁盘之间自动同步。
- 终端、`pnpm install`、原生模块、任意构建命令和不受控代码执行。
- 跨设备同步、跨浏览器恢复和把 OPFS 副本当成远程备份。
