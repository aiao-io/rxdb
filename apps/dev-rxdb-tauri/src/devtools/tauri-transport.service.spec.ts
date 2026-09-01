import { RXDB_DEVTOOLS_MESSAGE, type DevToolsMessage } from '@modules/rxdb-devtools-panel/wire';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TauriTransportService } from './tauri-transport.service';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

const invokeMock = vi.mocked(invoke);
const listenMock = vi.mocked(listen);

/** 一条经得起 `isDevToolsMessage` 的 v1 帧。 */
const v1Frame = (): DevToolsMessage => ({
  source: RXDB_DEVTOOLS_MESSAGE,
  direction: 'page-to-devtools',
  type: 'DB_INFO',
  payload: null,
  timestamp: 0,
  sequence: 0
});

describe('TauriTransportService', () => {
  let unlisten: ReturnType<typeof vi.fn<UnlistenFn>>;

  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
    listenMock.mockReset();
    unlisten = vi.fn();
    listenMock.mockResolvedValue(unlisten);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** 构造服务并等异步 `connect()` 落定，同时把 `listen` 收到的回调交出来。 */
  const connectAndGrabListener = async (): Promise<{
    service: TauriTransportService;
    onFrame: (payload: string) => void;
  }> => {
    const service = new TauriTransportService();
    await vi.waitFor(() => expect(listenMock).toHaveBeenCalledWith('devtools:message', expect.any(Function)));
    const callback = listenMock.mock.calls[0][1] as (event: { payload: string }) => void;
    return { service, onFrame: payload => callback({ payload }) };
  };

  /**
   * 通道名是跨语言契约的一半，另一半在 Rust 侧 `target.emit("devtools:message", …)`。
   * 任何一侧漂了都只是「帧静默消失」。
   */
  it('连接时订阅 devtools:message 事件，成功后置 connected', async () => {
    const { service } = await connectAndGrabListener();
    expect(listenMock).toHaveBeenCalledWith('devtools:message', expect.any(Function));
    expect(service.connected()).toBe(true);
    expect(service.connectionEpoch()).toBe(1);
  });

  /**
   * v1 车道：`subscribe` 只交付经 `isDevToolsMessage` 过滤的帧；
   * v2 帧（不含 `source: RXDB_DEVTOOLS_MESSAGE`）不进这条车道。
   */
  it('subscribe 只交付 v1 帧，v2 帧不进 v1 车道', async () => {
    const { service, onFrame } = await connectAndGrabListener();
    const delivered: DevToolsMessage[] = [];
    service.subscribe(message => delivered.push(message));

    onFrame(JSON.stringify(v1Frame()));
    expect(delivered).toHaveLength(1);

    // 一帧 v2 信封（不是 v1 DevToolsMessage）不得进 v1 车道。
    onFrame(JSON.stringify({ protocol: 2, type: 'HANDSHAKE' }));
    expect(delivered).toHaveLength(1);
  });

  /** 原始车道不经守卫过滤：v2 帧与 legacy HANDSHAKE 都必须原样到达。 */
  it('subscribeFrames 原样交付未经过滤的帧', async () => {
    const { service, onFrame } = await connectAndGrabListener();
    const frames: unknown[] = [];
    service.subscribeFrames(frame => frames.push(frame));

    const v2 = { protocol: 2, type: 'PROTOCOL_HELLO' };
    onFrame(JSON.stringify(v2));
    expect(frames).toEqual([v2]);
  });

  /** transport 只做 JSON 序列化与定向中继，不解释 payload。 */
  it('postFrame 把帧序列化成 JSON 字符串交给 devtools_message 命令', async () => {
    const { service } = await connectAndGrabListener();
    const frame = { protocol: 2, type: 'PING' };
    service.postFrame(frame);

    expect(invokeMock).toHaveBeenCalledWith('devtools_message', { payload: JSON.stringify(frame) });
  });

  /** 命令名同样是跨语言契约：Rust 侧函数名 `devtools_message` 决定。 */
  it('sendMessage 构造 v1 控制消息并投递', async () => {
    const { service } = await connectAndGrabListener();
    service.sendMessage('PING');

    expect(invokeMock).toHaveBeenCalledTimes(1);
    const [command, args] = invokeMock.mock.calls[0] as [string, { payload: string }];
    expect(command).toBe('devtools_message');
    const sent = JSON.parse(args.payload) as DevToolsMessage;
    expect(sent.source).toBe(RXDB_DEVTOOLS_MESSAGE);
    expect(sent.direction).toBe('devtools-to-page');
    expect(sent.type).toBe('PING');
  });

  /** AC#5：断开/销毁时必须摘掉事件监听，不再接收迟到帧。 */
  it('ngOnDestroy 摘除监听并置 disconnected', async () => {
    const { service } = await connectAndGrabListener();
    service.ngOnDestroy();

    expect(unlisten).toHaveBeenCalledTimes(1);
    expect(service.connected()).toBe(false);
  });

  /** AC#5：销毁后 postFrame 静默丢弃而不是抛错。 */
  it('断开后 postFrame 静默丢弃', async () => {
    const { service } = await connectAndGrabListener();
    service.ngOnDestroy();
    invokeMock.mockClear();

    service.postFrame({ protocol: 2, type: 'PING' });
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
