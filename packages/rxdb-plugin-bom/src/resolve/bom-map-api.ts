import type { BomLocalAdapter } from './bom-adapter.js';
import type { MappingCoverageResult, MappingGapsResult, MappingSaveInput } from './bom-map.js';
import type { ResolutionContext } from './resolution.js';

/** 按需加载映射保存实现，校验与写入仍由同一领域入口处理。 */
export const saveMapping = async (adapter: BomLocalAdapter, input: MappingSaveInput): Promise<{ mapId: string }> =>
  (await import('./bom-map.js')).saveMapping(adapter, input);

/** 按需计算完整结构的映射覆盖率，保持截断与未裁决的拒绝合同。 */
export const mappingCoverage = async (
  adapter: BomLocalAdapter,
  scopeId: string,
  context: ResolutionContext
): Promise<MappingCoverageResult> => (await import('./bom-map.js')).mappingCoverage(adapter, scopeId, context);

/** 按需读取映射跟进缺口，保持逐映射隔离的判定合同。 */
export const mappingGaps = async (
  adapter: BomLocalAdapter,
  scopeId: string,
  context: ResolutionContext
): Promise<MappingGapsResult> => (await import('./bom-map.js')).mappingGaps(adapter, scopeId, context);

/** 按需确认映射，解析、校验与基线推进仍共用原有事务。 */
export const confirmMapping = async (
  adapter: BomLocalAdapter,
  mappingId: string,
  targetOccurrenceId: string | null,
  context: ResolutionContext
): Promise<void> => (await import('./bom-map.js')).confirmMapping(adapter, mappingId, targetOccurrenceId, context);
