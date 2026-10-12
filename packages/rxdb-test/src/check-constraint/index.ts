/**
 * 跨适配器 CHECK 约束契约套件及共享夹具，用于 US-030 阶段 A。
 * 声明式 CHECK 是建表 DDL 的一部分，SQLite family 与 PGlite 各跑一份。
 *
 * @module @aiao/rxdb-test/check-constraint
 */
export * from './fixtures.js';
export { runCheckConstraintWriteBehaviorSuite } from './write-behavior.suite.js';
export * from './types.js';
