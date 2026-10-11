# Implementation Plan: US-602 A1

**Branch**: `codex/us602-a1` | **Date**: 2026-10-11 | **Spec**: [spec.md](spec.md)

## Summary

先完成 AC#12 的入口说明与事务验证，再完成发布发现、事实源、漂移门禁、生成生命周期与离线样例。验收覆盖 US-602 AC#1–3、#5、#6、#12–15。

## Technical Context

Node 26、TS 6、Nx 23、pnpm 10；审计用 Node ESM 与已有 TypeScript AST，夹具用 node:test；真实事务验证用现有 Vitest/PGlite 环境。事实源为 requirements/package-graph.json，生成物提交到 requirements/generated/ 并以 --check 防漂移。PGlite store:memory，无外部服务。根开发依赖由 pnpm workspace 命令声明。

## Constitution Check

- 质量：不新增 any；公开 TS 只修改中文 TSDoc；运行时源码不改。
- 测试：先红后绿；审计 .spec.mjs 只读 fixtures，真实 packages 校验走根审计入口；现有 core 覆盖率门禁 ≥90%，其余 ≥80%。
- 一致性：三框架情景统一字段，公共 API、UI 与行为不变；无新增无障碍界面。
- 性能：审计/生成实测 <10 秒（构建除外）；不增加运行时依赖或 bundle。样例依赖均为根 devDependencies。

## Project Structure

- scripts/audit/package-graph.mjs：扫描、AST 插件前置、情景闭合、依赖环与稳定知识生成；职责拆为 lib/package-graph-*.mjs。
- scripts/audit/package-graph.spec.mjs 与 `__fixtures__/package-graph/`：包与情景的独立正反例。
- scripts/audit/templates/package-knowledge.md：生成材料模板。
- scripts/examples/ai-local/：完整 TS 样例、安装清单、编译配置。
- scripts/audit/ai-example.mjs：严格编译样例、运行 CRUD、打包声明检查。
- requirements/package-graph.json 与 requirements/generated/：语义事实与版本化知识材料。
- packages/rxdb/src/：use/connect/transaction/executor/save 的 TSDoc。
- package.json、packages/rxdb/project.json、website/project.json、.github/workflows/ci-template.yml：审计、样例和缓存输入。

## Decisions

1. 包数均由扫描获得。门禁扫描 packages/* 非 private manifest；API 基线继续使用原 listPublicPackages，不扩大或缩小。
2. 发布范围用 git describe 的可达 v* 标签，再读标签树下的 manifest；无标签明确报错，未发布包不给安装命令。
3. 事实源不复制安装边或 inject。插件登记 source/class/factory，AST 只读对应类的 inject 字面数组；无法静态识别时明确报错，避免词法猜测和全仓类型 Program。
4. 情景登记入口插件；闭包自动加入 plugin:* 前置及包，adapter:* 前置核对槽位。输出开发范围与发布范围分开，docs-plugin-surface 从同一情景计算 QueryCache 所需项。
5. 使用提交生成物 + --check。facts/manifest/源码/template/sample/生成脚本以及 Git 发布引用进入审计和消费目标哈希输入；不禁用全局缓存。
6. 最小样例用 PGlite + history，执行 use → adapter → connect → CRUD → transaction executor → disconnect。实例 save 的负例通过受控队列 spy 验证，再释放外层事务并等待保存结束，测试无定时竞态。
7. 不运行在线模型、不发版、不改 peer 声明、不生成 llms 或 Skill。

## Complexity Tracking

只新增离线脚本、中心语义资料与自动化验证；AST 利用既有 TS，不引入新库。跨框架按事实登记，无框架业务改动。
