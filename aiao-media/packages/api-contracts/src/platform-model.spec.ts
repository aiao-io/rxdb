import { describe, expect, it } from 'vitest';
import { validatePlatformModels } from './platform-model';

const model = { id: 'standard', name: '平台生图', credits: 3, protocol: 'openai' };
describe('平台公开模型目录', () => {
  it('保留公开字段，允许停用后的空目录和两种响应协议', () => {
    expect(validatePlatformModels({ models: [model, { ...model, id: 'native', protocol: 'minimax' }] })).toEqual([
      model,
      { ...model, id: 'native', protocol: 'minimax' }
    ]);
    expect(validatePlatformModels({ models: [] })).toEqual([]);
  });
  it.each([
    null,
    [],
    {},
    { models: null },
    { models: Array(21).fill(model) },
    { models: [model, model] },
    { models: [null] },
    { models: [model], privateKey: 'secret' }
  ])('拒绝无效目录 %j', value => {
    expect(() => validatePlatformModels(value)).toThrow('模型目录');
  });
  it.each([
    { id: 12 },
    { id: 'a b' },
    { name: '' },
    { name: 12 },
    { name: 'x'.repeat(81) },
    { credits: -1 },
    { credits: 0 },
    { credits: 1.5 },
    { credits: 100001 },
    { protocol: 'unknown' },
    { baseUrl: 'https://private.test' },
    { secret: 'SERVER_KEY' }
  ])('拒绝模型无效字段或非公开字段 %j', patch => {
    expect(() => validatePlatformModels({ models: [{ ...model, ...patch }] })).toThrow('模型目录');
  });
});
