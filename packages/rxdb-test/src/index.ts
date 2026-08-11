/**
 * @fileoverview RxDB 测试工具包
 * 提供 RxDB 相关的测试工具和实体模型
 *
 * @module @aiao/rxdb-test
 */

import packageJson from '../package.json' with { type: 'json' };

/** 当前包版本。 */
export const version = packageJson.version;

/**
 * 测试工具导出
 * - generateTestDbName: 生成唯一的测试数据库名称
 * - expectObservableSequence: 断言 Observable 发出预期的序列
 * - cleanupSqliteTestAdapter: 清理 SQLite 测试适配器
 */
export * from './testing/index.js';

/**
 * 跨框架 fixtures（JSON + TS 混合）
 * - 既有 findByCursor/useInfiniteScroll JSON 场景
 * - T055 新增：search parity 种子数据（Article/Comment/queries）
 */
export * from './cross-framework-fixtures/index.js';
