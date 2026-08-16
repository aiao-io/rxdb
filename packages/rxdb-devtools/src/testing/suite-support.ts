/**
 * @fileoverview 两个 plane suite 共用的运行期小工具：以 panel 身份发帧、读某一段的产出。
 *
 * @remarks
 * 抽出来不是为了少写几行：控制面与数据面都需要「走完协商、然后以 panel 身份发一帧再等排空」，
 * 两份各写一遍的后果是其中一份悄悄改了时间戳基准或 `settle` 时机，于是同一条判据在两个套件里
 * 含义不同，而失败时看起来像产品代码的问题。
 *
 * 这里同样**不含任何断言与协议判断**——它只把「发一帧」翻译成 driver 的 `inject` + `settle`。
 *
 * @module @aiao/rxdb-devtools/testing/suite-support
 */

import type { DevToolsV2MessageType, DevToolsV2PayloadMap } from '../v2/wire.js';
import type { DevToolsConformanceSession, DevToolsWireFrame } from './driver.js';
import { encodeFrame, readV2FramesOfType } from './frames.js';

/** 套件自造帧的时间戳基准；固定值让失败输出可读。 */
export const DEVTOOLS_SUITE_BASE_TIMESTAMP = 1_700_000_000_000;

/** panel 侧客户端：只负责把帧发出去，不含任何协议判断。 */
export interface DevToolsSuitePanelClient {
  /** connector 铸造并在 HANDSHAKE 里宣告的 session。 */
  readonly sessionId: string;
  /**
   * 以 panel 身份发一帧并等链路排空。
   *
   * @typeParam TType - 消息类型。
   * @param type - 消息类型。
   * @param payload - 该类型的载荷。
   * @param sessionId - 覆盖 session 身份，用于伪造。
   * @returns 帧已投递完毕。
   */
  send<TType extends DevToolsV2MessageType>(
    type: TType,
    payload: DevToolsV2PayloadMap[TType],
    sessionId?: string
  ): Promise<void>;
}

/**
 * 从 panel 收到的 HANDSHAKE 里读出 connector 铸造的 session。
 *
 * @param run - 已打开的会话。
 * @returns session 标识。
 * @throws Error 当协商尚未产出 v2 HANDSHAKE 时——此时后续断言全部无意义，早抛比晚抛好读。
 */
export function sessionIdOf(run: DevToolsConformanceSession): string {
  const handshake = readV2FramesOfType(run.segment('panel').received, 'HANDSHAKE')[0];
  if (handshake === undefined) throw new Error('devtools suite: no v2 HANDSHAKE reached the panel');
  return handshake.payload.sessionId;
}

/**
 * 建一个绑定到当前 session 的 panel 客户端。
 *
 * @param run - 已完成协商的会话。
 * @returns panel 客户端。
 */
export function panelClient(run: DevToolsConformanceSession): DevToolsSuitePanelClient {
  const sessionId = sessionIdOf(run);
  let sequence = 0;

  return {
    sessionId,
    async send(type, payload, override): Promise<void> {
      sequence += 1;
      const frame = encodeFrame(type, payload, {
        sessionId: override ?? sessionId,
        sequence,
        timestamp: DEVTOOLS_SUITE_BASE_TIMESTAMP + sequence,
        direction: 'panel-to-connector'
      });
      await run.segment('panel').inject(frame, 'panel-to-connector');
      await run.settle();
    }
  };
}

/**
 * 走完 v2 协商，返回可直接发数据面帧的 panel 客户端。
 *
 * @param run - 刚打开的会话。
 * @returns panel 客户端。
 */
export async function connected(run: DevToolsConformanceSession): Promise<DevToolsSuitePanelClient> {
  await run.settle();
  return panelClient(run);
}

/**
 * connector 自己产出的帧。
 *
 * @remarks
 * 用 `sent` 而不是对端的 `received`：注入的伪造帧不在其中，断言因此不会被套件自己发的东西污染。
 *
 * @param run - 已打开的会话。
 * @returns connector 段的出站帧。
 */
export function connectorOutput(run: DevToolsConformanceSession): readonly DevToolsWireFrame[] {
  return run.segment('connector').sent;
}

/**
 * panel 自己产出的帧。
 *
 * @param run - 已打开的会话。
 * @returns panel 段的出站帧。
 */
export function panelOutput(run: DevToolsConformanceSession): readonly DevToolsWireFrame[] {
  return run.segment('panel').sent;
}
