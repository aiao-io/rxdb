import { describe, expect, it } from 'vitest';
import { analyzeDraft } from './analysis';
import { makeStressDataset } from './stress-data';
import { createDraft } from './draft';
describe('已确认草稿数量与成本', () => {
  it('累计用量沿路径相乘，金额使用领域十进制内核', () => {
    const data = makeStressDataset(3, 'deep');
    const draft = createDraft(data, data.structures.catalog);
    draft.nodes[1].quantity = '0.1';
    draft.nodes[2].quantity = '0.2';
    draft.nodes[2].unitCost = '0.3';
    const result = analyzeDraft(draft, '10');
    expect(result.lines[2].cumulativeQuantity).toBe('0.2');
    expect(result.lines[2].cost).toBe('0.06');
  });
  it('缺失和未确认用量阻止完整结果，保留具体问题', () => {
    const data = makeStressDataset(3);
    const draft = createDraft(data, data.structures.catalog);
    draft.nodes[1].quantityState = 'reference';
    expect(analyzeDraft(draft, '1').complete).toBe(false);
    expect(analyzeDraft(draft, '1').issues.length).toBeGreaterThan(0);
  });
});
