/**
 * 树形实体「同级唯一」的跨适配器契约套件。
 *
 * @remarks
 * 覆盖 RXT-010（文件路径唯一索引被 NULL 语义绕过）与 RXT-016（菜单 sibling 唯一性
 * 只存在 UI 内存校验）。两条同根：SQL 的 UNIQUE 认为每个 NULL 互不相等，
 * 根节点 `parentId IS NULL` 让整条唯一索引失效。
 *
 * ```ts
 * // packages/rxdb-adapter-<x>/src/__tests__/tree-unique-contract.spec.ts
 * import { runTreeSiblingUniqueSuite } from '@aiao/rxdb-test/tree-unique';
 * import { treeUniqueFactory } from './tree-unique-fixture.js';
 *
 * runTreeSiblingUniqueSuite({ factory: treeUniqueFactory });
 * ```
 *
 * @module @aiao/rxdb-test/tree-unique
 */
export { TreeFile, TreeMenu } from './fixtures.js';
export { runTreeSiblingUniqueSuite, type TreeSiblingUniqueSuiteOptions } from './sibling-unique.suite.js';
export * from './types.js';
