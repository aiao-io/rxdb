import {
  ASR_AUDIO_DURATION_MAX_MS,
  ASR_AUDIO_MAX_BYTES,
  AUDIO_DURATION_MAX_MS,
  AUDIO_TEXT_MAX_LENGTH,
  AUDIO_WAV_MAX_BYTES,
  MUSIC_DURATION_MAX_MS,
  MUSIC_TEXT_MAX_LENGTH,
  VIDEO_MP4_MAX_BYTES,
  VIDEO_TEXT_MAX_LENGTH
} from '@aiao-media/api-contracts';
import type { WorkerEnv } from './worker-env.ts';

const fixtureBaseUrl = 'https://fixture-media.example.test/v1';
const fixtureSecret = 'fixture-media-secret';
const fixtureIds = {
  tts: '10000000-0000-4000-8000-000000000001',
  asr: '10000000-0000-4000-8000-000000000002',
  music: '10000000-0000-4000-8000-000000000003',
  video: '10000000-0000-4000-8000-000000000004'
} as const;

/** 为 API 测试提供不连接真实供应商的完整能力目录。 */
export function fixtureMediaEnvironment(): WorkerEnv {
  return {
    ALLOWED_PROVIDER_BASE_URLS: JSON.stringify([fixtureBaseUrl]),
    FIXTURE_MEDIA_SECRET: fixtureSecret,
    MEDIA_PLATFORM_CAPABILITIES: JSON.stringify({
      revision: 1,
      capabilities: [
        {
          providerInstanceId: fixtureIds.tts,
          providerRevision: 1,
          kind: 'audio',
          operation: 'text-to-speech',
          label: 'Fixture TTS',
          modelId: 'fixture-tts',
          credits: 2,
          protocol: 'openai',
          baseUrl: fixtureBaseUrl,
          model: 'fixture-tts-upstream',
          secret: 'FIXTURE_MEDIA_SECRET',
          input: { textMaxLength: AUDIO_TEXT_MAX_LENGTH },
          parameters: {
            languages: ['zh-CN', 'en-US'],
            voices: [{ id: 'alloy', label: 'Fixture Alloy' }],
            speeds: [0.75, 1, 1.25]
          },
          output: {
            mediaTypes: ['audio/wav'],
            maxBytes: AUDIO_WAV_MAX_BYTES,
            maxDurationMs: AUDIO_DURATION_MAX_MS
          }
        },
        {
          providerInstanceId: fixtureIds.asr,
          providerRevision: 1,
          kind: 'audio',
          operation: 'speech-to-text',
          label: 'Fixture ASR',
          modelId: 'fixture-asr',
          credits: 1,
          protocol: 'openai',
          baseUrl: fixtureBaseUrl,
          model: 'fixture-asr-upstream',
          secret: 'FIXTURE_MEDIA_SECRET',
          input: {
            mediaTypes: ['audio/wav'],
            maxBytes: ASR_AUDIO_MAX_BYTES,
            maxDurationMs: ASR_AUDIO_DURATION_MAX_MS
          },
          parameters: { languages: ['zh-CN', 'en-US'] },
          output: { mediaTypes: ['application/json'] }
        },
        {
          providerInstanceId: fixtureIds.music,
          providerRevision: 1,
          kind: 'audio',
          operation: 'text-to-music',
          label: 'Fixture Music',
          modelId: 'fixture-music',
          credits: 4,
          protocol: 'openai',
          baseUrl: fixtureBaseUrl,
          model: 'fixture-music-upstream',
          secret: 'FIXTURE_MEDIA_SECRET',
          input: { textMaxLength: MUSIC_TEXT_MAX_LENGTH },
          parameters: { durationsSeconds: [5, 10], instrumental: [false, true] },
          output: {
            mediaTypes: ['audio/wav'],
            maxBytes: 32 * 1024 * 1024,
            maxDurationMs: MUSIC_DURATION_MAX_MS
          }
        },
        {
          providerInstanceId: fixtureIds.video,
          providerRevision: 1,
          kind: 'video',
          operation: 'text-to-video',
          label: 'Fixture Video',
          modelId: 'fixture-video',
          credits: 8,
          protocol: 'openai',
          baseUrl: fixtureBaseUrl,
          model: 'fixture-video-upstream',
          secret: 'FIXTURE_MEDIA_SECRET',
          input: { textMaxLength: VIDEO_TEXT_MAX_LENGTH },
          parameters: { ratios: ['16:9', '9:16'], durationsSeconds: [5, 10], resolutions: ['768P', '1080P'] },
          output: {
            mediaTypes: ['video/mp4'],
            maxBytes: VIDEO_MP4_MAX_BYTES,
            maxDurationMs: 300_000
          }
        }
      ]
    })
  };
}

