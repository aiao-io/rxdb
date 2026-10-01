# Implementation Plan: US-909 阶段 A — e2e 失败尝试保留 trace

**Branch**: `rrweb`（特性目录 `003-us-909-trace-retain-on-failure`） | **Date**: 2026-10-01 | **Spec**: [US-909](../../requirements/stories/future/US-909-session-replay-debugging.md)

**Input**: 没有单独的 spec.md，故事文件即 spec。本 plan 只覆盖阶段 A（AC#1～3）。owner 于 2026-10-01 决定 A / B / C 全做（故事「排期决定」）：
B / C 的价值门禁豁免，按 A → B → C 顺序交付，各自另开特性目录做 plan；B 的第二连接 spike 在它的 plan 之前做，不豁免。

## Summary

六个 Playwright 配置（angular / react / vue / supabase / http 五个 web demo e2e + `rxdb-devtools-extension-e2e`）的 `trace`
改为 `'retain-on-failure'`，补上三个盲区：

1. 本地：`--retries=0` 下 `on-first-retry` 只在 `retry === 1` 时录，本地失败永远没有 trace；
2. CI：首次失败、重试转绿的用例，留下的是通过那次重试的 trace，失败那次反而没有；
3. 扩展 e2e：config 没有 `use` 块，从来不录。

`ci-template.yml` 里描述 trace 模式的注释同步。产物通道（`test-output/playwright/**` 上传为 artifact，保留 7 天）不动。

AC#3 的量法在本 plan 冻结：angular 全量、`--retries=0`、两臂交错各 N=5 轮，比 JSON 报告 `stats.duration` 的中位数，
增幅上限 +10%。超限时唯一的调节杆是 `screenshots`（[research D6](research.md)）。

验证：AC#1 用临时探针先红后绿；AC#2 在临时分支 + draft PR 上验证，推送与开 PR 由用户放行；探针都不进交付 PR。

## Technical Context

**Language/Version**: TypeScript 6.0 strict + ESM（Playwright 配置）；YAML（CI 注释）

**Primary Dependencies**: `@playwright/test` / `playwright-core` 1.63.0；`@nx/playwright` 23.2.1 的 `nxE2EPreset`（不含 `use`
字段，扩展 e2e 新增的 `use` 块不会覆盖 preset 的任何值）

**Storage**: N/A。`trace.zip` 落在各项目 `test-output/playwright/output/<尝试目录>/`，CI 经既有 artifact 上传

**Testing**: 不加常驻测试（research D11）；AC#1 临时探针先红后绿，AC#2 临时分支探针，AC#3 量测记录

**Target Platform**: 本地 macOS（AC#1、AC#3）；GitHub ubuntu runner（AC#2）

**Project Type**: e2e 配置 + CI workflow 注释；不碰 `packages/*`，不碰产品代码

**Performance Goals**: angular 全量 `stats.duration` 中位数增幅 ≤ +10%。CI 上 e2e job 不在 PR 关键路径上（最长的是单测分片，
22:24–22:50）；angular 的 E2E 步骤 4:17–5:12，+10% 约 +26～31 s（main 最近三次成功 run）

**Constraints**: 只改 `trace` 的值（扩展 e2e 新增 `use` 块）与注释；不加依赖、脚本、CI 步骤；不改 retries、reporter、路径；
AC#3 量测要独占机器

**Scale/Scope**: 6 个配置 + 1 段 workflow 注释；量测套件 angular 27 个 spec 文件

## Constitution Check

_GATE: Phase 0 前必须通过，Phase 1 设计后复查。_ 依据宪法 v2.0.2。

