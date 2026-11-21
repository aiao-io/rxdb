import assert from 'node:assert/strict';
import { test } from 'node:test';
import { platformCatalog, platformImageInput } from './platform-models.ts';
import type { WorkerEnv } from './worker-env.ts';

const baseUrl = 'https://api.example.test/v1';
const imageModel = {
  id: 'square-only',
  name: '方图模型',
  baseUrl,
  model: 'private-square-model',
  secret: 'IMAGE_KEY',
  credits: 3,
  sizes: ['1024x1024'],
  counts: [1]
};
const batchModel = {
  id: 'portrait-batch',
  name: '竖图模型',
  baseUrl,
  model: 'private-portrait-model',
  secret: 'IMAGE_KEY',
  credits: 5,
  sizes: ['1024x1536'],
  counts: [1, 2, 3]
};
const editModel = {
  id: 'gpt-edit',
  name: 'GPT 图生图',
  baseUrl,
  model: 'new-gpt-image-model',
  secret: 'IMAGE_KEY',
  credits: 6,
  protocol: 'openai',
  sizes: ['1024x1024'],
  aspectRatios: ['1:1'],
  qualities: ['medium', 'high'],
  complexities: ['low', 'high'],
  counts: [1, 2],
  supportsImageEditing: true
};
const geminiModel = {
  id: 'gemini-image',
  name: 'Gemini 图片',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  model: 'gemini-new-image-model',
  secret: 'GEMINI_KEY',
  credits: 7,
  protocol: 'gemini',
  aspectRatios: ['1:1', '16:9'],
  resolutions: ['1K', '2K'],
  imageOptions: [
    { aspectRatio: '1:1', resolution: '1K', outputSize: '1024x1024' },
    { aspectRatio: '1:1', resolution: '2K', outputSize: '2048x2048' },
    { aspectRatio: '16:9', resolution: '1K', outputSize: '1376x768' },
    { aspectRatio: '16:9', resolution: '2K', outputSize: '2048x1152' }
  ],
  thinkingLevels: ['minimal', 'high'],
  counts: [1, 2],
  supportsImageEditing: true
};
const environment = (models = [imageModel, batchModel, geminiModel]) =>
  ({
    MEDIA_PLATFORM_MODELS: JSON.stringify(models),
    ALLOWED_PROVIDER_BASE_URLS: JSON.stringify([baseUrl, geminiModel.baseUrl]),
    IMAGE_KEY: 'fixture-secret',
    GEMINI_KEY: 'fixture-gemini-secret'
  }) as WorkerEnv;
const request = (value: unknown) =>
  new Request('https://media.example.test/api/relay/tasks/00000000-0000-4000-8000-000000000001', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(value)
  });

test('platform catalog exposes each model resolution and quantity without upstream identifiers', async () => {
  const catalog = await platformCatalog(environment([imageModel, batchModel, editModel, geminiModel]));
  assert.deepEqual(catalog.models, [
    {
      id: 'square-only',
      name: '方图模型',
      credits: 3,
      protocol: 'openai',
      sizes: ['1024x1024'],
      aspectRatios: ['1:1'],
      resolutions: [],
      qualities: ['low'],
      complexities: [],
      thinkingLevels: [],
      counts: [1],
      supportsImageEditing: false
    },
    {
      id: 'portrait-batch',
      name: '竖图模型',
      credits: 5,
      protocol: 'openai',
      sizes: ['1024x1536'],
      aspectRatios: ['2:3'],
      resolutions: [],
      qualities: ['low'],
      complexities: [],
      thinkingLevels: [],
      counts: [1, 2, 3],
      supportsImageEditing: false
    },
    {
      id: 'gpt-edit',
      name: 'GPT 图生图',
      credits: 6,
      protocol: 'openai',
      sizes: ['1024x1024'],
      aspectRatios: ['1:1'],
      resolutions: [],
      qualities: ['medium', 'high'],
      complexities: ['low', 'high'],
      thinkingLevels: [],
      counts: [1, 2],
      supportsImageEditing: true
    },
    {
      id: 'gemini-image',
      name: 'Gemini 图片',
      credits: 7,
      protocol: 'gemini',
      sizes: [],
      aspectRatios: ['1:1', '16:9'],
      resolutions: ['1K', '2K'],
      imageOptions: [
        { aspectRatio: '1:1', resolution: '1K', outputSize: '1024x1024' },
        { aspectRatio: '1:1', resolution: '2K', outputSize: '2048x2048' },
        { aspectRatio: '16:9', resolution: '1K', outputSize: '1376x768' },
        { aspectRatio: '16:9', resolution: '2K', outputSize: '2048x1152' }
      ],
      qualities: [],
      complexities: [],
      thinkingLevels: ['minimal', 'high'],
      counts: [1, 2],
      supportsImageEditing: true
    }
  ]);
  assert.equal(JSON.stringify(catalog).includes('private-portrait-model'), false);
  assert.equal(JSON.stringify(catalog).includes('fixture-secret'), false);
});

