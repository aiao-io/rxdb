/**
 * 手动排序实体（US-028）的跨适配器契约套件。
 *
 * @remarks
 * 排序键按码点比较才有序：SQLite 的 TEXT 默认 BINARY，PGlite 对 `sortOrder` 显式 `COLLATE "C"`。
 * 分组用例（阶段 D）随同一入口运行，覆盖可空外键分组（含 NULL 组）与 boolean 分组。
 * 两个 runner 对同一份数据断言同一个由 JS `<` 算出的期望顺序，两端同序因此由「各自等于期望」传递得到。
 *
 * ```ts
 * // packages/rxdb-adapter-<x>/src/__tests__/manual-order-contract.spec.ts
 * import { runManualOrderSuite } from '@aiao/rxdb-test/sortable';
 *
 * runManualOrderSuite({ factory });
 * ```
 *
 * @module @aiao/rxdb-test/sortable
 */
export { SortableItem, SortableList, SortableListItem, SortableTodo } from './fixtures.js';
export { runManualOrderSuite, type ManualOrderSuiteOptions } from './manual-order.suite.js';
export * from './types.js';
