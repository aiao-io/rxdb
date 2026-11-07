/**
 * 会话帧日志：包在字节传输外层，记下每一帧的方向、类型与大小，供页面上的「会话帧」面板显示。
 * 只观察，不改变收发；解不出的帧记为 `malformed`，交给会话自己按协议处理。
 */
import { decodeP2PFrame, type P2PByteTransport, type P2PFrame } from '@aiao/rxdb-plugin-p2p';

/** 一帧的摘要。 */
export interface FrameSummary {
  readonly kind: P2PFrame['kind'] | 'malformed';
  readonly id: number | null;
  /** 请求的「协议.方法」、错误码或 bye 原因。 */
  readonly detail: string | null;
  /** 整帧字节数（含负载）。 */
  readonly bytes: number;
}

/** 日志里的一帧。 */
export interface TracedFrame extends FrameSummary {
  readonly direction: 'in' | 'out';
  /** 记录时刻（epoch 毫秒）。 */
  readonly at: number;
}

/** 收发计数。 */
export interface FrameTotals {
  readonly sent: number;
  readonly received: number;
  readonly bytesSent: number;
  readonly bytesReceived: number;
}

const detailOf = (frame: P2PFrame): string | null => {
  if (frame.kind === 'request') return `${frame.protocol}.${frame.method}`;
  if (frame.kind === 'error') return frame.code;
  if (frame.kind === 'bye') return frame.reason;
  if (frame.kind === 'hello') return Object.keys(frame.protocols).join(', ');
  return null;
};

const decode = (bytes: Uint8Array): P2PFrame | null => {
  try {
    return decodeP2PFrame(bytes);
  } catch {
    return null;
  }
};

/** 摘要一帧。 */
export const summarizeFrame = (bytes: Uint8Array): FrameSummary => {
  const frame = decode(bytes);
  if (!frame) return { kind: 'malformed', id: null, detail: null, bytes: bytes.byteLength };
  return { kind: frame.kind, id: 'id' in frame ? frame.id : null, detail: detailOf(frame), bytes: bytes.byteLength };
};

/** 一条会话的帧日志。 */
export class FrameTrace {
  readonly #limit: number;
  readonly #changed: () => void;
  readonly #frames: TracedFrame[] = [];
  #totals: FrameTotals = { sent: 0, received: 0, bytesSent: 0, bytesReceived: 0 };

  /**
   * @param limit - 保留最近多少帧
   * @param changed - 每记一帧回调一次（页面据此节流刷新）
   */
  constructor(limit: number, changed: () => void) {
    this.#limit = limit;
    this.#changed = changed;
  }

  /** 最近的帧，旧的在前。 */
  recent(): readonly TracedFrame[] {
    return [...this.#frames];
  }

  /** 收发计数。 */
  totals(): FrameTotals {
    return this.#totals;
  }

  /** 包一层记录收发的传输。 */
  wrap(transport: P2PByteTransport): P2PByteTransport {
    return {
      send: frame => {
        this.#record('out', frame);
        return transport.send(frame);
      },
      receive: async signal => {
        const frame = await transport.receive(signal);
        this.#record('in', frame);
        return frame;
      },
      close: () => transport.close()
    };
  }

  #record(direction: 'in' | 'out', bytes: Uint8Array): void {
    this.#frames.push({ ...summarizeFrame(bytes), direction, at: Date.now() });
    if (this.#frames.length > this.#limit) this.#frames.shift();
    const { sent, received, bytesSent, bytesReceived } = this.#totals;
    this.#totals =
      direction === 'out' ?
        { sent: sent + 1, received, bytesSent: bytesSent + bytes.byteLength, bytesReceived }
      : { sent, received: received + 1, bytesSent, bytesReceived: bytesReceived + bytes.byteLength };
    this.#changed();
  }
}
