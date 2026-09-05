# 版本与 API 稳定性策略

本页定义 Aiao 各包的版本约定、公开 API 范围、废弃周期与破坏性变更审查流程。它同时是仓库内 [`requirements/versioning-policy.md`](https://github.com/aiao-io/rxdb/blob/main/requirements/versioning-policy.md) 的对外呈现。

## semver 约定

Aiao 遵循 [semver 2.0](https://semver.org/lang/zh-CN/)：`主版本.次版本.补丁`。

- **补丁**（`0.0.x`）：向后兼容的缺陷修复。
- **次版本**（`0.x.0`）：向后兼容的新功能。
- **主版本**（`x.0.0`）：破坏性变更。

### 0.x 阶段（当前）

项目当前处于 `0.x`（发布版本 `0.0.25`）。按 semver，**0.x 期间次版本即可包含破坏性变更**，公开 API 尚未冻结。1.0 发布即代表进入稳定维护，破坏性变更此后只能随主版本发布。

### 统一版本

所有 `@aiao/*` 发布包采用 **fixed release group**，同步同一版本号。升级时应整体升级，不混用不同版本。

## 公开 API 的范围

「公开 API」= 各包 `src/index.ts`（及其声明的子路径入口）导出的、未标注 `@internal` 的符号。

**不属于**公开 API、可随时变更且不视为破坏性变更：

- 未从包入口导出的内部实现
- 标注 `@internal` / `@alpha` / `@experimental` 的符号
- `dist` 内部文件结构、打包产物布局
- 测试夹具包（如 `@aiao/rxdb-test`）

框架相关的公开 API 要求 **Angular / React / Vue 三端对称**：单端缺失视为未完成，而非「该端不提供」。

## 废弃周期

1. 计划移除的符号先标注 `@deprecated`，并在 TSDoc 中给出替代方案。
2. 废弃符号至少保留 **一个次版本**（1.0 后为一个主版本周期）再移除。
3. 移除在破坏性版本中进行，并在[迁移指南](./migration/v1.md)记录。

示例：

```typescript
/**
 * @deprecated 使用 {@link SQLiteChangeType} 替代。将在下一个主版本移除。
 */
export { SQLiteChangeType as SQliteChangeType } from './sqlite-backend.interface.js';
```

## 破坏性变更审查流程

公开 API 表面由 **API 基线快照**守护，**主入口与子路径入口同等对待**：

1. 每个公开包在 `requirements/api-baseline/<pkg>.json` 记录导出符号表面，主入口
   （`@aiao/rxdb-plugin-graph`）与每个子路径入口（`@aiao/rxdb-plugin-graph/sqlite`）各占一条。
2. CI 在每次变更时用 `scripts/audit/api-surface.mjs --check` 对比基线。
3. 出现未声明的表面变化 → **检查失败**。子路径上少一个导出、或整个子路径入口消失，
   都按破坏性处理，与主入口用同一套分级。
4. 确属预期的变更需：更新基线快照、在 PR 标注是否 breaking、必要时补迁移说明。

:::note 唯一不扫描的是资产入口

`@aiao/rxdb-adapter-miniprogram/assets/wa-sqlite.cjs` 与 `.../wa-sqlite.wasm` 指向二进制 / CJS 文件，
没有导出表面可扫，改由 `scripts/audit/wa-sqlite-integrity.mjs` 的 SHA-256 校验守护内容。
除此之外，`exports` 里声明的每个子路径入口都在基线里。

:::

此外，公开类型另有编译期契约测试（如 `@aiao/rxdb` 的 `public-type-compatibility` 测试与各包 `public-contract` 消费者），从类型与运行时两个维度防止意外破坏。

## 版本级别如何决定

- 提交遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/)：`fix:` → 补丁，`feat:` → 次版本，`feat!:` / `BREAKING CHANGE:` → 主版本。
- 发布由 Nx Release 驱动；版本级别依据提交类型与 API 基线 diff 共同决定。
- API 基线出现破坏性 diff 但提交未标注 breaking 时，以基线检查为准阻止发布。

涉及系统 schema 或 change codec 的版本还要通过迁移发布清单和门禁：
`pnpm nx run @aiao/source:migration-release-gate`。没有已发布桥接 tag 或旧 bundle 隔离策略时，发布直接失败。

## 实验性层级

下列能力不在 1.0 的兼容承诺内，破坏性变更只需在 changelog 与迁移指南注明：

- `@aiao/rxdb-adapter-miniprogram` 整包（仅微信逻辑层，不保证崩溃恢复）
- `@aiao/rxdb-adapter-http` 的 `changeFeed` SSE 变更通知（缺省关闭）
- `@aiao/rxdb-plugin-search` 在 `wa-sqlite` 与小程序上的全文搜索（`unverified`，当前直接抛 `SearchUnsupportedAdapterError`）
- `@aiao/rxdb` 的 `QueryCacheRepository` 直接实例化（`@experimental`）

其余公开入口进入 1.0 冻结范围。维护者视角的完整清单见仓库 `requirements/versioning-policy.md`。

## 参考

- [迁移指南](./migration/README.md)
- [兼容矩阵](./compatibility.md)
