# Aiao Media 迁入 RxDB 的产品孵化方案

本方案把 Aiao Media 作为 RxDB 仓库内独立交付的真实应用：共用工作区工具链和底层能力，独立维护产品需求、验收与部署。本文件记录已确认的结构与迁移约束；工程导入与本次复验结果见[同仓迁入验收](rxdb-import-verification.md)。

## 1. 建议与范围

**采用应用目录内聚的结构：除独立 e2e 项目外，Aiao Media 的源码、私有契约、数据层、需求、部署、本地服务和工具全部放在 `apps/aiao-media/`。** 私有契约和数据层只是应用内文件夹，共用应用的编译、测试与依赖配置。原有根 `requirements/` 继续管理引擎、适配器、框架、插件和可复用领域方案。

应用层承担完整用户流程、账号、供应商、作品、发布与运营，可以组合多个 domain，也可以直接消费引擎能力。因此应用层在业务交付上高于 domain，但不是给原有 `stories/domain/` 再分配一段编号。

- 平台能力：RxDB、适配器、storage/sync 等通用包。
- 领域能力：BOM、模型驱动后台等可复用解决方案。
- 应用产品：Aiao Media，对自己的用户闭环和线上版本负责。

依赖方向为「应用 → 领域能力／平台能力」，底层不依赖 Aiao Media。图片供应商协议、Key 生命周期、提示词编辑和产品备份格式先保持应用私有；出现明确复用需求后再提取。

本轮迁移目标是功能与数据连续性。同步、账号绑定、业务后台的现有计划完整迁入，交付状态保持；它们不作为搬迁时顺便实现的新范围。移动真机验收仍暂缓。

## 2. 核对依据与实际差异

核对日期：2026-10-24。源仓基线为 `43bc9eeb696c4b3c4c51351724d2fe91f0f8e8f3`，目标仓基线为 `23d8a098c0ca348b451cf19c7fa1bc127f7a80db`。实施前重新记录两边 HEAD 和未提交变更。

| 项目         | Aiao Media 当前值           | RxDB 当前值                  | 迁入处理                                                           |
| ------------ | --------------------------- | ---------------------------- | ------------------------------------------------------------------ |
| 包管理       | Bun，部署 CI 安装 Bun       | pnpm 10.34.6，Node >=26      | 统一目标仓工具链，重写 Bun/bunx 调用                               |
| Nx           | 23.2.0                      | 23.3.0                       | 使用目标仓配置，逐项核对推断后的 targets                           |
| Angular core | 22.1.4                      | 22.2.3                       | 跟随目标仓，独立验证编辑器、构建和账号行为                         |
| TypeScript   | 6.0.3                       | ~6.0.3                       | 保留应用的 decorator 等必要配置，适配 strict 与 project references |
| RxDB 系列    | npm 0.0.26                  | 工作区 0.0.28                | 验证兼容后消费工作区包，不同时装两套引擎                           |
| Supabase JS  | 2.112.3                     | ^2.117.3                     | 验证真实 Auth 会话恢复与退出行为                                   |
| requirements | 11 条应用故事，独立 US 编号 | US 编号已覆盖引擎与 domain   | 引入产品命名空间，保留数字与映射                                   |
| 发布范围     | Cloudflare 应用             | Nx release 选择 `packages/*` | 应用及其内部文件夹不进入 npm 发包范围                              |

上述版本差异来自两边 `package.json`；已通过 `nx show project ... --json` 读取两边 Angular 应用与源仓 e2e 的解析配置。检查时目标仓命令提示当前 shell 是 Node 22.14.0，实际执行迁移应先切到目标仓要求的 Node >=26。

源仓能力与证据参见[能力矩阵](../capability-matrix.md)、[验收记录](../verification-report.md)、[当前路线图](../roadmap.md)。这些记录不代表本次重新跑过完整套件。

## 3. 目录与项目映射

下面均为目标仓 `/Users/jimmy/Documents/aiao/rxdb` 内的规划路径。

