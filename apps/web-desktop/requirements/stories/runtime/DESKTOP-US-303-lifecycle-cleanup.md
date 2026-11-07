---
id: DESKTOP-US-303
title: 实例生命周期与资源回收
status: In Progress
priority: High
epic: DESKTOP-EPIC-004
milestone: M0
created: 2026-11-07
updated: 2026-11-07
tags: [runtime, web-desktop]
dependsOn: ['DESKTOP-US-302']
capabilities: []
---

# 用户故事：实例生命周期与资源回收

## 作为/我想要/以便

**作为**平台维护者，**我想要**明确管理实例创建、就绪、隐藏、恢复和销毁，**以便**避免重复启动、幽灵实例与内存持续增长。

## 范围边界

### In Scope

- 显式生命周期、取消加载、幂等销毁与并发启动关闭。
- 已登记的监听器、计时器、通信、观察器和动态资源回收。

### Out of Scope

- 未经应用配合任意暂停 JavaScript、操作系统进程调度。

## 前置与依赖

- [DESKTOP-US-302 应用运行环境与样式隔离](DESKTOP-US-302-application-isolation.md)

## 验收标准

| #   | 前置条件                                 | 操作                             | 预期结果                                                                 | 状态 |
| --- | ---------------------------------------- | -------------------------------- | ------------------------------------------------------------------------ | ---- |
| 1   | 实例从未启动                             | 依次启动、就绪、隐藏、恢复和退出 | 状态转换可观察，ready 只触发一次，隐藏与销毁有不同事件                   | ⬜   |
| 2   | 应用资源仍在加载                         | 关闭窗口并在请求完成后观察       | 请求可取消部分被取消，迟到回调被忽略，不创建残留 DOM 或重新显示窗口      | ⬜   |
| 3   | 同一实例同时收到两次销毁和一次恢复请求   | 执行请求                         | 销毁幂等且最终无存活实例；销毁完成后恢复必须创建新身份                   | ⬜   |
| 4   | 实例登记过计时器、事件、观察器和通信订阅 | 销毁并触发外部事件               | 这些副作用清零，实例不再响应；应用自建资源也必须经约定卸载钩子释放       | ⬜   |
| 5   | 应用卸载钩子抛错                         | 退出实例                         | 记录清理错误并继续清理其余已登记资源，桌面准确呈现失败信息               | ⬜   |
| 6   | 连续执行 30 轮启动、隐藏、恢复与销毁     | 检查实例表与资源计数             | 存活实例、订阅及动态节点计数回到基线，堆快照无持续保留已销毁实例的引用链 | ⬜   |

状态符号：⬜ 未验证 / ⚠️ 进行中或有保留 / ✅ 有同层级证据。

验收证据：仓内运行内核已开始实现，代码与真实 Chromium 测试的范围见 [实施记录](../../../../../specs/001-web-desktop-product/runtime-implementation.md) 和 [分层验收台账](../../verification-report.md)。下表 AC 仍未完成完整产品验证，不因底层测试通过而自动关闭。

## 技术笔记

状态至少区分 loading、ready、hidden、suspended、closing、destroyed、failed。hidden 继续运行；suspended 需要应用显式支持，见 DESKTOP-US-307。

## 实现文件

- [仓内运行内核与使用说明](../../../../../packages/web-desktop-runtime/README.md)
- [实现范围与未关闭事项](../../../../../specs/001-web-desktop-product/runtime-implementation.md)

## References

- [产品规格](../../../../../specs/001-web-desktop-product/spec.md)
- [交互行为矩阵](../../interaction-matrix.md)
- [产品决策与信任边界](../../decisions.md)
- [调研依据与源码入口](../../research.md)
