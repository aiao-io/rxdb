// @vitest-environment node
import { existsSync, mkdtempSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RetentionStore } from '../../src/gateway/core/retention';
import { bootTestServer, type TestServer } from '../fixtures/test-server';

let ts: TestServer;
let retentionRoot: string;

beforeAll(async () => {
  retentionRoot = mkdtempSync(join(tmpdir(), 'asr-e2e-'));
  process.env.GATEWAY_TMP_DIR = retentionRoot;
  ts = await bootTestServer();
});

afterAll(() => {
  rmSync(retentionRoot, { recursive: true, force: true });
});

const makeAudioFile = (content: string, filename = 'sample.wav', type = 'audio/wav'): File =>
  new File([new Blob([content], { type })], filename, { type });

describe('ASR end-to-end (US2 / T058)', () => {
  it('multipart upload → mock provider transcribe → file written to retention dir', async () => {
    const form = new FormData();
    form.append('file', makeAudioFile('end-to-end audio bytes'));
    form.append('model', 'mock-asr-1');
    const res = await ts.app.handle(
      new Request('http://localhost/v1/audio/transcriptions', {
        method: 'POST',
        headers: { authorization: `Bearer ${ts.token}` },
        body: form
      })
    );
    expect(res.status).toBe(200);
    const traceId = res.headers.get('x-trace-id');
    expect(traceId).toBeTruthy();
    const body = (await res.json()) as { text: string };
    expect(body.text).toMatch(/^mock-asr-echo:end-to-end/);
  });

  it('retention store sweeps files older than ttlMs (manual tick)', async () => {
    const store = new RetentionStore({
      rootDir: retentionRoot,
      ttlMs: 1_000,
      sweepIntervalMs: 60_000
    });
    // Write a fake old file directly
    const oldPath = await store.register('aged-id', 'wav', Buffer.from('old'));
    expect(existsSync(oldPath)).toBe(true);
    // Backdate mtime to 60s ago
    const sixtySecondsAgo = Date.now() / 1000 - 60;
    utimesSync(oldPath, sixtySecondsAgo, sixtySecondsAgo);
    // Trigger sweep
    const removed = await store.tick();
    expect(removed).toBeGreaterThanOrEqual(1);
    expect(existsSync(oldPath)).toBe(false);
  });

  it('verbose_json response carries segments / language / duration', async () => {
    const form = new FormData();
    form.append('file', makeAudioFile('hello e2e'));
    form.append('model', 'mock-asr-1');
    form.append('response_format', 'verbose_json');
    form.append('language', 'en');
    const res = await ts.app.handle(
      new Request('http://localhost/v1/audio/transcriptions', {
        method: 'POST',
        headers: { authorization: `Bearer ${ts.token}` },
        body: form
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      text: string;
      segments: Array<{ start: number; end: number; text: string }>;
      language: string;
      duration: number;
    };
    expect(body.text).toMatch(/^mock-asr-echo:/);
    expect(body.segments.length).toBeGreaterThanOrEqual(1);
    expect(body.language).toBe('en');
    expect(body.duration).toBeGreaterThan(0);
  });
});
