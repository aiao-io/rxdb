import { vi } from 'vitest';

/**
 * 连接器私有信道（`MessageChannel`）的同步替身。
 *
 * @remarks
 * 真 `MessagePort` 的投递是一个 task，用例就得整体改成异步等待。
 * 连接器对端口的用法只有 `postMessage` / `onmessage` / `start` / `close` 四件事，
 * 换成同步替身既覆盖了这些语义，又让「派发命令 → 立即断言」的写法继续成立。
 */
interface FakePort {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
  start(): void;
  close(): void;
}

interface FakeChannel {
  port1: FakePort;
  port2: FakePort;
}

let originalMessageChannel: typeof MessageChannel | undefined;
/** 连接器最近一次握手交出去的那一端；用例经它把命令送进连接器。 */
let remotePort: FakePort | null = null;
/** 出站消息的落点，握手（window 总线）与后续端口消息都记到同一个 spy 上。 */
let outboundSink: ((message: unknown) => void) | null = null;

function createFakeChannel(): FakeChannel {
  let closed = false;
  const port1: FakePort = {
    onmessage: null,
    postMessage: message => {
      if (closed) return;
      outboundSink?.(message);
    },
    start: () => undefined,
    close: () => {
      closed = true;
    }
  };
  const port2: FakePort = {
    onmessage: null,
    postMessage: message => {
      if (closed) return;
      port1.onmessage?.({ data: message } as MessageEvent);
    },
    start: () => undefined,
    close: () => {
      closed = true;
    }
  };
  return { port1, port2 };
}

/**
 * 装上同步 `MessageChannel` 替身，并记录连接器交出的远端端口。
 *
 * @remarks
 * 必须在构造连接器**之前**调用（`beforeEach` 里），连接器在 `init()` 的握手中
 * 就会 `new MessageChannel()`。
 */
export function installChannelStub(): void {
  remotePort = null;
  outboundSink = null;
  originalMessageChannel ??= globalThis.MessageChannel;
  const ChannelStub = function ChannelStub(this: FakeChannel) {
    const channel = createFakeChannel();
    this.port1 = channel.port1;
    this.port2 = channel.port2;
    remotePort = channel.port2;
  } as unknown as typeof MessageChannel;
  globalThis.MessageChannel = ChannelStub;
}

/** 还原真 `MessageChannel` 并清掉夹具状态。 */
export function restoreChannelStub(): void {
  if (originalMessageChannel) globalThis.MessageChannel = originalMessageChannel;
  remotePort = null;
  outboundSink = null;
}

/**
 * 造一个记录全部出站消息的 spy。
 *
 * @remarks
 * 它既用作 `window.postMessage` 的实现，也是私有端口的出口 —— 握手走 window 总线、
 * 之后走端口，两条路记到同一个 spy 上，`mock.calls` 的顺序就是 wire 上的真实顺序。
 * 用例因此不必关心某条消息是从哪条路出去的。
 */
export function createPostMessageSpy(): ReturnType<typeof vi.fn> {
  const spy = vi.fn();
  outboundSink = message => spy(message);
  return spy;
}

/**
 * 把一条命令送进连接器。
 *
 * @param data - 完整的消息 envelope，原样投递（畸形消息用来测协议守卫）
 * @throws Error 连接器尚未握手（没有端口可用）时
 *
 * @remarks
 * 走的是握手时交出去的私有端口，与真实 DevTools 扩展的路径一致。
 * 要测「命令从 window 总线进来」请直接调 window 监听器，见
 * `MUST drop non-PING commands arriving on the window bus`。
 */
export function sendToConnector(data: unknown): void {
  if (!remotePort) throw new Error('connector has not handed out a port yet');
  remotePort.postMessage(data);
}

/**
 * 抓住**当前**这一端端口，返回一个只往它发消息的函数。
 *
 * @throws Error 连接器尚未握手时
 *
 * @remarks
 * 与 {@link sendToConnector} 的区别是它不跟随重握手。用来验证「换端口之后旧端口失效」。
 */
export function captureRemotePort(): (data: unknown) => void {
  const port = remotePort;
  if (!port) throw new Error('connector has not handed out a port yet');
  return data => port.postMessage(data);
}

/** 连接器当前是否持有一个可用的私有端口。 */
export function hasRemotePort(): boolean {
  return remotePort !== null;
}
