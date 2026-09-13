/**
 * QueryCache 远端行列契约的跨后端套件（US-022 / US-024）。
 *
 * @remarks
 * 每个 QueryCache 本地行缓存后端在落地前都要判一次「远端这一行带齐必填列了吗」。
 * 必填列的判据来自**各自的建表 DDL**，两个后端确有分歧，因此各包各自实现；
 * 本套件锁的是两侧必须一致的部分：哪些列可以省略、错误的 `name` 与消息骨架、整批拒绝。
 *
 * ```ts
 * // packages/rxdb-adapter-<x>/src/__tests__/query-cache-row-contract.spec.ts
 * import { runQueryCacheRowContractSuite } from '@aiao/rxdb-test/query-cache-contract';
 *
 * runQueryCacheRowContractSuite({
 *   name: 'pglite',
 *   requiredQueryCacheColumns,
 *   assertQueryCacheRowContract,
 *   ErrorClass: RxDBQueryCacheRowContractError
 * });
 * ```
 *
 * @module @aiao/rxdb-test/query-cache-contract
 */
export { QcContractBlob, QcContractMapped, QcContractMember, QcContractRecipe, QcContractTeam } from './fixtures.js';
export { runQueryCacheRowContractSuite } from './row-contract.suite.js';
export type { QueryCacheRowContractImpl } from './types.js';