```text
rxdb/
  requirements/                       # 原有平台、领域需求，保留编号与统计口径
  packages/                           # 通用、可发布能力
  apps/
    aiao-media/                       # 唯一应用项目，承载全部产品文件
      README.md                       # 产品定位、运行、发布入口
      AGENTS.md                       # 应用范围与开发约定
      project.json                    # 应用、需求、部署和本地服务的 Nx targets
      src/
        app/                          # 当前 Angular 页面与交互
        contracts/                    # 当前 apps/aiao-media/src/contracts，普通文件夹
        local-data/                   # 当前 apps/aiao-media/src/local-data，普通文件夹
      public/                         # 模板图片、编辑器资源、WASM 等
      requirements/                   # 完整迁入当前 requirements
      deploy/                         # Worker、Wrangler、部署说明
      infra/supabase/                 # 本地 Auth、SQL、Compose
      scripts/                        # 应用资产、验收和部署脚本
    aiao-media-e2e/                   # 当前 apps/aiao-media-e2e，独立 Nx 项目
```

| 当前 Nx 项目 | 目标归属                                        | 处理                                               |
| ------------ | ----------------------------------------------- | -------------------------------------------------- |
| `web`        | `aiao-media`                                    | 独立应用，保留现有 target 能力                     |
| `web-e2e`    | `aiao-media-e2e`                                | 保留本机与真实 Auth 两套验收                       |
| `contracts`  | `aiao-media` 的 `src/contracts/`                | 普通源码文件夹，既有测试归入应用测试               |
| `local-data` | `aiao-media` 的 `src/local-data/`               | 普通源码文件夹，既有测试归入应用测试               |
| `supabase`   | `aiao-media` 的 `infra/supabase/` 与 `scripts/` | 生命周期和探针通过应用的 `supabase-*` targets 编排 |

迁入后只有 `aiao-media`、`aiao-media-e2e` 两个 Nx 项目。`contracts`、`local-data` 和 `infra/supabase` 均不创建独立 `project.json`、包或 workspace 成员；它们的依赖、lint、类型检查与测试由应用统一承担。

原 `@aiao/media-contracts`、`@aiao/media-local-data` 引用改成应用内相对导入；如确需路径别名，只在应用编译与测试配置中定义。原有单测随源码迁入并由 `aiao-media:test` 统一发现，保留各自场景和覆盖率要求。

产品定位、负责人和运行入口维护在应用 README；目录映射使用本方案及应用配置，不额外引入产品清单文件。故事状态与完成比例仍只从 story YAML 推导。

所有脚本按迁入后的文件位置或显式参数定位目录，消除 `apps/aiao-media`、`dist/apps/aiao-media`、`../rxdb_ai` 等隐含路径。源仓根 `README.md` 迁入应用入口；其他受版本控制的资源、说明和历史资料逐项登记去向，不能只搬 `src`。

根级工作区配置只做必要的项目／依赖注册；GitHub Actions 在仓库固有的 `.github/workflows/` 保留调用入口，产品构建、验收和部署逻辑放在应用目录的脚本与 Nx targets 中。

## 4. requirements 隔离办法

### 4.1 目录、编号、统计、验收分别隔离

| 维度             | 平台／领域                    | Aiao Media                              |
| ---------------- | ----------------------------- | --------------------------------------- |
| 真相源目录       | `requirements/stories/`       | `apps/aiao-media/requirements/stories/` |
| Story ID         | 原有 `MEDIA-US-XXX` 保持      | `MEDIA-US-XXX`                          |
| Epic ID          | 原有 ID 保持                  | `MEDIA-EPIC-XXX`                        |
| 状态总览／路线图 | 原有文档只统计自己的故事      | 产品目录内独立派生                      |
| 关闭依据         | 包 API、adapter、领域组合验收 | 完整应用、真实浏览器与部署验收          |
| 发布             | npm 包版本与引擎发布门禁      | 应用构建标识与 Cloudflare 发布          |

例如原 `MEDIA-US-102` 改为 `MEDIA-US-102`，原 `MEDIA-EPIC-002` 改为 `MEDIA-EPIC-002`。同步更新文件名、frontmatter、dependsOn、正文链接、索引、验证材料中的有效引用；不重排数字。

迁移清单保留 `legacyId: aiao-media:US-102` 和一对一映射。当前 11 条故事及其 AC、状态、优先级、依赖、方案、设计图和验证证据完整保留；新增迁移故事另计，不把原故事批量改成 Done。

同样隔离产品本地 review 编号。Code scanning 使用仓库告警身份，不沿用另一仓库的告警 number 充当新仓身份；原扫描材料作为来源证据迁入并保留来源仓库。

### 4.2 跨层引用表达「能力依赖」，不复制故事

