---
id: ADESK-US-001
title: 产品根目录与多应用拆分
status: Done
priority: High
epic: ADESK-EPIC-001
created: 2026-11-12
updated: 2026-11-12
tags: [governance, tooling, nx]
dependsOn: []
capabilities: []
---

# 用户故事：产品根目录与多应用拆分

## 作为/我想要/以便

**作为** Aiao Desktop 的维护者
**我想要** 把单个 Angular 应用 `apps/aiao-desktop` 升级为仓库根的产品根目录，桌面与浏览器冒烟各是一个 Nx 应用
**以便** 产品需求集中在一个 `requirements/`，冒烟作为独立的 e2e 项目进 CI，结构、影响范围与安全边界由门禁约束。

## 范围边界

### In Scope

- 按[应用级需求与项目治理办法](../../../../requirements/application-governance.md)的多应用结构，把 `apps/aiao-desktop/` 升级为仓库根的产品根目录 `aiao-desktop/`：`apps/web` 与 `apps/e2e`。
- 产品根是 Nx 项目 `aiao-desktop`，承载需求门禁、安全门禁与聚合验证 `verify`；子项目名加后缀（`aiao-desktop-web`、`aiao-desktop-e2e`），tags 用 `scope:aiao-desktop` 与 `type:*`、`layer:*`。
- 原 web 的 `test` 目标里的冒烟脚本移到 `apps/e2e`，改为 `e2e` 目标，进 CI 的 e2e 矩阵。
- 产品需求目录（`ADESK` 前缀）与结构门禁；`AGENTS.md` 写明目录边界与依赖方向。
- 应用门禁的最低要求：安全边界门禁扫描 web 构建产物里的密钥形状。

### Out of Scope

- 改变桌面的产品行为。
- 产品私有包：眼下没有跨应用共用的代码。
- 把 `apps/web-desktop`（Web Desktop，另一个产品）并入本产品。

## 验收标准

| #   | 前置条件            | 操作                                                          | 预期结果                                                                                                                                                    | 状态 |
| --- | ------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 产品根目录已建立    | 查看 `aiao-desktop/` 并执行 `aiao-desktop:requirements-check` | 有 `AGENTS.md`、`README.md`、`requirements/`、`apps/web` 与 `apps/e2e`；需求门禁通过，链接全部有效                                                          | ✅   |
| 2   | 三个 Nx 项目        | 执行 `pnpm nx show project <name>`                            | `aiao-desktop`、`aiao-desktop-web`、`aiao-desktop-e2e` 的 root、sourceRoot、tags 与 targets 可读；tags 含 `scope:aiao-desktop` 及对应的 `type:*`、`layer:*` | ✅   |
| 3   | 搬迁完成            | 检索仓库并构建 web                                            | 没有 `apps/aiao-desktop` 目录，也没有旧项目名 `aiao-desktop:` 的目标引用；构建产物在 `dist/aiao-desktop/apps/web`                                           | ✅   |
| 4   | e2e 与 web          | 查看依赖图与 e2e 源码                                         | e2e 只经 web 的构建产物验证，不 import web 的源码；产品根依赖两个子项目，web 不依赖它们                                                                     | ✅   |
| 5   | 只改 web 的一个文件 | 执行 `nx show projects --affected`                            | 列出 web、e2e 与产品根；只改需求文档时只列产品根                                                                                                            | ✅   |
| 6   | web 已构建          | 执行 `aiao-desktop:audit-secrets`                             | 产物里没有密钥形状的字符串；命中时只报文件与类型、不回显取值；产物目录缺失或没有文本文件时失败                                                              | ✅   |
| 7   | 本地                | 执行 `aiao-desktop:verify`                                    | 需求门禁及其测试、密钥扫描及其测试、web 的 lint / typecheck / build、e2e 的 lint 与冒烟全部通过                                                             | ✅   |
| 8   | CI 按目标收集项目   | 执行 `nx show projects --withTarget=<target>`                 | e2e 在 `e2e` 的结果里；产品根在 `test` 与 `audit-secrets` 的结果里；web 在 `lint`、`typecheck`、`build` 的结果里                                            | ✅   |

验收证据入口：`nx show project`、`nx graph` 与 `nx show projects` 的输出、[需求门禁测试](../../../scripts/check-requirements.spec.mjs)、[密钥扫描测试](../../../scripts/check-web-secrets.spec.mjs)、`aiao-desktop:verify`，汇总见[验收台账](../../verification-report.md#结构门禁与构建)。

## 技术笔记

位置与组成由用户拍板（[D-02](../../decisions.md#d-02产品根目录与应用拆分)）：产品根放在仓库根，与 `aiao-model-design/` 同一布局，拆成 web 与 e2e。产品根是一个只含需求与门禁目标的 Nx 项目，子项目嵌套在它下面；它的 ESLint 配置忽略 `apps/**` 与 `packages/**`，避免推断出的 lint 把子项目再查一遍。产品根以 `implicitDependencies` 依赖两个子项目：需求文档链接到 web 的源码，web 改动时需求门禁也要跑。

需求门禁绑定前缀 `ADESK`，校验逻辑用仓库共用的 `scripts/audit/app-requirements.mjs`；产品根在仓库根下一层，`workspaceRoot` 要显式给出。安全门禁沿用 CI 已有的 `audit-secrets` 目标名，extras job 按 `--withTarget=audit-secrets` 自动收集；产品根的 `test` 是 `nx:noop`，只把门禁与脚本测试作为前置任务，CI 给覆盖率 lane 追加的参数不会传给 `node --test`。两个子项目都没有 `package.json`，不必加入 `pnpm-workspace.yaml`。

## 实现文件

- `aiao-desktop/AGENTS.md` — 目录边界与依赖方向。
- `aiao-desktop/project.json` — 产品根的需求门禁、安全门禁、`test` 与 `verify`。
- `aiao-desktop/apps/web/project.json`、`aiao-desktop/apps/e2e/project.json` — 两个应用的目标。
- `aiao-desktop/apps/e2e/src/smoke.mjs` — 冒烟（原 `apps/aiao-desktop/tests/smoke.mjs`）。
- `aiao-desktop/scripts/check-requirements.mjs` / `check-requirements.spec.mjs` — 需求门禁与测试。
- `aiao-desktop/scripts/check-web-secrets.mjs` / `check-web-secrets.spec.mjs` — 安全边界门禁与测试。
- `scripts/audit/app-requirements.mjs`（仓库根）— 应用需求门禁的共用校验逻辑。
- `requirements/README.md`（仓库根）— 产品需求入口。

## References

- [应用级需求与项目治理办法](../../../../requirements/application-governance.md)
- [D-02](../../decisions.md#d-02产品根目录与应用拆分)
- [ADESK-EPIC-001](../../epics/ADESK-EPIC-001.md)
