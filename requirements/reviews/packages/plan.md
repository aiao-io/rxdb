---
title: packages 全量代码评审计划
status: Done
created: 2026-10-16
updated: 2026-10-16
branch: codex/packages-review
base: main@94df0a04
---

# packages 全量代码评审计划

## 目标

在 `main@94df0a04` 基础上，对 `packages/` 下 51 个可发布或测试包做一次可追溯的代码评审。每个包产出一份独立报告，记录检查范围、证据锚点、风险等级、修复建议和验证建议；报告只记录本轮评审结论，不直接修改生产代码。

## 评审范围

| 分组 | 包数量 | 包名 |
| --- | ---: | --- |
| 核心与框架 | 16 | `code-editor`、`code-editor-angular`、`code-editor-react`、`code-editor-vue`、`rxdb`、`rxdb-angular`、`rxdb-react`、`rxdb-vue`、`rxdb-model`、`rxdb-model-angular`、`rxdb-model-react`、`rxdb-model-vue`、`rxdb-client-generator`、`rxdb-devtools`、`rxdb-test`、`utils` |
| 存储与宿主适配器 | 13 | `rxdb-adapter-electron`、`rxdb-adapter-encrypted`、`rxdb-adapter-http`、`rxdb-adapter-miniprogram`、`rxdb-adapter-pglite`、`rxdb-adapter-sqlite`、`rxdb-adapter-sqlite-core`、`rxdb-adapter-sqlite-wasm`、`rxdb-adapter-sqliteai`、`rxdb-adapter-supabase`、`rxdb-adapter-tauri`、`rxdb-adapter-wa-sqlite`、`rxdb-taro` |
| 插件 | 22 | `rxdb-plugin-graph`、`rxdb-plugin-history`、`rxdb-plugin-querycache`、`rxdb-plugin-replay`、`rxdb-plugin-replay-angular`、`rxdb-plugin-replay-react`、`rxdb-plugin-replay-vue`、`rxdb-plugin-search`、`rxdb-plugin-search-angular`、`rxdb-plugin-search-react`、`rxdb-plugin-search-vue`、`rxdb-plugin-storage`、`rxdb-plugin-sync`、`rxdb-plugin-tree`、`rxdb-plugin-tree-angular`、`rxdb-plugin-tree-react`、`rxdb-plugin-tree-vue`、`rxdb-plugin-working-tree`、`rxdb-plugin-working-tree-angular`、`rxdb-plugin-working-tree-react`、`rxdb-plugin-working-tree-vue`、`rxdb-plugin-workspace` |

## 评审维度

1. **行为正确性**：主路径、边界条件、错误处理、并发/重入、资源生命周期和数据一致性。
2. **API 与跨框架一致性**：公开导出、类型约束、Angular/React/Vue 三端 API 对称性，以及破坏性变更风险。
3. **存储与安全**：事务/锁、查询参数化、加密材料、权限边界、敏感数据和宿主差异。
4. **性能与可维护性**：复杂度、重复工作、潜在泄漏、初始化成本、异常路径和模块边界。
5. **测试与发布契约**：测试是否覆盖关键行为，Nx target、构建入口、`exports`、运行时条件、依赖和文档是否与实现一致。

## 证据和分级

- 每条发现必须包含文件路径、符号或行号，以及可复现的触发条件。
- `P0`：数据丢失、安全边界突破、发布完全不可用或会阻断所有消费者。
- `P1`：常见生产路径错误、跨端行为不一致、资源泄漏或高概率数据错误。
- `P2`：可感知的边界缺陷、错误契约、测试缺口或维护风险。
- `P3`：低风险可维护性、文档或轻微一致性问题。
- 没有发现时，报告必须写明实际检查的目录/入口、运行的静态检查或测试，以及仍未覆盖的宿主条件。

## 执行步骤

1. 固定基线与分支：`codex/packages-review` 从 `main@94df0a04` 创建。
2. 按分组检查 `package.json`、Nx 项目配置、源码、测试、构建入口和公开导出。
3. 对每个包写 `requirements/reviews/packages/<package>.md`，统一记录结论和验证建议。
4. 对 Angular/React/Vue 成对包做 API 对称性复核，对共享适配器做一致性复核。
5. 汇总 P0/P1/P2/P3 数量、未覆盖项和建议执行的 Nx 任务。
6. 在评审分支执行格式检查、文档链接检查和与本次变更相关的 Nx 校验；不把未运行的真实宿主测试写成已通过。

## 交付物状态

| 交付物 | 状态 |
| --- | --- |
| 本计划 | 已建立 |
| 核心与框架分组报告 | 已完成（16/16） |
| 适配器分组报告 | 已完成（13/13） |
| 插件分组报告 | 已完成（22/22） |
| 总结与交叉框架复核 | 已完成；见 `summary.md`、`cross-framework.md` |

## 本轮结果

- 51 个包均有独立报告。
- 共确认 6 条问题：2 条 P1、4 条 P2；没有 P0/P3。
- 发现集中在自定义主键列映射（PGlite/Supabase）、Supabase 数值/BigInt 树 ID、模型缩写标题、QueryCache peer 元数据和 Replay Vue 挂载前 seek。
- `pnpm audit:docs-plugins` 与 `pnpm audit:conditions` 通过；构建入口审计因 worktree 没有构建产物无法判定。
- Nx 动态门禁因当前 Node 22 低于仓库要求的 Node 26，且插件加载受限，留待支持环境串行复跑。
