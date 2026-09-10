import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DEVTOOLS_TRANSPORT, DevToolsEndpointService } from '@modules/rxdb-devtools-panel';
import { RXDB_DEVTOOLS_MESSAGE, type DevToolsMessage } from '@modules/rxdb-devtools-panel/wire';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PortService } from './port.service';

interface PortHarness {
  readonly port: chrome.runtime.Port;
  readonly postMessage: ReturnType<typeof vi.fn>;
  readonly disconnect: ReturnType<typeof vi.fn>;
  emitMessage(message: unknown): void;
  emitDisconnect(): void;
}

function createPortHarness(): PortHarness {
  let messageListener: ((message: unknown) => void) | null = null;
  let disconnectListener: (() => void) | null = null;
  const postMessage = vi.fn();
  const disconnect = vi.fn();
  const port = {
    postMessage,
    disconnect,
    onMessage: {
      addListener: vi.fn((listener: (message: unknown) => void) => {
        messageListener = listener;
      })
    },
    onDisconnect: {
      addListener: vi.fn((listener: () => void) => {
        disconnectListener = listener;
      })
    }
  } as unknown as chrome.runtime.Port;

  return {
    port,
    postMessage,
    disconnect,
    emitMessage(message: unknown) {
      messageListener?.(message);
    },
    emitDisconnect() {
      disconnectListener?.();
    }
  };
}

function validMessage(sequence = 0): DevToolsMessage {
  return {
    source: RXDB_DEVTOOLS_MESSAGE,
    direction: 'page-to-devtools',
    type: 'HANDSHAKE',
    payload: null,
    timestamp: 1,
    sequence
  };
}

