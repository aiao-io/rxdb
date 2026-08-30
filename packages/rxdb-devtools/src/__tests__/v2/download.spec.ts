import { describe, expect, it } from 'vitest';

import type { DevToolsChunkSink } from '../../provider/types.js';
import type { DevToolsFakeClock } from '../../testing/fake-clock.js';
import { createFakeClock } from '../../testing/fake-clock.js';
import type { DevToolsFakeProviderOptions, DevToolsFakeProviderSet } from '../../testing/fake-providers.js';
import { createFakeProviders, readFakeFileBytes } from '../../testing/fake-providers.js';
import { createMessage } from '../../types.js';
import { encodeCanonicalBase64 } from '../../v2/base64.js';
import {
  DEVTOOLS_MAX_CHUNK_BYTES,
  DEVTOOLS_PROTOCOL_VERSION_V2,
  DEVTOOLS_TRANSFER_IDLE_TIMEOUT_MS
} from '../../v2/constants.js';
import type { DevToolsConnectorEndpoint } from '../../v2/endpoint.js';
import { createDevToolsConnectorEndpoint } from '../../v2/endpoint.js';
import type { DevToolsPanelDownloadResult, DevToolsPanelEndpoint } from '../../v2/panel-endpoint.js';
import { createDevToolsPanelEndpoint } from '../../v2/panel-endpoint.js';
import type { DevToolsV2Message, DevToolsV2MessageType, DevToolsV2PayloadMap } from '../../v2/wire.js';
import { createDevToolsV2Message, isDevToolsV2Message } from '../../v2/wire.js';

/** 一个跨 3 块又不整除的大小：块数、末块长度与偏移三件事同时被这一个数验到。 */
const MULTI_CHUNK_SIZE = DEVTOOLS_MAX_CHUNK_BYTES * 2 + 7;

/**
 * 只校验、不留存的接收端。
 *
 * @remarks
 * 不把字节攒起来再比：那会让测试自己做掉「不得整文件驻留」禁止的事，也就再也测不出
 * 实现是不是在攒。改成每块当场跟 {@link readFakeFileBytes} 对齐，块序或偏移错了必然红。
 */
interface RecordingSink extends DevToolsChunkSink {
  readonly received: () => number;
  readonly mismatches: () => number;
  readonly commits: () => number;
  readonly discards: () => number;
}

function recordingSink(failCommit = false): RecordingSink {
  let received = 0;
  let mismatches = 0;
  let commits = 0;
  let discards = 0;

  return {
    async write(data: Uint8Array): Promise<void> {
      const expected = readFakeFileBytes(received, data.byteLength);
      if (!data.every((byte, index) => byte === expected[index])) mismatches += 1;
      received += data.byteLength;
    },
    async commit(): Promise<void> {
      if (failCommit) throw new Error('commit failed');
      commits += 1;
    },
    async discard(): Promise<void> {
      discards += 1;
    },
    received: () => received,
    mismatches: () => mismatches,
    commits: () => commits,
    discards: () => discards
  };
}

interface Loopback {
  readonly clock: DevToolsFakeClock;
  readonly panel: DevToolsPanelEndpoint;
  readonly connector: DevToolsConnectorEndpoint;
  readonly providers: DevToolsFakeProviderSet;
  /** 面板收到的全部 v2 帧。 */
  inbound(): readonly DevToolsV2Message[];
  /** connector 收到的全部 v2 帧。 */
  outbound(): readonly DevToolsV2Message[];
  /** 伪造一帧「来自 connector」的消息，用于协议层的错误路径。 */
  fromConnector<TType extends DevToolsV2MessageType>(type: TType, payload: DevToolsV2PayloadMap[TType]): void;
}

/**
 * 把真实的两端直接对接。
 *
 * @remarks
 * 同步投递，因为 wire 保序正是这条通道的前提；用队列异步投递会把「START 早于 RESPONSE」
 * 这条协议顺序偷偷放松成「先后无所谓」，而那正是本套用例要盯住的东西。
 */
