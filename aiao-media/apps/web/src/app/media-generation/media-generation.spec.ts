import { validateGenerationJobSummary } from '@aiao-media/api-contracts';
import type {
  AsrGenerationJobSummary,
  AudioGenerationJobSummary,
  AudioResultManifest,
  TranscriptResult,
  VideoGenerationJobSummary,
  VideoResultManifest
} from '@aiao-media/api-contracts';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LocalMediaStore } from '../../local-data';
import { MediaGeneration } from './media-generation';
import type { ProductClient } from '../product-client';
import type { ProductAuthorization } from '../supabase-auth';

const providerInstanceId = '10000000-0000-4000-8000-000000000001';
const taskId = '10000000-0000-4000-8000-000000000010';
const access: ProductAuthorization = {
  config: { url: 'https://account.example', anonKey: 'sb_publishable_fixture' },
  userId: '10000000-0000-4000-8000-000000000099',
  session: {
    access_token: 'fixture-session',
    refresh_token: 'fixture-refresh',
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: '10000000-0000-4000-8000-000000000099',
      aud: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-11-20T00:00:00.000Z'
    }
  }
};
const timestamps = {
  createdAt: '2026-11-20T00:00:00.000Z',
  updatedAt: '2026-11-20T00:00:00.000Z'
};

function storeStub() {
  const preferences = new Map<string, { payload: string; revision: number }>();
  const savePreferences = vi.fn(async (changes: readonly { key: string; payload: string; revision: number | null }[]) =>
    changes.map(change => {
      const revision = (preferences.get(change.key)?.revision ?? 0) + 1;
      preferences.set(change.key, { payload: change.payload, revision });
      return revision;
    })
  );
  return {
    store: {
      preference: vi.fn(async (key: string) => preferences.get(key) ?? null),
      savePreferences,
      saveTranscript: vi.fn(async () => undefined),
      saveMediaResult: vi.fn(async () => undefined),
      markMediaSubmissionHandled: vi.fn(async () => undefined)
    } as unknown as LocalMediaStore,
    savePreferences
  };
}

function mediaTask(operation: 'text-to-speech' | 'speech-to-text' | 'text-to-video') {
  const request =
    operation === 'text-to-speech' ?
      {
        kind: 'audio' as const,
        operation,
        providerInstanceId,
        providerRevision: 1,
        modelId: 'fixture-tts',
        language: 'zh-CN',
        voiceId: 'alloy',
        speed: 1,
        text: '测试文本'
      }
    : operation === 'speech-to-text' ?
      {
        kind: 'audio' as const,
        operation,
        providerInstanceId,
        providerRevision: 1,
        modelId: 'fixture-asr',
        language: null,
        input: {
          id: '10000000-0000-4000-8000-000000000011',
          mediaType: 'audio/wav' as const,
          bytes: 76,
          durationMs: 1_000,
          sha256: 'a'.repeat(64),
          expiresAt: '2026-11-20T01:00:00.000Z'
        }
      }
    : {
        kind: 'video' as const,
        operation,
        providerInstanceId,
        providerRevision: 1,
        modelId: 'fixture-video',
        prompt: '测试视频',
        parameters: { ratio: '16:9' as const, durationSeconds: 5, resolution: '768P' as const }
      };
  const result =
    operation === 'text-to-speech' ?
      ({
        kind: 'audio',
        mediaType: 'audio/wav',
        format: 'wav',
        durationMs: 1,
        sampleRate: 32_000,
        channels: 1,
        bytes: 108,
        sha256: 'b'.repeat(64)
      } satisfies AudioResultManifest)
    : operation === 'speech-to-text' ?
      ({
        kind: 'transcript',
        text: '测试转写',
        language: 'zh-CN',
        detectedLanguage: false,
        characters: 4,
        sha256: 'c'.repeat(64)
      } satisfies TranscriptResult)
    : ({
        kind: 'video',
        mediaType: 'video/mp4',
        format: 'mp4',
        codec: 'h264',
        width: 320,
        height: 180,
        durationMs: 1_000,
        bytes: 128,
        sha256: 'd'.repeat(64)
      } satisfies VideoResultManifest);
  return {
    task: {
      id: taskId,
      request,
      status: 'completed' as const,
      ...timestamps,
      delivery: { status: 'available' as const, expiresAt: null, acknowledgedAt: null },
      failure: null,
      providerRequestId: 'provider-request-01',
      result
    } as AudioGenerationJobSummary | AsrGenerationJobSummary | VideoGenerationJobSummary,
    result,
    blob: new Blob([operation === 'speech-to-text' ? JSON.stringify(result) : 'fixture'], {
      type: operation === 'speech-to-text' ? 'application/json' : operation === 'text-to-video' ? 'video/mp4' : 'audio/wav'
    })
  };
}

describe('多模态媒体保存重试', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it.each([
    ['text-to-speech', 'saveMediaResult'],
    ['speech-to-text', 'saveTranscript'],
    ['text-to-video', 'saveMediaResult']
  ] as const)('%s 重试只写本机并确认一次', async (operation, method) => {
    vi.spyOn(MediaGeneration.prototype, 'loadCapabilities').mockResolvedValue();
    const fixture = TestBed.createComponent(MediaGeneration);
    const { store, savePreferences } = storeStub();
    const client = { authorization: vi.fn(async () => access) } as unknown as ProductClient;
    fixture.componentRef.setInput('client', client);
    fixture.componentRef.setInput('store', store);
    fixture.componentRef.setInput('workspaceKey', 'fixture-workspace');
    fixture.componentRef.setInput('authReady', true);
    fixture.detectChanges();

    const current = mediaTask(operation);
    expect(() => validateGenerationJobSummary(current.task)).not.toThrow();
    fixture.componentInstance.task.set(current.task as never);
    fixture.componentInstance.result.set(current.result as never);
    Object.assign(fixture.componentInstance, {
      resultBlob: current.blob,
      settlement: { confirm: vi.fn(async () => undefined), discard: vi.fn(async () => undefined) }
    });

    await fixture.componentInstance.retrySave();

    expect(fixture.componentInstance.error()).toBe('');
    const saveCall = method === 'saveTranscript' ? store.saveTranscript : store.saveMediaResult;
    expect(saveCall).toHaveBeenCalledOnce();
    expect(store.markMediaSubmissionHandled).toHaveBeenCalledOnce();
    expect(savePreferences).toHaveBeenCalled();
    const taskJournal = JSON.parse((await store.preference('tasks-v1'))?.payload ?? '[]') as Array<Record<string, unknown>>;
    expect(taskJournal[0]?.['providerRequestId']).toBe('provider-request-01');
    expect(fixture.componentInstance.saved()).toBe(true);
    expect(fixture.componentInstance.error()).toBe('');
  });
});
