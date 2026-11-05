/**
 * RxDB Model 无展示依赖入口。
 *
 * 该入口只导出状态、动作、校验与转换契约，不加载 VTable、编辑器或任何 DOM API。
 * @module @aiao/rxdb-model/headless
 */
export {
  deriveEntityCapabilities,
  type EntityCapabilities,
  type EntityCapabilityContext
} from './entity-capabilities.js';
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
export { modelText, type ModelI18n } from './i18n.js';
export { modelEnMessages, modelMessages } from './messages.js';
export * from './query-builder/models/config.interface.js';
export type { OperatorDefinition } from './query-builder/models/operator.interface.js';
export * from './query-builder/models/query-builder-state.js';
export * from './query-builder/services/headless.js';
export {
  OperatorRegistry,
  getDefaultOperatorRegistry,
  type OperatorRegistryOptions
} from './query-builder/services/operator-registry.service.js';
export type { SchemaParserOptions } from './query-builder/services/schema-parser.service.js';
export { createSchemaFromEntity } from './query-builder/utils/schema-factory.js';
export { getDefaultValueForType, getInputType } from './query-builder/utils/value-input.js';
export * from './structural-equal.js';
