# 版本与 API 稳定性策略

> 本文是维护者视角的**真相源**。面向用户的对外呈现见 [website/docs/versioning.md](../website/docs/versioning.md)，两者内容应保持一致。

## 1. semver 约定

遵循 [semver 2.0](https://semver.org/)。当前处于 `0.x`（公开包版本 `0.0.25`），次版本即可含破坏性变更，公开 API 尚未冻结。1.0 发布即进入稳定维护。

所有 `@aiao/*` 采用 Nx **fixed release group**，同步版本号（`nx.json` › `release.projects: ["packages/*"]`）。

## 2. 公开 API 范围

「公开 API」= 各包 `src/index.ts`（及声明的子路径入口）导出的、未标注 `@internal` 的符号。

**排除**（可随时变更，不算破坏性）：

- 未从入口导出的内部实现
- `@internal` / `@alpha` / `@experimental` 符号
- `dist` 内部文件布局与打包产物
- 测试夹具包 `@aiao/rxdb-test`（非产品 API，故也不纳入 TypeDoc 与 API 基线）

框架公开 API 要求 **Angular / React / Vue 三端对称**（AGENTS.md 铁律）。

## 3. 废弃周期

1. 计划移除的符号先标 `@deprecated`，TSDoc 给出替代方案。
2. 至少保留一个次版本（1.0 后为一个主版本周期）。
3. 移除只在破坏性版本进行，并在 `website/docs/migration/v1.md` 记录。

## 4. API 表面守护机制

分三层，从弱到强：

| 层             | 机制                                                                                                               | 位置                                                      |
| :------------- | :----------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------- |
| 编译期类型契约 | `public-type-compatibility` 类型测试                                                                               | `packages/rxdb/src/__tests__/contracts/`                  |
| 发布产物契约   | `public-contract` 消费者 + `verify-public-contract.mjs`（检测 `.d.ts` 工作区路径泄漏、`.ts` 源码引用、导出名清单） | 各包 `public-contract/` + `scripts/`，接入 `build` target |
| 导出表面基线   | `scripts/audit/api-surface.mjs` 对比 `requirements/api-baseline/<pkg>.json`                                        | CI `--check`                                              |

### 基线工作流

- 每个公开包在 `requirements/api-baseline/<pkg>.json` 记录排序后的导出符号表面，
  格式为 `{ entries: { ".": [...], "./testing": [...] } }` —— **主入口与每个子路径入口各占一条**。
- CI 运行 `node scripts/audit/api-surface.mjs --check`；出现未声明的表面变化即失败。
- 预期内的变更：`node scripts/audit/api-surface.mjs --update` 重新生成基线，PR 标注是否 breaking，必要时补迁移说明。
- 分级对子路径与主入口一致：**入口整体消失**或符号 removed / kind changed = 破坏性（需迁移说明）；
  仅新增入口或新增符号 = 基线漂移（跑 `--update` 即可）。

### 子路径入口的源入口声明

入口 → 源文件的**唯一真相源**是 `package.json` › `exports` › `@aiao/source`（[US-601](stories/tooling/US-601-subpath-api-surface-baseline.md)）。
它是构建期条件——Node 的运行时解析器不认识这个条件名，指向 `.ts` 不影响 `types` / `import` / `default`
仍落在可执行的 dist 产物上（由 [package-runtime-conditions.mjs](../scripts/audit/package-runtime-conditions.mjs) 的白名单守护）。

新增子路径入口时必须同时补上该条件，否则 `--check` 与 `--update` **两种模式都硬失败**：
`--update` 若带着解析不了的入口继续写基线，等于把一个公开入口静默从快照里删掉。
源入口写错路径同样硬失败，不降级为「零导出」——否则整个入口被删会被记成「表面无变化」。

> **唯一的例外：无导出表面的资产入口。** `@aiao/rxdb-adapter-miniprogram/assets/wa-sqlite.{cjs,wasm}`
> 是二进制 / CJS 文件，没有 TS 源可解析，登记在 [api-surface.mjs](../scripts/audit/api-surface.mjs) 的
> `ASSET_SUBPATHS` 白名单里显式跳过，内容改由 [wa-sqlite-integrity.mjs](../scripts/audit/wa-sqlite-integrity.mjs)
> 的 SHA-256 固定守护。白名单双向核对：登记了包里已不存在的入口、或登记的包已退出扫描范围，同样门禁红。
>
> `@aiao/rxdb-test` 的 5 个子路径不在此列——整包已排除，非产品 API。
> 对外呈现见 [website/docs/versioning.md](../website/docs/versioning.md)。

## 5. 版本级别决策

- 提交遵循 [Conventional Commits](https://www.conventionalcommits.org/)：`fix:`→补丁，`feat:`→次版本，`feat!:` / `BREAKING CHANGE:`→主版本。
- 发布由 Nx Release 驱动（`nx.json` › `release`），`release.version.conventionalCommits` 按提交类型推断级别。
- API 基线出现破坏性 diff 但提交未标注 breaking → 以基线检查为准阻止发布。

涉及系统 schema 或 change codec 的发布还必须通过 `requirements/migration-release.json`
清单和 `pnpm nx run @aiao/source:migration-release-gate`。迁移版本需要已发布且可追溯的
桥接 tag，以及已启用的旧 bundle 隔离策略；缺失时发布任务 fail-closed。

## 6. 实验性层级（1.0 冻结范围之外）

31 个包同步发版，但**不是每个入口都进 1.0 的兼容承诺**。下列能力标为实验性：破坏性变更不受第 3 节废弃周期约束，
只需在 changelog 与迁移指南注明。1.0 发布前必须把这份清单与 TSDoc `@experimental` 标注、各包 README 对齐。

| 能力                                                       | 为什么是实验性                                                                                       |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `@aiao/rxdb-adapter-miniprogram` 整包                      | 仅微信逻辑层、强制单连接、不保证崩溃恢复（US-209 的长期口径）                                        |
| `@aiao/rxdb-adapter-http` 的 `changeFeed`（SSE 变更通知）  | 缺省关闭；协议只有参考后端一个实现                                                                   |
| `@aiao/rxdb-plugin-search` 在 `wa-sqlite` / 小程序上的 FTS | backend-registry 登记为 `unverified`，抛 `SearchUnsupportedAdapterError`，转正要重编 wasm 或真机实测 |
| `@aiao/rxdb` 的 `QueryCacheRepository` 直接实例化          | `@experimental`，只有 `SyncType.QueryCache` 经 `getRepository` 的间接路径是稳定面                    |

不在表内的公开入口默认进入 1.0 冻结范围。新增实验性入口必须同时改本表、对外呈现（[website/docs/versioning.md](../website/docs/versioning.md)）与 TSDoc。

## 7. 覆盖率与质量门禁（关联）

见 [.agents/skills/coverage-gate](../.agents/skills/coverage-gate/SKILL.md) 与 `scripts/audit/coverage-check.mjs`：硬门槛是固定阈值（核心包四指标 ≥90%、其余 ≥80%），`coverage-baseline.json` 记录每包上次实测值，仅用于「比上次低了」的非阻塞提示。