function loopback(options: DevToolsFakeProviderOptions = {}): Loopback {
  const clock = createFakeClock();
  const providers = createFakeProviders(options);
  const inbound: DevToolsV2Message[] = [];
  const outbound: DevToolsV2Message[] = [];

  // 两端互相引用，只能有一端后声明；投递全部发生在下面的 `start()` 之后，闭包不会读到 TDZ。
  const connector = createDevToolsConnectorEndpoint({
    clock,
    send: message => {
      if (isDevToolsV2Message(message)) inbound.push(message);
      panel.receive(message);
    },
    capability: 'full',
    mutationPolicy: 'allow',
    providers,
    legacyHandshake: createMessage('HANDSHAKE', 'page-to-devtools', null, 1)
  });
  const panel = createDevToolsPanelEndpoint({
    clock,
    send: message => {
      if (isDevToolsV2Message(message)) outbound.push(message);
      connector.receive(message);
    }
  });

  connector.start();
  panel.start();

  let sequence = 100;
  return {
    clock,
    panel,
    connector,
    providers,
    inbound: () => inbound,
    outbound: () => outbound,
    fromConnector(type, payload) {
      sequence += 1;
      panel.receive(
        createDevToolsV2Message(type, payload, {
          sessionId: connector.sessionId,
          sequence,
          timestamp: 1_700_000_000_000,
          direction: 'connector-to-panel'
        })
      );
    }
  };
}

/** 走 wire 的下载：params 带上 requestId，fake 据此登记字节来源。 */
function download(harness: Loopback, path: string, sink: DevToolsChunkSink): Promise<DevToolsPanelDownloadResult> {
  return harness.panel.download({ params: requestId => ({ path, requestId }), sink });
}

function framesOf(frames: readonly DevToolsV2Message[], type: DevToolsV2MessageType): readonly DevToolsV2Message[] {
  return frames.filter(frame => frame.type === type);
}

describe('devtools download round trip', () => {
  it('MUST stream a file through the frozen transfer state machine and commit it', async () => {
    const harness = loopback();

    const sink = recordingSink();
    const result = await download(harness, '/db.sqlite', sink);

    expect(result).toEqual({ outcome: 'received', result: { path: '/db.sqlite', size: 4_096 } });
    expect(sink.received()).toBe(4_096);
    expect(sink.mismatches()).toBe(0);
    expect(sink.commits()).toBe(1);
    expect(sink.discards()).toBe(0);
  });

  it('MUST send TRANSFER_START before the RESPONSE that announces the download', async () => {
    const harness = loopback();

    await download(harness, '/db.sqlite', recordingSink());

    const types = harness
      .inbound()
      .map(frame => frame.type)
      .filter(type => type === 'TRANSFER_START' || type === 'RESPONSE');
    // 顺序倒过来的话，面板只能靠等一个猜出来的时长去判断「有没有流要来」。
    expect(types).toEqual(['TRANSFER_START', 'RESPONSE']);
  });

  it('MUST split a file larger than one chunk into contiguous chunks', async () => {
    const harness = loopback({
      files: { '/big.bin': MULTI_CHUNK_SIZE },
      maxTransferBytes: MULTI_CHUNK_SIZE
    });

    const sink = recordingSink();
    const result = await download(harness, '/big.bin', sink);

    expect(result.outcome).toBe('received');
    expect(sink.received()).toBe(MULTI_CHUNK_SIZE);
    expect(sink.mismatches()).toBe(0);
    const chunks = framesOf(harness.inbound(), 'TRANSFER_CHUNK');
    expect(chunks).toHaveLength(3);
    expect(chunks.map(frame => (frame.payload as { offset: number }).offset)).toEqual([
      0,
      DEVTOOLS_MAX_CHUNK_BYTES,
      DEVTOOLS_MAX_CHUNK_BYTES * 2
    ]);
  });

  it('MUST commit an empty file without sending any chunk', async () => {
    const harness = loopback({ files: { '/empty.bin': 0 } });

    const sink = recordingSink();
    const result = await download(harness, '/empty.bin', sink);

    // 零字节文件仍然是一次成功的下载：不发块，但必须 commit，否则空文件永远建不出来。
    expect(result.outcome).toBe('received');
    expect(framesOf(harness.inbound(), 'TRANSFER_CHUNK')).toHaveLength(0);
    expect(sink.commits()).toBe(1);
  });

  it('MUST report delivery at the source when the provider streams nothing', async () => {
    const harness = loopback();

    const sink = recordingSink();
    // 不带 requestId：fake 不登记来源，等价于浏览器 OPFS 由页面自己保存。
    const result = await harness.panel.download({ params: () => ({ path: '/db.sqlite' }), sink });

    expect(result).toEqual({ outcome: 'delivered-at-source', result: { path: '/db.sqlite', size: 4_096 } });
    expect(framesOf(harness.inbound(), 'TRANSFER_START')).toHaveLength(0);
    expect(sink.commits()).toBe(0);
    expect(sink.discards()).toBe(1);
  });

  it('MUST refuse a file larger than the negotiated limit without sending a RESPONSE', async () => {
    const harness = loopback({ files: { '/huge.bin': 4_096 }, maxTransferBytes: 1_024 });

    const result = await download(harness, '/huge.bin', recordingSink());

    expect(result).toEqual({
      outcome: 'failed',
      error: { code: 'transfer_size_exceeded', retryable: false }
    });
    expect(framesOf(harness.inbound(), 'RESPONSE')).toHaveLength(0);
    // 来源已经开过又被弃用，句柄必须还回去。
    expect(harness.providers.openChunkSources()).toBe(0);
  });

  it('MUST release the byte source and both transfer budgets once the download settles', async () => {
    const harness = loopback();

    await download(harness, '/db.sqlite', recordingSink());

    // 只查传输侧的账：协商机自己还挂着心跳定时器，那不是这条下载留下的。
    expect(harness.providers.openChunkSources()).toBe(0);
    expect(harness.connector.inflightDownloads).toBe(0);
    expect(harness.panel.inflightTransfers).toBe(0);
  });
});

