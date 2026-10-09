# 角色与规范

遵循 [AGENTS.md](./AGENTS.md) 中的角色定义、代码哲学与铁律。

## 项目概述

**rxdb** — Local-first RxDB monorepo（开源版），核心 RxDB 引擎、三框架绑定（Angular 22 / React 19 / Vue 3.5）、多存储适配器与开发者工具。

核心能力：装饰器驱动实体 → 类型安全 Repository → RxDB 响应式查询 → 多存储后端（wa-sqlite / sqlite-wasm / PGlite / Supabase / sqliteai / electron / tauri）。

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
apps/          # 演示应用（angular/react/vue + electron/tauri/supabase）
packages/      # 可发布库（rxdb-* / rxdb-adapter-* / rxdb-plugin-* / code-editor-*）
modules/       # 内部共享模块（angular / angular-todo / recipes-domain / rxdb-devtools-panel / wujie）
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

# 全量验证（CI 门禁；失败先单独复跑，见 AGENTS.md「全量测试坑」）
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

- 运行任务（build / lint / test / e2e 等）一律通过 `nx`（`nx run` / `nx run-many` / `nx affected`），不要直接调底层工具
- nx 命令必须加包管理器前缀（如 `pnpm nx build`、`pnpm nx test`），避免用全局安装的 CLI
- 探索工作区、按变更跑校验时优先用现有 skill：`affected-ci`（affected 校验）、`coverage-gate`（覆盖率阈值）、`tri-framework-check`（三框架 API 对称）
- 不确定 CLI flag 时先跑 `nx <command> --help`，不要猜
- Nx 插件最佳实践可查 `node_modules/@nx/<plugin>/PLUGIN.md`（不是所有插件都有此文件，没有就跳过）

<!-- nx configuration end-->
