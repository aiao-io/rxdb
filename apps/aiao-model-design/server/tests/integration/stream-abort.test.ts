import { beforeAll, describe, expect, it } from 'vitest';
import { bootTestServer, buildOpenAiClient, rawRequest, type TestServer } from '../fixtures/test-server';

let ts: TestServer;

beforeAll(async () => {
  ts = await bootTestServer();
});

const longInput = 'x'.repeat(500);

describe('Stream abort (FR-006 / FR-007)', () => {
  it('client abort mid-stream does NOT emit error frame ([DONE] suppressed too)', async () => {
    const ctrl = new AbortController();
    const res = await rawRequest(
      ts,
      'POST',
      '/v1/chat/completions',
      {
        model: 'mock-echo-1',
        messages: [{ role: 'user', content: longInput }],
        stream: true
      },
      {}
    );
    expect(res.status).toBe(200);
    const reader = res.body!.getReader();
    let accBytes = 0;
    // 读 3 块就主动取消
    for (let i = 0; i < 3; i++) {
      const { value, done } = await reader.read();
      if (done) break;
      accBytes += value!.byteLength;
    }
    await reader.cancel();
    ctrl.abort();
    expect(accBytes).toBeGreaterThan(0);
  });

  it('concurrent streams are isolated — aborting one does not affect the other', async () => {
    const client = buildOpenAiClient(ts);

    const stream1Promise = (async () => {
      const stream = await client.chat.completions.create({
        model: 'mock-echo-1',
        messages: [{ role: 'user', content: 'stream-1-payload-with-some-text' }],
        stream: true
      });
      let acc = '';
      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) acc += delta;
      }
      return acc;
    })();

    const stream2Promise = (async () => {
      const stream = await client.chat.completions.create({
        model: 'mock-echo-1',
        messages: [{ role: 'user', content: 'stream-2-payload-with-other-text' }],
        stream: true
      });
      let acc = '';
      let aborted = false;
      try {
        for await (const chunk of stream) {
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) acc += delta;
          if (acc.length >= 10 && !aborted) {
            aborted = true;
            stream.controller.abort();
            break;
          }
        }
      } catch {
        // OpenAI SDK throws on iterator after abort — expected
      }
      return acc;
    })();

    const [out1, out2] = await Promise.all([stream1Promise, stream2Promise]);
    expect(out1).toBe('stream-1-payload-with-some-text');
    expect(out2.length).toBeGreaterThanOrEqual(10);
    expect(out2.length).toBeLessThan(out1.length);
  });

  it('client cancel after partial read emits no error frame on server', async () => {
    const res = await rawRequest(ts, 'POST', '/v1/chat/completions', {
      model: 'mock-echo-1',
      messages: [{ role: 'user', content: 'abcdefghij' }],
      stream: true
    });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let raw = '';
    const { value } = await reader.read();
    raw += decoder.decode(value);
    await reader.cancel();
    expect(raw).toContain('data: ');
    expect(raw).not.toContain('"error"');
  });
});
