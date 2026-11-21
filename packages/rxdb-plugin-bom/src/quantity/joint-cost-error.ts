import { BomCostError } from './cost-error.js';

/** 联产来源没有显式裁决或选择与当前解析上下文不符。 */
export class BomJointCostSourceError extends BomCostError {
  readonly code = 'BOM_JOINT_COST_SOURCE';
  readonly payload: { outputRevisionId: string; candidates: readonly string[]; selected: string | null };
  constructor(outputRevisionId: string, candidates: readonly string[], selected: string | undefined) {
    super(outputRevisionId, '联产成本来源未解析：请选择同一组织/类型/评估日的有效来源');
    this.name = 'BomJointCostSourceError';
    Object.setPrototypeOf(this, BomJointCostSourceError.prototype);
    this.payload = { outputRevisionId, candidates, selected: selected ?? null };
  }
}
