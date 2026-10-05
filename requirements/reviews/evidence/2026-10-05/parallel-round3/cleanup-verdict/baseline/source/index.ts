/**
 * 跨适配器「事务上下文与连接就绪」契约套件。
 *
 * @remarks
 * 覆盖设计文档 `code-reviews/transaction-executor-design.md` 的三个契约：
 * **C1 就绪门** / **C2 事务作用域** / **C3 引导事务**。
 *
 * SQLite 与 PGlite 是两处真实事务实现，分别通过 runner 接入全部三组契约：
 *
 * ```ts
 * // packages/rxdb-adapter-<x>/src/__tests__/transaction-contract.spec.ts
 * import { runBootstrapAtomicitySuite, runReadinessSuite, runTransactionIsolationSuite } from '@aiao/rxdb-test/transaction';
 * import { transactionFactory } from './transaction-contract-fixture.js';
 *
 * runReadinessSuite({ factory: transactionFactory });
 * runTransactionIsolationSuite({ factory: transactionFactory });
 * runBootstrapAtomicitySuite({ factory: transactionFactory });
 * ```
 *
 * `RxDBAdapterSqliteBase` 被 sqlite / sqlite-wasm / wa-sqlite / sqliteai 四个适配器继承；
 * 另一处实现是 `RxDBAdapterPGlite`。
 *
 * @module @aiao/rxdb-test/transaction
 */
export { runBootstrapAtomicitySuite } from './bootstrap.suite.js';
export * from './fixtures.js';
export { runTransactionIsolationSuite } from './isolation.suite.js';
export { runReadinessSuite } from './readiness.suite.js';
export * from './types.js';
