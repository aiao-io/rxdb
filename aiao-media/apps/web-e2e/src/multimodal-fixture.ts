import {
  relayResultKey,
  sealRelayResult,
  validateMediaCapabilityCatalog,
  type AudioResultManifest,
  type CreditEntry,
  type MediaCapabilityCatalog,
  type TranscriptResult,
  type VideoResultManifest
} from '@aiao-media/api-contracts';
import { expect, type BrowserContext, type Page, type Request } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setupPlatform } from './platform-fixture.ts';

type MediaResultManifest = AudioResultManifest | TranscriptResult | VideoResultManifest;

const ids = {
  tts: '10000000-0000-4000-8000-000000000001',
  asr: '10000000-0000-4000-8000-000000000002',
  music: '10000000-0000-4000-8000-000000000003',
  video: '10000000-0000-4000-8000-000000000004'
} as const;

export const multimodalCatalog: MediaCapabilityCatalog = validateMediaCapabilityCatalog({
  revision: 1,
  capabilities: [
    {
      providerInstanceId: ids.tts,
      providerRevision: 1,
      kind: 'audio',
      operation: 'text-to-speech',
      label: 'Fixture TTS',
      modelId: 'fixture-tts',
      credits: 2,
      input: { textMaxLength: 500 },
      parameters: {
        languages: ['zh-CN', 'en-US'],
        voices: [{ id: 'alloy', label: 'Fixture Alloy' }],
        speeds: [0.75, 1, 1.25]
      },
      output: { mediaTypes: ['audio/wav'], maxBytes: 8 * 1024 * 1024, maxDurationMs: 120_000 }
    },
    {
      providerInstanceId: ids.asr,
      providerRevision: 1,
      kind: 'audio',
      operation: 'speech-to-text',
      label: 'Fixture ASR',
      modelId: 'fixture-asr',
      credits: 1,
      input: { mediaTypes: ['audio/wav'], maxBytes: 16 * 1024 * 1024, maxDurationMs: 600_000 },
      parameters: { languages: ['zh-CN', 'en-US'] },
      output: { mediaTypes: ['application/json'] }
    },
    {
      providerInstanceId: ids.music,
      providerRevision: 1,
      kind: 'audio',
      operation: 'text-to-music',
      label: 'Fixture Music',
      modelId: 'fixture-music',
      credits: 4,
      input: { textMaxLength: 1000 },
      parameters: { durationsSeconds: [5, 10], instrumental: [false, true] },
      output: { mediaTypes: ['audio/wav'], maxBytes: 32 * 1024 * 1024, maxDurationMs: 300_000 }
    },
    {
      providerInstanceId: ids.video,
      providerRevision: 1,
      kind: 'video',
      operation: 'text-to-video',
      label: 'Fixture Video',
      modelId: 'fixture-video',
      credits: 8,
      input: { textMaxLength: 1000 },
      parameters: { ratios: ['16:9', '9:16'], durationsSeconds: [5, 10], resolutions: ['768P', '1080P'] },
      output: { mediaTypes: ['video/mp4'], maxBytes: 64 * 1024 * 1024, maxDurationMs: 300_000 }
    }
  ]
});

const fixtureVideo = new Uint8Array(readFileSync(new URL('./fixtures/fixture.mp4', import.meta.url)));

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function wav(durationMs = 500): Uint8Array<ArrayBuffer> {
  const samples = Math.max(1, Math.round((durationMs / 1000) * 32_000));
  const dataBytes = samples * 2;
  const bytes = new Uint8Array(44 + dataBytes);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode('RIFF'), 0);
  view.setUint32(4, bytes.byteLength - 8, true);
  bytes.set(new TextEncoder().encode('WAVEfmt '), 8);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 32_000, true);
  view.setUint32(28, 64_000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  bytes.set(new TextEncoder().encode('data'), 36);
  view.setUint32(40, dataBytes, true);
  return bytes;
}

export function asrWav(): Buffer {
  return Buffer.from(wav(500));
}

