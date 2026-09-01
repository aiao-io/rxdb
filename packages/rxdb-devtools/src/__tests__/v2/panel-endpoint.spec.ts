import { describe, expect, it, vi } from 'vitest';

import type { DevToolsProviderDescriptor } from '../../provider/descriptor.js';
import { createFakeClock } from '../../testing/fake-clock.js';
import type { AnyDevToolsMessage } from '../../types.js';
import { createMessage } from '../../types.js';
import {
  DEVTOOLS_MAX_CHUNK_BYTES,
  DEVTOOLS_MAX_INFLIGHT_REQUESTS,
  DEVTOOLS_MAX_INFLIGHT_TRANSFERS,
  DEVTOOLS_PROTOCOL_VERSION_V2,
  DEVTOOLS_REQUEST_TIMEOUT_MS,
  DEVTOOLS_TRANSFER_TOTAL_TIMEOUT_MS
} from '../../v2/constants.js';
import type { DevToolsPanelNegotiationMessage } from '../../v2/negotiation-panel.js';
import type { DevToolsPanelEndpoint, DevToolsPanelUploadSource } from '../../v2/panel-endpoint.js';
import { createDevToolsPanelEndpoint } from '../../v2/panel-endpoint.js';
import type { DevToolsV2Message } from '../../v2/wire.js';
import { createDevToolsV2Message } from '../../v2/wire.js';

const SESSION_ID = '2f1c8a4e-6b0d-4f37-9c25-7ae3b8140d6f';
const OTHER_SESSION_ID = 'b3d9e7c1-4a52-4e08-8f6b-1c0d5a2739e4';

/** files descriptor 的上限刻意取一个小值，好让「超限」用例不用真的造 50 MiB。 */
const SMALL_LIMIT = 8;

const FILES_DESCRIPTOR: DevToolsProviderDescriptor = {
  domain: 'files',
  version: 1,
  kind: 'opfs',
  operations: ['list', 'upload'],
  runtime: 'browser',
  limits: { maxTransferBytes: SMALL_LIMIT }
};

/** 上限放宽到多块，用于分块与并发额度用例。 */
const ROOMY_DESCRIPTOR: DevToolsProviderDescriptor = {
  ...FILES_DESCRIPTOR,
  limits: { maxTransferBytes: DEVTOOLS_MAX_CHUNK_BYTES * 8 }
};

function handshake(sessionId: string, descriptors: readonly DevToolsProviderDescriptor[]): DevToolsV2Message {
  return createDevToolsV2Message(
    'HANDSHAKE',
    {
      protocolVersion: DEVTOOLS_PROTOCOL_VERSION_V2,
      sessionId,
      capabilities: { capability: 'full', descriptors }
    },
    { sessionId, sequence: 1, timestamp: 1_700_000_000_000 }
  );
}

function fresh(): {
  clock: ReturnType<typeof createFakeClock>;
  sent: DevToolsPanelNegotiationMessage[];
  panel: DevToolsPanelEndpoint;
} {
  const clock = createFakeClock();
  const sent: DevToolsPanelNegotiationMessage[] = [];
  const panel = createDevToolsPanelEndpoint({ clock, send: message => sent.push(message) });
  return { clock, sent, panel };
}

/** 已协商成功的端点；`sent` 已清空，后续断言只看数据面。 */
function setup(descriptors: readonly DevToolsProviderDescriptor[] = [FILES_DESCRIPTOR]): ReturnType<typeof fresh> {
  const harness = fresh();
  harness.panel.start();
  harness.panel.receive(handshake(SESSION_ID, descriptors));
  harness.sent.length = 0;
  return harness;
}

function response(requestId: string, result: unknown, sessionId = SESSION_ID): DevToolsV2Message {
  return createDevToolsV2Message(
    'RESPONSE',
    { requestId, result },
    { sessionId, sequence: 2, timestamp: 1_700_000_000_001 }
  );
}

