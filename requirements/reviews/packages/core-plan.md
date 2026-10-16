---
title: 核心与框架包评审计划
status: Done
created: 2026-10-16
updated: 2026-10-16
base: main@94df0a04
---

# 核心与框架包评审计划

## 覆盖范围

本组覆盖 16 个包：`code-editor`、`code-editor-angular`、`code-editor-react`、`code-editor-vue`、`rxdb`、`rxdb-angular`、`rxdb-react`、`rxdb-vue`、`rxdb-model`、`rxdb-model-angular`、`rxdb-model-react`、`rxdb-model-vue`、`rxdb-client-generator`、`rxdb-devtools`、`rxdb-test`、`utils`。

## 方法

逐包检查 `package.json`、`project.json`、TypeScript/Vite/ng-package 配置、公开入口与 README；阅读 `src` 主路径、错误/生命周期/并发/序列化代码及对应 spec；对 Angular、React、Vue 的同名 API 做入口和参数语义对照；检查构建产物 `exports` 与生成脚本的路径安全。

每条问题都记录文件、符号和行号，按 P0（数据/安全/发布阻断）、P1（常见生产错误）、P2（可感知边界/契约/测试缺口）、P3（维护与文档）分级。没有足够证据的假设不列为问题，只放到未覆盖项。

## 验证记录

尝试执行 `pnpm nx run-many -t test ... --parallel=1 --skipRemoteCache` 与单包 `pnpm nx run rxdb-model:typecheck --skipRemoteCache --verbose`。两次均在加载 Nx 插件阶段失败：当前执行环境 Node `v22.14.0` 不满足仓库 `>=26`，并出现 `@nx/js/typescript`、`@nx/vite/plugin`、`@nx/eslint/plugin`、`@nx/vitest`、`@nx/playwright` 插件加载错误；没有把该结果误报成包测试通过或失败。建议在 Node 26+ 的干净环境重跑受影响包的 `typecheck`、`test`、`build`，并补跑真实浏览器、Angular 编译器和 DevTools MessageChannel/OPFS 宿主测试。

## 结果

首轮：15 个包未发现足以定级的行为问题；`rxdb-model` 发现 1 条 P2（默认字段标题对全大写缩写的实现与文档不一致）。二次评审：该 P2 已修复并复核（模型包 996/996 通过），残留 1 条 P3 缩写分词边界（`rxdb-model.md`）；新确认 `rxdb` 核心 2 条 P2（游标分页重锚只比 id、reachability 零订阅方空转，`rxdb.md`，前者三端绑定同源）；补齐首轮未覆盖的 7 个包后，`rxdb-model-react` 确认 1 P1 + 2 P2（StrictMode 下表格不复建、initialQuery 丢弃、草稿不补建）、`rxdb-model-angular` 确认 1 P2（`#dialogData!` 空断言）；深扫 query-builder 之外的 rxdb-model 后确认 1 P1 + 1 P2 + 2 P3（枚举编辑器静默改写、日期未变更判据、数字数组空段、整数截断）；`utils`（158 文件全量走读）确认 6 条 P2（金额大写、urlJoin、稀疏数组相等、`__proto__` 原型污染、路径对象往返、分词吞字符），`rxdb-devtools` 确认 1 P1 + 3 P2（OPFS 上传覆盖、serializer 数组 undefined、v2 transfer 释放、panel-endpoint 泄漏）；其余包（code-editor 四端、rxdb-model-vue、rxdb-client-generator、rxdb-test）复验干净。各包的检查边界、发现和验证建议见同目录逐包报告。
