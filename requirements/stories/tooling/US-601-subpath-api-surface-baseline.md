---
id: US-601
title: 子路径入口纳入 API 表面基线
status: Backlog
priority: Medium
epic: epic-007-public-api-gates
created: 2026-08-15
updated: 2026-08-15
tags: [tooling, release-gate, api-baseline, exports]
---

<!--
INVEST 检查清单:
- [x] Independent: 只动 scripts/audit/ 与基线文件，不依赖任何 story 的产品代码
- [x] Negotiable: 「源入口声明放哪」与「基线文件格式」两处在 plan 阶段二选一（见技术笔记）
- [x] Valuable: 12 个已承诺为公开 API 的入口从「只能人工审查」变成「破坏性变更拦 CI」
- [x] Estimable: 入口数量已枚举清楚，TS 解析逻辑已存在，工作量集中在入口发现与基线格式
- [x] Small: 不扩大扫描粒度（仍是名称 + kind），不碰 dist 契约、类型契约测试与文档产出
- [x] Testable: 每条 AC 都能用 scripts/audit/__fixtures__/ 下的假包在 node:test 里验证
-->

# 用户故事：子路径入口纳入 API 表面基线

## 作为/我想要/以便

**作为** 依赖 `@aiao/*` 子路径入口（`@aiao/rxdb-adapter-wa-sqlite/client` 等）的使用者
**我想要** 这些入口的导出表面和主入口一样被 API 基线守护
**以便** 子路径上的破坏性变更在 PR 阶段就被拦下，而不是升级次版本后在我的构建里炸开

## 来源与边界

本故事认领 [US-209](../adapter/US-209-miniprogram-adapter.md) AC#8 留下的**后半段**。

US-209 AC#8 问的是「`@aiao/rxdb-adapter-miniprogram/runtime` 的 11 个导出要不要进基线」，
决策是**记录为已知不覆盖**，并顺手把「清单本身」纳入门禁：
[api-surface.mjs](../../../scripts/audit/api-surface.mjs) 的 `KNOWN_UNCOVERED_SUBPATHS` 成为清单真相源，
[subpath-inventory.mjs](../../../scripts/audit/subpath-inventory.mjs) 在每次 `--check` 时逐包核对 `exports`——
新增或删除子路径而不同步清单即 CI 红。那条 AC 已经关闭，本故事不重做它。

留下的差额是：**清单受保护，清单里那些入口的导出表面不受保护**。
按 [versioning-policy.md](../../versioning-policy.md) 第 2 节，子路径入口属于公开 API；
按 `api-surface.mjs` 的 v1 边界，扫描只解析主入口 `src/index.ts`。
两句话同时成立，就等于对外承诺了一份门禁抓不到的稳定性。本故事负责消掉这个差额。

### In Scope

- `api-surface.mjs` 解析每个公开包 `exports` 声明的子路径入口，产出与主入口同粒度（名称 + `type`/`value`/`both`）的导出表面
- 子路径入口 → **源文件**的解析路径收敛到单一真相源（当前散在三处且都不全，见技术笔记）
- 基线文件格式扩展到多入口，并一次性重写 `requirements/api-baseline/` 下的全部快照
- 无导出表面的资产入口（`./assets/wa-sqlite.cjs` / `./assets/wa-sqlite.wasm`）**白名单式**跳过并说明去向，不静默按零导出处理
- `KNOWN_UNCOVERED_SUBPATHS` 退化为「无导出表面的资产入口」白名单；`auditSubpathInventory()` 的清单核对保留
- 文档三处同步收口：[versioning-policy.md](../../versioning-policy.md) 第 4 节、
  [website/docs/versioning.md](../../../website/docs/versioning.md) 的警示块、
  [capability-matrix.md](../../capability-matrix.md) 的「已知的需求覆盖缺口」
- 新增逻辑的 `scripts/**/*.spec.mjs` 单测，全部基于 `__fixtures__/` 下的假包，不断言真实 `packages/` 内容

### Out of Scope