function errorFrame(requestId: string | null, sessionId = SESSION_ID): DevToolsV2Message {
  return createDevToolsV2Message(
    'ERROR',
    { requestId, error: { code: 'resource_not_found', retryable: false } },
    { sessionId, sequence: 3, timestamp: 1_700_000_000_002 }
  );
}

function eventFrame(eventType: string, data: unknown, sessionId = SESSION_ID): DevToolsV2Message {
  return createDevToolsV2Message(
    'EVENT',
    { eventType, data },
    { sessionId, sequence: 4, timestamp: 1_700_000_000_003 }
  );
}

function disconnectFrame(): DevToolsV2Message {
  return createDevToolsV2Message('DISCONNECT', null, {
    sessionId: SESSION_ID,
    sequence: 9,
    timestamp: 1_700_000_000_009,
    direction: 'connector-to-panel'
  });
}

/** 只保留 v2 帧；legacy ACK 不参与数据面断言。 */
function v2Frames(sent: readonly DevToolsPanelNegotiationMessage[]): DevToolsV2Message[] {
  return sent.filter((message): message is DevToolsV2Message => 'protocol' in message);
}

function typesOf(sent: readonly DevToolsPanelNegotiationMessage[]): string[] {
  return v2Frames(sent).map(frame => frame.type);
}

function requestIdOf(sent: readonly DevToolsPanelNegotiationMessage[], index = 0): string {
  const frame = v2Frames(sent).filter(item => item.type === 'REQUEST')[index];
  if (frame === undefined || frame.type !== 'REQUEST') throw new Error('no REQUEST frame at that index');
  return frame.payload.requestId;
}

/** 全内存字节源；`read` 立即 resolve。 */
function bytesSource(totalBytes: number): DevToolsPanelUploadSource {
  const bytes = Uint8Array.from({ length: totalBytes }, (_, index) => index % 256);
  return { totalBytes, read: (offset, length) => Promise.resolve(bytes.subarray(offset, offset + length)) };
}

/** 读到第二块就挂住的字节源：用它把一条传输**停在在途状态**，而不是靠测试专用开关。 */
function stallingSource(totalBytes: number): DevToolsPanelUploadSource {
  let served = false;
  return {
    totalBytes,
    read: (offset, length) => {
      if (served) return new Promise<Uint8Array>(() => undefined);
      served = true;
      return Promise.resolve(new Uint8Array(length).fill(7));
    }
  };
}

describe('panel endpoint · 协商接线', () => {
  it('MUST expose the connector capabilities announced in HANDSHAKE', () => {
    const { panel } = setup();

    expect(panel.state).toBe('v2');
    expect(panel.sessionId).toBe(SESSION_ID);
    expect(panel.capability).toBe('full');
    expect(panel.descriptors).toEqual([FILES_DESCRIPTOR]);
  });

  it('MUST keep ACK ownership: exactly one HANDSHAKE_ACK for the negotiated session', () => {
    const { sent, panel } = fresh();

    panel.start();
    panel.receive(handshake(SESSION_ID, []));

    expect(typesOf(sent)).toEqual(['PROTOCOL_HELLO', 'HANDSHAKE_ACK']);
  });

  it('MUST re-send PROTOCOL_HELLO on a session-less legacy HANDSHAKE', () => {
    const { sent, panel } = fresh();

    panel.start();
    const legacy: AnyDevToolsMessage = createMessage('HANDSHAKE', 'page-to-devtools', null, 1);
    panel.receive(legacy);

    expect(typesOf(sent)).toEqual(['PROTOCOL_HELLO', 'PROTOCOL_HELLO']);
    expect(panel.state).toBe('awaiting');
  });
});

