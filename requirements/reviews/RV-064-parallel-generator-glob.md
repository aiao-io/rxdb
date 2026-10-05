---
id: RV-064
title: 实体生成器把字符类与花括号 glob 当成字面路径
status: Open
severity: P2
created: 2026-10-05
updated: 2026-10-05
baseline: 44de1138b4d396fc45d6e76ab60476c40fef2223
---

# RV-064：实体生成器把字符类与花括号 glob 当成字面路径

## 问题与影响

**P2，当前源码/复验确认，待修。** 公开实体文件模式只有 * 或 ? 才被识别为 glob；[AB].ts 和 {A,B}.ts 被按不存在的字面路径规范化，存在的 A/B 文件不被展开。Vite watch 的 magic 判定已经识别这两类，输入与重建语义不一致。

## 根因与锚点

[实际源码](../../packages/rxdb-client-generator/src/cli/find-files.ts)：23–41。根因及反证详见 [子任务取证说明](evidence/2026-10-05/parallel/core/findings.pending.md)。所有行号属于本批阅读版本，后续变更须复核，不以旧源码行号冒充新提交。

## 复验与范围

真实临时文件、实际 glob 和原 finder；两个无星号/问号边界失败，普通星号模式正常。原 374 个生成器用例通过。尚未实测每种消费应用构建失败。

[复验入口](../../packages/rxdb-client-generator/src/__tests__/cli/review-parallel-glob-patterns.spec.ts) / [本轮原始日志](evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage.txt)；聚焦续验见 [新增探针集中日志](evidence/2026-10-05/parallel/validation/new-parallel-probes.txt)（只在实际完成后使用其状态，不预判通过）。测试没有删除/skip改绿；失败的门禁保留为失败，coverage缺失不补历史绿。

## 最小修复方向与回归

用一致的完整 magic 判定与现有 glob 库；保持字面路径、cwd、ignore、allowEmpty 及零匹配失败契约。补字符类、brace、转义/特殊文件名和真实 CLI/Vite 一致性。

## 解决记录

- [x] 当前源锚点及本轮失败证据登记，影响限于上述实测/明确接缝。
- [ ] 修复实现并补原正常契约、失败/关闭回归；本次只评审，不改业务。
