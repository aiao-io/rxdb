---
id: DESKTOP-US-308
title: 三框架接入与既有无界消费迁移
status: In Progress
priority: High
epic: DESKTOP-EPIC-004
milestone: M0
created: 2026-11-07
updated: 2026-11-07
tags: [runtime, web-desktop]
dependsOn: ['DESKTOP-US-303', 'DESKTOP-US-304', 'DESKTOP-US-305']
capabilities: []
---

# 用户故事：三框架接入与既有无界消费迁移

## 作为/我想要/以便

**作为**Angular / React / Vue 应用开发者，**我想要**使用等价的桌面适配协议，**以便**不因所选框架失去生命周期、路由或窗口能力。

## 范围边界

### In Scope

- 三框架生命周期和桌面能力适配、独立运行能力。
- 既有文档站主题、路由和样式协议回归。

### Out of Scope

- 实现三套不同桌面业务外壳、维持上游所有历史封装接口。

## 前置与依赖

- [DESKTOP-US-303 实例生命周期与资源回收](DESKTOP-US-303-lifecycle-cleanup.md)
- [DESKTOP-US-304 多实例身份与数据作用域](DESKTOP-US-304-instance-storage-scope.md)
- [DESKTOP-US-305 应用资源加载与独立路由](DESKTOP-US-305-resources-routing.md)

## 验收标准

| #   | 前置条件                                   | 操作                         | 预期结果                                                                  | 状态 |
| --- | ------------------------------------------ | ---------------------------- | ------------------------------------------------------------------------- | ---- |
| 1   | Angular、React、Vue 各有一个同任务样例     | 按统一契约接入               | 三端具有等价的就绪、隐藏、恢复、退出、窗口命令和错误行为                  | ⬜   |
| 2   | 三端分别使用路由、弹窗、动态样式和中文输入 | 并排运行同一测试旅程         | 行为一致，焦点、事件与样式不串实例，功能差异不得用单端完成代替            | ⬜   |
| 3   | 三端调用公开能力入口                       | 比较名称、参数、结果与错误   | 桌面协议一致；框架生命周期绑定方式的差异可记录，但不改变能力范围          | ⬜   |
| 4   | 任一样例在普通浏览器地址独立运行           | 执行应用自身任务             | 可正常运行；桌面专属能力明确显示不可用，不伪造成功                        | ⬜   |
| 5   | 现有文档站改接仓内内核                     | 打开三框架演示并切换路由主题 | 保持原入口行为，覆盖 modules/wujie 的路由和主题协议及 Shadow DOM 样式处理 | ⬜   |
| 6   | 正式构建三个适配器与桌面                   | 检查产物与依赖               | 不重新引入上游运行时；迁移后对原消费方提供明确的兼容入口与迁移说明        | ⬜   |

状态符号：⬜ 未验证 / ⚠️ 进行中或有保留 / ✅ 有同层级证据。

验收证据：仓内运行内核已开始实现，代码与真实 Chromium 测试的范围见 [实施记录](../../../../../specs/001-web-desktop-product/runtime-implementation.md) 和 [分层验收台账](../../verification-report.md)。下表 AC 仍未完成完整产品验证，不因底层测试通过而自动关闭。

## 技术笔记

三个适配入口位于 @aiao/web-desktop-runtime/{angular,react,vue}，共用 WujieBinding；不为生命周期函数再拆三份工程。产品外壳尚未实现。

## 实现文件

- [仓内运行内核与使用说明](../../../../../packages/web-desktop-runtime/README.md)
- [实现范围与未关闭事项](../../../../../specs/001-web-desktop-product/runtime-implementation.md)

## References

- [产品规格](../../../../../specs/001-web-desktop-product/spec.md)
- [交互行为矩阵](../../interaction-matrix.md)
- [产品决策与信任边界](../../decisions.md)
- [调研依据与源码入口](../../research.md)