test('relay accepts only model-configured sizes and dispatches one image per task', async () => {
  const env = environment();
  const prepared = await platformImageInput(
    request({ model: 'portrait-batch', prompt: '测试', size: '1024x1536', aspectRatio: '2:3', n: 1 }),
    env
  );
  assert.deepEqual(prepared.body, {
    model: 'private-portrait-model',
    prompt: '测试',
    size: '1024x1536',
    n: 1,
    quality: 'low',
    output_format: 'png'
  });
  assert.equal(prepared.protocol, 'openai');
  assert.equal(prepared.authHeader, 'authorization');
  await assert.rejects(
    platformImageInput(
      request({ model: 'square-only', prompt: '测试', size: '1024x1536', aspectRatio: '2:3', n: 1 }),
      env
    ),
    /模型不支持此宽高比/
  );
  await assert.rejects(
    platformImageInput(
      request({ model: 'portrait-batch', prompt: '测试', size: '1024x1536', aspectRatio: '2:3', n: 2 }),
      env
    ),
    /参数无效/
  );
});

test('官方预设保留不同型号的编辑、尺寸和推理选项', async () => {
  const names = [
    'gpt-image-2.6-flare',
    'gpt-image-2.6-sunburst',
    'gpt-image-2.5-flare',
    'gpt-image-2.5-sunburst',
    'gemini-nano-banana-2.1',
    'gemini-3.1-flash-image',
    'gemini-3.1-flash-lite-image',
    'gemini-3-pro-image',
    'gemini-2.5-flash-image'
  ];
  const env = {
    ...environment(),
    MEDIA_PLATFORM_MODELS: JSON.stringify(
      names.map(model => ({
        id: model,
        model,
        baseUrl,
        secret: 'IMAGE_KEY',
        credits: 2,
        preset: 'official'
      }))
    )
  };
  const { models } = await platformCatalog(env);
  assert.equal(models.length, names.length);
  assert.ok(models.every(model => model.supportsImageEditing));
  assert.deepEqual(models[0].complexities, ['high', 'medium', 'low']);
  assert.deepEqual(models[2].complexities, []);
  assert.deepEqual(models[6].resolutions, ['1K']);
  assert.deepEqual(models[7].thinkingLevels, []);
  assert.ok(models[5].resolutions.includes('512'));
  assert.ok(models[4].aspectRatios.includes('21:9'));
});

test('Gemini uses its native generation contract and only declared image editing options', async () => {
  const png = Buffer.alloc(33);
  png.set([137, 80, 78, 71, 13, 10, 26, 10]);
  png.writeUInt32BE(13, 8);
  png.write('IHDR', 12);
  png.writeUInt32BE(1, 16);
  png.writeUInt32BE(1, 20);
  const image = png.toString('base64');
  const prepared = await platformImageInput(
    request({
      model: 'gemini-image',
      prompt: '编辑图片',
      aspectRatio: '16:9',
      resolution: '2K',
      thinkingLevel: 'high',
      n: 1,
      referenceImage: { mimeType: 'image/png', data: image }
    }),
    environment()
  );
  assert.equal(prepared.protocol, 'gemini');
  assert.equal(prepared.authHeader, 'x-goog-api-key');
  assert.deepEqual(prepared.body, {
    model: 'gemini-new-image-model',
    store: false,
    input: [
      { type: 'text', text: '编辑图片' },
      { type: 'image', mime_type: 'image/png', data: image }
    ],
    response_format: {
      type: 'image',
      mime_type: 'image/jpeg',
      delivery: 'inline',
      aspect_ratio: '16:9',
      image_size: '2K'
    },
    generation_config: { thinking_level: 'high' }
  });
  await assert.rejects(
    platformImageInput(
      request({
        model: 'square-only',
        prompt: '无编辑能力',
        size: '1024x1024',
        aspectRatio: '1:1',
        n: 1,
        referenceImage: { mimeType: 'image/png', data: image }
      }),
      environment()
    ),
    /不支持图生图/
  );
});

test('GPT Image editing uses the OpenAI multipart image edit endpoint', async () => {
  const png = Buffer.alloc(33);
  png.set([137, 80, 78, 71, 13, 10, 26, 10]);
  png.writeUInt32BE(13, 8);
  png.write('IHDR', 12);
  png.writeUInt32BE(1, 16);
  png.writeUInt32BE(1, 20);
  const image = png.toString('base64');
  const prepared = await platformImageInput(
    request({
      model: 'gpt-edit',
      prompt: '修改图片',
      size: '1024x1024',
      aspectRatio: '1:1',
      quality: 'high',
      complexity: 'high',
      n: 1,
      referenceImage: { mimeType: 'image/png', data: image }
    }),
    environment([imageModel, batchModel, editModel])
  );
  assert.equal(prepared.url, `${baseUrl}/images/edits`);
  assert.deepEqual(prepared.body, {
    _format: 'multipart',
    fields: {
      model: 'new-gpt-image-model',
      prompt: '修改图片',
      n: 1,
      size: '1024x1024',
      quality: 'high',
      complexity: 'high',
      output_format: 'png'
    },
    image: { mimeType: 'image/png', data: image }
  });
});
