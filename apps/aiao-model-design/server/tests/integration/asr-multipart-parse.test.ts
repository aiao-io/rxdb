// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { bootTestServer, type TestServer } from '../fixtures/test-server';

let ts: TestServer;

beforeAll(async () => {
  ts = await bootTestServer();
});

const makeAudioFile = (content: string, filename = 'sample.wav', type = 'audio/wav'): File =>
  new File([new Blob([content], { type })], filename, { type });

describe('ASR multipart parse (US2 / T059)', () => {
  it('accepts standard audio/wav upload', async () => {
    const form = new FormData();
    form.append('file', makeAudioFile('wav-bytes', 'a.wav', 'audio/wav'));
    form.append('model', 'mock-asr-1');
    const res = await ts.app.handle(
      new Request('http://localhost/v1/audio/transcriptions', {
        method: 'POST',
        headers: { authorization: `Bearer ${ts.token}` },
        body: form
      })
    );
    expect(res.status).toBe(200);
  });

  it.each([
    ['mp3-bytes', 'a.mp3', 'audio/mpeg'],
    ['webm-bytes', 'a.webm', 'audio/webm'],
    ['ogg-bytes', 'a.ogg', 'audio/ogg'],
    ['flac-bytes', 'a.flac', 'audio/flac'],
    ['m4a-bytes', 'a.m4a', 'audio/mp4']
  ])('accepts %s upload', async (content, filename, type) => {
    const form = new FormData();
    form.append('file', makeAudioFile(content, filename, type));
    form.append('model', 'mock-asr-1');
    const res = await ts.app.handle(
      new Request('http://localhost/v1/audio/transcriptions', {
        method: 'POST',
        headers: { authorization: `Bearer ${ts.token}` },
        body: form
      })
    );
    expect(res.status).toBe(200);
  });

  it('missing file field → 422 invalid_request_error', async () => {
    const form = new FormData();
    form.append('model', 'mock-asr-1');
    const res = await ts.app.handle(
      new Request('http://localhost/v1/audio/transcriptions', {
        method: 'POST',
        headers: { authorization: `Bearer ${ts.token}` },
        body: form
      })
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    const body = (await res.json()) as { error?: { type: string } };
    expect(body.error?.type).toBe('invalid_request_error');
  });

  it('missing model field → schema validation error', async () => {
    const form = new FormData();
    form.append('file', makeAudioFile('hi'));
    const res = await ts.app.handle(
      new Request('http://localhost/v1/audio/transcriptions', {
        method: 'POST',
        headers: { authorization: `Bearer ${ts.token}` },
        body: form
      })
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('OpenAI-style error body shape: { error: { type, message, code?, param? } }', async () => {
    const form = new FormData();
    form.append('file', makeAudioFile('big'.repeat(10), 'x.wav'));
    form.append('model', 'no-such-model');
    const res = await ts.app.handle(
      new Request('http://localhost/v1/audio/transcriptions', {
        method: 'POST',
        headers: { authorization: `Bearer ${ts.token}` },
        body: form
      })
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as {
      error?: { type: string; message: string; code?: string };
    };
    expect(body.error).toBeDefined();
    expect(body.error?.type).toBe('invalid_request_error');
    expect(body.error?.message).toContain('model_not_found');
    expect(body.error?.code).toBe('model_not_found');
  });
});