应用 story 的 `dependsOn` 继续表示应用内部硬前置；另用 `capabilities` 引用底层需求。跨层引用采用 `rxdb:US-XXX` 这种带作用域的标识，解析到原有文件，不给平台故事改号。

以下是迁入后的字段示例，`integration` 表示应用集成情况，不能从底层 Done 自动填为通过：

```yaml
id: MEDIA-US-302
legacyId: aiao-media:US-302
product: aiao-media
title: 多端草稿同步与冲突处理
status: In Progress
epic: MEDIA-EPIC-004
dependsOn: [MEDIA-US-201, MEDIA-US-301]
capabilities:
  - ref: rxdb:US-203
    integration: pending
```

这里 `rxdb:US-203` 是目标仓现有 Supabase adapter 故事。应用的账号绑定、产品 RLS、首次同步确认和双设备复制仍须在应用故事中验收。通用 storage 的 Done 同样不能代替原图保存、损坏备份拒绝等产品证据。

**底层已交付、应用已接线、产品已验收分别有证据。** 应用 Done 必须满足应用自己的 AC；若下层缺能力，再独立创建或引用平台／领域故事，由应用记录依赖关系。

### 4.3 保留轻量 Markdown 工作流

继续使用现有 story 五态、YAML 状态真相源、AC 表和文件内交付阶段；暂不引入需求数据库或额外管理服务。继承通用写作约定，产品补充规则放在自己的 `CONVENTIONS.md`。

迁入时对现有检查器做小范围适配：

1. 区分 `repositoryRoot`、`requirementsRoot`、产品 ID 前缀，链接以实际文件位置解析，实现文件以仓库根解析。
2. 产品检查器只统计自己的故事；平台检查器仍只统计原 `requirements/stories`，保持原计数。
3. 校验 ID／文件名／epic／内部依赖、跨层 ref 存在性、AC 状态、派生视图、设计资源和证据链接。
4. 检查当前代码／计划中的同级 `rxdb_ai` 链接，替换成仓内引用；冻结证据保留原来源说明。
5. CI 分别输出平台检查和产品检查。跨层引用检查不得把被引用的平台故事计入应用进度。

原源仓检查器硬编码了 `requirements/stories/*/US-*`；目标仓检查器也有原 US 编号和根目录约定。仅移动 Markdown 而不适配检查器，会漏掉故事或产生错误计数。

## 5. MVP 功能保全清单

以可达界面、业务实现和既有测试共同定义保全范围，不能单凭 README 删代码。迁移清单为每项记录原实现／测试、目标位置、复验结果和证据。

| 能力组         | 必须保留的用户行为                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 页面与交互     | `/`、`/create`、`/images`、`/providers`，现有响应式布局、提示与错误恢复                                                  |
| 灵感与编辑     | 12 个模板、搜索／分类／详情／来源、字段套用、Tiptap、撤销重做、草稿／画幅恢复、资源失败重试                              |
| 供应商         | 默认供应商、CRUD、默认选择、URL／模型校验、直连／主动代理、Key 仅内存或显式本机记住／替换／移除                          |
| 生成           | 单张 PNG、三个画幅、b64／HTTPS URL 结果、本机先记任务、未知结果锁定、多标签互斥、不自动重发或切代理                      |
| 作品与反馈     | 预览、原图信息、保存／精确下载、复用、删除、任务历史、无本机副本提示、复制反馈                                           |
| 本机可靠性     | RxDB／wa-sqlite／IndexedDB／OPFS、跨标签草稿冲突选择、保存与删除 journal、中断恢复、schema 守卫                          |
| 离线与数据管理 | 首次安装后的四路由离线冷启动、配额提示、持久存储申请、64 MiB 无 Key 备份、摘要校验、独立工作区恢复、失败不覆盖与中断续导 |
| 可选账号       | 公开配置启用注册／邮箱确认／登录／会话恢复／退出、离线待验证、跨标签退出、本机草稿保留                                   |
| 代理与部署     | Worker `/api/relay`、允许列表、按请求 Key、超时／大小边界、离线资产、CSP、产物检查和部署 dry-run                         |

现有 contracts/local-data 还包含未由当前图片页面完整开放的音视频、参考图和 notebook 代码。先整体迁入并保留既有测试，不在搬迁中清理，也不据此宣称音视频产品功能已交付。

## 6. 数据连续性与版本兼容

