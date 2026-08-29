import { createDevToolsV2Message, isDevToolsMessage as isStrictDevToolsMessage } from '@aiao/rxdb-devtools';
import { RXDB_DEVTOOLS_MESSAGE } from '@modules/rxdb-devtools-panel/wire';
import { describe, expect, it, vi } from 'vitest';
import {
  createBridgePing,
  extractHandshakePort,
  forwardExtensionMessage,
  forwardPageMessage,
  forwardPortMessage
} from './bridge-core';

/**
 * 构造一条**方向与类型配对正确**的消息。
 *
 * PING 只允许 `devtools-to-page`；页面到 DevTools 用 `HANDSHAKE`。
 */
function message(direction: 'page-to-devtools' | 'devtools-to-page') {
  return {
    source: RXDB_DEVTOOLS_MESSAGE,
    direction,
    type: direction === 'page-to-devtools' ? ('HANDSHAKE' as const) : ('PING' as const),
    payload: null,
    timestamp: 1,
    sequence: 1
  };
}

/** 协商完成后每一帧都必须归属的规范 UUID v4。 */
const SESSION_ID = '4b1d0f3a-2c6e-4a58-9f31-8d7c5e2b0a94';

/** 构造一条上行的 v2 `EVENT`（connector → 面板）。 */
function v2Event() {
  return createDevToolsV2Message(
    'EVENT',
    { eventType: 'insert', data: null },
    { sessionId: SESSION_ID, sequence: 1, timestamp: 1 }
  );
}

/** 构造一条下行的 v2 `REQUEST`（面板 → connector）。 */
function v2Request() {
  return createDevToolsV2Message(
    'REQUEST',
    { requestId: 'r1', domain: 'database', operation: 'query', params: {} },
    { sessionId: SESSION_ID, sequence: 1, timestamp: 1 }
  );
}