- `@aiao/rxdb-test` 的 5 个子路径——整包已由 `EXCLUDED` 排除，非产品 API
- 把扫描粒度从「名称 + kind」升级为完整签名快照；分级判定（removed/kind changed = 破坏性，added = 漂移）也保持不变
- `dist` 产物层面的校验，由 `verify-public-contract.mjs` 与各包 `public-contract/` 负责
- 编译期类型契约测试（`packages/rxdb/src/__tests__/contracts/`）
- 把子路径纳入 TypeDoc / `package-api-docs.mjs` 的文档产出——可另立故事
- 为了让扫描器好写而增删任何一个子路径入口；`exports` 的形状由包的实际需要决定
- `apps/` / `modules/` / `examples/` 下的项目

## 验收标准

| #   | 前置条件                                                                                     | 操作                                         | 预期结果                                                                                                                 | 状态 |
| --- | -------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---- |
| 1   | 12 个子路径入口中有 4 个在 `tsconfig.base.json` paths 与 `@aiao/source` 条件里都查不到源入口 | 补齐声明后运行 `--update` 再 `--check`       | 每个有导出表面的子路径入口都能解析到 `.ts` 源文件；源入口声明只存在于一处真相源，不再散落三处                            | ⬜   |
| 2   | 基线已建立                                                                                   | 删除某子路径入口导出的一个符号，跑 `--check` | 以**破坏性**失败，输出指明包名、子路径与符号名，退出码非 0；与主入口用同一套分级                                         | ⬜   |
| 3   | 基线已建立                                                                                   | 只向某子路径入口新增一个导出，跑 `--check`   | 报**基线漂移**并提示 `--update`，不要求迁移说明                                                                          | ⬜   |
| 4   | 某子路径的源入口无法解析（路径写错 / 声明缺失）                                              | 跑 `--check`                                 | **硬失败**并报出包名与子路径；不得降级为「零导出」——否则整个入口被删会被记成「表面无变化」                               | ⬜   |
| 5   | 子路径指向二进制 / CJS 资产（`./assets/wa-sqlite.wasm`）                                     | 跑 `--check`                                 | 显式跳过并说明由 [wa-sqlite-integrity.mjs](../../../scripts/audit/wa-sqlite-integrity.mjs) 的 SHA-256 守护；不报解析失败 | ⬜   |
| 6   | 新增一个未登记在资产白名单、且无源入口声明的子路径入口                                       | 跑 `--check`                                 | 仍然失败：清单核对与表面扫描任一维度都不允许静默通过                                                                     | ⬜   |
| 7   | 本故事已交付                                                                                 | 阅读维护者与对外两份版本策略文档             | 「已知不覆盖」措辞已收敛到仅剩资产入口，两份文档一致，`website/docs/versioning.md` 不再提示使用者自行验证子路径导出      | ⬜   |
| 8   | CI                                                                                           | 跑 `pnpm test-scripts`                       | 入口发现、资产跳过、解析失败三类分支都有 `__fixtures__/` 驱动的单测；用例不依赖真实 `packages/` 的当前形状               | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

> AC#4 是本故事最容易写漏的一条。`extractExports()` 对主入口已经做到「别名解析不了就抛」，
> 但子路径多了一层「入口文件本身找不到」的失败模式；把它吞掉会让门禁在最该报警时最安静。
>
> AC#7 是本故事的关闭判据之一：门禁扩了而文档没收口，等于把一个已解决的问题继续写成风险。

## 技术笔记

### 源入口声明散在三处，且没有一处是全的

扫描器基于**源码**而非 dist（无需先构建，且 ng-packagr 包与普通包的产物布局不同）。
但 12 个子路径入口里，10 个的 `exports` 只指向 `./dist/*.js`，源入口得另找。实测分布：

| 声明位置                                                             | 覆盖的子路径入口                                                                                                                                                 | 数量 |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `tsconfig.base.json` › `paths`                                       | `rxdb-adapter-encrypted/testing`、`rxdb-adapter-pglite/testing`、`rxdb-adapter-sqlite-core/testing`、`rxdb-adapter-wa-sqlite/client`、`rxdb-plugin-graph/sqlite` | 5    |
| `package.json` › `exports` › `@aiao/source`                          | `rxdb-adapter-wa-sqlite/client`（与上表重复）、`rxdb-adapter-miniprogram/runtime`                                                                                | 2    |
| 只在 vite 配置里（`build.lib.entry` 字典 / `rolldownOptions.input`） | `rxdb-adapter-desktop/host`、`rxdb-client-generator/{cli,vite}`、`rxdb-plugin-graph/generator`                                                                   | 4    |
| 无导出表面（资产）                                                   | `rxdb-adapter-miniprogram/assets/wa-sqlite.{cjs,wasm}`                                                                                                           | 2    |

