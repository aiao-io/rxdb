# 发布计划

> 本文只维护当前发布基线、下一次发布的前置与操作顺序。版本规则见 [versioning-policy](versioning-policy.md)，开发排期见 [roadmap](roadmap.md)。

## 现在的处境（一屏）

- 发布由 owner 手工执行，发布时间由 owner 决定；没有自动发布 workflow。
- 已发布基线为 `v0.0.28`（`23d8a098`），系统 schema 为 **7**；当前源码 schema 为 **8**，codec 均为 **1**。
- 下一次发布必须是 **schema 7→8 的迁移发布**，桥接锚点为 `v0.0.28`。版本号与旧 bundle 隔离策略在发布前定案。
- `migration-release.json` 保留已发布 `0.0.28` 的原始声明（`normal`、升级位 false）；产物的 3→7 升级已在 CHANGELOG 追认。历史清单不追改为下一次发布。
- 当前清单检查通过只说明历史声明可读取，不说明下一次迁移发布已就绪。开发、测试、合入不受发布时点阻塞。
- 发布前必须跑绿 `pnpm test-all`；把结果绑定到待发布提交和产物的自动前置由 [US-603](stories/tooling/US-603-manual-release-preflight.md) 承担，当前已接入两个手工入口，待受控 registry 验收。

基线可用 `git show v0.0.28:packages/rxdb/src/system/migration.ts`、当前 `RXDB_SYSTEM_SCHEMA_VERSION` 与 `RXDB_CHANGE_CODEC_VERSION` 复核；版本产物清单以对应 tag 与 registry 为准。

## 开项：版本漂移

| 开项                          | 当前事实与后续动作                                                                                         |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `@aiao/rxdb-model@0.0.26`     | 该产物引用了其钉死依赖的 core 0.0.26 不具备的导出。owner 后续决定是否 deprecate；后续版本不修复旧版本本身  |
| GitHub Release `v0.0.26` 正文 | CHANGELOG 已补录 US-018 首发的 default factory 破坏性语义，Release 正文仍需同步                            |
| Angular peer 范围             | 7 个 Angular 包的 `@angular/*` peer 为精确版本；下次统一发版前决定兼容范围，不能把工作区版本相同当消费兼容 |

旧产物无法靠修改源码修复。不要重打历史 tag，也不要把“新版本覆盖”写成原坏版本已经修复。

## 开项：迁移发布须承接的发布说明

### ① 有一类库「未认领能力守卫」接不住

抽包前在开发机创建过 epic-006 系统表、却没有能力水位行的库，无法由能力守卫识别。该开发态数据库要求删库重建，已有发布说明仍须保留；不为未发布开发态表形态单开迁移。

### ② 三个框架绑定包的破坏性变更

`useWorkingTree` / `WorkingTreeResource` 从 `@aiao/rxdb-plugin-working-tree-{angular,react,vue}` 导入。它们在旧框架根包中从未正式发布，仍需为跟随 main 的消费者提供 import 迁移说明。

### ③ 已知影响：系统 schema 号抬升之后，旧客户端打不开升级过的库

`assertSupportedRxDBSystemVersions()` 在 `stored > supported` 时抛 `UnsupportedRxDBSystemVersionError`，早于迁移执行。
下一次说明明确写 **7→8**：新客户端可以升级旧库，旧客户端不能重新打开已升到 8 的库，用户须升级客户端。
迁移说明还要覆盖 table-set 参数等公开 API 变化，清单以 `requirements/api-baseline/` 对 `v0.0.28` 的差异为准。

## 下一次发布：迁移发布（schema 7→8）

| 字段                                          | 要求                                                                                                  |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `release.kind`                                | `migration`                                                                                           |
| `release.version`                             | 与包版本、`v<version>` tag 一致；先 dry-run 并核对 registry，再由 owner 确定最终版本                  |
| `release.systemSchemaUpgrade`                 | `true`（7→8）                                                                                         |
| `release.changeCodecUpgrade`                  | `false`（codec 仍为 1）                                                                               |
| `bridge.tag` / `bridge.version`               | `v0.0.28` / `0.0.28`，tag 存在且为待发布提交的祖先                                                    |
| `oldBundlePolicy.strategy`                    | `force-update` / `cache-invalidation` / `server-version` / `database-namespace` 四选一，待 owner 定案 |
| `oldBundlePolicy.minimumVersion` / `enforced` | 不低于 `0.0.28`；`true`                                                                               |
| `release.protocolVersion`                     | `1`                                                                                                   |

版本以 `pnpm nx release version --dry-run` 的实际输出和已发布库存核对，不能复制旧发布的计算结果。
`preVersionCommand` 会先构建；没有输出版本号时，不能把构建失败误判为没有可发布变更。

CHANGELOG 从 `v0.0.28` 起量。自动生成结果须人工复核：规范提交标题不保证所有破坏性 API 变化都已被正确分类；迁移页见
[table-set-parameter](../website/docs/migration/table-set-parameter.md) 与 CHANGELOG 的 Unreleased 部分。

