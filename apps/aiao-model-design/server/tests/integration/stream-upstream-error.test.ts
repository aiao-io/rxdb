import { beforeAll, describe, expect, it } from 'vitest';
import {
  bootTestServer,
  buildAnthropicClient,
  buildOpenAiClient,
  rawRequest,
  type TestServer
} from '../fixtures/test-server';

let ts: TestServer;

beforeAll(async () => {
  ts = await bootTestServer();
});

describe('Stream upstream error — OpenAI v1 (FR-007)', () => {
  it('non-stream 5xx returns HTTP 502 + api_error OpenAI error body', async () => {
    const client = buildOpenAiClient(ts);
    try {
      await client.chat.completions.create({
        model: 'mock-echo-1',
        messages: [{ role: 'user', content: 'inject-5xx' }]
      });
      throw new Error('should have thrown');
    } catch (e) {
      const err = e as { status: number; error?: { type: string } };
      expect(err.status).toBe(502);
      expect(err.error?.type).toBe('api_error');
    }
  });

  it('non-stream 429 returns HTTP 429 + rate_limit_error', async () => {
    const client = buildOpenAiClient(ts);
    try {
      await client.chat.completions.create({
        model: 'mock-echo-1',
        messages: [{ role: 'user', content: 'inject-rate-limit' }]
      });
      throw new Error('should have thrown');
    } catch (e) {
      const err = e as { status: number; error?: { type: string } };
      expect(err.status).toBe(429);
      expect(err.error?.type).toBe('rate_limit_error');
    }
  });

  it('stream 5xx returns 200 + in-stream error frame, NO [DONE]', async () => {
    const res = await rawRequest(ts, 'POST', '/v1/chat/completions', {
      model: 'mock-echo-1',
      messages: [{ role: 'user', content: 'inject-5xx' }],
      stream: true
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('"error"');
    expect(text).not.toContain('[DONE]');
    const errorFrame = text.split('\n\n').find(f => f.includes('"error"'));
    const payload = JSON.parse(errorFrame!.slice(6));
    expect(payload.error.type).toBe('api_error');
  });

  it('stream 429 emits rate_limit_error frame', async () => {
    const res = await rawRequest(ts, 'POST', '/v1/chat/completions', {
      model: 'mock-echo-1',
      messages: [{ role: 'user', content: 'inject-rate-limit' }],
      stream: true
    });
    const text = await res.text();
    expect(text).not.toContain('[DONE]');
    const errorFrame = text.split('\n\n').find(f => f.includes('"error"'))!;
    const payload = JSON.parse(errorFrame.slice(6));
    expect(payload.error.type).toBe('rate_limit_error');
  });
});

describe('Stream upstream error — Anthropic v1 (FR-007)', () => {
  it('non-stream 5xx returns HTTP 502 + Anthropic api_error body', async () => {
    const client = buildAnthropicClient(ts);
    try {
      await client.messages.create({
        model: 'mock-echo-1',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'inject-5xx' }]
      });
      throw new Error('should have thrown');
    } catch (e) {
      const err = e as {
        status: number;
        error?: { type: string; error: { type: string } };
      };
      expect(err.status).toBe(502);
      expect(err.error?.type).toBe('error');
      expect(err.error?.error.type).toBe('api_error');
    }
  });

  it('non-stream rate-limit returns HTTP 429 + rate_limit_error', async () => {
    const client = buildAnthropicClient(ts);
    try {
      await client.messages.create({
        model: 'mock-echo-1',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'inject-rate-limit' }]
      });
      throw new Error('should have thrown');
    } catch (e) {
      const err = e as {
        status: number;
        error?: { type: string; error: { type: string } };
      };
      expect(err.status).toBe(429);
      expect(err.error?.error.type).toBe('rate_limit_error');
    }
  });

  it('stream 5xx emits event: error + NO message_stop', async () => {
    const res = await rawRequest(ts, 'POST', '/v1/messages', {
      model: 'mock-echo-1',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'inject-5xx' }],
      stream: true
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    const eventLines = text
      .split('\n\n')
      .filter(f => f.startsWith('event:'))
      .map(f => f.split('\n')[0].replace('event: ', ''));
    expect(eventLines).toContain('error');
    expect(eventLines).not.toContain('message_stop');
  });

  it('stream rate-limit emits Anthropic rate_limit_error', async () => {
    const res = await rawRequest(ts, 'POST', '/v1/messages', {
      model: 'mock-echo-1',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'inject-rate-limit' }],
      stream: true
    });
    const text = await res.text();
    const errorFrame = text.split('\n\n').find(f => f.startsWith('event: error'))!;
    const dataLine = errorFrame.split('\n').find(l => l.startsWith('data: '))!;
    const payload = JSON.parse(dataLine.slice(6));
    expect(payload.error.type).toBe('rate_limit_error');
  });
});
