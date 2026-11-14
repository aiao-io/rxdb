import { describe, expect, it } from 'vitest';
import { selectModelNodes } from './model-mapping';
describe('模型映射身份', () => {
  const nodes = [
    { index: 1, partId: '1234567', compId: '1234567XEU', systemId: 'A' },
    { index: 2, partId: '1234567', compId: '1234567XUS', systemId: 'A' },
    { index: 3, partId: '1234567', compId: '1234567XEU', systemId: 'B' }
  ];
  it('完整件号映射不混入其他变体，重复使用返回全部精确位置', () => {
    expect(selectModelNodes(nodes, { partId: '1234567', compId: '1234567XEU' })).toEqual({
      indices: [1, 3],
      level: 'variant'
    });
  });
  it('具体场景节点只选中该位置，Group 参考显式降级', () => {
    expect(selectModelNodes(nodes, { partId: '1234567', compId: '', nodeIndex: 2 })).toEqual({
      indices: [2],
      level: 'occurrence'
    });
    expect(selectModelNodes(nodes, { partId: '1234567', compId: 'unknown' }).level).toBe('group');
    expect(selectModelNodes(nodes, { partId: 'missing', compId: '' }).level).toBe('none');
  });
});