describe('panel endpoint · 请求', () => {
  it('MUST fail a request without a session instead of queueing it', async () => {
    const { sent, panel } = fresh();
    panel.start();
    sent.length = 0;

    await expect(panel.request('database', 'inspect', {})).resolves.toEqual({
      outcome: 'failed',
      error: { code: 'session_closed', retryable: true }
    });
    expect(sent).toEqual([]);
  });

  it('MUST settle a request on the matching RESPONSE', async () => {
    const { sent, panel } = setup();

    const pending = panel.request('database', 'inspect', { scope: 'all' });
    expect(v2Frames(sent)).toHaveLength(1);
    expect(v2Frames(sent)[0]).toMatchObject({
      type: 'REQUEST',
      direction: 'panel-to-connector',
      sessionId: SESSION_ID,
      payload: { domain: 'database', operation: 'inspect', params: { scope: 'all' } }
    });

    panel.receive(response(requestIdOf(sent), { entities: [] }));

    await expect(pending).resolves.toEqual({ outcome: 'ok', result: { entities: [] } });
    expect(panel.inflightRequests).toBe(0);
  });

  it('MUST settle a request on the matching ERROR', async () => {
    const { sent, panel } = setup();

    const pending = panel.request('files', 'list', { path: '/' });
    panel.receive(errorFrame(requestIdOf(sent)));

    await expect(pending).resolves.toEqual({
      outcome: 'failed',
      error: { code: 'resource_not_found', retryable: false }
    });
  });

  it('MUST drop and count a RESPONSE carrying a foreign session id', async () => {
    const { sent, panel } = setup();

    const pending = panel.request('database', 'inspect', {});
    panel.receive(response(requestIdOf(sent), 'stolen', OTHER_SESSION_ID));

    expect(panel.inflightRequests).toBe(1);
    expect(panel.rejectedFrames).toBe(1);

    panel.receive(response(requestIdOf(sent), 'mine'));
    await expect(pending).resolves.toEqual({ outcome: 'ok', result: 'mine' });
  });

  it('MUST drop and count a RESPONSE for an unknown request id', () => {
    const { panel } = setup();

    panel.receive(response('never-issued', 'x'));

    expect(panel.rejectedFrames).toBe(1);
  });

  it('MUST time out a request and then drop its late RESPONSE', async () => {
    const { clock, sent, panel } = setup();

    const pending = panel.request('database', 'query', {});
    clock.advance(DEVTOOLS_REQUEST_TIMEOUT_MS);

    await expect(pending).resolves.toEqual({
      outcome: 'failed',
      error: { code: 'request_timeout', retryable: true }
    });
    expect(panel.inflightRequests).toBe(0);

    panel.receive(response(requestIdOf(sent), 'late'));
    expect(panel.rejectedFrames).toBe(1);
  });

  it('MUST reject an over-limit request without emitting a frame', async () => {
    const { sent, panel } = setup();

    const pending = Array.from({ length: DEVTOOLS_MAX_INFLIGHT_REQUESTS }, () =>
      panel.request('database', 'inspect', {})
    );
    expect(v2Frames(sent)).toHaveLength(DEVTOOLS_MAX_INFLIGHT_REQUESTS);

    await expect(panel.request('database', 'inspect', {})).resolves.toEqual({
      outcome: 'failed',
      error: { code: 'request_limit_exceeded', retryable: true }
    });
    // 被拒的调用既不占额度也不上线：多出来的那一帧正是「静默扩容」最常见的形态。
    expect(v2Frames(sent)).toHaveLength(DEVTOOLS_MAX_INFLIGHT_REQUESTS);
    expect(panel.inflightRequests).toBe(DEVTOOLS_MAX_INFLIGHT_REQUESTS);

    panel.dispose();
    await Promise.all(pending);
  });

  it('MUST settle every in-flight request when the session closes', async () => {
    const { panel } = setup();

    const pending = panel.request('database', 'inspect', {});
    panel.receive(disconnectFrame());

    await expect(pending).resolves.toEqual({
      outcome: 'failed',
      error: { code: 'session_closed', retryable: true }
    });
    expect(panel.sessionOpen).toBe(false);
  });
});

