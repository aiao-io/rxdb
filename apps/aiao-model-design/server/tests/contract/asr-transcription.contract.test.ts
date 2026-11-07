// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { bootTestServer, buildOpenAiClient, type TestServer } from '../fixtures/test-server';

let ts: TestServer;

beforeAll(async () => {
  ts = await bootTestServer();
});

/** 把字符串包成 multipart File payload */
const makeAudioFile = (content: string, filename: string = 'sample.wav', type: string = 'audio/wav'): File => {
  const blob = new Blob([content], { type });
  return new File([blob], filename, { type });
};

describe('OpenAI SDK contract — /v1/audio/transcriptions (US2 / T057)', () => {
  it('non-stream transcription returns OpenAI JSON { text }', async () => {
    const client = buildOpenAiClient(ts);
    const file = makeAudioFile('hello world audio bytes');
    const res = await client.audio.transcriptions.create({
      file,
      model: 'mock-asr-1'
    });
    expect(res.text).toMatch(/^mock-asr-echo:hello world/);
  });

  it('verbose_json response includes segments + language + duration', async () => {
    const client = buildOpenAiClient(ts);
    const file = makeAudioFile('foo bar', 'sample.mp3', 'audio/mpeg');
    const res = (await client.audio.transcriptions.create({
      file,
      model: 'mock-asr-1',
      response_format: 'verbose_json',
      language: 'en'
    })) as unknown as {
      text: string;
      segments: Array<{ start: number; end: number; text: string }>;
      language: string;
      duration: number;
    };
    expect(res.text).toMatch(/^mock-asr-echo:/);
    expect(Array.isArray(res.segments)).toBe(true);
    expect(res.language).toBe('en');
    expect(res.duration).toBeGreaterThan(0);
  });

  it('FR-021: provider/model exposed via x-aiao-* headers, NOT in JSON body', async () => {
    const form = new FormData();
    form.append('file', makeAudioFile('header test'));
    form.append('model', 'mock-asr-1');
    const res = await ts.app.handle(
      new Request('http://localhost/v1/audio/transcriptions', {
        method: 'POST',
        headers: { authorization: `Bearer ${ts.token}` },
        body: form
      })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('x-aiao-provider')).toBe('mock-asr');
    expect(res.headers.get('x-aiao-model')).toBe('mock-asr-1');
    expect(res.headers.get('x-trace-id')).toBeTruthy();
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(expect.arrayContaining(['text']));
    expect(body).not.toHaveProperty('provider');
    expect(body).not.toHaveProperty('provider_id');
    expect(body).not.toHaveProperty('model_id');
    expect(body).not.toHaveProperty('model');
  });

  it('rejects 404 model_not_found for unregistered model id', async () => {
    const client = buildOpenAiClient(ts);
    const file = makeAudioFile('hi');
    try {
      await client.audio.transcriptions.create({
        file,
        model: 'whisper-1'
      });
      throw new Error('should have thrown');
    } catch (e) {
      const err = e as { status: number };
      expect(err.status).toBe(404);
    }
  });

  it('rejects 422 audio_too_large for > 25 MB payload', async () => {
    const oversized = 'x'.repeat(25 * 1024 * 1024 + 1);
    const form = new FormData();
    form.append('file', makeAudioFile(oversized, 'big.wav'));
    form.append('model', 'mock-asr-1');
    const res = await ts.app.handle(
      new Request('http://localhost/v1/audio/transcriptions', {
        method: 'POST',
        headers: { authorization: `Bearer ${ts.token}` },
        body: form
      })
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as {
      error?: { type: string; code?: string };
    };
    expect(body.error?.type).toBe('invalid_request_error');
    expect(body.error?.code).toBe('audio_too_large');
  });

  it('rejects 401 without token', async () => {
    const form = new FormData();
    form.append('file', makeAudioFile('hi'));
    form.append('model', 'mock-asr-1');
    const res = await ts.app.handle(
      new Request('http://localhost/v1/audio/transcriptions', {
        method: 'POST',
        body: form
      })
    );
    expect(res.status).toBe(401);
  });

  it('propagates 500 upstream as 502 (mock inject-5xx)', async () => {
    const form = new FormData();
    form.append('file', makeAudioFile('inject-5xx'));
    form.append('model', 'mock-asr-1');
    const res = await ts.app.handle(
      new Request('http://localhost/v1/audio/transcriptions', {
        method: 'POST',
        headers: { authorization: `Bearer ${ts.token}` },
        body: form
      })
    );
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error?: { type: string } };
    expect(body.error?.type).toBe('api_error');
  });

  it('propagates 429 upstream rate-limit', async () => {
    const form = new FormData();
    form.append('file', makeAudioFile('inject-rate-limit'));
    form.append('model', 'mock-asr-1');
    const res = await ts.app.handle(
      new Request('http://localhost/v1/audio/transcriptions', {
        method: 'POST',
        headers: { authorization: `Bearer ${ts.token}` },
        body: form
      })
    );
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error?: { type: string } };
    expect(body.error?.type).toBe('rate_limit_error');
  });
});
