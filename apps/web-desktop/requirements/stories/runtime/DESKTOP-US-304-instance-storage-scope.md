---
id: DESKTOP-US-304
title: 多实例身份与数据作用域
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

# 用户故事：多实例身份与数据作用域

## 作为/我想要/以便

**作为**同时编辑不同文档的用户，**我想要**让窗口内容独立而已保存文件可以共享，**以便**既避免串页也能继续访问应用保存的数据。

## 范围边界

### In Scope

- appId、version、instanceId、windowId 与 workspaceId 分离。
- 运行态按实例隔离，桌面托管私有数据按应用命名空间。

### Out of Scope

- 隔离浏览器原生 Cookie、自动改写所有第三方 IndexedDB 与 localStorage 调用。

## 前置与依赖

- [DESKTOP-US-302 应用运行环境与样式隔离](DESKTOP-US-302-application-isolation.md)

## 验收标准

| #   | 前置条件                               | 操作                           | 预期结果                                                                 | 状态 |
| --- | -------------------------------------- | ------------------------------ | ------------------------------------------------------------------------ | ---- |
| 1   | 同一应用在两个窗口打开不同文档         | 分别编辑和导航                 | 内存状态、路由、窗口命令各自隔离，不覆盖对方内容                         | ⬜   |
| 2   | 同一应用一个实例保存私有设置           | 另一个实例通过桌面存储服务读取 | 按 appId 和数据模式版本共享持久设置；更新通知注明来源实例                | ⬜   |
| 3   | 两个应用使用相同私有数据键             | 分别通过桌面服务读写           | 键按应用作用域分开，应用 A 不能通过服务枚举或访问应用 B 的私有区         | ⬜   |
| 4   | 实例销毁后重新启动                     | 比较标识与已保存内容           | instanceId 和 windowId 重新生成，appId 保持；兼容的已保存数据仍可读取    | ⬜   |
| 5   | 应用直接使用未命名空间的浏览器原生存储 | 执行接入检查                   | 报告其无法满足桌面托管隔离契约并阻止准入，不宣称运行内核自动提供存储安全 | ⬜   |
| 6   | 应用版本升级且数据模式不兼容           | 尝试打开旧私有数据             | 执行应用声明的迁移或明确阻止启动，不清空数据掩盖错误                     | ⬜   |

状态符号：⬜ 未验证 / ⚠️ 进行中或有保留 / ✅ 有同层级证据。

验收证据：仓内运行内核已开始实现，代码与真实 Chromium 测试的范围见 [实施记录](../../../../../specs/001-web-desktop-product/runtime-implementation.md) 和 [分层验收台账](../../verification-report.md)。下表 AC 仍未完成完整产品验证，不因底层测试通过而自动关闭。

## 技术笔记

同应用多实例共享持久区可能发生并发写入；文本文件使用版本号冲突检测，见 DESKTOP-US-602。

## 实现文件

- [仓内运行内核与使用说明](../../../../../packages/web-desktop-runtime/README.md)
- [实现范围与未关闭事项](../../../../../specs/001-web-desktop-product/runtime-implementation.md)

## References

- [产品规格](../../../../../specs/001-web-desktop-product/spec.md)
- [交互行为矩阵](../../interaction-matrix.md)
- [产品决策与信任边界](../../decisions.md)
- [调研依据与源码入口](../../research.md)