function audioManifest(bytes: Uint8Array): AudioResultManifest {
  return {
    kind: 'audio',
    mediaType: 'audio/wav',
    format: 'wav',
    durationMs: (bytes.byteLength - 44) / 64,
    sampleRate: 32_000,
    channels: 1,
    bytes: bytes.byteLength,
    sha256: digest(bytes)
  };
}

function videoBytes(): Uint8Array<ArrayBuffer> {
  return fixtureVideo.slice() as Uint8Array<ArrayBuffer>;
}

function videoManifest(bytes: Uint8Array): VideoResultManifest {
  return {
    kind: 'video',
    mediaType: 'video/mp4',
    format: 'mp4',
    codec: 'h264',
    width: 320,
    height: 180,
    durationMs: 1000,
    bytes: bytes.byteLength,
    sha256: digest(bytes)
  };
}

export interface MediaFixtureAnswer {
  status?: number;
  bytes?: Uint8Array<ArrayBuffer>;
  manifest?: MediaResultManifest;
  providerRequestId?: string;
}

export interface MediaFixtureTask {
  id: string;
  operation: string;
  token: string;
  status: 'dispatched' | 'received' | 'rejected' | 'needs_review';
  upstreamStatus: number | null;
  resultMimeType: string | null;
  manifest: MediaResultManifest | null;
  bytes: Uint8Array<ArrayBuffer> | null;
  providerRequestId: string | null;
  credit: 'reserved' | 'charged' | 'released';
}

const costs: Record<string, number> = {
  'text-to-speech': 2,
  'speech-to-text': 1,
  'text-to-music': 4,
  'text-to-video': 8
};

function view(task: MediaFixtureTask) {
  return {
    status: task.status,
    upstreamStatus: task.upstreamStatus,
    updatedAt: new Date().toISOString(),
    operation: task.operation,
    resultMimeType: task.resultMimeType,
    ...(task.providerRequestId ? { providerRequestId: task.providerRequestId } : {}),
    ...(task.manifest ? { result: task.manifest } : {})
  };
}

export function defaultMediaAnswer(request: Request): MediaFixtureAnswer {
  const body = request.postDataJSON() as { operation: string };
  if (body.operation === 'speech-to-text') {
    const text = 'fixture transcript';
    const manifest: TranscriptResult = {
      kind: 'transcript',
      text,
      language: 'zh-CN',
      detectedLanguage: false,
      characters: [...text].length,
      sha256: digest(new TextEncoder().encode(text))
    };
    return {
      bytes: new TextEncoder().encode(JSON.stringify(manifest)) as Uint8Array<ArrayBuffer>,
      manifest,
      providerRequestId: 'fixture-asr-request'
    };
  }
  if (body.operation === 'text-to-video') {
    const bytes = videoBytes();
    return { bytes, manifest: videoManifest(bytes), providerRequestId: 'fixture-video-request' };
  }
  const bytes = wav(500);
  return {
    bytes,
    manifest: audioManifest(bytes),
    providerRequestId: body.operation === 'text-to-music' ? 'fixture-music-request' : 'fixture-tts-request'
  };
}

