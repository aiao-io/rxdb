/**
 * 跨适配器声明式存储约束契约套件及共享夹具（US-030）：CHECK（阶段 A）、条件唯一索引（阶段 B）、
 * 区间排他（阶段 C）。约束是建表 DDL 的一部分，SQLite family 与 PGlite 各跑一份。
 *
 * @module @aiao/rxdb-test/check-constraint
 */
export { runConditionalUniqueWriteBehaviorSuite } from './conditional-unique.suite.js';
export { runExclusionWriteBehaviorSuite } from './exclusion.suite.js';
export * from './fixtures.js';
export * from './types.js';
export { runCheckConstraintWriteBehaviorSuite } from './write-behavior.suite.js';
