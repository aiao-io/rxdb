import {
  decimalAdd,
  decimalFromCanonical,
  decimalSub,
  decimalToCanonical,
  type CostRollupResult,
  type EcnDiffResult,
  type EcnImpactResult,
  type ExplosionResult,
  type RequirementLine
} from '@aiao/rxdb-plugin-bom';
import type { BomWorkspaceContext } from '../bom-workspace-state';

/** 归集后的备料变化保留各路径来源，方便核对重复料贡献。 */
export interface BomMaterialChange {
  key: string;
  itemId: string;
  uom: string;
  beforeQty: string;
  afterQty: string;
  delta: string;
  kind: 'added' | 'removed' | 'changed';
  beforeLines: RequirementLine[];
  afterLines: RequirementLine[];
}

/** 相同业务条件下，ECN 生效日前一天与生效日的两时点快照。 */
export interface BomChangeReview {
  ecnId: string;
  ecnNo: string;
  beforeDate: string;
  afterDate: string;
  context: BomWorkspaceContext;
  revisions: Record<string, { revisionNo: string; effectiveFrom: string | null }>;
  before: { explosion: ExplosionResult; cost: CostRollupResult };
  after: { explosion: ExplosionResult; cost: CostRollupResult };
  changes: BomMaterialChange[];
  costDelta: string;
  impact: EcnImpactResult;
  diff: EcnDiffResult;
}

const groupLines = <K>(lines: RequirementLine[], keyFor: (line: RequirementLine) => K): Map<K, RequirementLine[]> => {
  const grouped = new Map<K, RequirementLine[]>();
  for (const line of lines) {
    const key = keyFor(line);
    const entries = grouped.get(key) ?? [];
    entries.push(line);
    grouped.set(key, entries);
  }
  return grouped;
};

const totalQuantity = (lines: RequirementLine[]): string =>
  decimalToCanonical(
    lines.reduce((sum, line) => decimalAdd(sum, decimalFromCanonical(line.qty)), decimalFromCanonical('0'))
  );

const revisionQuantities = (lines: RequirementLine[]): Map<RequirementLine['revisionId'], string> =>
  new Map(
    [...groupLines(lines, line => line.revisionId)].map(([revisionId, entries]) => [revisionId, totalQuantity(entries)])
  );

const sameRevisionQuantities = (before: RequirementLine[], after: RequirementLine[]): boolean => {
  const beforeQuantities = revisionQuantities(before);
  const afterQuantities = revisionQuantities(after);
  return (
    beforeQuantities.size === afterQuantities.size &&
    [...beforeQuantities].every(([id, qty]) => afterQuantities.get(id) === qty)
  );
};

/** 按物料和库存单位比对两份备料需求，十进制量只通过公开计算内核归集。 */
export const materialChanges = (before: RequirementLine[], after: RequirementLine[]): BomMaterialChange[] => {
  const beforeGroups = groupLines(before, line => JSON.stringify([line.itemId, line.uom]));
  const afterGroups = groupLines(after, line => JSON.stringify([line.itemId, line.uom]));
  const keys = [...new Set([...beforeGroups.keys(), ...afterGroups.keys()])].sort();
  return keys.flatMap((key): BomMaterialChange[] => {
    const beforeLines = beforeGroups.get(key) ?? [];
    const afterLines = afterGroups.get(key) ?? [];
    const beforeQty = totalQuantity(beforeLines);
    const afterQty = totalQuantity(afterLines);
    if (beforeQty === afterQty && sameRevisionQuantities(beforeLines, afterLines)) return [];
    const line = afterLines[0] ?? beforeLines[0];
    return [
      {
        key,
        itemId: line.itemId,
        uom: line.uom,
        beforeQty,
        afterQty,
        delta: decimalToCanonical(decimalSub(decimalFromCanonical(afterQty), decimalFromCanonical(beforeQty))),
        kind:
          beforeLines.length === 0 ? 'added'
          : afterLines.length === 0 ? 'removed'
          : 'changed',
        beforeLines,
        afterLines
      }
    ];
  });
};
