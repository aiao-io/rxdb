# 版本与 API 稳定性策略

> 本文是维护者视角的**真相源**。面向用户的对外呈现见 [website/docs/versioning.md](../website/docs/versioning.md)，两者内容应保持一致。

## 1. semver 约定

遵循 [semver 2.0](https://semver.org/)。当前处于 `0.x`（`0.0.21`），次版本即可含破坏性变更，公开 API 尚未冻结。1.0 发布即进入稳定维护。

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

- 每个公开包在 `requirements/api-baseline/<pkg>.json` 记录排序后的导出符号表面。
- CI 运行 `node scripts/audit/api-surface.mjs --check`；出现未声明的表面变化即失败。
- 预期内的变更：`node scripts/audit/api-surface.mjs --update` 重新生成基线，PR 标注是否 breaking，必要时补迁移说明。

> **已知不覆盖：子路径入口。** 基线只扫主入口 `src/index.ts`，`exports` 里声明的子路径
> （`@aiao/rxdb-adapter-miniprogram/runtime`、`@aiao/rxdb-adapter-wa-sqlite/client` 等，
> 完整清单见 [api-surface.mjs](../scripts/audit/api-surface.mjs) 的 v1 边界注释）**属于第 2 节的公开 API，
> 但不受本门禁保护**——改动这些子路径的导出必须在 PR 描述里人工声明破坏性。
> 扩展扫描器覆盖子路径不在 [US-209](stories/adapter/US-209-miniprogram-adapter.md) 范围内。

## 5. 版本级别决策

- 提交遵循 [Conventional Commits](https://www.conventionalcommits.org/)：`fix:`→补丁，`feat:`→次版本，`feat!:` / `BREAKING CHANGE:`→主版本。
- 发布由 Nx Release 驱动（`nx.json` › `release`），`release.version.conventionalCommits` 按提交类型推断级别。
- API 基线出现破坏性 diff 但提交未标注 breaking → 以基线检查为准阻止发布。

涉及系统 schema 或 change codec 的发布还必须通过 `requirements/migration-release.json`
清单和 `pnpm nx run @aiao/source:migration-release-gate`。迁移版本需要已发布且可追溯的
桥接 tag，以及已启用的旧 bundle 隔离策略；缺失时发布任务 fail-closed。

## 6. 覆盖率与质量门禁（关联）

见 [.agents/skills/coverage-gate](../.agents/skills/coverage-gate/SKILL.md) 与 `scripts/audit/coverage-check.mjs`：硬门槛是固定阈值（核心包四指标 ≥90%、其余 ≥80%），`coverage-baseline.json` 记录每包上次实测值，仅用于「比上次低了」的非阻塞提示。
