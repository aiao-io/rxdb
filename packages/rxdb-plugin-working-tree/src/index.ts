/**
 * @fileoverview 本地工作树与提交历史插件的公开入口。
 *
 * @remarks
 * epic-006 拆分后，工作树（可变面，`working-tree/`）与提交历史（不可变面，`commit/`）
 * 从核心搬到本包。主面是这两桶的再导出，外加引导迁移的初始行构造器——它随
 * `RxDBSystemContribution.createMigrations()` 交给核心，与核心自带的系统迁移并进同一条链
 * （`migrations/0004-working-tree-commits.ts` 头部说明了编号的来历）。
 */
export * from './commit/index.js';
export { createWorkingTreeCommitsInitialRows } from './migrations/0004-working-tree-commits.js';
export * from './plugin.js';
export * from './working-tree/index.js';
