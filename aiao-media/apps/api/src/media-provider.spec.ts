import { describe, expect, it } from 'vitest';
import { fixtureMediaEnvironment, fixtureMp4, fixtureWav } from './media-fixtures.ts';
import { mediaCapabilityCatalog } from './media-capabilities.ts';
import { normalizeMediaResponse, type MediaDispatch } from './media-provider.ts';

const requestBase = {
  providerInstanceId: '10000000-0000-4000-8000-000000000001',
  providerRevision: 1,
  modelId: 'fixture-tts'
};
const dispatch = (request: MediaDispatch['request'], resultKind: MediaDispatch['resultKind']): MediaDispatch => ({
  operation: request.operation,
  url: 'https://fixture-media.example.test/v1/result',
  body: {},
  protocol: 'openai',
  authorization: 'Bearer fixture',
  cost: 1,
  resultKind,
  maxResultBytes: 64 * 1024 * 1024,
  maxResultDurationMs: 300_000,
  request
});

describe('fixture media provider normalization', () => {
  it('builds a public catalog without fixture credentials', () => {
    const catalog = mediaCapabilityCatalog(fixtureMediaEnvironment());
    expect(catalog.capabilities).toHaveLength(4);
    expect(JSON.stringify(catalog)).not.toContain('fixture-media-secret');
    expect(JSON.stringify(catalog)).not.toContain('fixture-media.example.test');
  });

  it('normalizes a binary TTS WAV response from actual bytes', async () => {
    const request = {
      kind: 'audio',
      operation: 'text-to-speech',
      ...requestBase,
      language: 'zh-CN',
      voiceId: 'alloy',
      speed: 1,
      text: '你好'
    } as const;
    const wav = fixtureWav(1000);
    const result = await normalizeMediaResponse(
      new Response(wav, { headers: { 'content-type': 'audio/wav' } }),
      dispatch(request, 'audio')
    );
    expect(result.mediaType).toBe('audio/wav');
    expect(result.bytes).toEqual(wav);
    expect(result.manifest).toMatchObject({ kind: 'audio', bytes: wav.byteLength, durationMs: 1000 });
  });

  it('keeps only safe provider request IDs from headers and JSON', async () => {
    const request = {
      kind: 'audio',
      operation: 'text-to-speech',
      ...requestBase,
      language: 'zh-CN',
      voiceId: 'alloy',
      speed: 1,
      text: '你好'
    } as const;
    const headerResult = await normalizeMediaResponse(
      new Response(fixtureWav(), { headers: { 'content-type': 'audio/wav', 'x-request-id': 'header_request_01' } }),
      dispatch(request, 'audio')
    );
    expect(headerResult.providerRequestId).toBe('header_request_01');

    const secondaryHeader = await normalizeMediaResponse(
      new Response(fixtureWav(), {
        headers: {
          'content-type': 'audio/wav',
          'x-request-id': 'https://provider.example.test/request',
          'x-provider-request-id': 'secondary_request_01'
        }
      }),
      dispatch(request, 'audio')
    );
    expect(secondaryHeader.providerRequestId).toBe('secondary_request_01');

    const jsonResult = await normalizeMediaResponse(
      Response.json(
        { id: 'json-request-01', data: [{ b64_json: Buffer.from(fixtureWav()).toString('base64') }] },
        { headers: { 'x-request-id': 'https://provider.example.test/request' } }
      ),
      dispatch(request, 'audio')
    );
    expect(jsonResult.providerRequestId).toBe('json-request-01');

    const unsafe = await normalizeMediaResponse(
      Response.json(
        { text: 'fixture transcript', request_id: 'https://provider.example.test/request' },
        { headers: { 'x-provider-request-id': 'contains spaces and a credential' } }
      ),
      dispatch(
        {
          kind: 'audio',
          operation: 'speech-to-text',
          ...requestBase,
          modelId: 'fixture-asr',
          language: null,
          input: {
            id: '10000000-0000-4000-8000-000000000010',
            mediaType: 'audio/wav',
            bytes: fixtureWav().byteLength,
            durationMs: 1000,
            sha256: 'a'.repeat(64),
            expiresAt: new Date(Date.now() + 60_000).toISOString()
          }
        },
        'transcript'
      )
    );
    expect(unsafe.providerRequestId).toBeUndefined();
  });

  it('normalizes JSON audio, transcript and video fixture responses', async () => {
    const wav = fixtureWav(500);
    const music = await normalizeMediaResponse(
      Response.json({ data: [{ b64_json: Buffer.from(wav).toString('base64') }] }),
      dispatch(
        {
          kind: 'audio',
          operation: 'text-to-music',
          ...requestBase,
          modelId: 'fixture-music',
          prompt: 'ambient',
          parameters: { durationSeconds: 5, instrumental: true }
        },
        'audio'
      )
    );
    const transcript = await normalizeMediaResponse(
      Response.json({ text: '  fixture transcript  ', language: 'en-US' }),
      dispatch(
        {
          kind: 'audio',
          operation: 'speech-to-text',
          ...requestBase,
          modelId: 'fixture-asr',
          language: null,
          input: {
            id: '10000000-0000-4000-8000-000000000010',
            mediaType: 'audio/wav',
            bytes: wav.byteLength,
            durationMs: 500,
            sha256: 'a'.repeat(64),
            expiresAt: new Date(Date.now() + 60_000).toISOString()
          }
        },
        'transcript'
      )
    );
    const video = await normalizeMediaResponse(
      new Response(fixtureMp4(), { headers: { 'content-type': 'video/mp4' } }),
      dispatch(
        {
          kind: 'video',
          operation: 'text-to-video',
          providerInstanceId: '10000000-0000-4000-8000-000000000004',
          providerRevision: 1,
          modelId: 'fixture-video',
          prompt: 'fixture',
          parameters: { ratio: '16:9', durationSeconds: 5, resolution: '768P' }
        },
        'video'
      )
    );
    expect(music.manifest).toMatchObject({ kind: 'audio', durationMs: 500 });
    expect(transcript.manifest).toMatchObject({ kind: 'transcript', text: 'fixture transcript' });
    expect(video.manifest).toMatchObject({ kind: 'video', width: 320, height: 180, durationMs: 1000 });
  });

  it('downloads provider-hosted media URLs only through the configured provider origin', async () => {
    const wav = fixtureWav(500);
    const requests: Array<{ url: string; authorization: string; redirect: string }> = [];
    const result = await normalizeMediaResponse(
      Response.json({ data: [{ url: 'https://fixture-media.example.test/v1/files/audio.wav' }] }),
      {
        ...dispatch(
          {
            kind: 'audio',
            operation: 'text-to-music',
            ...requestBase,
            modelId: 'fixture-music',
            prompt: 'ambient',
            parameters: { durationSeconds: 5, instrumental: true }
          },
          'audio'
        ),
        fetchResult: async (url, init) => {
          requests.push({
            url,
            authorization: new Headers(init.headers).get('authorization') ?? '',
            redirect: init.redirect ?? 'follow'
          });
          return new Response(wav, { headers: { 'content-type': 'audio/wav' } });
        }
      }
    );
    expect(result.manifest).toMatchObject({ kind: 'audio', durationMs: 500 });
    expect(requests).toEqual([
      {
        url: 'https://fixture-media.example.test/v1/files/audio.wav',
        authorization: 'Bearer fixture',
        redirect: 'error'
      }
    ]);

    await expect(
      normalizeMediaResponse(
        Response.json({ url: 'https://other.example.test/audio.wav' }),
        {
          ...dispatch(
            {
              kind: 'audio',
              operation: 'text-to-music',
              ...requestBase,
              modelId: 'fixture-music',
              prompt: 'ambient',
              parameters: { durationSeconds: 5, instrumental: true }
            },
            'audio'
          ),
          fetchResult: async () => new Response(wav, { headers: { 'content-type': 'audio/wav' } })
        }
      )
    ).rejects.toThrow('结果地址');
  });

  it('uses capability output limits and rejects missing actual video metadata', async () => {
    const wav = fixtureWav(500);
    await expect(
      normalizeMediaResponse(
        new Response(wav, { headers: { 'content-type': 'audio/wav' } }),
        { ...dispatch({
          kind: 'audio',
          operation: 'text-to-music',
          ...requestBase,
          modelId: 'fixture-music',
          prompt: 'ambient',
          parameters: { durationSeconds: 5, instrumental: true }
        }, 'audio'), maxResultDurationMs: 400 }
      )
    ).rejects.toThrow('时长');

    await expect(
      normalizeMediaResponse(
        new Response(new Uint8Array([0, 0, 0, 8, 0x66, 0x74, 0x79, 0x70]), { headers: { 'content-type': 'video/mp4' } }),
        dispatch({
          kind: 'video',
          operation: 'text-to-video',
          providerInstanceId: '10000000-0000-4000-8000-000000000004',
          providerRevision: 1,
          modelId: 'fixture-video',
          prompt: 'fixture',
          parameters: { ratio: '16:9', durationSeconds: 5, resolution: '768P' }
        }, 'video')
      )
    ).rejects.toThrow('MP4');
  });

  it('rejects empty and malformed upstream results', async () => {
    const request = {
      kind: 'audio',
      operation: 'text-to-speech',
      ...requestBase,
      language: 'zh-CN',
      voiceId: 'alloy',
      speed: 1,
      text: '你好'
    } as const;
    await expect(
      normalizeMediaResponse(Response.json({ data: [] }), dispatch(request, 'audio'))
    ).rejects.toThrow('媒体供应商结果无效');
    await expect(
      normalizeMediaResponse(new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'video/mp4' } }), {
        ...dispatch(
          {
            kind: 'video',
            operation: 'text-to-video',
            providerInstanceId: '10000000-0000-4000-8000-000000000004',
            providerRevision: 1,
            modelId: 'fixture-video',
            prompt: 'fixture',
            parameters: { ratio: '16:9', durationSeconds: 5, resolution: '768P' }
          },
          'video'
        ),
        maxResultBytes: 10
      })
    ).rejects.toThrow('MP4');
  });
});
