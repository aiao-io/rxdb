import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RXDB_DEVTOOLS_MESSAGE, type DevToolsMessage } from '@modules/rxdb-devtools-panel/wire';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DevToolsEndpointService } from './devtools-endpoint.service';
import { PortService } from './port.service';

interface PortHarness {
  readonly port: chrome.runtime.Port;
  readonly postMessage: ReturnType<typeof vi.fn>;
  emitMessage(message: unknown): void;
  emitDisconnect(): void;
}

function createPortHarness(): PortHarness {
  let messageListener: ((message: unknown) => void) | null = null;
  let disconnectListener: (() => void) | null = null;
  const postMessage = vi.fn();
  const port = {
    postMessage,
    disconnect: vi.fn(),
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
    emitMessage: message => messageListener?.(message),
    emitDisconnect: () => disconnectListener?.()
  };
}

function legacyHandshake(): DevToolsMessage {
  return {
    source: RXDB_DEVTOOLS_MESSAGE,
    direction: 'page-to-devtools',
    type: 'HANDSHAKE',
    payload: null,
    timestamp: 1,
    sequence: 0
  };
}

/** 出站帧里的 v2 类型；协商机的 legacy ACK 也在同一条 `postFrame` 上。 */
function typesOf(postMessage: ReturnType<typeof vi.fn>): string[] {
  return postMessage.mock.calls.map(call => (call[0] as { type?: string }).type ?? '');
}

describe('DevToolsEndpointService', () => {
  let harnesses: (PortHarness & { port: chrome.runtime.Port })[];

  function setup(): { endpoints: DevToolsEndpointService; ports: PortService } {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const ports = TestBed.inject(PortService);
    const endpoints = TestBed.inject(DevToolsEndpointService);
    TestBed.tick();
    return { endpoints, ports };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    harnesses = [];
    vi.stubGlobal('chrome', {
      runtime: {
        connect: vi.fn(() => {
          const harness = createPortHarness() as PortHarness & { port: chrome.runtime.Port };
          harnesses.push(harness);
          return harness.port;
        })
      },
      devtools: { inspectedWindow: { tabId: 42 } }
    } as unknown as typeof chrome);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends PROTOCOL_HELLO as soon as the port is up', () => {
    const { endpoints } = setup();

    expect(typesOf(harnesses[0]!.postMessage)).toEqual(['PROTOCOL_HELLO']);
    expect(endpoints.state()).toBe('idle');
  });

  it('receives the legacy handshake that the v1 guard would have dropped', () => {
    // 协商是证据触发的：那条 v1 握手就是唯一的证据。若原始车道复用 `isDevToolsMessage`
    // 之外的 v2 判定把它滤掉，1,000 ms 窗口永远不会开始，两端都支持 v2 也会稳定退回 v1。
    const { endpoints } = setup();

    harnesses[0]!.emitMessage(legacyHandshake());

    expect(endpoints.state()).toBe('awaiting');
  });

  it('falls back to the v1 facade only after the window expires, and owns the ACK itself', () => {
    const { endpoints } = setup();
    harnesses[0]!.emitMessage(legacyHandshake());
    harnesses[0]!.postMessage.mockClear();

    vi.advanceTimersByTime(1000);

    expect(typesOf(harnesses[0]!.postMessage)).toEqual(['HANDSHAKE_ACK']);
    expect(endpoints.state()).toBe('v1-facade');
  });

  it('replaces the endpoint on reconnect instead of talking to a settled one', () => {
    // v1 facade 是终态。重连后若还拿着旧端点，每次文件请求都会以 `session_closed` 结束，
    // 症状是「重连后文件页永久失效」，且看起来像页面侧的问题。
    const { endpoints } = setup();
    harnesses[0]!.emitMessage(legacyHandshake());
    vi.advanceTimersByTime(1000);
    const settled = endpoints.resolve();

    harnesses[0]!.emitDisconnect();
    vi.advanceTimersByTime(1000);
    TestBed.tick();

    expect(harnesses).toHaveLength(2);
    expect(endpoints.resolve()).not.toBe(settled);
    expect(endpoints.state()).toBe('idle');
    expect(typesOf(harnesses[1]!.postMessage)).toEqual(['PROTOCOL_HELLO']);
  });

  it('drops the endpoint when the panel is torn down', () => {
    const { endpoints } = setup();

    endpoints.ngOnDestroy();

    expect(endpoints.resolve()).toBeNull();
    expect(endpoints.state()).toBeNull();
  });
});