/**
 * 只有面板一端的台架，connector 的帧由用例逐条手写。
 *
 * @remarks
 * 中途出事的四条路径不能用 {@link loopback}：fake 的字节源 `read` 立即 resolve，两端又是同步
 * 投递，所以一次下载在 `download()` 返回的那一刻就已经跑完了，用例根本插不进「中途」那一帧。
 * 这里把对端换成手写帧，时序就完全由用例掌握。
 */
interface PanelOnly {
  readonly clock: DevToolsFakeClock;
  readonly panel: DevToolsPanelEndpoint;
  /** 开一条下载，并把它推进到「已开流、已收下第一块」。 */
  stream(sink: DevToolsChunkSink): Promise<StreamedDownload>;
  fromConnector<TType extends DevToolsV2MessageType>(type: TType, payload: DevToolsV2PayloadMap[TType]): void;
}

/** 一条停在「中途」的下载。 */
interface StreamedDownload {
  readonly requestId: string;
  readonly pending: Promise<DevToolsPanelDownloadResult>;
}

const PANEL_SESSION_ID = '2f1c8a4e-6b0d-4f37-9c25-7ae3b8140d6f';
const PANEL_TRANSFER_ID = 'dl-1';

function panelOnly(): PanelOnly {
  const clock = createFakeClock();
  const sent: DevToolsV2Message[] = [];
  const panel = createDevToolsPanelEndpoint({
    clock,
    send: message => {
      if (isDevToolsV2Message(message)) sent.push(message);
    }
  });
  panel.start();
  panel.receive(
    createDevToolsV2Message(
      'HANDSHAKE',
      {
        protocolVersion: DEVTOOLS_PROTOCOL_VERSION_V2,
        sessionId: PANEL_SESSION_ID,
        capabilities: {
          capability: 'full',
          descriptors: [
            {
              domain: 'files',
              version: 1,
              kind: 'opfs',
              operations: ['download'],
              runtime: 'browser',
              limits: { maxTransferBytes: MULTI_CHUNK_SIZE }
            }
          ]
        }
      },
      { sessionId: PANEL_SESSION_ID, sequence: 1, timestamp: 1_700_000_000_000 }
    )
  );

  let sequence = 100;
  const fromConnector: PanelOnly['fromConnector'] = (type, payload) => {
    sequence += 1;
    panel.receive(
      createDevToolsV2Message(type, payload, {
        sessionId: PANEL_SESSION_ID,
        sequence,
        timestamp: 1_700_000_000_000 + sequence,
        direction: 'connector-to-panel'
      })
    );
  };

  return {
    clock,
    panel,
    fromConnector,
    async stream(sink) {
      const pending = panel.download({ params: () => ({ path: '/big.bin' }), sink });
      // `download()` 同步发出 REQUEST，所以这一帧此刻一定在 `sent` 里。
      const request = sent.filter(frame => frame.type === 'REQUEST').at(-1);
      if (request === undefined) throw new Error('no REQUEST frame observed');
      const requestId = (request.payload as { requestId: string }).requestId;

      // 协议顺序：START 先于 RESPONSE，面板见到 RESPONSE 时就已经知道有没有流要来。
      fromConnector('TRANSFER_START', { transferId: PANEL_TRANSFER_ID, requestId, totalBytes: MULTI_CHUNK_SIZE });
      fromConnector('RESPONSE', { requestId, result: { path: '/big.bin', size: MULTI_CHUNK_SIZE } });
      fromConnector('TRANSFER_CHUNK', {
        transferId: PANEL_TRANSFER_ID,
        chunkIndex: 0,
        offset: 0,
        dataBase64: encodeCanonicalBase64(readFakeFileBytes(0, DEVTOOLS_MAX_CHUNK_BYTES))
      });
      await flush();
      return { requestId, pending };
    }
  };
}

