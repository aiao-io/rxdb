import { describe, expect, it } from 'vitest';
import { validatePlatformModels } from './platform-model';

const model = { id: 'standard', name: '平台生图', credits: 3, protocol: 'openai' };
describe('平台公开模型目录', () => {
  it('保留模型配置；旧目录使用现有默认尺寸和单张数量', () => {
    expect(validatePlatformModels({ models: [model] })).toEqual([
      {
        ...model,
        sizes: ['1024x1024', '1536x1024', '1024x1536'],
        aspectRatios: ['1:1', '3:2', '2:3'],
        resolutions: [],
        qualities: ['low'],
        complexities: [],
        thinkingLevels: [],
        counts: [1],
        supportsImageEditing: false
      }
    ]);
    expect(validatePlatformModels({ models: [] })).toEqual([]);
  });
  it('保留各模型独有的尺寸与数量选项', () => {
    const configured = {
      ...model,
      sizes: ['1536x1024', '1024x1536'],
      aspectRatios: ['3:2', '2:3'],
      resolutions: [],
      qualities: ['low'],
      complexities: [],
      thinkingLevels: [],
      counts: [1, 2, 4],
      supportsImageEditing: true
    };
    expect(validatePlatformModels({ models: [configured] })).toEqual([configured]);
  });
  it('支持 Gemini 的原生分辨率、比例和图生图能力目录', () => {
    const gemini = {
      id: 'gemini-image',
      name: 'Gemini Image',
      credits: 5,
      protocol: 'gemini',
      sizes: [],
      aspectRatios: ['1:1', '16:9'],
      resolutions: ['1K', '2K'],
      imageOptions: [
        { aspectRatio: '1:1', resolution: '1K', outputSize: '1024x1024' },
        { aspectRatio: '1:1', resolution: '2K', outputSize: '2048x2048' },
        { aspectRatio: '16:9', resolution: '1K', outputSize: '1376x768' }
      ],
      qualities: [],
      complexities: [],
      thinkingLevels: ['minimal', 'high'],
      counts: [1, 2],
      supportsImageEditing: true
    };
    expect(validatePlatformModels({ models: [gemini] })).toEqual([gemini]);
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
    { sizes: [] },
    { sizes: ['770x1024'] },
    { sizes: ['1024x1024', '1024x1024'] },
    { aspectRatios: ['0:1'] },
    { aspectRatios: ['1:1', '1:1'] },
    { resolutions: ['8K'] },
    { aspectRatios: ['7:2'] },
    { supportsImageEditing: 'true' },
    { counts: [] },
    { counts: [1, 1] },
    { counts: [11] },
    {
      protocol: 'gemini',
      sizes: [],
      aspectRatios: ['1:1'],
      resolutions: ['1K'],
      imageOptions: [{ aspectRatio: '1:1', resolution: '1K', outputSize: '8192x1024' }]
    },
    { baseUrl: 'https://private.test' },
    { secret: 'SERVER_KEY' }
  ])('拒绝模型无效字段或非公开字段 %j', patch => {
    expect(() => validatePlatformModels({ models: [{ ...model, ...patch }] })).toThrow('模型目录');
  });
});