describe('PortService', () => {
  let harnesses: PortHarness[];
  let connect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-13T00:00:00.000Z'));
    harnesses = [];
    connect = vi.fn(() => {
      const harness = createPortHarness();
      harnesses.push(harness);
      return harness.port;
    });
    vi.stubGlobal('chrome', {
      runtime: { connect },
      devtools: { inspectedWindow: { tabId: 42 } }
    } as unknown as typeof chrome);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('connects without activating the inspected tab before host access is confirmed', () => {
    const service = new PortService();

    expect(connect).toHaveBeenCalledWith({ name: 'rxdb-devtools-panel' });
    expect(harnesses[0]?.postMessage).not.toHaveBeenCalled();
    expect(service.connected()).toBe(true);

    service.activateTab();

    expect(harnesses[0]?.postMessage).toHaveBeenCalledWith({
      source: RXDB_DEVTOOLS_MESSAGE,
      direction: 'devtools-to-page',
      type: 'INIT',
      payload: null,
      timestamp: Date.now(),
      sequence: 0,
      tabId: 42
    });
    service.ngOnDestroy();
  });

  it('sends typed envelopes with increasing sequence numbers and null payloads', () => {
    const service = new PortService();
    service.activateTab();
    harnesses[0]?.postMessage.mockClear();

    service.sendMessage('PING');
    service.sendMessage('SWITCH_BRANCH', 'feature');

    expect(harnesses[0]?.postMessage).toHaveBeenNthCalledWith(1, {
      source: RXDB_DEVTOOLS_MESSAGE,
      direction: 'devtools-to-page',
      type: 'PING',
      payload: null,
      timestamp: Date.now(),
      // INIT 已经用掉 sequence 0，业务消息从 1 起
      sequence: 1,
      tabId: 42
    });
    expect(harnesses[0]?.postMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ type: 'SWITCH_BRANCH', payload: 'feature', sequence: 2 })
    );
    expect(harnesses[0]?.postMessage.mock.calls[1]?.[0]).not.toHaveProperty('session');

    service.ngOnDestroy();
  });

  // 协议 v2 用私有 MessagePort 取代了会话令牌：面板不再在 envelope 上贴任何 `session`，
  // 贴了反而会被页面侧的严格 envelope 校验整条拒掉。
  it('never stamps a session key on outbound commands', () => {
    const service = new PortService();
    service.activateTab();
    harnesses[0]?.emitMessage({
      source: RXDB_DEVTOOLS_MESSAGE,
      direction: 'page-to-devtools',
      type: 'HANDSHAKE',
      payload: { protocolVersion: 2, capabilities: 'full' },
      timestamp: 1,
      sequence: 0
    });
    harnesses[0]?.postMessage.mockClear();

    service.sendMessage('PING');
    service.sendMessage('SWITCH_BRANCH', 'feature');

    expect(harnesses[0]?.postMessage.mock.calls[0]?.[0]).not.toHaveProperty('session');
    expect(harnesses[0]?.postMessage.mock.calls[1]?.[0]).not.toHaveProperty('session');

    service.ngOnDestroy();
  });

  it('forwards only valid messages and supports unsubscribe', () => {
    const service = new PortService();
    const listener = vi.fn();
    const unsubscribe = service.subscribe(listener);

    harnesses[0]?.emitMessage({ type: 'HANDSHAKE' });
    harnesses[0]?.emitMessage(validMessage());
    unsubscribe();
    harnesses[0]?.emitMessage(validMessage(1));

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(validMessage());
    service.ngOnDestroy();
  });

  it('notifies subscribers immediately when the inspected page navigates', () => {
    const service = new PortService();
    const listener = vi.fn();
    service.subscribe(listener);

    service.notifyNavigation();

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'DISCONNECT', direction: 'page-to-devtools', payload: null })
    );
    service.ngOnDestroy();
  });

  // v2 端点只订阅 `connectionEpoch` / `subscribeFrames`，看不到 v1 车道上合成的 DISCONNECT。
  // 导航不推进 epoch，端点就停在 `'v2'` 终态拒绝新 connector 的握手——文件 tab 静默变旧。
  it('advances connectionEpoch on navigation so the v2 endpoint re-negotiates', () => {
    const service = new PortService();
    const listener = vi.fn();
    service.subscribe(listener);
    const before = service.connectionEpoch();

    service.notifyNavigation();

    expect(service.connectionEpoch()).toBe(before + 1);
    // v1 车道行为不变：DISCONNECT 照发
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: 'DISCONNECT' }));
    service.ngOnDestroy();
  });

  it('replaces the v2 endpoint on navigation: old frame subscriber detached, new endpoint re-hellos', () => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        PortService,
        { provide: DEVTOOLS_TRANSPORT, useExisting: PortService },
        DevToolsEndpointService
      ]
    });
    const port = TestBed.inject(PortService);
    const endpoints = TestBed.inject(DevToolsEndpointService);
    TestBed.tick();
    const first = endpoints.resolve();
    expect(first).not.toBeNull();
    const subscribeFrames = vi.spyOn(port, 'subscribeFrames');
    const hellos = (): number =>
      harnesses[0]?.postMessage.mock.calls.filter(([frame]) => (frame as { type?: string }).type === 'PROTOCOL_HELLO')
        .length ?? 0;
    const hellosBefore = hellos();

    port.notifyNavigation();
    TestBed.tick();

    expect(endpoints.resolve(), '没有换端点——面板会继续对着旧 session 说话').not.toBe(first);
    expect(subscribeFrames, '新端点必须重新挂到原始帧车道').toHaveBeenCalledOnce();
    expect(hellos(), '新端点没有重新开口协商').toBe(hellosBefore + 1);

    endpoints.ngOnDestroy();
    TestBed.resetTestingModule();
  });

  it('isolates listener failures', () => {
    const service = new PortService();
    const healthyListener = vi.fn();
    service.subscribe(() => {
      throw new Error('listener failed');
    });
    service.subscribe(healthyListener);

    harnesses[0]?.emitMessage(validMessage());

    expect(healthyListener).toHaveBeenCalledOnce();
    service.ngOnDestroy();
  });

  it('reconnects with a timer after disconnect without stacking retries', async () => {
    const service = new PortService();
    const listener = vi.fn();
    service.subscribe(listener);

    harnesses[0]?.emitDisconnect();
    harnesses[0]?.emitDisconnect();
    expect(service.connected()).toBe(false);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: 'DISCONNECT', payload: null }));
    expect(connect).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(999);
    expect(connect).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    expect(connect).toHaveBeenCalledTimes(2);
    expect(service.connected()).toBe(true);
    service.ngOnDestroy();
  });

  it('retries when connect throws and stops reconnecting after destroy', async () => {
    connect.mockImplementationOnce(() => {
      throw new Error('worker unavailable');
    });
    const service = new PortService();
    expect(service.connected()).toBe(false);

    service.ngOnDestroy();
    await vi.runAllTimersAsync();

    expect(connect).toHaveBeenCalledOnce();
  });

  it('disconnects the active port and clears listeners on destroy', () => {
    const service = new PortService();
    const listener = vi.fn();
    service.subscribe(listener);

    service.ngOnDestroy();
    harnesses[0]?.emitMessage(validMessage());
    service.sendMessage('PING');

    expect(harnesses[0]?.disconnect).toHaveBeenCalledOnce();
    expect(listener).not.toHaveBeenCalled();
  });
});
