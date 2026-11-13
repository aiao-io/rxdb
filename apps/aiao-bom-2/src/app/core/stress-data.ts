import type { BomDataset, Occurrence, Part } from './types';
export function makeStressDataset(count: number, shape: 'balanced' | 'wide' | 'deep' = 'balanced'): BomDataset {
  if (!Number.isSafeInteger(count) || count < 1 || count > 100000) throw new Error('节点数量必须在 1–100000 之间');
  const parts: Part[] = [];
  const nodes: Occurrence[] = [];
  for (let i = 0; i < count; i++) {
    const id = `ST-${String(i).padStart(6, '0')}`;
    const parent = shape === 'wide' ? 0 : shape === 'deep' ? i - 1 : Math.floor((i - 1) / 8);
    parts.push({ id, name: i === 0 ? '规模验收装配' : `标准组件 ${String(i).padStart(6, '0')}`, english: `Component ${i}`, family: 'TEST', familyName: '规模验收', variants: [id], markets: ['EU', 'CN', 'US', 'AU'], marketParts: {}, cb: {}, mb: {}, sb: {}, rawQuantity: '1 件', quantity: '1', quantityState: 'confirmed', uom: '件', conflict: '', policy: '合成验收数据', specs: {}, dimensions: [], assets: [], sceneNodes: [], sceneVariants: [], inBom: true, photo: null, price: null, parentReference: null });
    nodes.push({ key: `stress:${i}`, parentKey: i ? `stress:${parent}` : null, partId: id, compId: id, kind: i === 0 ? 'assembly' : 'part', source: 'catalog', markets: ['EU', 'CN', 'US', 'AU'], quantity: '1', quantityState: 'confirmed', uom: '件', sourceRef: `synthetic:${i}`, unitCost: '0.1' });
  }
  return { schema: 'aiao-bom-2/1', id: `stress-${count}-${shape}`, title: `${count.toLocaleString('en-US')} 节点性能样本`, version: shape, observedOn: '2026-11-13', parts, structures: { catalog: nodes, purchase: [], cad: [], draft: [] }, vehicle: { url: '', bytes: 0, label: '合成数据无 3D', units: 'mm' }, sourceUrls: [] };
}
