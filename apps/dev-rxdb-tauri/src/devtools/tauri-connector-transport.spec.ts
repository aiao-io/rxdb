import type { DevToolsConnectorNegotiationMessage } from '@aiao/rxdb-devtools';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTauriConnectorTransport } from './tauri-connector-transport';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

const invokeMock = vi.mocked(invoke);
const listenMock = vi.mocked(listen);

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
   */
  it('subscribe 返回退订函数，注册完成前退订也能摘除监听', async () => {
    const unlisten = vi.fn();
    // 让 listen 挂起，先拿到 subscribe 的退订函数再让它 settle。
    let resolveListen: (fn: typeof unlisten) => void = () => undefined;
    listenMock.mockReturnValue(new Promise(resolve => (resolveListen = resolve)));

    const transport = createTauriConnectorTransport();
    const unsubscribe = transport.subscribe(() => undefined);
    unsubscribe();

    resolveListen(unlisten);
    await vi.waitFor(() => expect(unlisten).toHaveBeenCalledTimes(1));
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