describe('forwardPageMessage', () => {
  it('forwards a valid same-window same-origin page message', () => {
    const send = vi.fn();
    const currentWindow = { location: { origin: 'https://example.com' } } as Window;
    const event = {
      source: currentWindow,
      origin: 'https://example.com',
      data: message('page-to-devtools')
    } as unknown as MessageEvent;

    expect(forwardPageMessage(event, currentWindow, send)).toBe(true);
    expect(send).toHaveBeenCalledWith(event.data);
  });

  it.each([
    { source: {}, origin: 'https://example.com', data: message('page-to-devtools') },
    { source: null, origin: 'https://evil.example', data: message('page-to-devtools') },
    { source: null, origin: '', data: message('devtools-to-page') },
    { source: null, origin: '', data: { type: 'PING' } }
  ])('rejects untrusted or wrong-direction page messages', partial => {
    const send = vi.fn();
    const currentWindow = { location: { origin: 'https://example.com' } } as Window;
    const event = { ...partial, source: partial.source ?? currentWindow } as unknown as MessageEvent;

    expect(forwardPageMessage(event, currentWindow, send)).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('createBridgePing', () => {
  it('passes the connector 的严格校验，才能唤醒页面重新握手', () => {
    // connector 用的是 @aiao/rxdb-devtools 的严格守卫（envelope 必须精确匹配），
    // 比扩展内部的宽松守卫更挑剔；bridge 自造的 PING 必须过这一关。
    expect(isStrictDevToolsMessage(createBridgePing())).toBe(true);
  });

  it('是发往页面的 PING', () => {
    expect(createBridgePing()).toMatchObject({
      source: RXDB_DEVTOOLS_MESSAGE,
      direction: 'devtools-to-page',
      type: 'PING',
      payload: null
    });
  });

  it('不会被 forwardPageMessage 反向回传，避免自环', () => {
    const send = vi.fn();
    const currentWindow = { location: { origin: 'https://example.com' } } as Window;
    const event = {
      source: currentWindow,
      origin: 'https://example.com',
      data: createBridgePing()
    } as unknown as MessageEvent;

    expect(forwardPageMessage(event, currentWindow, send)).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('forwardExtensionMessage', () => {
  it('posts a valid extension message only to the current origin', () => {
    const post = vi.fn();
    const value = message('devtools-to-page');

    expect(forwardExtensionMessage(value, 'https://example.com', post)).toBe(true);
    expect(post).toHaveBeenCalledWith(value, 'https://example.com');
  });

  it('rejects malformed and wrong-direction extension messages', () => {
    const post = vi.fn();

    expect(forwardExtensionMessage(message('page-to-devtools'), 'https://example.com', post)).toBe(false);
    expect(forwardExtensionMessage({ type: 'PING' }, 'https://example.com', post)).toBe(false);
    expect(post).not.toHaveBeenCalled();
  });

  it('routes through the private port and keeps the payload off the window bus', () => {
    const post = vi.fn();
    const port = { postMessage: vi.fn() } as unknown as MessagePort;
    const value = message('devtools-to-page');

    expect(forwardExtensionMessage(value, 'https://example.com', post, port)).toBe(true);
    expect(port.postMessage).toHaveBeenCalledWith(value);
    expect(post).not.toHaveBeenCalled();
  });
});

describe('forwardPortMessage', () => {
  it('forwards a valid page-to-devtools message without any source check', () => {
    // 端口是点对点的，MessageEvent 上没有 source / origin 可查 —— 只做结构校验。
    const send = vi.fn();
    const event = { data: message('page-to-devtools') } as unknown as MessageEvent;

    expect(forwardPortMessage(event, send)).toBe(true);
    expect(send).toHaveBeenCalledWith(event.data);
  });

  it.each([message('devtools-to-page'), { type: 'HANDSHAKE' }, null])('rejects %#', data => {
    const send = vi.fn();

    expect(forwardPortMessage({ data } as unknown as MessageEvent, send)).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
});

/**
 * US-904 阶段 C2 / AC#36：content script 段同样必须承载两代协议。
 *
 * 三个转发点与端口采纳原先都读 v1 的方向标签 / v1 的类型白名单，对 v2 帧一律静默丢弃；
 * `extractHandshakePort` 更是逼着 v2 connector 为了拿到私有端口而伪装成 v1 —— 而私有信道
 * 的建立本就与协议版本无关。
 */
describe('content 段的 v2 帧穿透（C2/AC#36）', () => {
  const currentWindow = { location: { origin: 'https://example.com' } } as Window;
  const pageEvent = (data: unknown) =>
    ({ source: currentWindow, origin: 'https://example.com', data }) as unknown as MessageEvent;

  it('把页面 window 总线上的 v2 上行帧转给扩展', () => {
    const send = vi.fn();
    const event = pageEvent(v2Event());

    expect(forwardPageMessage(event, currentWindow, send)).toBe(true);
    expect(send).toHaveBeenCalledWith(event.data);
  });

  it('把私有端口上的 v2 上行帧转给扩展', () => {
    const send = vi.fn();
    const event = { data: v2Event() } as unknown as MessageEvent;

    expect(forwardPortMessage(event, send)).toBe(true);
    expect(send).toHaveBeenCalledWith(event.data);
  });

  it('把扩展发来的 v2 下行帧投递给页面', () => {
    const post = vi.fn();
    const port = { postMessage: vi.fn() } as unknown as MessagePort;
    const request = v2Request();

    expect(forwardExtensionMessage(request, 'https://example.com', post, port)).toBe(true);
    expect(port.postMessage).toHaveBeenCalledWith(request);
    expect(post).not.toHaveBeenCalled();
  });

  it('不把 v2 下行帧当成页面消息回传，避免自环', () => {
    const send = vi.fn();

    expect(forwardPageMessage(pageEvent(v2Request()), currentWindow, send)).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('不把 v2 上行帧当成扩展消息投给页面', () => {
    const post = vi.fn();

    expect(forwardExtensionMessage(v2Event(), 'https://example.com', post)).toBe(false);
    expect(post).not.toHaveBeenCalled();
  });
});

describe('extractHandshakePort', () => {
  const port = {} as MessagePort;

  it('takes the port transferred with a handshake', () => {
    const event = { data: message('page-to-devtools'), ports: [port] } as unknown as MessageEvent;

    expect(extractHandshakePort(event)).toBe(port);
  });

  it('采纳 v2 握手带来的端口，不逼 v2 connector 伪装成 v1', () => {
    const handshake = createDevToolsV2Message(
      'HANDSHAKE',
      { protocolVersion: 2, sessionId: SESSION_ID, capabilities: { capability: 'readonly', descriptors: [] } },
      { sessionId: SESSION_ID, sequence: 1, timestamp: 1 }
    );
    const event = { data: handshake, ports: [port] } as unknown as MessageEvent;

    expect(extractHandshakePort(event)).toBe(port);
  });

  it('reports a v1 connector by returning null for a portless handshake', () => {
    const event = { data: message('page-to-devtools'), ports: [] } as unknown as MessageEvent;

    expect(extractHandshakePort(event)).toBeNull();
  });

  it('never adopts a port smuggled in on a non-handshake message', () => {
    const event = { data: message('devtools-to-page'), ports: [port] } as unknown as MessageEvent;

    expect(extractHandshakePort(event)).toBeNull();
  });
});
