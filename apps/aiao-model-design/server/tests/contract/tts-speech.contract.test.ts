// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { bootTestServer, buildOpenAiClient, type TestServer } from '../fixtures/test-server';

let ts: TestServer;

beforeAll(async () => {
  ts = await bootTestServer();
});

describe('OpenAI SDK contract — /v1/audio/speech (US3 / T073)', () => {
  it('non-stream synthesis returns audio binary body', async () => {
    const client = buildOpenAiClient(ts);
    const res = await client.audio.speech.create({
      model: 'mock-tts-1',
      input: 'hello tts',
      voice: 'alloy'
    });
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.toString('utf-8')).toBe('mock-tts-echo:hello tts');
  });

  it('x-aiao-provider / x-aiao-model headers exposed', async () => {
    const res = await ts.app.handle(
      new Request('http://localhost/v1/audio/speech', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${ts.token}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'mock-tts-1',
          input: 'header test',
          voice: 'alloy'
        })
      })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('x-aiao-provider')).toBe('mock-tts');
    expect(res.headers.get('x-aiao-model')).toBe('mock-tts-1');
    expect(res.headers.get('x-trace-id')).toBeTruthy();
    expect(res.headers.get('content-type')).toMatch(/audio\//);
  });

  it.each([
    ['mp3', 'audio/mpeg'],
    ['wav', 'audio/wav'],
    ['opus', 'audio/opus'],
    ['flac', 'audio/flac']
  ])('response_format=%s → Content-Type %s', async (format, expectedMime) => {
    const res = await ts.app.handle(
      new Request('http://localhost/v1/audio/speech', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${ts.token}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'mock-tts-1',
          input: 'fmt test',
          voice: 'alloy',
          response_format: format
        })
      })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe(expectedMime);
  });

  it('rejects 422 text_too_long when input > 4096 chars', async () => {
    const res = await ts.app.handle(
      new Request('http://localhost/v1/audio/speech', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${ts.token}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'mock-tts-1',
          input: 'x'.repeat(4097),
          voice: 'alloy'
        })
      })
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as {
      error?: { type: string; code?: string };
    };
    expect(body.error?.type).toBe('invalid_request_error');
    expect(body.error?.code).toBe('text_too_long');
  });

  it('rejects 422 for unsupported response_format', async () => {
    const res = await ts.app.handle(
      new Request('http://localhost/v1/audio/speech', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${ts.token}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'mock-tts-1',
          input: 'hi',
          voice: 'alloy',
          response_format: 'aac'
        })
      })
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('invalid_response_format');
  });

  it('rejects 404 model_not_found for unregistered tts model', async () => {
    const client = buildOpenAiClient(ts);
    try {
      await client.audio.speech.create({
        model: 'tts-1',
        input: 'hi',
        voice: 'alloy'
      });
      throw new Error('should have thrown');
    } catch (e) {
      const err = e as { status: number };
      expect(err.status).toBe(404);
    }
  });

  it('rejects 401 without token', async () => {
    const res = await ts.app.handle(
      new Request('http://localhost/v1/audio/speech', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'mock-tts-1',
          input: 'hi',
          voice: 'alloy'
        })
      })
    );
    expect(res.status).toBe(401);
  });
});
