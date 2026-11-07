// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { UpstreamHttpError, ValidationError } from '../../src/gateway/core/errors';
import { OpenAiCompatTtsProvider } from '../../src/gateway/providers/openai-compat-tts.provider';
import type { TtsRequest } from '../../src/gateway/providers/types';

const TEST_DIR = mkdtempSync(join(tmpdir(), 'aiao-tts-provider-'));
const VOICE_PATH = join(TEST_DIR, 'voice.wav');
const SIGNAL = new AbortController().signal;

writeFileSync(VOICE_PATH, 'voice-bytes');

const makeProvider = (capabilities: readonly string[] = [], apiKey = 'tts-secret') =>
  new OpenAiCompatTtsProvider({
    baseUrl: 'https://tts.test/',
    apiKey,
    modelIds: ['tts-1'],
    capabilities
  });

const makeRequest = (overrides: Partial<TtsRequest> = {}): TtsRequest => ({
  modelId: 'tts-1',
  input: 'hello',
  voice: 'alloy',
  responseFormat: 'mp3',
  ...overrides
});

afterEach(() => vi.unstubAllGlobals());
afterAll(() => rmSync(TEST_DIR, { recursive: true, force: true }));

describe('OpenAiCompatTtsProvider healthCheck', () => {
  it('accepts /healthz and does not send a fallback request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(makeProvider().healthCheck(SIGNAL)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('falls back after an unhealthy health endpoint', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 405 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(makeProvider().healthCheck(SIGNAL)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://tts.test', { method: 'HEAD', signal: SIGNAL });
  });

  it('rejects an unhealthy fallback endpoint after /healthz throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockRejectedValueOnce(new Error('connection refused'))
        .mockResolvedValueOnce(new Response(null, { status: 500, statusText: 'Failure' }))
    );

    const result = makeProvider().healthCheck(SIGNAL);
    await expect(result).rejects.toBeInstanceOf(UpstreamHttpError);
    await expect(result).rejects.toMatchObject({ status: 500 });
  });
});

describe('OpenAiCompatTtsProvider synthesize', () => {
  it('rejects reference audio unless the provider declares support', async () => {
    const result = makeProvider().synthesize(
      makeRequest({ voiceReference: { path: VOICE_PATH, mimeType: 'audio/wav' } }),
      SIGNAL
    );

    await expect(result).rejects.toBeInstanceOf(ValidationError);
    await expect(result).rejects.toMatchObject({
      code: 'voice_reference_unsupported',
      param: 'voice_reference'
    });
  });

  it('sends JSON with speed and returns the upstream content type', async () => {
    const response = new Response('audio', { headers: { 'content-type': 'audio/opus' } });
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetchMock);

    const result = await makeProvider().synthesize(makeRequest({ responseFormat: 'opus', speed: 1.25 }), SIGNAL);
    const [, init] = fetchMock.mock.calls[0];

    expect(result).toEqual({ audio: response.body, contentType: 'audio/opus' });
    expect(init?.headers).toEqual({ authorization: 'Bearer tts-secret', 'content-type': 'application/json' });
    expect(JSON.parse(String(init?.body))).toEqual({
      model: 'tts-1',
      input: 'hello',
      voice: 'alloy',
      response_format: 'opus',
      speed: 1.25
    });
  });

  it('omits speed and derives content type from the requested format', async () => {
    const response = new Response(new Uint8Array([1, 2, 3]));
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetchMock);

    const result = await makeProvider([], '').synthesize(makeRequest({ responseFormat: 'flac' }), SIGNAL);
    const [, init] = fetchMock.mock.calls[0];

    expect(result.contentType).toBe('audio/flac');
    expect(init?.headers).toEqual({ 'content-type': 'application/json' });
    expect(JSON.parse(String(init?.body))).not.toHaveProperty('speed');
  });

  it('sends supported reference audio as multipart', async () => {
    const response = new Response('audio', { headers: { 'content-type': 'audio/wav' } });
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetchMock);

    await makeProvider(['reference_voice']).synthesize(
      makeRequest({
        responseFormat: 'wav',
        speed: 0.9,
        voiceReference: { path: VOICE_PATH, mimeType: 'audio/wav' }
      }),
      SIGNAL
    );

    const [, init] = fetchMock.mock.calls[0];
    const form = init?.body as FormData;
    expect(form.get('model')).toBe('tts-1');
    expect(form.get('input')).toBe('hello');
    expect(form.get('voice')).toBe('alloy');
    expect(form.get('response_format')).toBe('wav');
    expect(form.get('speed')).toBe('0.9');
    expect(form.get('voice_reference')).toBeInstanceOf(File);
  });

  it('preserves an upstream error body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('invalid voice', { status: 400 })));

    await expect(makeProvider().synthesize(makeRequest(), SIGNAL)).rejects.toMatchObject({
      status: 400,
      message: 'tts upstream 400: invalid voice'
    });
  });

  it('falls back to status text when reading the error body fails', async () => {
    const response = new Response(null, { status: 502, statusText: 'Bad Gateway' });
    vi.spyOn(response, 'text').mockRejectedValue(new Error('body read failed'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    await expect(makeProvider().synthesize(makeRequest(), SIGNAL)).rejects.toMatchObject({
      status: 502,
      message: 'tts upstream 502: Bad Gateway'
    });
  });

  it('rejects an empty successful response body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));

    await expect(makeProvider().synthesize(makeRequest(), SIGNAL)).rejects.toMatchObject({
      status: 502,
      message: 'tts upstream returned empty body'
    });
  });
});
