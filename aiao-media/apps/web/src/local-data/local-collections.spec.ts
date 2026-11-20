import { describe, expect, it } from 'vitest';
import { defaultFreeProvider } from '../app/default-provider';
import { createNotebookDraft, emptyNotebook } from './draft-notebook';
import { decodeCollection } from './local-collections';

const providerId = '10000000-0000-4000-8000-000000000001';
const inputId = '20000000-0000-4000-8000-000000000001';
const timestamp = '2026-10-26T00:00:00.000Z';
const digest = 'a'.repeat(64);

const jobSummary = (request: Record<string, unknown>, result: unknown, id: string) => ({
  id,
  request,
  status: result === null ? 'failed' : 'completed',
  createdAt: timestamp,
  updatedAt: timestamp,
  delivery: { status: result === null ? 'unavailable' : 'available', expiresAt: null, acknowledgedAt: null },
  failure: result === null ? { category: 'upstream_unavailable', retryable: true } : null,
  result
});

describe('旧集合的逐条迁移', () => {
  it('保留供应商标识、默认选择和原始存储，由独立行承载公开配置', () => {
    const provider = defaultFreeProvider();
    const source = JSON.stringify({ providers: [provider], defaultId: provider.id });
    const rows = decodeCollection('providers', source);
    expect(rows[0]).toMatchObject({ sourceId: provider.id, position: 0 });
    expect(JSON.parse(rows[0].payload)).toEqual(provider);
    expect(source).toContain(provider.id);
  });
  it('保留 notebook 删除标记、冲突与未确认提交，不清理历史', () => {
    const book = emptyNotebook();
    const id = '00000000-0000-4000-8000-000000000001';
    createNotebookDraft(
      book,
      { kind: 'image', prompt: '保留', requiresReference: false, parameters: { operation: 'text-to-image' } },
      id
    );
    book.drafts[0].deleted = true;
    book.drafts[0].content = null;
    const rows = decodeCollection('drafts', JSON.stringify(book));
    expect(rows[0].sourceId).toBe(id);
    expect(JSON.parse(rows[0].payload).deleted).toBe(true);
  });
  it.each(['direct', 'proxy', 'platform'])(
    '保留任务创建时的 %s 通道，旧任务缺失通道时只在迁移时默认为直连',
    channel => {
      const task = {
        id: '00000000-0000-4000-8000-000000000001',
        request: {
          kind: 'image',
          operation: 'text-to-image',
          providerInstanceId: '10000000-0000-4000-8000-000000000001',
          providerRevision: 1,
          modelId: 'fixture',
          prompt: '通道'
        },
        status: 'completed',
        createdAt: '2026-10-26T00:00:00.000Z',
        updatedAt: '2026-10-26T00:00:00.000Z',
        delivery: { status: 'available', expiresAt: null, acknowledgedAt: null },
        failure: null,
        channel
      };
      expect(JSON.parse(decodeCollection('tasks', JSON.stringify([task]))[0].payload).channel).toBe(channel);
      const legacy = { ...task, channel: undefined };
      expect(JSON.parse(decodeCollection('tasks', JSON.stringify([legacy]))[0].payload).channel).toBe('direct');
    }
  );

  it('在 tasks-v1 中读取四类媒体任务并投影 providerId 和状态', () => {
    const tasks = [
      jobSummary(
        {
          kind: 'audio',
          operation: 'text-to-speech',
          providerInstanceId: providerId,
          providerRevision: 1,
          modelId: 'fixture-tts',
          language: 'zh-CN',
          voiceId: 'alloy',
          speed: 1,
          text: '你好'
        },
        {
          kind: 'audio',
          mediaType: 'audio/wav',
          format: 'wav',
          durationMs: 9.3125,
          sampleRate: 32000,
          channels: 1,
          bytes: 640,
          sha256: digest
        },
        '30000000-0000-4000-8000-000000000001'
      ),
      jobSummary(
        {
          kind: 'audio',
          operation: 'speech-to-text',
          providerInstanceId: providerId,
          providerRevision: 1,
          modelId: 'fixture-asr',
          language: null,
          input: {
            id: inputId,
            mediaType: 'audio/wav',
            bytes: 640,
            durationMs: 1000,
            sha256: digest,
            expiresAt: timestamp
          }
        },
        {
          kind: 'transcript',
          text: '你好',
          language: 'zh-CN',
          detectedLanguage: true,
          characters: 2,
          sha256: digest
        },
        '30000000-0000-4000-8000-000000000002'
      ),
      jobSummary(
        {
          kind: 'audio',
          operation: 'text-to-music',
          providerInstanceId: providerId,
          providerRevision: 1,
          modelId: 'fixture-music',
          prompt: '轻快钢琴',
          parameters: { durationSeconds: 10, instrumental: true }
        },
        {
          kind: 'audio',
          mediaType: 'audio/wav',
          format: 'wav',
          durationMs: 9.3125,
          sampleRate: 32000,
          channels: 1,
          bytes: 640,
          sha256: digest
        },
        '30000000-0000-4000-8000-000000000003'
      ),
      jobSummary(
        {
          kind: 'video',
          operation: 'text-to-video',
          providerInstanceId: providerId,
          providerRevision: 1,
          modelId: 'fixture-video',
          prompt: '海边日落',
          parameters: { ratio: '16:9', durationSeconds: 5, resolution: '768P' }
        },
        {
          kind: 'video',
          mediaType: 'video/mp4',
          format: 'mp4',
          codec: 'h264',
          width: 1280,
          height: 720,
          durationMs: 5000,
          bytes: 128,
          sha256: digest
        },
        '30000000-0000-4000-8000-000000000004'
      )
    ];
    const rows = decodeCollection('tasks', JSON.stringify(tasks));
    expect(rows).toHaveLength(4);
    expect(rows.map(row => row.status)).toEqual(['completed', 'completed', 'completed', 'completed']);
    expect(rows.map(row => row.providerId)).toEqual([providerId, providerId, providerId, providerId]);
    expect(JSON.parse(rows[1].payload).request.operation).toBe('speech-to-text');
    expect(JSON.parse(rows[3].payload).result.kind).toBe('video');
  });

  it('保留旧图片任务读取能力，同时拒绝损坏媒体摘要', () => {
    const image = {
      id: '30000000-0000-4000-8000-000000000001',
      request: {
        kind: 'image',
        operation: 'text-to-image',
        providerInstanceId: providerId,
        providerRevision: 1,
        modelId: 'fixture-image',
        prompt: '旧图片'
      },
      status: 'completed',
      createdAt: timestamp,
      updatedAt: timestamp,
      delivery: { status: 'available', expiresAt: null, acknowledgedAt: null },
      failure: null
    };
    expect(decodeCollection('tasks', JSON.stringify([image]))[0].providerId).toBe(providerId);
    const corrupted = jobSummary(
      {
        kind: 'audio',
        operation: 'text-to-speech',
        providerInstanceId: providerId,
        providerRevision: 1,
        modelId: 'fixture-tts',
        language: 'zh-CN',
        voiceId: 'alloy',
        speed: 1,
        text: '损坏'
      },
      {
        kind: 'audio',
        mediaType: 'audio/wav',
        format: 'wav',
        durationMs: 9.3125,
        sampleRate: 32000,
        channels: 1,
        bytes: 640,
        sha256: 'broken'
      },
      '30000000-0000-4000-8000-000000000005'
    );
    expect(() => decodeCollection('tasks', JSON.stringify([corrupted]))).toThrow();
  });

  it('拒绝重复身份、损坏任务和不完整提交日志，避免部分导入', () => {
    const provider = defaultFreeProvider();
    expect(() =>
      decodeCollection('providers', JSON.stringify({ providers: [provider, provider], defaultId: provider.id }))
    ).toThrow();
    expect(() => decodeCollection('tasks', '[{"id":"bad","status":"processing"}]')).toThrow();
    expect(() => decodeCollection('image-submissions', '{"version":1}')).toThrow();
  });
});