代码路径和 Nx 项目名可以改，用户数据标识单独受兼容约束。源码依据为 `LocalImageMvp`、`LocalMediaStore.open()` 及账号配置实现。

- 本机开发继续使用 `http://localhost:4300`，不因为目标仓 demo 在 4200 而改 origin。
- 保留 profile 的 `aiao-local-profile-v1`、上一工作区／导入暂存 key、schema 标记，以及任务、凭据和账号会话相关 key。
- 保留 `am1-<userId>` 数据库名、`aiao-media-v1-<userId>` OPFS 根、实体／表名、文件引用、锁与 BroadcastChannel 命名。
- 保留备份 format/version、数据校验和不带 Key 的契约；新增需求 ID 与目录名不改变业务数据。
- Worker 名仍为 `aiao-media`，正式域名目标仍为 `media.aiao.io`。已有 workers.dev origin 的数据依旧通过原站备份导出／新站导入迁移，代码入同仓不意味着跨 origin 数据可见。
- 保留离线资源 URL 的兼容性；修改构建目录后重新生成 manifest，验证旧 Service Worker 到新资源的更新，不直接复制旧构建缓存。
- Supabase Compose 的项目名 `aiao-media-supabase`、卷身份和端口保持，核对目标仓其他本地服务端口；迁路径不能触发重建空库或删除卷。

RxDB 0.0.26 → 工作区 0.0.28 必须单独验证。使用不含凭据的旧版测试数据，在同一 origin 下先运行旧构建写入供应商／草稿／作品，再切换新构建验证回读、下载、备份、并发和 journal 恢复；另测旧备份导入。若数据格式发生变化，应增加显式迁移与回退验收，不通过修改名称另开空库来绕过。

## 7. 工程边界与发布治理

应用及 e2e 项目加 `product:media` 标签，平台与可复用领域按层标记。使用 Nx 的 `@nx/enforce-module-boundaries`／`depConstraints` 禁止下层引用应用源码，并校验实际 project graph。`src/contracts/` 与 `src/local-data/` 的边界属于应用内部代码组织，不建立独立 Nx 节点。

目标仓当前该规则是 `warn`，约束为任意标签可互相依赖。要形成可执行边界，应对本次涉及的项目补齐标签，并将相应约束设为错误；不要同时对全仓做无关整改。

RxDB 仓库现有三框架对称约束需要明确适用范围：**通用库／领域 UI 的公共能力遵循原规则，Aiao Media 首期沿用 Angular 实际产品。** 迁入时在根规则中明确这项应用边界，并在产品 AGENTS 中细化，避免把迁移隐性扩大成 React/Vue 两个产品重写。

沿用底层改动独立评审、先合入再由应用消费的治理方式。应用迁移如发现 `packages/*` 缺陷，提取最小底层修复单独评审；应用业务与引擎改动分开提交和合入。

产品有独立 CI 和 Cloudflare 发布流程。测试使用 affected／项目依赖触发：产品代码和资料变化跑产品检查，所依赖的底层包变化也跑产品回归。平台原门禁继续执行；不能只用应用路径过滤漏掉引擎变更。

检查 Nx affected 的实际依赖边；`apps/aiao-media` 下私有源码、脚本、部署、需求和本地服务文件均须纳入相应 target inputs。对脚本中的动态加载和 WASM 复制补充显式依赖，避免缓存错误命中。e2e 显式依赖应用，应用的测试覆盖三个原项目的全部单测。

部署继续使用现有 Worker 身份；GitHub environment、secrets、vars 和部署令牌需在目标仓配置，源仓设置不会随文件迁移。切换后仅目标仓承担生产部署，防止两个仓库同时发布同一 Worker。产品发布不触发平台 npm 版本增长。

## 8. 实施顺序与验收门槛

