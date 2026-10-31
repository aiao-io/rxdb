/**
 * RxDB Model 无展示依赖入口。
 *
 * 该入口只导出状态、动作、校验与转换契约，不加载 VTable、编辑器或任何 DOM API。
 * @module @aiao/rxdb-model/headless
 */
export * from './entity-detail/headless.js';
export * from './entity-detail/interfaces.js';
export * from './entity-dialog/headless.js';
export * from './entity-form/form-data.js';
export * from './entity-form/form-fields.js';
export * from './entity-form/form-validation.js';
export * from './entity-form/headless.js';
export * from './entity-form/interfaces.js';
export * from './entity-list/headless.js';
export * from './entity-list/types.js';
export * from './entity-table/headless.js';
export * from './query-builder/models/config.interface.js';
export * from './query-builder/models/query-builder-state.js';
export * from './query-builder/services/headless.js';