/** 创建最小的受控 WAV，供 provider 和 relay 测试使用。 */
export function fixtureWav(durationMs = 1000): Uint8Array<ArrayBuffer> {
  const samples = Math.max(1, Math.round((durationMs / 1000) * 32000));
  const dataBytes = samples * 2;
  const result = new Uint8Array(44 + dataBytes);
  const view = new DataView(result.buffer);
  result.set(new TextEncoder().encode('RIFF'), 0);
  view.setUint32(4, result.byteLength - 8, true);
  result.set(new TextEncoder().encode('WAVEfmt '), 8);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 32000, true);
  view.setUint32(28, 64000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  result.set(new TextEncoder().encode('data'), 36);
  view.setUint32(40, dataBytes, true);
  return result;
}

/** 创建含有真实 movie metadata 的 fixture 结果。 */
export function fixtureMp4(): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(
    atob(
      'AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAM5bW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAA+gAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAmR0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAA+gAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAUAAAAC0AAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAPoAAAAAAABAAAAAAHcbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAoAAAAKABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABh21pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAUdzdGJsAAAAu3N0c2QAAAAAAAAAAQAAAKthdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAUAAtABIAAAASAAAAAAAAAABFUxhdmM2MS4xOS4xMDEgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAAMWF2Y0MBQsAe/+EAGWdCwB7ZAUGfnwEQAAADABAAAAMAoPFi5IABAAVoy4PLIAAAABBwYXNwAAAAAQAAAAEAAAAUYnRydAAAAAAAABuAAAAAAAAAABhzdHRzAAAAAAAAAAEAAAAFAAAIAAAAABRzdHNzAAAAAAAAAAEAAAABAAAAHHN0c2MAAAAAAAAAAQAAAAEAAAAFAAAAAQAAAChzdHN6AAAAAAAAAAAAAAAFAAADRAAAAAsAAAALAAAACwAAAAsAAAAUc3RjbwAAAAAAAAABAAADaQAAAGF1ZHRhAAAAWW1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAALGlsc3QAAAAkqXRvbwAAABxkYXRhAAAAAQAAAABMYXZmNjEuNy4xMDAAAAAIZnJlZQAAA3htZGF0AAACcAYF//9s3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE2NCByMzEwOCAzMWUxOWY5IC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAyMyAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTAgcmVmPTMgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4MToweDExMSBtZT1oZXggc3VibWU9NyBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0xIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MSA4eDhkY3Q9MCBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0tMiB0aHJlYWRzPTYgbG9va2FoZWFkX3RocmVhZHM9MSBzbGljZWRfdGhyZWFkcz0wIG5yPTAgZGVjaW1hdGU9MSBpbnRlcmxhY2VkPTAgYmx1cmF5X2NvbXBhdD0wIGNvbnN0cmFpbmVkX2ludHJhPTAgYmZyYW1lcz0wIHdlaWdodHA9MCBrZXlpbnQ9MjUwIGtleWludF9taW49NSBzY2VuZWN1dD00MCBpbnRyYV9yZWZyZXNoPTAgcmNfbG9va2FoZWFkPTQwIHJjPWNyZiBtYnRyZWU9MSBjcmY9MjMuMCBxY29tcD0wLjYwIHFwbWluPTAgcXBtYXg9NjkgcXBzdGVwPTQgaXBfcmF0aW89MS40MCBhcT0xOjEuMDAAgAAAAMxliIQEfEYoAAxIxwABbWjgACHzJycnJycnJycnJycnJycnJycnJ11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111114AAAAAHQZo4CPgPGAAAAAdBmlQCPgPGAAAAB0GaYBDwHjAAAAAHQZqAP8B4wA=='
    ),
    character => character.charCodeAt(0)
  ) as Uint8Array<ArrayBuffer>;
}

export const fixtureMediaIds = fixtureIds;