describe('panel endpoint · 事件', () => {
  it('MUST deliver EVENT frames to subscribers until they unsubscribe', () => {
    const { panel } = setup();
    const seen = vi.fn();

    const unsubscribe = panel.onEvent(seen);
    panel.receive(eventFrame('write', { id: 1 }));
    unsubscribe();
    panel.receive(eventFrame('write', { id: 2 }));

    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen).toHaveBeenCalledWith({ eventType: 'write', data: { id: 1 } });
  });

  it('MUST drop EVENT frames carrying a foreign session id', () => {
    const { panel } = setup();
    const seen = vi.fn();

    panel.onEvent(seen);
    panel.receive(eventFrame('write', { id: 1 }, OTHER_SESSION_ID));

    expect(seen).not.toHaveBeenCalled();
    expect(panel.rejectedFrames).toBe(1);
  });
});

describe('panel endpoint · 上传', () => {
  it('MUST drive REQUEST / START / CHUNK* / COMPLETE and hand the transfer id to params', async () => {
    const { sent, panel } = setup();

    const result = await panel.upload({
      params: transferId => ({ path: '/a.txt', transferId }),
      source: bytesSource(3)
    });

    expect(typesOf(sent)).toEqual(['REQUEST', 'TRANSFER_START', 'TRANSFER_CHUNK', 'TRANSFER_COMPLETE']);
    const [request, start, chunk] = v2Frames(sent);
    if (request.type !== 'REQUEST' || start.type !== 'TRANSFER_START' || chunk.type !== 'TRANSFER_CHUNK') {
      throw new Error('unexpected frame order');
    }
    expect(request.payload).toMatchObject({ domain: 'files', operation: 'upload' });
    // params 必须拿得到 transferId：provider 侧的 sink 只按 transferId 命名，路径绑定无处可去。
    expect(request.payload.params).toEqual({ path: '/a.txt', transferId: start.payload.transferId });
    expect(start.payload).toMatchObject({ requestId: requestIdOf(sent), totalBytes: 3 });
    expect(chunk.payload).toMatchObject({ chunkIndex: 0, offset: 0, dataBase64: 'AAEC' });

    expect(result).toEqual({ outcome: 'sent' });
    expect(panel.inflightTransfers).toBe(0);
  });

  it('MUST send START then COMPLETE with no CHUNK for a zero-byte upload', async () => {
    const { sent, panel } = setup();

    const result = await panel.upload({ params: () => ({ path: '/empty' }), source: bytesSource(0) });

    expect(typesOf(sent)).toEqual(['REQUEST', 'TRANSFER_START', 'TRANSFER_COMPLETE']);
    expect(result).toEqual({ outcome: 'sent' });
  });

  it('MUST split payloads larger than one chunk', async () => {
    const { sent, panel } = setup([ROOMY_DESCRIPTOR]);

    const result = await panel.upload({
      params: () => ({}),
      source: bytesSource(DEVTOOLS_MAX_CHUNK_BYTES + 1)
    });

    expect(typesOf(sent)).toEqual([
      'REQUEST',
      'TRANSFER_START',
      'TRANSFER_CHUNK',
      'TRANSFER_CHUNK',
      'TRANSFER_COMPLETE'
    ]);
    const second = v2Frames(sent).filter(frame => frame.type === 'TRANSFER_CHUNK')[1];
    if (second.type !== 'TRANSFER_CHUNK') throw new Error('unexpected frame');
    expect(second.payload).toMatchObject({ chunkIndex: 1, offset: DEVTOOLS_MAX_CHUNK_BYTES });
    expect(result).toEqual({ outcome: 'sent' });
  });

  it('MUST refuse an upload above the negotiated limit before emitting any frame', async () => {
    const { sent, panel } = setup();

    const result = await panel.upload({ params: () => ({}), source: bytesSource(SMALL_LIMIT + 1) });

    expect(result).toEqual({ outcome: 'failed', error: { code: 'transfer_size_exceeded', retryable: false } });
    expect(sent).toEqual([]);
  });

  it('MUST refuse an upload when the transfer budget is exhausted', async () => {
    const { panel } = setup([ROOMY_DESCRIPTOR]);

    const held = Array.from({ length: DEVTOOLS_MAX_INFLIGHT_TRANSFERS }, () =>
      panel.upload({ params: () => ({}), source: stallingSource(DEVTOOLS_MAX_CHUNK_BYTES * 2) })
    );
    await Promise.resolve();
    expect(panel.inflightTransfers).toBe(DEVTOOLS_MAX_INFLIGHT_TRANSFERS);

    await expect(panel.upload({ params: () => ({}), source: bytesSource(1) })).resolves.toEqual({
      outcome: 'failed',
      error: { code: 'transfer_limit_exceeded', retryable: true }
    });

    panel.dispose();
    await Promise.all(held);
  });

  it('MUST fail an upload when the connector reports an error mid-transfer', async () => {
    const { sent, panel } = setup([ROOMY_DESCRIPTOR]);

    const pending = panel.upload({
      params: () => ({}),
      source: stallingSource(DEVTOOLS_MAX_CHUNK_BYTES * 2)
    });
    await Promise.resolve();
    panel.receive(errorFrame(requestIdOf(sent)));

    await expect(pending).resolves.toEqual({
      outcome: 'failed',
      error: { code: 'resource_not_found', retryable: false }
    });
    expect(panel.inflightTransfers).toBe(0);
  });

  /**
   * RESPONSE 之后的 ERROR 同样要落到这次上传身上。
   *
   * @remarks
   * connector 在 provider **登记完** upload 就回 RESPONSE，字节一个都还没写。因此真正的
   * 写入失败（磁盘满、权限、commit 失败）全部发生在 RESPONSE **之后**——那时 requestId
   * 早已从在途请求表里删掉了。只查 `#requests` 与下载专用的 `#downloads` 的话，这条
   * ERROR 变成一帧无主帧被记进 `rejectedFrames`，上传照发不误并回 `'sent'`：
   * 一次彻底失败的上传被报成成功，这是本用例唯一要挡住的东西。
   */
  it('MUST fail an upload when the error arrives after the upload RESPONSE', async () => {
    const { sent, panel } = setup([ROOMY_DESCRIPTOR]);

    const pending = panel.upload({
      params: () => ({}),
      source: stallingSource(DEVTOOLS_MAX_CHUNK_BYTES * 2)
    });
    await Promise.resolve();
    const requestId = requestIdOf(sent);
    panel.receive(response(requestId, { transferId: 'trf-1' }));
    panel.receive(errorFrame(requestId));

    await expect(pending).resolves.toEqual({
      outcome: 'failed',
      error: { code: 'resource_not_found', retryable: false }
    });
    expect(panel.inflightTransfers).toBe(0);
    expect(panel.rejectedFrames).toBe(0);
  });

  /**
   * 对端彻底沉默时，上传不能永远挂着。
   *
   * @remarks
   * REQUEST 超时只覆盖「RESPONSE 没来」。RESPONSE 来了、随后 connector 死掉（或字节源
   * 卡住）时，`#drive` 既不等对端任何一帧，也没有自己的闸——`source.read` 停住就永久
   * 挂起，UI 上是一个永不结束的进度条。所以上传要有自己的总时长闸。
   */
  it('MUST fail an upload that outlives the total transfer timeout', async () => {
    const { sent, clock, panel } = setup([ROOMY_DESCRIPTOR]);

    const pending = panel.upload({
      params: () => ({}),
      source: stallingSource(DEVTOOLS_MAX_CHUNK_BYTES * 2)
    });
    await Promise.resolve();
    panel.receive(response(requestIdOf(sent), { transferId: 'trf-1' }));
    clock.advance(DEVTOOLS_TRANSFER_TOTAL_TIMEOUT_MS);

    await expect(pending).resolves.toEqual({
      outcome: 'failed',
      error: { code: 'transfer_timeout', retryable: false }
    });
    expect(panel.inflightTransfers).toBe(0);
    // 闸自己也要拆干净，否则每条上传都在时钟上留一个到期回调。
    expect(clock.pendingTimers()).toBe(0);
  });
});