## 包组合知识随发布更新（US-602）

投递范围由 `requirements/package-graph.json` 的 `release` 显式登记；当前为 **v0.0.28**。工作区新增能力只属于 development，不能自动当作已发布能力。

1. bump 包版本后运行 `pnpm nx run @aiao/source:audit-package-graph --args=--update`，把生成物与 bump 一起提交。
2. 推 tag、完成 npm 发布并核对产物后，再把 `release` 切到新 tag、重新生成，单独评审该登记变更。生成检查不自动判断是否选了最新发布。
3. 删除仍在登记发布中的包时，先标 `retired: true` 保留投递边界；新登记已不含该包时，再删事实源条目。

生成物包括 `requirements/generated/package-knowledge.*` 与 `packages/rxdb/skills/aiao-rxdb/SKILL.md`；站点只读取提交的生成物。

## 桥接锚点定案

当前下一次迁移的锚点是 **v0.0.28**。历史 `v0.0.26`（schema 3）是 main 祖先，历史 `v0.0.25` 已脱离发布主线；均不得移动或重打。
桥接版本不得抬系统 schema 或 change codec，且必须是迁移发布提交的祖先。历史桥接的分支操作由 Git 历史回答，不作为本次发布步骤重复执行。

### 约束 12 修订：破坏性改动如实声明

桥接区间可以包含此前已合入的破坏性 API 变化，但 CHANGELOG 必须逐条声明并链接迁移页；“只用于桥接”不是省略 breaking 说明的理由。
硬不变量仍是桥接不抬系统版本常量。已发布条目留在 CHANGELOG，当前执行清单只覆盖下一次发布。

## 执行顺序

1. owner 确定版本号、旧 bundle 策略与最低版本，确认隔离措施实际可用。
2. 更新包版本、`RXDB_VERSION`、lockfile、迁移清单和 CHANGELOG；重新生成包组合知识并提交最终待发布内容。
3. 在最终待发布提交上跑绿 `pnpm test-all`，完成受支持入口的消费者检查。之后源码、清单或产物变化都使旧证据失效，需要相应复验。
4. 对最终待发布提交运行下方门禁。核对 tag、包版本、系统常量、发布清单和 tarball 的一致性，确认工作区干净。
5. 按 owner 选择的分支/tag 操作发布经核对的产物；从发布 tag 的干净检出完成发布，不从其他分支借构建产物。
6. registry 可读后逐包核对版本与产物，再按上一节切换发布登记。npm 网页验证和传播延迟属于发布操作，不通过试探性 tag 解决。

```bash
pnpm nx run @aiao/source:migration-release-gate-test
pnpm nx run @aiao/source:migration-release-gate --args="--release-tag=v<版本>"
pnpm nx run @aiao/source:audit-package-graph
```

### 门禁 tag 钩子的状态

PR CI 对 `migration` 清单执行 `bridgeTagExists` / `bridgeTagIsAncestor` / `bridgeTagSupportsProtocol` / `bridgeTagVersionConstants`；
checkout 必须取 tag。`bridgeTagSupportsProtocol` 只检查必要文件存在，不独立证明迁移语义正确。
候选 normal/bridge 也会对比上一发布与源码常量，阻止把系统升级声明成普通发布。

当前清单仍属于已经发布的 normal 0.0.28，`pnpm nx run @aiao/source:migration-release-gate` 在 schema 8 源码上通过是预期行为；
下一次清单改为 migration 后，必须对真实的 **v0.0.28→待发布版本** 组合重新验证。

### 迁移发布的关闭条件

本节承接 US-305 的实际发布验收，当前尚未完成；代码 AC 关闭不等于发布动作已经发生。

| 条件                                                               | 状态                                                                  |
| ------------------------------------------------------------------ | --------------------------------------------------------------------- |
| v0.0.28 为当前提交祖先、schema 7 / codec 1                         | ✅ 可用 git tag 树与 `git merge-base --is-ancestor v0.0.28 HEAD` 复核 |
| 新清单为 migration，桥接字段指向 v0.0.28，在最终发布提交上门禁通过 | ⬜ 待实际迁移发布                                                     |
| 旧 bundle 策略实际执行，minimumVersion≥0.0.28、enforced=true       | ⬜ 待 owner 定案及验证                                                |
| 从 schema 7 的真实旧库升级到 8，失败恢复及旧客户端拒绝符合契约     | ⬜ 待实际迁移发布验收                                                 |

证据应记录实际 tag、提交、命令与结果；不能复用 v0.0.26 的历史正例替代本次验收。

### 线 A 执行记录（v0.0.26）

本标题仅保留历史引用入口。当前发布不重跑线 A；其分支/tag/产物记录见 `git show 7bb16a90:requirements/release-plan.md`，当前锚点与操作以本文上方为准。
