---
id: US-904b3
title: DevTools 共享面板 library 抽取
status: Backlog
priority: High
epic: epic-003-ui-developer-tools
created: 2026-08-15
updated: 2026-08-15
tags: [tooling, devtools, angular, library, release]
---

<!--
INVEST 检查清单:
- [x] Independent: 行为中性抽取，只依赖现有 v1 面板，可与 US-904b1/b2 并行
- [x] Negotiable: Angular service/component 拆分可调整，私有发布边界与 transport token 不可省略
- [x] Valuable: 三种 surface 共用一套面板实现，且不增加公开 npm 包
- [x] Estimable: library 创建、组件迁入、token 抽象与发布隔离已分项
- [x] Small: 不改协议、不改用户可见行为、不接任何 provider
- [x] Testable: 项目结构、import graph、release dry-run 与既有浏览器回归均可自动验收
-->

# 用户故事：DevTools 共享面板 library 抽取

> 共享契约见 [US-904b](./US-904b-devtools-shared-protocol-panel.md)。本故事只做**行为中性**的
> 结构抽取：把现有面板搬进私有 Angular library，并把 Chrome 依赖收敛到一个 transport token 之后。
> v2 协议切换由 [US-904b4](./US-904b4-devtools-chrome-v2-migration.md) 承担。

## 作为/我想要/以便

**作为** Chrome、Electron、Tauri DevTools surface 的维护者
**我想要** 从正式 workspace dependency 消费同一 Angular 面板和平台无关 transport token
**以便** 后续的 v2 迁移和桌面接入只写 transport adapter，而不是各自复制一套 UI

## 启动门禁

- 无协议前置：本故事在**现有 v1 wire 上**完成抽取，不等待 US-904b1/b2，可与其并行。
- [US-902](./US-902-devtools-panel.md) 的既有面板与浏览器行为是本故事的回归基准。

## 范围边界

### In Scope

- 用 generator 创建 `packages/rxdb-devtools-panel/` 私有 Angular library
- 迁入面板组件、状态服务与视图模型；迁移前后用户可见行为、路由和文案保持一致
- 定义平台无关 transport token（消息收发 + 连接生命周期），Chrome runtime/PortService 只作为
  该 token 的一个 adapter 在 `apps/rxdb-devtools-extension/` 侧注入
- 共享 UI 不读取 `chrome.*`、PortService、`ipcRenderer`、Tauri global 或桌面 host global
- 私有 library 的 workspace、Nx release、包数量和 API baseline 隔离
- 抽取后重跑既有浏览器回归（Database、Events、branch、Storage metadata、OPFS、Settings 清理）

### Out of Scope

- 任何协议改动：v2 消息、ACK 所有权转移、provider descriptor、transfer、snapshot（US-904b1/b2/b4）
- 禁用不安全数据库下载、`none` 零泄漏收敛等**行为变更**（US-904b4）
- Electron extension 加载、Tauri window/transport 或任何 native provider
- 发布新的公共 Angular/npm 包

## 私有 library 边界

- `packages/rxdb-devtools-panel/package.json` 必须 `private: true`，不得声明 `npm:public` tag 或 publish target
- `nx.json.release.projects` 必须显式排除该 project；fixed release version/publish dry-run 不得修改或发布它
- Chrome/Electron/Tauri 通过 package manager workspace dependency 消费，不使用 tsconfig path 绕过依赖
- API baseline 与公开包统计继续只包含现有公开 npm 包；本故事不改变 `status-overview.md` 的“28 个公开包”
- library 构建不得把 Chrome types/runtime 变成传递依赖；surface adapter 在各 app 侧提供 transport

## transport token 契约

- token 只暴露平台无关的收发与连接生命周期；不出现 tab id、Port、window label、`invoke` 或 IPC 概念
- token 的消息形状在本故事保持**当前 v1 wire**；US-904b4 只替换实现，不需要为 v2 重新设计 token
- 至少存在两个实现：Chrome adapter 与用于单测的内存 fake，证明 token 确实是唯一接缝

## 验收标准

| #   | 前置条件                           | 操作                                                              | 预期结果                                                                                                 | 状态 |
| --- | ---------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---- |
| 1   | generator 创建私有 panel library   | 检查 project、manifest、graph 与 release dry-run                  | 正式 workspace dependency 生效；private project 不在 public tag、API baseline、版本改写或 publish 列表中 | ⬜   |
| 2   | Chrome surface 构建                | 扫描共享 library import graph                                     | UI/状态服务只依赖 transport token；不引用 chrome runtime、PortService 或任何桌面 global                  | ⬜   |
| 3   | 抽取完成                           | 只用内存 fake transport 在单测中启动面板并渲染各页                | 面板可在无任何 `chrome.*` 的环境下装配；token 是唯一接缝                                                 | ⬜   |
| 4   | 抽取前的浏览器回归基线已记录       | 抽取后重跑 Database、Events、branch、Storage、OPFS、Settings 清理 | 用户可见行为、wire 消息与错误展示与基线一致；本故事不引入任何协议或行为差异                              | ⬜   |
| 5   | 公开包统计与 API baseline 已有基线 | 运行 API surface 审计与包数量统计                                 | 公开包数量与 baseline 条目不变；`packages/rxdb-devtools-panel/` 不产生任何公开子路径入口                 | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术约束

- 抽取必须行为中性：本故事的 diff 不得包含 wire 消息类型、错误码或权限判定的变化。
- 组件不得通过 `inject()` 直接取 Chrome service，只能取 transport token；adapter 在 app 的 provider 中绑定。
- library 不得依赖 `apps/` 下的任何代码，方向只能是 app → library。

## 实现文件

- `packages/rxdb-devtools-panel/` — 私有 Angular library、共享面板、状态服务和 transport token
- `apps/rxdb-devtools-extension/src/` — Chrome transport adapter 绑定与 provider 接线
- `nx.json` — 私有 project 的 fixed release exclusion
- `requirements/api-baseline/` — 断言该 private project 不进入公开 API 清单

## References

- [US-904b 共享 v2 协议与面板契约](./US-904b-devtools-shared-protocol-panel.md)
- [US-904b4 DevTools Chrome v2 迁移](./US-904b4-devtools-chrome-v2-migration.md)
- [US-902 DevTools 面板](./US-902-devtools-panel.md)
- [版本与 API 稳定性策略](../../versioning-policy.md)
