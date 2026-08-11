/**
 * 跨适配器加密列契约套件及共享夹具，用于
 * spec 004-local-field-encryption。所有支持加密字段钩子的存储适配器
 * （wa-sqlite、PGlite、sqliteai 等）都会使用。
 *
 * @module @aiao/rxdb-test/encrypted
 */
export { runBigIntBinaryEncryptedSuite } from './bigint-binary.suite.js';
export { runChangeLogSuite } from './change-log.suite.js';
export { runCrudSuite, runQueryValidationSuite } from './crud.suite.js';
export * from './fixtures.js';
export { runLifecycleSuite } from './lifecycle.suite.js';
export { runTamperSuite } from './tamper.suite.js';
export * from './types.js';