| 阶段              | 工作                                                                                                                      | 可评审交付物／通过条件                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| M0 基线冻结       | 记录两个 HEAD、工作区改动、tracked 文件清单、功能／测试映射；运行源仓基线                                                 | 可复现的旧构建和脱敏测试数据；现有外部待验项原样列出                                          |
| M1 需求隔离       | 在应用目录内建产品入口与规则，导入完整需求／设计／证据，转换 ID 与链接，适配检查器                                        | 原 11 条一对一映射、状态保持；平台故事计数不变；两套检查均通过                                |
| M2 工程迁入       | 在 `codex/aiao-media-incubation` 分支将产品文件集中迁入应用目录，e2e 单独迁入；统一工具链与依赖，合并契约／数据层测试配置 | 两个 Nx 项目可识别、无循环依赖，原有单测全部纳入，lint／typecheck／构建通过；不同时做业务重构 |
| M3 行为与兼容回归 | 保留并运行全部既有套件，增加真正需要的旧数据与升级用例                                                                    | 每项 MVP 映射有目标证据，旧数据连续性与两种依赖版本差异已解释                                 |
| M4 发布交接       | 配置目标仓部署环境、预览／dry-run／正式烟测，切换唯一发布入口                                                             | 路由／WASM／CSP／离线更新正常，旧构建回退可用，源仓保留为历史与回退来源                       |

M1、M2 中的改动以可运行的完整结果评审，业务行为不变。平台修复如有需要走独立变更；当前 0.0.26 与目标 0.0.28 的兼容性不预先假定通过。

迁入后的主要命令规划如下，需待项目配置落地后执行：

```sh
pnpm nx run aiao-media:serve
pnpm nx run-many -t lint typecheck test -p aiao-media
pnpm nx run-many -t lint typecheck -p aiao-media-e2e
pnpm nx run aiao-media:relay-test
pnpm nx run aiao-media:auth-config-test
pnpm nx run aiao-media:requirements-check
pnpm nx run aiao-media-e2e:local-first-e2e
pnpm nx run aiao-media:supabase-test
pnpm nx run aiao-media:supabase-e2e
pnpm nx run aiao-media:deploy-check
```

本地服务的 `supabase-init`／`supabase-up`／`supabase-migrate`／`supabase-down`／`supabase-serve` 同样挂在 `aiao-media`；真实 Auth 浏览器用例保留在 `aiao-media-e2e`，由应用的 `supabase-e2e` target 编排服务前置与执行。

常规图片 fixture 与真实本地 Supabase 浏览器套件继续顺序运行。当前验收记录列出 27 项本机／fixture 场景、3 项真实本地 Auth 场景及 4 项 relay 测试；实施时以实际发现的用例与结果报告为准，不能通过删测试维持数量。

正式供应商出图、桌面真实中文 IME、正式域名及历史数据／正式回退的剩余验收项保留。fixture、真实本地 Auth、dry-run 和正式发布的证据边界继续分别记录；搬迁通过不自动关闭这些产品 AC。

## 9. 完成定义与回退

迁移完成必须同时满足：旧 tracked 文件有可核对去向；现有可达功能逐项通过；需求与证据完整且两边统计隔离；工作区包兼容与旧数据升级已验证；独立构建／部署链路可用；没有双仓同时生产部署。

保留旧仓和旧构建作为回退来源，迁移通过后再把旧仓入口改为指向新位置。目录移动不删除浏览器数据或 Docker 卷。回退先恢复上一应用构建与离线资源；若涉及不可逆的数据升级，则先满足备份／显式恢复方案再发布，不能把代码回退当作数据回退。

代码导入提交记录源仓 SHA 和文件映射，旧仓保留完整历史；本方案不要求改写两仓 Git 历史，也不把 `.git`、`node_modules`、缓存、构建目录或本地秘密复制进目标仓。私有运行配置按新路径在本机重新配置，Docker 持久卷独立保留。

迁入后的孵化顺序沿用当前产品路线：先维持图片闭环并完成桌面交付，随后推进已有账号绑定、最小同步与业务后台计划；只有经真实应用验证的共性能力才向领域／平台下沉。

## 参考

- [当前需求入口](../README.md)、[决策与执行条件](../decisions.md)。
- [当前界面实现](../../src/app/local-image-mvp.ts)中的 `LocalImageMvp`，负责四页面、生成、供应商、备份与会话入口。
- [当前数据实现](../../src/local-data/browser-media.ts)中的 `LocalMediaStore`，负责本机存储标识、锁与恢复。
- [当前需求检查器](../../scripts/check-requirements.mjs)中的 `auditRequirements`，负责应用需求结构和相对链接检查。
- [Nx 项目依赖规则](https://nx.dev/docs/kb/project-dependency-rules)、[多维标签约束](https://nx.dev/docs/guides/enforce-module-boundaries/tag-multiple-dimensions)：已通过 Context7 查证标签与依赖约束机制；目标仓实际配置仍须落地与验证。
