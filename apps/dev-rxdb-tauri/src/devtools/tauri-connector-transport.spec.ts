import type { DevToolsConnectorNegotiationMessage } from '@aiao/rxdb-devtools';
import { invoke } from '@tauri-apps/api/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTauriConnectorTransport } from './tauri-connector-transport';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
// 监听走的是**本窗口**的 `listen` 而不是全局 `listen`：全局那个注册的 target 是
// `EventTarget::Any`，会无视 Rust 侧的定向投递过滤收到所有帧（含本窗口自己发出的）。
// 桩跟着真实调用面走，否则单测会把一条已经修掉的缺陷继续当成正确行为钉住。
const listenMock = vi.fn();
vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: vi.fn(() => ({ listen: listenMock }))
}));

const invokeMock = vi.mocked(invoke);

describe('createTauriConnectorTransport', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
    listenMock.mockReset();
  });

  /**
   * connector 侧与面板侧走同一条 Rust 中继（`devtools_message` 命令），只是方向相反。
   * 命令名与参数形状必须与 Rust 侧逐字一致。
   */
  it('send 把消息序列化成 JSON 字符串交给 devtools_message 命令', () => {
    const transport = createTauriConnectorTransport();
    // transport 只做 JSON 序列化、不解释 payload，这里给一帧最小 v2 信封即可。
    const message = { protocol: 2, type: 'PROTOCOL_HELLO', payload: { supportedVersions: [2] } };

    transport.send(message as unknown as DevToolsConnectorNegotiationMessage);
    expect(invokeMock).toHaveBeenCalledWith('devtools_message', { payload: JSON.stringify(message) });
  });

  /**
   * subscribe 是异步注册：退订可能在注册完成前就来（init 后立刻 disconnect）。
   * 退订后 `listen` 才 settle 时，那一端必须立刻摘除。
   *
   * subscribe 现在注册**两条**监听：`devtools:message`（帧）与 `devtools:peer-gone`
   * （调试窗口销毁的讣告，US-905 AC#4/#5）。两条都必须被这同一个退订函数摘掉——
   * 漏掉后者的表征是窗口重开后收到两份讣告，而 connector 会据此关掉一个刚建好的 session。
   */
  it('subscribe 返回退订函数，注册完成前退订也能摘除两条监听', async () => {
    const unlistenFrames = vi.fn();
    const unlistenPeerGone = vi.fn();
    // 让两条 listen 都挂起，先拿到 subscribe 的退订函数再让它们 settle。
    const resolvers = new Map<string, (fn: () => void) => void>();
    listenMock.mockImplementation((event: string) => new Promise<() => void>(resolve => resolvers.set(event, resolve)));

    const transport = createTauriConnectorTransport();
    const unsubscribe = transport.subscribe(() => undefined);
    unsubscribe();

    resolvers.get('devtools:message')?.(unlistenFrames);
    resolvers.get('devtools:peer-gone')?.(unlistenPeerGone);
    await vi.waitFor(() => {
      expect(unlistenFrames).toHaveBeenCalledTimes(1);
      expect(unlistenPeerGone).toHaveBeenCalledTimes(1);
    });
  });

  it('subscribe 注册成功后，入站 payload 被解析回对象再交给回调', async () => {
    const unlisten = vi.fn();
    listenMock.mockResolvedValue(unlisten);

    const transport = createTauriConnectorTransport();
    const received: unknown[] = [];
    transport.subscribe(message => received.push(message));

    await vi.waitFor(() => expect(listenMock).toHaveBeenCalledWith('devtools:message', expect.any(Function)));
    const callback = listenMock.mock.calls[0][1] as (event: { payload: string }) => void;

    const frame = { protocol: 2, type: 'HANDSHAKE_ACK' };
    callback({ payload: JSON.stringify(frame) });
    expect(received).toEqual([frame]);
  });

  /**
   * AC#3 / AC#4：Tauri 没有 `MessageChannel`，隔离由 Rust 按窗口 label 路由提供。
   * `createSessionPort` 恒返 `undefined`，`closeSessionPort` 是幂等空操作——不能伪造一个端口。
   */
  it('createSessionPort 恒返 undefined，closeSessionPort 是空操作', () => {
    const transport = createTauriConnectorTransport();
    expect(transport.createSessionPort(() => undefined)).toBeUndefined();
    expect(() => transport.closeSessionPort()).not.toThrow();
    expect(() => transport.closeSessionPort()).not.toThrow();
  });
});
