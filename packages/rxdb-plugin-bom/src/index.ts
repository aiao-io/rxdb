/**
 * @fileoverview @aiao/rxdb-plugin-bom 公共入口
 *
 * BOM（物料清单）领域插件：`item` / `item_revision` / `bom_header` / `bom_line` /
 * `bom_line_occurrence` 实体、BomRepository 门面（十进制值合同入口规范化）与
 * 存储层触发器（写入协议 / 结构列不可改 / 十进制格式）。
 */

export { BOM_ENTITIES, BomHeader, BomHistoryBatch, BomItem, BomItemRevision, BomLine, BomLineDesignator, BomLineOccurrence, BomLineOperationSplit, BomRouting, BomRoutingOperation, BomSubstituteGroup, BomWorkCenter } from './entities.js';
export { DECIMAL_CANONICAL_RE, DECIMAL_MAX_SIGNIFICANT_DIGITS, normalizeDecimalString } from './decimal.utils.js';
export { BomRepository } from './repository.js';
export {
  BOM_CYCLE_PREFIX,
  BOM_DECIMAL_FORMAT_PREFIX,
  BOM_PUBLISH_VALIDATION_PREFIX,
  BOM_WRITE_PROTOCOL_PREFIX,
  BomBackendCapabilityError,
  BomCycleError,
  BomDecimalFormatError,
  BomError,
  BomPublishValidationError,
  BomQuantityError,
  BomSyncUnsupportedError,
  BomTruncationError,
  BomWriteProtocolError,
  normalizeBomError,
  type TruncationReason
} from './types.js';
export { BOM_CYCLE_DEPTH_LIMIT } from './backend/bom-trigger-ddl.js';
export { rxDBPluginBom, RxDBPluginBom } from './plugin.js';
export {
  BomResolutionError,
  type BomType,
  type ResolutionContext,
  type ResolutionManifest,
  type ResolutionResult,
  type ResolvedLineOccurrence,
  type UnresolvedAlternative
} from './resolve/resolution.js';
export { resolveBom, type ResolveTarget } from './resolve/resolver.js';
export {
  assertCompleteResolution,
  expandBom,
  whereUsed,
  type ExpansionBudgets,
  type ExpansionNode,
  type ExpansionOptions,
  type ExpansionResult,
  type WhereUsedTarget
} from './resolve/expansion.js';
export {
  EXPLOSION_ALGORITHM_VERSION,
  explodeBom,
  type ExplosionManifest,
  type ExplosionOptions,
  type ExplosionResult,
  type ExplosionSteps,
  type ExplosionStepValue,
  type OutputLine,
  type PenetrationRecord,
  type PlannedQuantity,
  type RequirementLine
} from './quantity/explosion.js';
export { FORMULA_GRAMMAR_VERSION, evaluateFormula } from './quantity/formula.js';
export { convertUom, type UomConversionRates } from './quantity/uom.js';
export {
  ceilToDecimalPlaces,
  decimalAdd,
  decimalCmp,
  decimalDiv,
  decimalFromCanonical,
  decimalIsNegative,
  decimalIsZero,
  decimalMul,
  decimalSub,
  decimalToCanonical,
  roundToSignificant,
  type Decimal
} from './quantity/decimal.js';
export {
  loadHistory,
  type HistoryBatchInput,
  type HistoryHeaderInput,
  type HistoryOccurrenceInput,
  type HistoryRevisionInput
} from './resolve/history-loader.js';
export { bomSqlDialectFor, pgliteBomDialect, sqliteBomDialect, type BomSqlDialect } from './resolve/bom-sql.js';
export { cycleConstraintDdlForRemotePg } from './resolve/cycle-constraint-ddl.js';
