---
id: epic-003-ui-developer-tools
status: Backlog
startDate: 2025-07-01
targetDate: 2026-12-01
owner: jimmy
---

# UI 组件与开发者工具

## 愿景

提供代码编辑器组件和开发者工具，降低使用门槛，提升开发体验

## 目标

- [x] 代码编辑器组件（跨 3 端）
- [x] 浏览器 DevTools 面板（连接器 + Chrome 扩展）
- [ ] Electron 原生本地存储 DevTools 调试
- [ ] Tauri 原生本地存储 DevTools 调试

## 故事

> 本清单只列范围，**不带状态**。状态见 [status-overview](../status-overview.md)（真相源是各 story 的 YAML `status`）。

- [US-402 代码编辑器组件](../stories/ui/US-402-code-editor.md) (Medium)
- [US-902 DevTools 面板](../stories/future/US-902-devtools-panel.md) (Low)
- [US-904 DevTools 原生本地存储调试](../stories/future/US-904-devtools-native-storage-contract.md) (Medium) — 单文件四阶段：
  - 阶段 A Electron 43 MV3 DevTools 可行性门禁
  - 阶段 B DevTools v2 协议（控制面 + provider 数据面）
  - 阶段 C DevTools 共享面板与 Chrome v2 迁移 — C1 可与阶段 B 并行
  - 阶段 D Electron 原生存储 DevTools 集成 — 仅阶段 A supported 时开工
- [US-905 Tauri DevTools 调试窗口与原生存储集成](../stories/future/US-905-tauri-native-devtools.md) (Medium) — 不等待 US-904 阶段 D
