/**
 * @fileoverview 帧读写小工具：把探针里的 JSON 文本还原成消息，把消息编成 JSON 文本。
 *
 * @remarks
 * 两个 plane suite 与下游 driver 作者共用。**它只做解析与筛选，不做判断**——一旦这里出现
 * 「这算不算通过」的语义，判据就从 suite 漏到了工具里，换 driver 时会跟着一起漂。
 *
 * 读侧一律先过 {@link isDevToolsV2Message} 的严 guard：探针里混着注入的畸形原文与 v1 帧，
 * 直接按下标取 `payload` 会在断言之前先抛，把「协议拒绝了它」误报成「测试自己写错了」。
 *
 * @module @aiao/rxdb-devtools/testing/frames
 */

import { isDevToolsMessage } from '../types.js';
import type { AnyDevToolsMessage, MessageType } from '../types.js';
import type { DevToolsProviderErrorCode } from '../v2/errors.js';
import type { DevToolsControlPlaneErrorCode } from '../v2/errors.js';
import { createDevToolsV2Message, isDevToolsV2Message } from '../v2/wire.js';
import type {
  DevToolsV2Envelope,
  DevToolsV2MessageOptions,
  DevToolsV2MessageType,
  DevToolsV2Message,
  DevToolsV2PayloadMap
} from '../v2/wire.js';
import type { DevToolsWireFrame } from './driver.js';

/** 探针里出现的任一错误码。 */
export type DevToolsAnyErrorCode = DevToolsControlPlaneErrorCode | DevToolsProviderErrorCode;

function parse(frame: DevToolsWireFrame): unknown {
  try {
    return JSON.parse(frame) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * 取出所有通过严 guard 的 v2 消息。
 *
 * @param frames - 探针里的原文序列。
 * @returns 合法 v2 消息，保持原顺序。
 */
export function readV2Frames(frames: readonly DevToolsWireFrame[]): readonly DevToolsV2Message[] {
  const messages: DevToolsV2Message[] = [];
  for (const frame of frames) {
    const parsed = parse(frame);
    if (isDevToolsV2Message(parsed)) messages.push(parsed);
  }
  return messages;
}

/**
 * 取出某一类型的全部 v2 消息。
 *
 * @param frames - 探针里的原文序列。
 * @param type - 消息类型。
 * @returns 该类型的消息，保持原顺序。
 */
export function readV2FramesOfType<TType extends DevToolsV2MessageType>(
  frames: readonly DevToolsWireFrame[],
  type: TType
): readonly DevToolsV2Envelope<TType>[] {
  const matches: DevToolsV2Envelope<TType>[] = [];
  for (const message of readV2Frames(frames)) {
    // 按判别字段筛联合成员，TS 不会因与泛型值比较而收窄，只能在此断言；
    // 运行时判据（`message.type === type`）与断言完全一致，不存在放宽。
    if (message.type === type) matches.push(message as DevToolsV2Envelope<TType>);
  }
  return matches;
}

/**
 * 取出某一类型的全部 v1 消息。
 *
 * @param frames - 探针里的原文序列。
 * @param type - v1 消息类型。
 * @returns 该类型的 v1 消息。
 */
export function readLegacyFramesOfType(
  frames: readonly DevToolsWireFrame[],
  type: MessageType
): readonly AnyDevToolsMessage[] {
  const matches: AnyDevToolsMessage[] = [];
  for (const frame of frames) {
    const parsed = parse(frame);
    if (isDevToolsMessage(parsed) && parsed.type === type) matches.push(parsed);
  }
  return matches;
}

/**
 * 取出全部 `ERROR` 帧里的错误码。
 *
 * @remarks
 * 断言错误码而不是断言「有错误帧」：`transfer_size_exceeded` 与 `payload_encoding_invalid`
 * 在「有没有报错」这个粒度上完全一样，而协议要求它们可区分。
 *
 * @param frames - 探针里的原文序列。
 * @returns 错误码序列，保持原顺序。
 */
export function readErrorCodes(frames: readonly DevToolsWireFrame[]): readonly DevToolsAnyErrorCode[] {
  return readV2FramesOfType(frames, 'ERROR').map(message => message.payload.error.code);
}

/**
 * 把一条 v2 消息编成可注入的原文。
 *
 * @param type - 消息类型。
 * @param payload - 该类型的载荷。
 * @param options - 信封字段。
 * @returns 规范 JSON 文本。
 */
export function encodeFrame<TType extends DevToolsV2MessageType>(
  type: TType,
  payload: DevToolsV2PayloadMap[TType],
  options: DevToolsV2MessageOptions
): DevToolsWireFrame {
  return JSON.stringify(createDevToolsV2Message(type, payload, options));
}
