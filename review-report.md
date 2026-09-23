# RxDB 代码审查报告

## 结论

**🔴 阻断，不建议合并。**

当前变更涉及核心测试基础设施和 tree 插件迁移，但迁移后的导入路径没有收尾。现有 build/lint 结果不足以证明测试和类型检查可用；至少有以下模块解析问题会在 test/typecheck 阶段直接失败。

## 审查范围

- 当前分支全部已暂存、未暂存和未跟踪变更
- `packages/rxdb` 核心包
- `packages/rxdb-plugin-tree` tree 插件
- 测试台迁移、包导出和 API surface 相关修改

## 问题清单

### [P0] 核心测试仍引用已移动的测试台

**位置：**

- `packages/rxdb/src/__tests__/contracts/incremental-merge-surface.spec.ts:24`
- `packages/rxdb/src/__tests__/query/merge_create.spec.ts:14`
- `packages/rxdb/src/__tests__/query/merge_remove.spec.ts:14`
- `packages/rxdb/src/__tests__/query/merge_update.spec.ts:7`
- `packages/rxdb/src/__tests__/query/numeric-id-merge.spec.ts:26`
- `packages/rxdb/src/__tests__/query/review-query.regression.spec.ts:10`

**问题：**

测试台已从 `packages/rxdb/src/__tests__/fixtures/query-task-harness.ts` 移动到 `packages/rxdb/src/testing/query-task-harness.ts`，但上述 spec 仍导入 `../fixtures/query-task-harness.js`。

**影响：**

Vitest 或 TypeScript 会在解析测试模块时报告模块不存在，核心包测试无法运行。

**建议：**

统一改为正确的相对路径，或统一使用明确的 `@aiao/rxdb/testing` 子路径。推荐后者，避免测试台再次因目录迁移产生相对路径断裂。

### [P0] tree 插件测试引用不存在的核心私有模块

**位置：**

`packages/rxdb-plugin-tree/src/__tests__/repository/TreeRepository.spec.ts:8`

**问题：**

该测试仍使用：

```ts
import { METADATA } from '../../rxdb.private.js';
```

测试迁移到 `packages/rxdb-plugin-tree` 后，这个路径会解析为 `packages/rxdb-plugin-tree/src/rxdb.private.js`，但该文件不存在。核心包中的 `packages/rxdb/src/rxdb.private.ts` 也不是 tree 插件可直接访问的模块。

**影响：**

tree 插件测试会在模块解析阶段失败；同时暴露出插件与核心私有符号之间没有稳定边界。

**建议：**

为测试/插件内部契约提供明确的 `@aiao/rxdb/testing` 子路径，或者提供一个受控的公开内部契约。不要让跨包测试依赖失效的相对路径。

### [P0] tree 测试迁移造成同类相对导入整体失效

**位置：**

- `packages/rxdb-plugin-tree/src/__tests__/query/merge_tree_create.spec.ts`
- `packages/rxdb-plugin-tree/src/__tests__/query/merge_tree_remove.spec.ts`
- `packages/rxdb-plugin-tree/src/__tests__/query/merge_tree_update.spec.ts`
- `packages/rxdb-plugin-tree/src/__tests__/query/merge-update-tree.handlers.spec.ts`
- `packages/rxdb-plugin-tree/src/__tests__/repository/TreeRepository.spec.ts`

**问题：**

迁移后的 spec 仍保留原来在 `packages/rxdb/src/__tests__` 下成立的导入，例如：

```ts
../../RxDB.js
../../RxDBError.js
../../repository/QueryManager.interface.js
../../entity/...
```

迁移后这些路径会指向 `packages/rxdb-plugin-tree/src/**`，而不是核心包源文件。

**影响：**

tree 插件测试大面积无法解析核心依赖。即使生产代码 build 通过，插件 test/typecheck 仍可能失败。

**建议：**

核心公共 API 使用 `@aiao/rxdb` 导入；测试辅助 API 使用 `@aiao/rxdb/testing`；tree 专属实现继续使用插件内相对路径。迁移完成后用全仓搜索确认不存在指向旧核心目录结构的相对导入。

## 其他风险

### [P1] 验证范围不足

现有记录显示核心包和 tree 插件的 build/lint 曾通过，但这不能覆盖测试 spec 的模块解析和完整项目类型检查。当前已发现的失效导入说明验证结论不完整。

建议修复导入后串行执行：

```bash
pnpm nx run rxdb:typecheck --skipRemoteCache
pnpm nx run rxdb:test --skipRemoteCache
pnpm nx run rxdb-plugin-tree:typecheck --skipRemoteCache
pnpm nx run rxdb-plugin-tree:test --skipRemoteCache
```

### [P1] 变更边界不清晰

工作区同时包含大量已暂存、未暂存和未跟踪变更，至少涉及核心 API、tree 插件迁移、测试台子路径和 API surface 文档。混合提交会增加回归定位和审查成本。

建议拆分为独立提交：

1. 核心 API/类型变更
2. tree 插件迁移
3. 测试台子路径和测试调整
4. API surface 与文档基线

## 修复验收清单

- [ ] 核心 6 个 spec 不再引用 `../fixtures/query-task-harness.js`
- [ ] tree 插件 spec 不再引用不存在的 `../../RxDB.js`、`../../rxdb.private.js` 等路径
- [ ] `@aiao/rxdb/testing` 的 package exports、tsconfig paths、构建入口和声明文件一致
- [ ] `rxdb` typecheck/test 全部通过
- [ ] `rxdb-plugin-tree` typecheck/test 全部通过
- [ ] API surface、子路径和文档基线检查通过
- [ ] 修复后再进行提交拆分和最终 review

## 最终建议

先修复三组 P0 导入问题，再重新跑核心包和 tree 插件的 typecheck/test。未完成这些步骤前，不应以 build/lint 通过作为合并依据。
