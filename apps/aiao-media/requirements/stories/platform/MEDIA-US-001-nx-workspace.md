---
id: MEDIA-US-001
legacyId: aiao-media:US-001
product: aiao-media
title: 多项目开发工作区
status: Done
priority: High
epic: MEDIA-EPIC-001
created: 2026-09-26
updated: 2026-10-01
dependsOn: []
tags: [nx, pnpm, tooling]
---

# 用户故事：多项目开发工作区

## 作为/我想要/以便

**作为** 开发者  
**我想要** 在 RxDB 工作区内独立构建和运行图片应用及其 e2e  
**以便** 直接消费同仓底层能力，并保持产品代码与需求内聚

## 范围边界

### In Scope

- Angular 图片应用和独立 e2e 两个项目。
- 应用内 contracts、local-data、本地服务、需求、部署和工具文件夹。
- 使用工作区依赖与 Nx 的单测、类型检查、lint、构建和浏览器验收入口。

### Out of Scope

- 模型供应商的新接入、音视频产品化和桌面安装包。
- 独立发布私有契约／数据层包。

## 验收标准

| #   | 前置条件           | 操作                                         | 预期结果                                                     | 状态 |
| --- | ------------------ | -------------------------------------------- | ------------------------------------------------------------ | ---- |
| 1   | 工作区依赖已声明   | 执行 pnpm install 并通过 Nx 构建             | @aiao/rxdb 等包消费工作区版本，Nx 先构建底层依赖，无跨仓软链 | ✅   |
| 2   | 开发者在仓库根目录 | 通过 Nx 运行 build / lint / typecheck / test | 对应应用目标可独立执行，私有目录测试全部纳入                 | ✅   |
| 3   | 开发者检查启动配置 | 核对应用与 e2e 的 Nx 配置                    | 应用使用 4300 端口，e2e 独立，Supabase 与部署目标归属应用    | ✅   |

## 技术笔记

应用消费本仓工作区包，私有契约与数据层不创建独立项目。应用故事状态不计入平台 requirements 的统计。

## 实现文件

- [应用依赖](../../../package.json)
- [工作区配置](../../../../../nx.json)
- [应用目标](../../../project.json)
- [e2e 目标](../../../../aiao-media-e2e/project.json)

## References

- [项目需求约定](../../CONVENTIONS.md)
