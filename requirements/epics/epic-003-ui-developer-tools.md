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

- ✅ [US-402 代码编辑器组件](../stories/ui/US-402-code-editor.md) (Medium)
- ✅ [US-902 DevTools 面板](../stories/future/US-902-devtools-panel.md) (Low)
- 📄 [US-904 DevTools 原生本地存储调试共享契约](../stories/future/US-904-devtools-native-storage-contract.md) (Medium) — 父故事/共享契约，不直接交付
  - ⬜ [US-904a Electron 43 MV3 DevTools 可行性门禁](../stories/future/US-904a-electron-mv3-devtools-feasibility.md) (High)
  - ⬜ [US-904b DevTools v2 协议（控制面 + provider 数据面）](../stories/future/US-904b-devtools-v2-protocol.md) (High)
  - ⬜ [US-904c DevTools 共享面板与 Chrome v2 迁移](../stories/future/US-904c-devtools-shared-panel-chrome-migration.md) (High) — 阶段 1 可与 904b 并行
  - ⬜ [US-904d Electron 原生存储 DevTools 集成](../stories/future/US-904d-electron-native-devtools-integration.md) (Medium) — 仅 904a supported 时开工
  - ⬜ [US-905 Tauri DevTools 调试窗口与原生存储集成](../stories/future/US-905-tauri-native-devtools.md) (Medium) — 不等待 Electron 904d
