import { decimalAdd, decimalFromCanonical, decimalMul, decimalToCanonical } from '@aiao/rxdb-plugin-bom';
import { validateDraft, validQuantity } from './draft';
import type { DraftState } from './types';
export function analyzeDraft(draft: DraftState, plannedQuantity: string) {
  if (!validQuantity(plannedQuantity)) throw new Error('计划量必须是非负规范十进制字符串');
  const issues = validateDraft(draft);
  const lines: Array<{ key: string; partId: string; cumulativeQuantity: string | null; cost: string | null }> = [];
  const byKey = new Map(draft.nodes.map(n => [n.key, n]));
  const quantities = new Map<string, string | null>();
  const calculate = (key: string): string | null => {
    const chain: string[] = [];
    const seen = new Set<string>();
    let node = byKey.get(key);
    while (node && !quantities.has(node.key)) {
      if (seen.has(node.key)) return null;
      seen.add(node.key);
      chain.push(node.key);
      node = node.parentKey ? byKey.get(node.parentKey) : undefined;
    }
    for (const next of chain.reverse()) {
      const n = byKey.get(next)!;
      const parentQty = n.parentKey ? quantities.get(n.parentKey) : plannedQuantity;
      const value =
        n.kind === 'system' ? parentQty
        : n.quantityState === 'confirmed' && n.quantity !== null && parentQty != null && validQuantity(n.quantity) ?
          decimalToCanonical(decimalMul(decimalFromCanonical(parentQty), decimalFromCanonical(n.quantity)))
        : null;
      quantities.set(next, value ?? null);
    }
    return quantities.get(key) ?? null;
  };
  let cost = decimalFromCanonical('0');
  for (const n of draft.nodes) {
    const cumulativeQuantity = calculate(n.key);
    const lineCost =
      cumulativeQuantity !== null && n.unitCost != null && validQuantity(n.unitCost) ?
        decimalToCanonical(decimalMul(decimalFromCanonical(cumulativeQuantity), decimalFromCanonical(n.unitCost)))
      : null;
    if (lineCost !== null) cost = decimalAdd(cost, decimalFromCanonical(lineCost));
    lines.push({ key: n.key, partId: n.partId, cumulativeQuantity, cost: lineCost });
  }
  return {
    complete: issues.length === 0,
    issues,
    lines,
    knownCost: decimalToCanonical(cost),
    missingCosts: draft.nodes.filter(n => n.kind !== 'system' && n.unitCost == null).length
  };
}
