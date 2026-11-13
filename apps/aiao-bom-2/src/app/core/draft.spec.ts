import { describe, expect, it } from 'vitest';
import { DraftHistory, createDraft, validateDraft, parseImport, exportCsv, compareDrafts } from './draft';
import { makeStressDataset } from './stress-data';

describe('BOM 草稿与导入导出', () => {
  it('草稿不修改来源，撤销重做恢复同一个发生位置', () => {
    const data = makeStressDataset(12);
    const draft = createDraft(data, data.structures.catalog);
    const history = new DraftHistory(draft);
    const key = draft.nodes[1].key;
    history.patch([key], { quantity: '2.5', quantityState: 'confirmed' });
    expect(history.current.nodes[1].quantity).toBe('2.5');
    expect(data.structures.catalog[1].quantity).toBe('1');
    history.undo(); expect(history.current.nodes[1].quantity).toBe('1');
    history.redo(); expect(history.current.nodes[1].key).toBe(key);
  });
  it('拒绝循环、父项丢失、重复身份及不规范十进制', () => {
    const data = makeStressDataset(10);
    const draft = createDraft(data, data.structures.catalog);
    draft.nodes[0].parentKey = draft.nodes[1].key;
    draft.nodes[2].quantity = '1,4';
    const issues = validateDraft(draft);
    expect(issues.some(i => i.field === 'parentKey')).toBe(true);
    expect(issues.some(i => i.field === 'quantity')).toBe(true);
    expect(() => parseImport(JSON.stringify(draft))).toThrow();
  });
  it('拒绝结构不明的 JSON 和数字型数量，保留缺失数量为诊断', () => {
    expect(() => parseImport('{"rows":[]}')).toThrow();
    const data = makeStressDataset(3);
    const draft = createDraft(data, data.structures.catalog);
    const raw = JSON.parse(JSON.stringify(draft)) as { nodes: Array<{ quantity: unknown }> };
    raw.nodes[1].quantity = 1.2;
    expect(() => parseImport(JSON.stringify(raw))).toThrow('字符串');
    draft.nodes[1].quantity = null;
    expect(validateDraft(draft).some(i => i.field === 'quantity')).toBe(true);
  });
  it('删除分支保留事务可撤销，移动不允许把父项放进后代', () => {
    const data = makeStressDataset(20);
    const history = new DraftHistory(createDraft(data, data.structures.catalog));
    const root = history.current.nodes[0].key;
    expect(() => history.move(root, history.current.nodes[1].key)).toThrow('循环');
    history.remove([history.current.nodes[1].key]);
    expect(history.current.nodes.length).toBeLessThan(20);
    history.undo(); expect(history.current.nodes).toHaveLength(20);
  });
  it('CSV 转义公式与引号，比较精确指出使用位置的字段变化', () => {
    const data = makeStressDataset(3);
    const draft = createDraft(data, data.structures.catalog);
    draft.nodes[1].label = '=1+1';
    const csv = exportCsv(draft.nodes);
    expect(csv).toContain("'=1+1");
    const changed = structuredClone(draft);
    changed.nodes[1].quantity = '3';
    expect(compareDrafts(draft, changed)).toEqual(expect.arrayContaining([expect.objectContaining({ key: draft.nodes[1].key, field: 'quantity' })]));
  });
});
