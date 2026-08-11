---
id: US-002
title: 客户端代码生成
status: Done
priority: High
epic: epic-001-core-mvp
created: 2025-12-08
updated: 2026-02-08
tags: [core, codegen, ts-morph]
---

# 用户故事：客户端代码生成

## 作为/我想要/以便

**作为** 开发者
**我想要** 从实体定义自动生成类型安全的 Repository 代码
**以便** 减少样板代码，获得完整的类型提示和 IDE 自动补全

## 验收标准

| #   | 前置条件                    | 操作                             | 预期结果                       | 状态 |
| --- | --------------------------- | -------------------------------- | ------------------------------ | ---- |
| 1   | 定义了 `@Entity()` 实体类   | 运行 client-generator            | 生成对应的 Repository 类       | ✅   |
| 2   | 实体有关系定义              | 生成代码                         | 关系查询方法包含正确的类型参数 | ✅   |
| 3   | 使用 CLI 模式               | 执行 `npx rxdb-client-generator` | 扫描指定目录并输出代码         | ✅   |
| 4   | 使用 Vite 插件模式          | 文件变更                         | 自动重新生成客户端代码         | ✅   |
| 5   | 使用 API 模式               | 调用 `generate()` 函数           | 以编程方式生成代码             | ✅   |
| 6   | `IRepositoryGenerator` 接口 | 自定义生成器                     | 可扩展生成逻辑                 | ✅   |

## 技术笔记

- 引擎：`ts-morph` AST 操作（浏览器 shim 支持）
- 3 种入口：CLI (`cli.ts`) / Vite 插件 (`vite.ts`) / API (`index.ts`)
- 可扩展：`IRepositoryGenerator` 接口支持自定义生成器
- 输出：类型安全的 Repository 客户端（TypeScript）

## 实现文件

- `packages/rxdb-client-generator/` — 代码生成器完整实现

## 参考

- [文档: 客户端生成](../../../website/docs/client-generator.md)