export async function installMediaFixture(
  target: Page | BrowserContext,
  produce: (request: Request) => MediaFixtureAnswer | Promise<MediaFixtureAnswer> = defaultMediaAnswer
) {
  const context = 'context' in target ? target.context() : target;
  const account = await setupPlatform(context);
  const tasks = new Map<string, MediaFixtureTask>();
  const abandoned = new Set<string>();
  const inputs = new Set<string>();
  let calls = 0;
  let confirmCalls = 0;
  let discardCalls = 0;
  const routeTarget = target;

  await routeTarget.route('**/api/media/capabilities', route =>
    route.fulfill({ json: multimodalCatalog, headers: { 'cache-control': 'no-store' } })
  );
  await routeTarget.route('**/api/media/inputs**', async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() === 'POST' && pathname === '/api/media/inputs') {
      const bytes = request.postDataBuffer() ?? Buffer.alloc(0);
      const id = '10000000-0000-4000-8000-000000000010';
      inputs.add(id);
      return route.fulfill({
        status: 201,
        json: {
          id,
          mediaType: 'audio/wav',
          bytes: bytes.byteLength,
          durationMs: Math.max(1, Math.round((bytes.byteLength - 44) / 64)),
          sha256: digest(bytes),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
        }
      });
    }
    if (request.method() === 'DELETE') {
      const id = pathname.split('/').pop() ?? '';
      inputs.delete(id);
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ status: 404 });
  });
  await routeTarget.route('**/api/relay/tasks/**', async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const [, id, action = ''] = /\/api\/relay\/tasks\/([^/?]+)(\/\w+)?/.exec(pathname) ?? [];
    if (!id) return route.fulfill({ status: 404 });
    const token = request.headers()['x-relay-task-token'] ?? '';
    let task = tasks.get(id);
    if (request.method() === 'PUT') {
      expect(request.headers()['authorization']).toBe(`Bearer ${account.token}`);
      if (abandoned.has(id)) return route.fulfill({ status: 409 });
      if (task) return route.fulfill({ json: view(task) });
      const body = request.postDataJSON() as { operation?: string };
      const operation = body.operation ?? '';
      const cost = costs[operation];
      if (!cost) return route.fulfill({ status: 400 });
      if (account.balance - account.reserved < cost) return route.fulfill({ status: 402 });
      account.reserved += cost;
      calls++;
      task = {
        id,
        operation,
        token,
        status: 'dispatched',
        upstreamStatus: null,
        resultMimeType: null,
        manifest: null,
        bytes: null,
        providerRequestId: null,
        credit: 'reserved'
      };
      tasks.set(id, task);
      void Promise.resolve(produce(request)).then(answer => {
        task!.upstreamStatus = answer.status ?? 200;
        if (answer.status && answer.status >= 400 && answer.status < 500) {
          task!.status = 'rejected';
          task!.credit = 'released';
          account.reserved -= cost;
          return;
        }
        if (!answer.bytes || !answer.manifest || (answer.status ?? 200) >= 500) {
          task!.status = 'needs_review';
          return;
        }
        task!.status = 'received';
        task!.bytes = answer.bytes;
        task!.manifest = answer.manifest;
        task!.providerRequestId = answer.providerRequestId ?? null;
        task!.resultMimeType = answer.manifest.kind === 'transcript' ? 'application/json' : answer.manifest.mediaType;
      });
      return route.fulfill({ status: 202, json: view(task) });
    }
    expect(request.headers()['authorization']).toBeUndefined();
    if (action === '/abandon' && !task) {
      abandoned.add(id);
      return route.fulfill({ status: 404 });
    }
    if (!task || task.token !== token) return route.fulfill({ status: 404 });
    if (action === '/result') {
      if (task.status !== 'received' || !task.bytes) return route.fulfill({ status: 409 });
      const key = await relayResultKey(task.token, task.id, 'encrypt');
      const sealed = await sealRelayResult(key, task.bytes);
      return route.fulfill({ body: Buffer.from(sealed), contentType: 'application/octet-stream' });
    }
    if (action === '/confirm') {
      confirmCalls++;
      if (task.credit === 'reserved') {
        account.reserved -= costs[task.operation];
        account.balance -= costs[task.operation];
        task.credit = 'charged';
        account.entries.unshift({
          id: account.entries.length + 1,
          user_id: '10000000-0000-4000-8000-000000000099',
          actor_id: '10000000-0000-4000-8000-000000000099',
          request_id: task.id,
          source: 'generation',
          delta: -costs[task.operation],
          balance_after: account.balance,
          reason: '平台媒体生成',
          created_at: new Date().toISOString()
        } satisfies CreditEntry);
      }
      return route.fulfill({ status: 204 });
    }
    if (action === '/discard') {
      discardCalls++;
      if (task.credit === 'reserved') {
        account.reserved -= costs[task.operation];
        task.credit = 'released';
      }
      return route.fulfill({ status: 204 });
    }
    if (request.method() === 'DELETE') {
      if (task.credit === 'reserved') {
        account.reserved -= costs[task.operation];
        task.credit = 'released';
      }
      tasks.delete(id);
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ json: view(task) });
  });

  return {
    account,
    tasks,
    inputs,
    abandoned,
    get calls() {
      return calls;
    },
    get confirmCalls() {
      return confirmCalls;
    },
    get discardCalls() {
      return discardCalls;
    }
  };
}