去重后 6 个有声明、4 个只能从构建配置里推。**不要去解析 vite 配置**——那是 TS 模块、含条件分支，
解析它等于把门禁的正确性押在构建脚本的写法上。

两个候选真相源：

| 方案                             | 做法                                                   | 主要风险                                                                                         |
| -------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `exports` 的 `@aiao/source` 条件 | 给 4 个缺失入口补上该条件，扫描器直接读 `package.json` | 需要确认补的条件不改变运行时解析（该条件已在 `tsconfig.base.json` 的 `customConditions` 中启用） |
| `tsconfig.base.json` › `paths`   | 给 4 个缺失入口补上 path 映射，扫描器读 paths          | paths 与 `exports` 是两份清单，仍可能各自漂移；且 paths 已被 `rxdb-test` 用来指向 `dist`         |

推荐前者：`subpath-inventory.mjs` 已经在读 `package.json` 的 `exports`，声明与入口同处一地不会分家；
且 `--check` 天然能断言「有导出表面的入口必须有 `@aiao/source`」，把漂移拦在源头。
无论选哪个，**先补齐 4 个缺失声明**是第一步，AC#1 就是这一步的验收。

### 基线文件格式

| 方案         | 做法                                                                            | 主要风险                                                     |
| ------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 单文件多入口 | `<pkg>.json` 由 `{ exports: [] }` 扩为 `{ entries: { ".": [], "./host": [] } }` | 需一次性重写全部基线文件；旧格式要么迁移要么兼容读取         |
| 每入口一文件 | 新增 `<pkg>__host.json`                                                         | 文件数膨胀、目录可读性下降；子路径改名要手工删文件，易留孤儿 |

推荐单文件多入口，且**不做旧格式兼容读取**——留一条兼容分支就等于允许一半的包停在旧格式。
一次 `--update` 全量重写，在 PR 描述里说明格式变更即可；基线文件是仓库内部产物，不对外发布。

### 与既有清单核对的关系

`auditSubpathInventory()` 回答「有没有新入口溜进来」，基线回答「入口里有什么」。两者不互相取代：
即使表面扫描落地，新增一个**资产**入口仍然只能靠清单核对捕获。因此 `KNOWN_UNCOVERED_SUBPATHS`
不删除，而是把语义从「已知不覆盖的公开入口」收窄为「无导出表面的资产入口白名单」，
常量名与 TSDoc 需同步改掉，避免留下一个名字说 uncovered、实际已 covered 的常量。

### 工作量落点

`extractExports()` 已经是按文件解析，换个入口文件就能复用；`diff()` 与分级判定完全不用动。
成本集中在：入口枚举与源入口解析（含 AC#4 的失败路径）、基线格式迁移与全量重写、
以及三处文档的收口。TS 解析本身不是难点。

## 实现文件

- `scripts/audit/api-surface.mjs` — 入口枚举、子路径解析、基线格式、输出分级
- `scripts/audit/subpath-inventory.mjs` — 清单核对语义收窄为资产白名单
- `scripts/audit/subpath-inventory.spec.mjs` — 随语义收窄更新
- `scripts/audit/__fixtures__/` — 新增「有源入口 / 资产入口 / 解析失败」三类假包
- `requirements/api-baseline/*.json` — 格式扩展后全量重写
- `packages/*/package.json` 或 `tsconfig.base.json` — 补齐 4 个缺失的源入口声明（二选一，见技术笔记）
- `requirements/versioning-policy.md`、`website/docs/versioning.md`、`requirements/capability-matrix.md` — 文档收口

## References

- [US-209 微信小程序 wa-sqlite 适配器](../adapter/US-209-miniprogram-adapter.md) — AC#8 的决策产物，本故事的来源
- [版本与 API 稳定性策略](../../versioning-policy.md) — 第 2 节公开 API 范围、第 4 节守护机制
- [website/docs/versioning.md](../../../website/docs/versioning.md) — 对外的同名警示块
- [api-surface.mjs](../../../scripts/audit/api-surface.mjs) — v1 边界与 `KNOWN_UNCOVERED_SUBPATHS`