/** 让传输表内部那条 `await` 链跑完；它全是 microtask，一轮宏任务足够。 */
function flush(): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, 0);
  });
}

describe('devtools download failure paths', () => {
  it('MUST attribute a mid-stream failure to the ERROR frame, not to the cancellation', async () => {
    const harness = panelOnly();
    const sink = recordingSink();
    const { requestId, pending } = await harness.stream(sink);

    // connector 侧读盘失败的形态：先 ERROR 给归因，再 CANCEL 让本端丢掉半个文件。
    harness.fromConnector('ERROR', { requestId, error: { code: 'permission_denied', retryable: false } });
    harness.fromConnector('TRANSFER_CANCEL', { transferId: PANEL_TRANSFER_ID });

    // 拿先到的那帧结算的话，这里会变成通用的 `operation_failed`，一次权限失败被显示成用户取消。
    await expect(pending).resolves.toEqual({
      outcome: 'failed',
      error: { code: 'permission_denied', retryable: false }
    });
    expect(sink.received()).toBe(DEVTOOLS_MAX_CHUNK_BYTES);
    expect(sink.commits()).toBe(0);
    expect(sink.discards()).toBe(1);
  });

  it('MUST discard the sink when the idle gate expires mid-stream', async () => {
    const harness = panelOnly();
    const sink = recordingSink();
    const { pending } = await harness.stream(sink);

    harness.clock.advance(DEVTOOLS_TRANSFER_IDLE_TIMEOUT_MS + 1);

    await expect(pending).resolves.toEqual({
      outcome: 'failed',
      error: { code: 'transfer_timeout', retryable: false }
    });
    expect(sink.discards()).toBe(1);
    expect(sink.commits()).toBe(0);
  });

  it('MUST discard the sink exactly once when the session disconnects mid-stream', async () => {
    const harness = panelOnly();
    const sink = recordingSink();
    const { pending } = await harness.stream(sink);

    harness.fromConnector('DISCONNECT', null);

    await expect(pending).resolves.toEqual({
      outcome: 'failed',
      error: { code: 'session_closed', retryable: true }
    });
    // 断连时收尾路径有两条（session 收尾与 `download()` 自己的失败分支），但 sink 只能被弃一次。
    expect(sink.discards()).toBe(1);
    expect(sink.commits()).toBe(0);
  });

  it('MUST reject an out-of-order chunk without writing it', async () => {
    const harness = panelOnly();
    const sink = recordingSink();
    const { pending } = await harness.stream(sink);

    const before = harness.panel.rejectedFrames;
    const written = sink.received();
    // 跳过一块：下标与偏移都对不上，状态机必须拒绝而不是接着往 sink 写。
    harness.fromConnector('TRANSFER_CHUNK', {
      transferId: PANEL_TRANSFER_ID,
      chunkIndex: 9,
      offset: written + DEVTOOLS_MAX_CHUNK_BYTES,
      dataBase64: encodeCanonicalBase64(readFakeFileBytes(0, 8))
    });
    await flush();

    expect(harness.panel.rejectedFrames).toBe(before + 1);
    expect(sink.received()).toBe(written);
    harness.panel.dispose();
    await expect(pending).resolves.toEqual({
      outcome: 'failed',
      error: { code: 'session_closed', retryable: true }
    });
  });

  it('MUST fail the download when the sink refuses to commit', async () => {
    const harness = loopback();

    const sink = recordingSink(true);
    const result = await download(harness, '/db.sqlite', sink);

    expect(result).toEqual({ outcome: 'failed', error: { code: 'operation_failed', retryable: false } });
    expect(sink.discards()).toBe(1);
  });
});

