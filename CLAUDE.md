# 角色与规范

遵循 [AGENTS.md](./AGENTS.md) 中的角色定义、代码哲学与铁律。

## 项目概述

**aiao** — Local-first RxDB monorepo（开源版），核心 RxDB 引擎、三框架绑定（Angular 22 / React 19 / Vue 3.5）、多存储适配器与开发者工具。

核心能力：装饰器驱动实体 → 类型安全 Repository → RxDB 响应式查询 → 多存储后端（wa-sqlite / PGlite / Supabase / sqliteai）。

## 技术栈

| 层        | 技术                                                   |
| --------- | ------------------------------------------------------ |
| 语言      | TypeScript 6.0+ strict, ESM                            |
| 构建      | Nx 23 + pnpm 10                                        |
| 框架      | Angular 22+ / React 19+ / Vue 3.5+                     |
| 状态/响应 | RxJS 7.8+                                              |
| 存储      | wa-sqlite / sqlite-wasm / PGlite / Supabase / sqliteai |
| 测试      | Vitest (unit/integration) + Playwright (e2e/a11y)      |
| 运行时    | 浏览器 (OPFS/IDB) + Node 26+ + Electron + Tauri        |

## 项目结构

```
apps/          # 演示应用（dev-rxdb-angular + electron/tauri/supabase）
packages/      # 可发布库（rxdb-* / rxdb-adapter-* / code-editor-*）
modules/       # 内部共享模块（angular / angular-todo）
requirements/  # Epics / Stories / status-overview.md
scripts/       # 构建 / 审计脚本（scripts/audit/）
docker/        # 容器配置
```

## 常用命令

```bash
# 开发
pnpm nx serve dev-rxdb-angular          # Angular demo

# TDD（边改边跑）
pnpm nx test <project> --watch

# 核心包 lint / test / build
pnpm nx run-many -t lint test build --projects=tag:js-lib

# 全量验证（CI 门禁）
pnpm test-all

# 依赖图
pnpm nx graph

# 覆盖率报告
pnpm nx test <project> --coverage
```

## Speckit Skills

| 命令                 | 用途                     |
| -------------------- | ------------------------ |
| `/speckit-specify`   | 从自然语言创建/更新 spec |
| `/speckit-plan`      | 生成实现计划（plan.md）  |
| `/speckit-tasks`     | 生成任务清单（tasks.md） |
| `/speckit-implement` | 按 tasks.md 执行实现     |
| `/speckit-analyze`   | 跨 artifact 一致性分析   |
| `/speckit-clarify`   | 澄清 spec 中的模糊点     |

## 关键约束（不可违反）

- TS strict / 零 ESLint 警告 / 嵌套 ≤ 3 层 / 无 fallback 兜底
- 三框架 API 必须对称（Angular/React/Vue 同功能同 API），单端缺失 = 未完成
- TDD：先写红测试，再写实现
- 新包/新导出必须补齐 TSDoc

<!-- SPECKIT START -->

For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan

<!-- SPECKIT END -->

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

## General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->
