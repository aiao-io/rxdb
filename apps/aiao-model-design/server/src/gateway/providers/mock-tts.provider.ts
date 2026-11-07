import { ValidationError } from '../core/errors';
import type { TtsContentType, TtsProvider, TtsRequest, TtsResult } from './types';

const CONTENT_TYPE_BY_FORMAT: Record<string, TtsContentType> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  opus: 'audio/opus',
  flac: 'audio/flac'
};

/**
 * Mock TTS provider — 测试 / SC 验收专用
 *
 * **正常行为**：把输入字符串作为 utf-8 字节包装为 ReadableStream 输出（"音频"）。
 *
 * **行为注入 marker**（仅 NODE_ENV !== 'production' 生效）：
 *
 * `input` 严格等于以下值时抛错：
 *
 * | input | 错误 |
 * | --- | --- |
 * | `inject-validation` | `ValidationError('mock_inject')` |
 */
export class MockTtsProvider implements TtsProvider {
  readonly id = 'mock-tts';
  readonly modality = 'tts' as const;
  readonly modelIds: readonly string[];
  readonly capabilities: readonly string[];

  constructor(config: { modelIds?: readonly string[]; capabilities?: readonly string[] } = {}) {
    this.modelIds = config.modelIds ?? ['mock-tts-1'];
    this.capabilities = config.capabilities ?? [];
  }

  async healthCheck(): Promise<void> {
    return;
  }

  async synthesize(req: TtsRequest, _signal: AbortSignal): Promise<TtsResult> {
    if (req.voiceReference && !this.capabilities.includes('reference_voice')) {
      throw new ValidationError(`provider ${this.id} does not support voice_reference`, {
        code: 'voice_reference_unsupported',
        param: 'voice_reference'
      });
    }
    if (process.env.NODE_ENV !== 'production') {
      if (req.input.trim() === 'inject-validation') {
        throw new ValidationError('mock-tts inject-validation', {
          code: 'mock_inject'
        });
      }
    }
    const bytes = new TextEncoder().encode(`mock-tts-echo:${req.input}`);
    const audio = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      }
    });
    return {
      audio,
      contentType: CONTENT_TYPE_BY_FORMAT[req.responseFormat] ?? 'audio/mpeg'
    };
  }
}
