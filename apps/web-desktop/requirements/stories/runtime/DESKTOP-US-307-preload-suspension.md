---
id: DESKTOP-US-307
title: 预加载与后台资源管理
status: In Progress
priority: Medium
epic: DESKTOP-EPIC-004
milestone: M2
created: 2026-11-07
updated: 2026-11-07
tags: [runtime, web-desktop]
dependsOn: ['DESKTOP-US-303', 'DESKTOP-US-305', 'DESKTOP-US-401', 'DESKTOP-US-502']
capabilities: []
---

# 用户故事：预加载与后台资源管理

## 作为/我想要/以便

**作为**同时打开多个工具的用户，**我想要**让常用应用更快打开且后台资源可控，**以便**获得流畅体验而不牺牲未保存内容。

## 范围边界

### In Scope

- 空闲资源预取、有限并发和版本缓存；可观察后台策略。
- 显式支持的应用挂起与恢复，未保存状态保护。

### Out of Scope

- 默认预执行所有应用、任意冻结第三方 JS、自动销毁脏状态实例。

## 前置与依赖

- [DESKTOP-US-303 实例生命周期与资源回收](DESKTOP-US-303-lifecycle-cleanup.md)
- [DESKTOP-US-305 应用资源加载与独立路由](DESKTOP-US-305-resources-routing.md)
- [DESKTOP-US-401 桌面能力授权与撤销](../integration/DESKTOP-US-401-capability-permissions.md)
- [DESKTOP-US-502 离线启动与资源完整性](../workspace/DESKTOP-US-502-offline-cache.md)

## 验收标准

| #   | 前置条件                         | 操作             | 预期结果                                                                 | 状态 |
| --- | -------------------------------- | ---------------- | ------------------------------------------------------------------------ | ---- |
| 1   | 应用尚未授权且被列为常用         | 桌面空闲预取     | 只下载允许的静态资源，不执行应用脚本、不触发授权、登录、通知或业务请求   | ⚠️   |
| 2   | 用户启动一个未缓存应用           | 后台已有预取任务 | 前台加载优先；同版本资源请求去重，后台预取并发不超过 2                   | ⚠️   |
| 3   | 应用仅被最小化                   | 观察其行为       | 发送 hidden 事件而不宣称暂停；用户可从运行信息中区分隐藏和挂起           | ⚠️   |
| 4   | 应用声明可挂起且确认状态已保存   | 挂起后恢复       | 按协议停止其可暂停工作并保留恢复数据，恢复后路由和保存内容一致           | ⚠️   |
| 5   | 应用有未保存内容或未实现挂起协议 | 触发后台资源回收 | 不自动销毁或伪造挂起，提示哪些应用需要用户处理                           | ⚠️   |
| 6   | 用户取消预加载或应用被更新卸载   | 观察缓存与任务   | 取消相关任务，按版本清理无用资源，正在运行实例引用的版本资源不被提前删除 | ⚠️   |

状态符号：⬜ 未验证 / ⚠️ 进行中或有保留 / ✅ 有同层级证据。

验收证据：已实现静态空闲预取、前台优先队列、独立取消、版本引用清理，以及应用明确声明的协作挂起与恢复。逐 AC 自动化证据见 [分层验收台账](../../verification-report.md) 和 [逐 AC 登记](../../acceptance-evidence.md)。单元与 Worker 消息测试覆盖并发上限、去重、抢占、取消隔离和清理串行；6 条 Chromium 正式产物旅程覆盖预取无副作用、脏状态保护、同 iframe 恢复、活引用保留及取消预取后的冷更新 / 回退；完整回归 33 条通过，单元 / 集成 162 条通过。构建版本 `788100c8de7e4e94`。完整支持环境和发布组合尚未验收，AC 保持 ⚠️。

## 技术笔记

静态预取在交互空闲 500ms 后开始，Service Worker 统一限制并发为 2；同资源指纹共享下载，前台可抢占纯后台任务。取消每个请求单独计数，不终止仍有前台等待者的共享下载。资源清理保留安装、回退、运行实例、临时持有、队列以及活 iframe 的引用，只回收当前部署的无引用 CacheStorage 版本，不清理用户文件。

挂起要求清单声明 `suspension:1`，先检查未保存状态，再由应用确认 `{saved:true}`；恢复由应用明确确认。AppSession 暂停业务请求和已登记的状态事件，恢复后补发最新状态；保留原 iframe、组件内存、目录与搜索路由。最小化只发送 hidden，状态面板分别显示已隐藏和已挂起。挂起内存状态不写入会话 schema，刷新后按已保存会话重新启动。

## 实现文件

- `src/core/resource-scheduler.ts`、`resource-references.ts`、`release-cache.ts` 及对应单元 / Chromium 集成测试。
- `src/host/prefetch.ts`、`suspension.ts`、`application-resources.ts`、`runtime.ts`、`shell.tsx` 及对应测试。
- `src/apps/session.ts` 和内置应用视图，`tools/service-worker.js`、`offline-build.mjs`。
- `e2e/background.spec.ts`，以及已有 `desktop.spec.ts`、`updates.spec.ts`、`offline-upgrade.spec.ts` 回归。

## References

- [产品规格](../../../../../specs/001-web-desktop-product/spec.md)
- [交互行为矩阵](../../interaction-matrix.md)
- [产品决策与信任边界](../../decisions.md)
- [调研依据与源码入口](../../research.md)
