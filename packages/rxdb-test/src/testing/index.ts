/**
 * @fileoverview RxDB 测试工具模块
 * 提供测试数据库名称生成、Observable 序列断言、SQLite 清理工具，
 * 以及三框架 e2e 共享的实体清空与 search demo API 注入。
 *
 * @module testing
 */

/**
 * 清空给定实体在当前 RxDB 中的所有记录（reset 场景）
 * @see clearEntityRecords
 */
export * from './clear-entity-records.js';

/**
 * Playwright / 本地开发共用的数据库命名策略
 * @see getE2eDbName
 */
export * from './e2e-db-name.js';

/**
 * 生成唯一的测试数据库名称
 * @see generateTestDbName
 */
export * from './generate-test-db-name.js';

/**
 * Observable 序列断言工具
 * @see expectObservableSequence
 */
export * from './observable-sequence.js';

/**
 * Search demo 的 Playwright e2e API 注入工具
 * @see installSearchDemoTestApi
 */
export * from './search-demo-api.js';

/**
 * 跨调用者串行化 seed 写入，避免页面自动 seed 与显式 reset seed 并发冲突
 * @see withSeedLock
 */
export * from './seed-lock.js';

/**
 * SQLite 测试适配器清理工具
 * @see cleanupSqliteTestAdapter
 */
export * from './sqlite.js';
