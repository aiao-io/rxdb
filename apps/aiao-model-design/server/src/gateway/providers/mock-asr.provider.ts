import { readFileSync } from 'node:fs';
import { UpstreamHttpError, ValidationError } from '../core/errors';
import type { AsrProvider, AsrRequest, AsrResult } from './types';

/**
 * Mock ASR provider — 测试 / SC 验收专用
 *
 * **正常行为**：读 `req.audio.path` 文件前 200 字节作为"转写文本"
 * （tests 用文本文件冒充音频，便于断言）。
 *
 * **行为注入 marker**（仅 NODE_ENV !== 'production' 生效）：
 *
 * 文件内容**以下列前缀开头**时分别抛错：
 *
 * | 前缀 | 错误 |
 * | --- | --- |
 * | `inject-5xx` | `UpstreamHttpError(500)` |
 * | `inject-rate-limit` | `UpstreamHttpError(429)` |
 * | `inject-validation` | `ValidationError(code='mock_inject')` |
 */
export class MockAsrProvider implements AsrProvider {
  readonly id = 'mock-asr';
  readonly modality = 'asr' as const;
  readonly modelIds: readonly string[];
  readonly capabilities: readonly string[];

  constructor(config: { modelIds?: readonly string[]; capabilities?: readonly string[] } = {}) {
    this.modelIds = config.modelIds ?? ['mock-asr-1'];
    this.capabilities = config.capabilities ?? ['timestamps'];
  }

  async healthCheck(): Promise<void> {
    return;
  }

  async transcribe(req: AsrRequest, _signal: AbortSignal): Promise<AsrResult> {
    const raw = readFileSync(req.audio.path, 'utf-8');
    this.#checkMarker(raw);
    const echoText = raw.slice(0, 200);
    const segments = req.responseFormat === 'verbose_json' ? [{ start: 0, end: 1.2, text: echoText }] : undefined;
    return {
      text: `mock-asr-echo:${echoText}`,
      segments,
      language: req.language ?? 'en',
      duration: 1.2
    };
  }

  #checkMarker(raw: string): void {
    if (process.env.NODE_ENV === 'production') return;
    const trimmed = raw.trim();
    if (trimmed.startsWith('inject-5xx')) {
      throw new UpstreamHttpError(500, 'mock-asr inject-5xx');
    }
    if (trimmed.startsWith('inject-rate-limit')) {
      throw new UpstreamHttpError(429, 'mock-asr inject-rate-limit');
    }
    if (trimmed.startsWith('inject-validation')) {
      throw new ValidationError('mock-asr inject-validation', {
        code: 'mock_inject'
      });
    }
  }
}
