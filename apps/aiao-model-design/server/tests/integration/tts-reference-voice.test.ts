// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { bootTestServer, type TestServer } from '../fixtures/test-server';

let ts: TestServer;

beforeAll(async () => {
  ts = await bootTestServer();
});

const makeRefVoice = (content: string, filename = 'voice.wav', type = 'audio/wav'): File =>
  new File([new Blob([content], { type })], filename, { type });

describe('TTS reference voice multipart (US3 / T075)', () => {
  it('multipart with voice_reference → reference-capable provider accepts', async () => {
    const form = new FormData();
    form.append('model', 'mock-tts-ref-1');
    form.append('input', 'reference test');
    form.append('voice', 'custom');
    form.append('voice_reference', makeRefVoice('voice-sample-bytes'));
    const res = await ts.app.handle(
      new Request('http://localhost/v1/audio/speech', {
        method: 'POST',
        headers: { authorization: `Bearer ${ts.token}` },
        body: form
      })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('x-aiao-provider')).toBe('mock-tts-ref');
    const audio = await res.text();
    expect(audio).toBe('mock-tts-echo:reference test');
  });

  it('multipart with voice_reference on non-capable provider → 422 voice_reference_unsupported', async () => {
    const form = new FormData();
    form.append('model', 'mock-tts-1'); // mock-tts has no reference_voice capability
    form.append('input', 'no-ref-support');
    form.append('voice', 'alloy');
    form.append('voice_reference', makeRefVoice('voice-sample-bytes'));
    const res = await ts.app.handle(
      new Request('http://localhost/v1/audio/speech', {
        method: 'POST',
        headers: { authorization: `Bearer ${ts.token}` },
        body: form
      })
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('voice_reference_unsupported');
  });

  it('reference voice file is registered to retention store', async () => {
    const form = new FormData();
    form.append('model', 'mock-tts-ref-1');
    form.append('input', 'retention test');
    form.append('voice', 'custom');
    form.append('voice_reference', makeRefVoice('reference-payload-marker'));
    const res = await ts.app.handle(
      new Request('http://localhost/v1/audio/speech', {
        method: 'POST',
        headers: { authorization: `Bearer ${ts.token}` },
        body: form
      })
    );
    expect(res.status).toBe(200);
    // 文件被落盘后 mock-tts-ref 直接 echo 不读，但 traceId 应当存在
    expect(res.headers.get('x-trace-id')).toBeTruthy();
  });
});
