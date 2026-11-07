import { classifyError } from '../../../gateway/core/error-classifier';
import { closeStream, writeEvent } from '../../../gateway/core/sse-writer';
import type { RequestContext } from '../../../gateway/core/types';
import type { ChatStreamEvent, FinishReason } from '../../../gateway/providers/types';
import { mapGatewayErrorToAnthropic } from './error-mapper';

const mapStopReasonToAnthropic = (reason: FinishReason): string => {
  if (reason === 'length') return 'max_tokens';
  if (reason === 'content_filter') return 'stop_sequence';
  return 'end_turn';
};

const messageIdFromTraceId = (traceId: string): string => `msg_${traceId.replace(/-/g, '').slice(0, 24)}`;

export interface SerializeAnthropicStreamOptions {
  source: AsyncIterable<ChatStreamEvent>;
  modelId: string;
  ctx: RequestContext;
}

/**
 * 把 ChatStreamEvent 流序列化为 Anthropic `/v1/messages` SSE 事件流
 *
 * 事件序列（字节级保真）：
 *   event: message_start
 *   event: content_block_start (index=0, type=text)
 *   event: content_block_delta × N
 *   event: content_block_stop (index=0)
 *   event: message_delta (含 stop_reason + usage.output_tokens)
 *   event: message_stop
 *
 * 上游异常（FR-007）：写一条 `event: error` 帧后立即关闭。
 */
export function serializeAnthropicMessagesStream(opts: SerializeAnthropicStreamOptions): ReadableStream<Uint8Array> {
  const messageId = messageIdFromTraceId(opts.ctx.traceId);
  let inputTokens = 0;
  let outputTokens = 0;
  let stopReason: string | null = 'end_turn';
  let openedContentBlock = false;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        writeEvent(controller, 'message_start', {
          type: 'message_start',
          message: {
            id: messageId,
            type: 'message',
            role: 'assistant',
            content: [],
            model: opts.modelId,
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 0, output_tokens: 0 }
          }
        });
        writeEvent(controller, 'content_block_start', {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' }
        });
        openedContentBlock = true;

        for await (const evt of opts.source) {
          if (evt.kind === 'text-delta') {
            writeEvent(controller, 'content_block_delta', {
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'text_delta', text: evt.delta }
            });
          } else if (evt.kind === 'usage') {
            inputTokens = evt.promptTokens;
            outputTokens = evt.completionTokens;
          } else if (evt.kind === 'finish') {
            stopReason = mapStopReasonToAnthropic(evt.reason);
          }
        }

        writeEvent(controller, 'content_block_stop', {
          type: 'content_block_stop',
          index: 0
        });
        writeEvent(controller, 'message_delta', {
          type: 'message_delta',
          delta: { stop_reason: stopReason, stop_sequence: null },
          usage: { input_tokens: inputTokens, output_tokens: outputTokens }
        });
        writeEvent(controller, 'message_stop', { type: 'message_stop' });
      } catch (err) {
        const gwErr = classifyError(err, opts.ctx);
        if (gwErr) {
          if (openedContentBlock) {
            try {
              writeEvent(controller, 'content_block_stop', {
                type: 'content_block_stop',
                index: 0
              });
            } catch {
              // 已写错则继续
            }
          }
          writeEvent(controller, 'error', {
            type: 'error',
            error: mapGatewayErrorToAnthropic(gwErr)
          });
        }
      } finally {
        closeStream(controller);
      }
    }
  });
}