| 原则        | 检查项                                                                                                                 | 结论 |
| ----------- | ---------------------------------------------------------------------------------------------------------------------- | :--: |
| I. 代码质量 | 六个 e2e 项目 `lint` + `typecheck` 零警告（六个项目都有这两个 target，已核对）                                         |  ✅  |
| I. 代码质量 | 不新增注释掉的代码；描述旧模式的注释改写而非删除（D4）                                                                 |  ✅  |
| I. 代码质量 | 无 fallback：扩展 e2e 录不出 trace 就停下重新 plan，不在 fixture 里叠加手动 `context.tracing`（D3）                    |  ✅  |
| I. 代码质量 | 不碰 `packages/*`，TSDoc 不适用                                                                                        | N/A  |
| II. 测试    | 先红后绿：AC#1 探针在旧配置下正常运行但没有 `trace.zip`（按预期原因红），改配置后转绿（D7）                            |  ✅  |
| II. 测试    | 确定性：AC#1 断言一个不存在的 test id；AC#2 按 `testInfo.retry` 决定成败（D7、D8）                                     |  ✅  |
| II. 测试    | 不加常驻回归测试：不是产品缺陷修复，静态断言只是把配置复述一遍（D11，否决点）                                          |  ✅  |
| II. 测试    | 覆盖率分级只管 `packages/*`                                                                                            | N/A  |
| III. 三框架 | angular / react / vue 同值、同注释措辞；supabase / http / 扩展同步；electron / miniprogram / tauri 按故事 Out of Scope |  ✅  |
| III. 三框架 | 无 UI 改动，loading / empty / error / WCAG 不适用                                                                      | N/A  |
| IV. 性能    | 可量化目标（≤ +10%）+ 量法（D5）+ 超限阶梯（D6）；默认预算表与 `benchmarks/` 只管 `packages/*`                         |  ✅  |
| 工程护栏    | 技术栈不变；spec（故事）→ plan → tasks → implement；一个 PR 只交付阶段 A；探针不进交付 PR                              |  ✅  |

angular 配置里既有的注释掉的 Nx 样板（firefox / webkit / 移动端 / 品牌浏览器 projects）是存量，不在本阶段范围，不扩大改动面。

**设计后复查**：Phase 1 没有引入新抽象、新依赖或 fallback，Complexity Tracking 为空，结论不变。

## Project Structure

### Documentation (this feature)

```text
specs/003-us-909-trace-retain-on-failure/
├── plan.md          # 本文件
├── research.md      # Phase 0：D1–D11 决策
├── data-model.md    # Phase 1：配置清单、尝试生命周期、artifact 布局、AC#3 记录格式
├── quickstart.md    # Phase 1：AC#1～3 验证步骤
├── ac3-runs.tsv     # 实现阶段产出（AC#3 原始记录），本命令不创建
└── tasks.md         # /speckit-tasks 产出，本命令不创建
```

不建 `contracts/`：本阶段不对外暴露接口，没有公开 API、CLI 或 wire 格式变化；`trace.zip` 是 Playwright 自己的格式。

### Source Code (repository root)

```text
apps/
├── dev-rxdb-angular-e2e/playwright.config.ts         # trace 值 + 英文注释
├── dev-rxdb-react-e2e/playwright.config.ts           # trace 值 + 英文注释
├── dev-rxdb-vue-e2e/playwright.config.ts             # trace 值 + 英文注释
├── dev-rxdb-supabase-e2e/playwright.config.ts        # trace 值 + 中文注释
├── dev-rxdb-http-e2e/playwright.config.ts            # 只改值（原本没有注释）
└── rxdb-devtools-extension-e2e/playwright.config.ts  # 新增 use 块
.github/workflows/ci-template.yml                     # 870-874 行注释
requirements/stories/future/US-909-session-replay-debugging.md  # 交付时回写 AC 状态与 AC#3 摘要
```

临时文件，不进交付 PR：

- `apps/dev-rxdb-angular-e2e/src/us909-trace-probe.spec.ts`、`apps/rxdb-devtools-extension-e2e/src/us909-trace-probe.spec.ts`（AC#1，跑完删除）
- `apps/dev-rxdb-angular-e2e/src/us909-ci-retry-probe.spec.ts`（AC#2，只提交在临时分支 `us909-ac2-probe` 上）

**Structure Decision**: 不新增项目、包、脚本或 CI 步骤，改动全部落在既有文件上。

## 与故事的偏差

本 plan 顺带改了故事两处（否决点）：

1. 交付阶段表 A 行门禁列：「plan 实测开销并冻结上限」→「plan 冻结开销上限与量法，实测即 AC#3」。plan 期机器负载高（load ≈ 11），
   试测数据不可信；上限在看到数据之前冻结，实测归 AC#3。
2. 技术笔记「阶段 A 的模式」：超限调节杆从「`screenshots` / `snapshots` / `sources`」收窄为只有 `screenshots`。`snapshots` 是
   AC#1 的验收内容；`sources` / `attachments` 只在保留的 trace 合并时收集，通过的用例不付这份开销。

## Complexity Tracking

无违例，不填。
