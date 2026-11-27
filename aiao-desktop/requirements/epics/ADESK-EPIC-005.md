---
id: ADESK-EPIC-005
status: Backlog
startDate: TBD
targetDate: TBD
owner: jimmy
---

# 原生桌面版与本地运行时

## 愿景

让用户像使用普通桌面软件一样安装、启动和升级 Aiao Desktop。安装版使用 Tauri 承载现有桌面体验，在受支持的 macOS 与 Windows 设备上提供独立窗口、稳定的本地数据目录和可恢复的版本生命周期。

## 为什么单列一个 Epic

浏览器版和 Tauri 安装版的启动入口、数据位置、操作系统权限、安装包交付和真实设备验收边界不同。PWA 安装不能替代原生安装版，也不能把浏览器 Origin 下的数据默认为安装版数据。单独管理这些差异，才能保证用户知道当前使用的版本、数据位置和迁移方式。

## 目标

- [ ] 用户可以在受支持的 macOS 与 Windows 设备上安装并独立启动 Aiao Desktop（[ADESK-US-010](../stories/platform/ADESK-US-010-tauri-install-and-launch.md)）
- [ ] 用户可以把已有浏览器工作区显式迁移到安装版，并在安装版中继续处理本地文件和应用数据（[ADESK-US-011](../stories/platform/ADESK-US-011-tauri-local-workspace-migration.md)）
- [ ] 用户升级或卸载安装版时不会因版本失败或默认操作丢失本地数据（[ADESK-US-012](../stories/platform/ADESK-US-012-tauri-update-and-uninstall.md)）

## 故事

> 本清单只列范围，不带状态。状态见 [status-overview.md](../status-overview.md)。

- [ADESK-US-010 Tauri 安装版与首次启动](../stories/platform/ADESK-US-010-tauri-install-and-launch.md) (High)
- [ADESK-US-011 Tauri 本地工作区与显式迁移](../stories/platform/ADESK-US-011-tauri-local-workspace-migration.md) (High)
- [ADESK-US-012 Tauri 升级、卸载与故障恢复](../stories/platform/ADESK-US-012-tauri-update-and-uninstall.md) (Medium)

## 非目标

- Linux、移动端和 Electron 版本。它们需要独立的平台矩阵与真实设备验收。
- 浏览器版、PWA 与 Tauri 之间的账号、云同步或实时数据合并。
- 用户输入任意网址安装 Web 应用、公开应用市场和未经批准的第三方代码执行。
- 首版完整复刻操作系统能力，例如系统级全局快捷键、托盘常驻、文件关联、自动启动和所有原生通知行为。
- 后台自动更新通道、企业设备管理和跨不兼容 schema 的任意降级。
