# BOM 开发应用整合

日期：2026-11-15。应用仍处于开发阶段。本次将唯一开发入口统一为 `aiao-bom-2`，删除旧 `aiao-bom` 与 `aiao-bom-e2e` 项目。

## 代码与需求归属

- 结构表和 3D 工作台：`apps/aiao-bom`。
- 领域页面、业务服务与状态：`modules/bom-workspace`，通过领域路由显式提供配置。
- 领域内核及 Angular / React / Vue 绑定：保留现有 `packages/rxdb-plugin-bom*`。
- BOM 应用故事、计划和验收资料：本目录；历史日期记录保留原有上下文，当前运行命令以应用 README 为准。
- 需求结构检查及其回归：`../scripts/check-requirements.mjs` 与 `check-requirements.spec.mjs`，CI 统一调用新版任务。

## 回归范围

旧版 40 项领域业务回归移入 `apps/aiao-bom-e2e/src/domain/`，从 `/domain` 进入。备份恢复回归改为在新版准备包含草稿、长 Decimal、ECN 与换件历史的领域数据，再验证完整恢复、schema 与数据逐项一致、损坏归档拒绝、刷新保留活动库、回退及原库不变。测试只启动新版服务。

五项 Cloudflare 响应头、WASM、深链接、重开和移动端回归保留为新版独立目标；默认使用本地 Wrangler。

## 验证

| 检查                   | 结果                                                            |
| ---------------------- | --------------------------------------------------------------- |
| 应用及共享模块静态检查 | lint、typecheck、spec-typecheck 通过                            |
| 应用单测               | 130 项通过                                                      |
| 共享领域模块单测       | 437 项通过；四项覆盖率均超过 80%                                |
| 需求结构与脚本回归     | 应用结构检查、平台需求一致性检查通过；应用脚本 16 项通过        |
| 根脚本回归             | 602 项通过                                                      |
| 完整浏览器回归         | 61 项通过，含 40 项迁入的领域回归及 Chromium / Firefox / WebKit |
| Cloudflare 本地回归    | 5/5 通过                                                        |
| 完整受影响门禁         | 112 个项目、455 项任务全部通过，零失败                          |
| 工程与格式检查         | Nx sync:check、format:check、git diff --check 通过              |

共享模块覆盖率为 statements 89.46%、branches 81.13%、functions 92.62%、lines 92.46%。脚本测试初轮因终端同时设置 `NO_COLOR` 与 `FORCE_COLOR`，Node 警告污染 CLI stderr 断言；移除冲突的 `NO_COLOR` 后，602 项全部通过，未修改业务或放宽断言。

应用覆盖率 statements 90.94%、branches 82.31%、functions 90.26%、lines 94.94%，四项均通过 80% 门槛。本地 Cloudflare 回归 5/5 通过。末轮完整受影响门禁退出码为 0：112 个项目、455 项任务全部通过，耗时 129 分 23 秒，本地缓存命中 180/455（40%）。任务数以 Nx 最终汇总为准，包含 2 项没有命令输出的依赖任务。受影响基线固定为本轮开始前的 `89179282a1e166b0099299e097965bfcc15dad9b`，包含本轮期间已提交与未提交的整合改动。

初轮完整门禁在 `rxdb-plugin-board:coverage` 遇到 4 项 PGlite 初始化 / 测试超时；单独复跑 167 项全部通过，Nx 将其标为 flaky。首轮直接追加并行参数导致命令包含重复参数，后续使用仓库 `test-all:log` 入口生成单一 `--parallel=1` 的完整门禁命令，全部目标与 `pnpm test-all` 一致，没有修改看板实现、断言或超时。

复验命令：

```bash
pnpm nx run-many --projects=aiao-bom-2,aiao-bom-2-e2e,bom-workspace --targets=lint,typecheck,spec-typecheck,requirements-check,requirements-test,test --parallel=1 --skipRemoteCache
pnpm nx run-many --projects=aiao-bom-2,bom-workspace --targets=test --coverage --parallel=1 --skipRemoteCache
pnpm nx run aiao-bom-2-e2e:e2e
pnpm nx run aiao-bom-2-e2e:e2e-cloudflare
env -u NO_COLOR pnpm nx run @aiao/source:test-scripts
pnpm nx run @aiao/source:audit-requirements
env -u NO_COLOR pnpm test-all:log --parallel=1 --style=static -- --base=89179282a1e166b0099299e097965bfcc15dad9b
```

Nx 项目图与活动源码、配置、锁文件均不再引用旧项目。39 份实际文档的本地链接均可解析，故事与 Epic 模板保留生成时使用的占位链接。版本回归截图写入 `test-output/evidence/`，不会覆盖历史验收截图。

## 开发阶段改名

同日后续确认应用仍未上线，不需要保留旧项目名、旧存储库名或旧本地选择器的兼容迁移。因此当前唯一入口已从 `aiao-bom-2` 改为 `aiao-bom`，E2E 项目改为 `aiao-bom-e2e`；运行时数据库、数据 schema、Angular 选择器和 `bom:*` 本地命名空间同步改名。上文记录保留整合当时的历史名称与验证命令，当前命令以新的应用 README 和 Nx 项目配置为准。
