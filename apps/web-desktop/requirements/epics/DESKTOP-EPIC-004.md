---
id: DESKTOP-EPIC-004
status: Backlog
startDate: TBD
targetDate: TBD
owner: jimmy
---

# 仓内隔离运行内核

## 愿景

以仓内重构的无界内核承载桌面应用，具备可测的隔离和回收契约。

## 目标

- [ ] 能直接修复桌面问题并独立控制构建与发布（[DESKTOP-US-301](../stories/runtime/DESKTOP-US-301-in-repository-runtime.md)）。
- [ ] 避免某个应用破坏整个桌面的显示与操作（[DESKTOP-US-302](../stories/runtime/DESKTOP-US-302-application-isolation.md)）。
- [ ] 避免重复启动、幽灵实例与内存持续增长（[DESKTOP-US-303](../stories/runtime/DESKTOP-US-303-lifecycle-cleanup.md)）。
- [ ] 既避免串页也能继续访问应用保存的数据（[DESKTOP-US-304](../stories/runtime/DESKTOP-US-304-instance-storage-scope.md)）。
- [ ] 保留独立部署能力并避免刷新白屏（[DESKTOP-US-305](../stories/runtime/DESKTOP-US-305-resources-routing.md)）。
- [ ] 继续使用其他应用并尽量找回已保存工作（[DESKTOP-US-306](../stories/runtime/DESKTOP-US-306-failure-recovery.md)）。
- [ ] 获得流畅体验而不牺牲未保存内容（[DESKTOP-US-307](../stories/runtime/DESKTOP-US-307-preload-suspension.md)）。
- [ ] 不因所选框架失去生命周期、路由或窗口能力（[DESKTOP-US-308](../stories/runtime/DESKTOP-US-308-framework-parity.md)）。

## 故事

本清单只列范围。状态以故事 YAML 为准，派生汇总见 [状态总览](../status-overview.md)。

- [DESKTOP-US-301 无界源码内化与独立运行内核](../stories/runtime/DESKTOP-US-301-in-repository-runtime.md)（High，M0）
- [DESKTOP-US-302 应用运行环境与样式隔离](../stories/runtime/DESKTOP-US-302-application-isolation.md)（High，M0）
- [DESKTOP-US-303 实例生命周期与资源回收](../stories/runtime/DESKTOP-US-303-lifecycle-cleanup.md)（High，M0）
- [DESKTOP-US-304 多实例身份与数据作用域](../stories/runtime/DESKTOP-US-304-instance-storage-scope.md)（High，M0）
- [DESKTOP-US-305 应用资源加载与独立路由](../stories/runtime/DESKTOP-US-305-resources-routing.md)（High，M0）
- [DESKTOP-US-306 应用故障呈现与恢复](../stories/runtime/DESKTOP-US-306-failure-recovery.md)（High，M0）
- [DESKTOP-US-307 预加载与后台资源管理](../stories/runtime/DESKTOP-US-307-preload-suspension.md)（Medium，M2）
- [DESKTOP-US-308 三框架接入与既有无界消费迁移](../stories/runtime/DESKTOP-US-308-framework-parity.md)（High，M0）

## 非目标

- 本 Epic 不扩展产品规格中排除的原生程序、任意不可信网页、账号云同步与多人协作。
- 不通过提前标记 Done 或降低验收环境来关闭未验证能力。
