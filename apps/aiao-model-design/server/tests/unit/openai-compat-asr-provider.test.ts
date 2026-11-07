// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { UpstreamHttpError } from '../../src/gateway/core/errors';
import { OpenAiCompatAsrProvider } from '../../src/gateway/providers/openai-compat-asr.provider';
import type { AsrRequest } from '../../src/gateway/providers/types';

const TEST_DIR = mkdtempSync(join(tmpdir(), 'aiao-asr-provider-'));
const AUDIO_PATH = join(TEST_DIR, 'sample.raw');
const SIGNAL = new AbortController().signal;

writeFileSync(AUDIO_PATH, 'audio-bytes');

const makeProvider = (apiKey = 'asr-secret') =>
  new OpenAiCompatAsrProvider({
    baseUrl: 'https://asr.test/',
    apiKey,
    modelIds: ['whisper-1'],
    capabilities: ['timestamps']
  });

const makeRequest = (overrides: Partial<AsrRequest> = {}): AsrRequest => ({
  modelId: 'whisper-1',
  audio: { path: AUDIO_PATH, mimeType: 'audio/custom', sizeBytes: 11 },
  ...overrides
});

afterEach(() => vi.unstubAllGlobals());
afterAll(() => rmSync(TEST_DIR, { recursive: true, force: true }));

describe('OpenAiCompatAsrProvider healthCheck', () => {
  it('accepts a healthy /healthz response without fallback', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(makeProvider().healthCheck(SIGNAL)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith('https://asr.test/healthz', { method: 'GET', signal: SIGNAL });
  });

  it('falls back to HEAD and accepts method-not-allowed', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('health endpoint unavailable'))
      .mockResolvedValueOnce(new Response(null, { status: 405 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(makeProvider().healthCheck(SIGNAL)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://asr.test', { method: 'HEAD', signal: SIGNAL });
  });

  it('rejects an unhealthy fallback endpoint', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 503 }))
        .mockResolvedValueOnce(new Response(null, { status: 502, statusText: 'Bad Gateway' }))
    );

    const result = makeProvider().healthCheck(SIGNAL);
    await expect(result).rejects.toBeInstanceOf(UpstreamHttpError);
    await expect(result).rejects.toMatchObject({ status: 502 });
  });
});

describe('OpenAiCompatAsrProvider transcribe', () => {
  it('serializes all optional fields and parses verbose JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        {
          text: 'hello',
          segments: [{ start: 0, end: 1, text: 'hello' }],
          language: 'en',
          duration: 1
        },
        { headers: { 'content-type': 'application/json; charset=utf-8' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      makeProvider().transcribe(
        makeRequest({ language: 'en', prompt: 'names', responseFormat: 'verbose_json', temperature: 0.25 }),
        SIGNAL
      )
    ).resolves.toEqual({
      text: 'hello',
      segments: [{ start: 0, end: 1, text: 'hello' }],
      language: 'en',
      duration: 1
    });

    const [, init] = fetchMock.mock.calls[0];
    const form = init?.body as FormData;
    expect(init?.headers).toEqual({ authorization: 'Bearer asr-secret' });
    expect(form.get('model')).toBe('whisper-1');
    expect(form.get('language')).toBe('en');
    expect(form.get('prompt')).toBe('names');
    expect(form.get('response_format')).toBe('verbose_json');
    expect(form.get('temperature')).toBe('0.25');
    expect(form.get('file')).toBeInstanceOf(File);
  });

  it('uses MIME fallback, omits absent fields and accepts text responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('plain transcript'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      makeProvider('').transcribe(makeRequest({ audio: { path: AUDIO_PATH, mimeType: '', sizeBytes: 11 } }), SIGNAL)
    ).resolves.toEqual({ text: 'plain transcript' });

    const [, init] = fetchMock.mock.calls[0];
    const form = init?.body as FormData;
    expect(init?.headers).toEqual({});
    expect(form.has('language')).toBe(false);
    expect(form.has('prompt')).toBe(false);
    expect(form.has('response_format')).toBe(false);
    expect(form.has('temperature')).toBe(false);
    expect((form.get('file') as File).type).toBe('audio/wav');
  });

  it('preserves an upstream error body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('quota exceeded', { status: 429 })));

    await expect(makeProvider().transcribe(makeRequest(), SIGNAL)).rejects.toMatchObject({
      status: 429,
      message: 'asr upstream 429: quota exceeded'
    });
  });

  it('falls back to status text when reading the error body fails', async () => {
    const response = new Response(null, { status: 503, statusText: 'Unavailable' });
    vi.spyOn(response, 'text').mockRejectedValue(new Error('body read failed'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    await expect(makeProvider().transcribe(makeRequest(), SIGNAL)).rejects.toMatchObject({
      status: 503,
      message: 'asr upstream 503: Unavailable'
    });
  });
});
