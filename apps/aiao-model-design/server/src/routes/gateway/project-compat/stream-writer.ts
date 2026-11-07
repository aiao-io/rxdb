import { classifyError } from '../../../gateway/core/error-classifier';
import { closeStream } from '../../../gateway/core/sse-writer';
import type { RequestContext } from '../../../gateway/core/types';
import type { ChatStreamEvent } from '../../../gateway/providers/types';
import { mapGatewayErrorToAiApi } from './error-mapper';

const encoder = new TextEncoder();

type SseController = ReadableStreamDefaultController<Uint8Array>;

/**
 * 写一条 AI SDK data stream 行：`<prefix>:<json>\n`
 *
 * dashboard `AiApiService.chat()` 按 `line.startsWith('0:')` 解析 text delta，
 * 其它前缀（`3:` 错误、`d:` done 等）被静默忽略。
 */
const writeLine = (controller: SseController, prefix: string, payload: unknown): void => {
  controller.enqueue(encoder.encode(`${prefix}:${JSON.stringify(payload)}\n`));
};

export interface SerializeAiSdkStreamOptions {
  source: AsyncIterable<ChatStreamEvent>;
  ctx: RequestContext;
}

/**
 * ChatStreamEvent → AI SDK v6 data stream 文本流（dashboard 协议契约）
 *
 * 协议参考 `apps/dashboard/src/app/shared/services/ai-api.service.ts`：
 *   每个 text delta 写成一行 `0:"<delta>"\n`
 *   上游异常按 FR-007 写一行 `3:{...}\n` 后关闭
 *
 * 不发明确终止符：dashboard 用 `reader.read()` 的 `done` 标志识别流结束。
 */
export function serializeAiSdkDataStream(opts: SerializeAiSdkStreamOptions): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const evt of opts.source) {
          if (evt.kind === 'text-delta') {
            writeLine(controller, '0', evt.delta);
          }
          // usage / finish 当前 dashboard 不消费；如需要可追加 d:/2: 等行
        }
      } catch (err) {
        const gwErr = classifyError(err, opts.ctx);
        if (gwErr) {
          writeLine(controller, '3', mapGatewayErrorToAiApi(gwErr));
        }
      } finally {
        closeStream(controller);
      }
    }
  });
}
