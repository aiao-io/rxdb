---
id: MODEL-US-003
title: 产品根目录与多应用拆分
status: Done
priority: High
epic: MODEL-EPIC-002
created: 2026-11-12
updated: 2026-11-12
tags: [governance, tooling, nx]
dependsOn: [MODEL-US-001]
capabilities: []
---

# 用户故事：产品根目录与多应用拆分

## 作为/我想要/以便

**作为** 模型设计器的维护者
**我想要** 把浏览器设计器、Cloudflare Worker 与 Trigger.dev 智能体拆成同一个产品根目录下的三个 Nx 应用，共用的模型操作抽成产品私有包
**以便** 每个运行时只带自己的依赖与目标，依赖方向由门禁约束，产品需求仍集中在一个 `requirements/`。

## 范围边界

### In Scope

- 按[应用级需求与项目治理办法](../../../../requirements/application-governance.md)的多应用结构，把 `apps/aiao-model-design/` 升级为仓库根的产品根目录 `aiao-model-design/`：`apps/web`、`apps/api`、`apps/agent` 与 `packages/model-ops`。
- 产品根保留 `aiao-model-design` 这个 Nx 项目，承载需求门禁、安全门禁与聚合验证 `verify`；子项目名加后缀，tags 用 `scope:model-design` 与 `type:*`、`layer:*`。
- web 与 agent 共用的纯函数抽成私有包 `@aiao-model-design/model-ops`（`private: true`），经 tsconfig paths 按源码消费；测试夹具从 `/testing` 子路径导出。
- `AGENTS.md` 写明目录边界与依赖方向；根 ESLint 对 `layer:domain` 加依赖约束。
- 应用门禁的最低要求：安全边界门禁扫描 web 构建产物里的服务端密钥。
- 本地文件随所属应用迁移（`.dev.vars` 到 api），并修正 `.env.agent.example` 被根 `.gitignore` 误伤、从未入库的问题。

### Out of Scope

- 新增产品功能或改变三个应用的行为。
- 抽出 api 与 web 共用的接口契约包：两边的会话接口类型各自声明，等出现真实的共享需要再立故事。

## 验收标准

| #   | 前置条件             | 操作                                                  | 预期结果                                                                                                      | 状态 |
| --- | -------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 产品根目录已建立     | 查看 `aiao-model-design/` 并执行 `requirements-check` | 有 `AGENTS.md`、`requirements/`、`apps/{web,api,agent}` 与 `packages/model-ops`；需求门禁通过，链接全部有效   | ✅   |
| 2   | 五个 Nx 项目         | 执行 `pnpm nx show project <name>`                    | root、sourceRoot、tags 与 targets 可读；tags 含 `scope:model-design` 及对应的 `type:*`、`layer:*`             | ✅   |
| 3   | web 与 agent         | 查看依赖图与导入                                      | 两者只经 `@aiao-model-design/model-ops` 共用模型操作；应用之间没有依赖边，也不 import 其他应用的源码          | ✅   |
| 4   | 私有包               | 在 `packages/model-ops` 里导入 `@angular/core`        | lint 报 `layer:domain` 不允许该导入                                                                           | ✅   |
| 5   | 只改私有包的一个文件 | 执行 `nx show projects --affected`                    | 列出 model-ops、web 与 agent；只改 api 时只列 api                                                             | ✅   |
| 6   | web 已构建           | 执行 `aiao-model-design:security-check`               | 产物里没有 Trigger.dev 或供应商密钥形状的字符串，也没有本机环境文件里的密钥值；命中时只报文件与类型、不回显值 | ✅   |
| 7   | 本地                 | 执行 `aiao-model-design:verify`                       | 需求门禁、四个子项目的 lint / typecheck / test、web 构建、Worker 打包、`test-worker` 与安全门禁全部通过       | ✅   |
| 8   | 自建实例             | 从新位置部署智能体，并重跑真实环境场景                | 部署成功；电商订单建模、生成并合并、中途刷新续流与提问作答在新结构下全部通过（真实环境）                      | ✅   |
| 9   | 旧目录的本地文件     | 迁移后检查 api 与 agent                               | `.dev.vars` 在 `apps/api/`；`.env.agent.example` 进入版本管理，`.env.agent` 仍被忽略                          | ✅   |

验收证据入口：`nx show project` 与 `nx graph` 的输出、[安全门禁测试](../../../scripts/check-web-secrets.spec.mjs)、`aiao-model-design:verify`，以及真实环境重跑的记录，汇总见[验收台账](../../verification-report.md)。

## 技术笔记

位置与拆分粒度由用户拍板（D-09）：产品根放在仓库根，按运行时拆成三个应用。产品根是一个只含需求与门禁目标的 Nx 项目，子项目嵌套在它下面；它的 ESLint 配置忽略 `apps/**` 与 `packages/**`，避免把子项目再查一遍。私有包沿用仓库的做法：`tsconfig.base.json` 的 paths 指向源码，web 的 tsconfig 引用包的 `tsconfig.lib.json`；api 与 agent 的 tsconfig 是独立配置，agent 自带 paths，`nx sync` 为它补上对私有包的引用，所以它的 typecheck 先跑依赖的 typecheck。私有包用 `bundler` 模块解析，与它的消费方（Angular、trigger 的 esbuild、vitest）一致。

## 实现文件

- `aiao-model-design/AGENTS.md` — 目录边界与依赖方向。
- `aiao-model-design/project.json` — 产品根的需求门禁、安全门禁与 `verify`。
- `aiao-model-design/apps/{web,api,agent}/project.json`、`package.json` — 各应用的目标与依赖。
- `aiao-model-design/packages/model-ops/` — 私有包（`src/index.ts`、`src/testing.ts`）。
- `aiao-model-design/scripts/check-web-secrets.mjs` / `check-web-secrets.spec.mjs` — 安全边界门禁与测试。
- `eslint.config.mjs`（仓库根）— `layer:domain` 的依赖约束。
- `pnpm-workspace.yaml`、`tsconfig.base.json`、`tsconfig.json`（仓库根）— 工作区成员、私有包 paths 与项目引用。

## References

- [应用级需求与项目治理办法](../../../../requirements/application-governance.md)
- [D-09](../../decisions.md#d-09产品根目录与按运行时拆分)
- [MODEL-EPIC-002](../../epics/MODEL-EPIC-002.md)
