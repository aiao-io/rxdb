import { describe, expect, it } from 'vitest';

import { RXDB_DEVTOOLS_MESSAGE, createMessage } from '../../types.js';
import type { AnyDevToolsMessage, DevToolsCapability } from '../../types.js';
import { createFakeClock } from '../../testing/fake-clock.js';
import type { DevToolsFakeClock } from '../../testing/fake-clock.js';
import { createFakeProviders } from '../../testing/fake-providers.js';
import type { DevToolsFakeProviderSet } from '../../testing/fake-providers.js';
import { encodeCanonicalBase64 } from '../../v2/base64.js';
import {
  DEVTOOLS_PROTOCOL_VERSION_V2,
  DEVTOOLS_REQUEST_TIMEOUT_MS,
  DEVTOOLS_TRANSFER_IDLE_TIMEOUT_MS
} from '../../v2/constants.js';
import { createDevToolsConnectorEndpoint } from '../../v2/endpoint.js';
import type { DevToolsConnectorEndpoint } from '../../v2/endpoint.js';
import type { DevToolsMutationPolicy } from '../../v2/authorization.js';
import { createDevToolsV2Message, isDevToolsV2Message } from '../../v2/wire.js';
import type { DevToolsV2Message, DevToolsV2MessageType, DevToolsV2PayloadMap } from '../../v2/wire.js';
import type { DevToolsConnectorNegotiationMessage } from '../../v2/negotiation-connector.js';

const FOREIGN_SESSION_ID = 'b3d9e7c1-4a52-4e08-8f6b-1c0d5a2739e4';
const TIMESTAMP = 1_700_000_000_000;

interface Harness {
  readonly clock: DevToolsFakeClock;
  readonly providers: DevToolsFakeProviderSet;
  readonly endpoint: DevToolsConnectorEndpoint;
  readonly sent: DevToolsConnectorNegotiationMessage[];
  /** 面板视角的发帧：自动带上已协商的 sessionId 与递增 sequence。 */
  panel<TType extends DevToolsV2MessageType>(type: TType, payload: DevToolsV2PayloadMap[TType]): void;
  /** 只保留 v2 帧，v1 legacy 握手不参与数据面断言。 */
  v2Frames(): readonly DevToolsV2Message[];
  framesOf<TType extends DevToolsV2MessageType>(type: TType): readonly DevToolsV2Message[];
}

interface HarnessOptions {
  readonly capability?: DevToolsCapability;
  readonly mutationPolicy?: DevToolsMutationPolicy;
  readonly providers?: DevToolsFakeProviderSet;
}

function legacyHandshake(): AnyDevToolsMessage {
  return createMessage('HANDSHAKE', 'page-to-devtools', null, 1);
}

function createHarness(options: HarnessOptions = {}): Harness {
  const clock = createFakeClock();
  const providers = options.providers ?? createFakeProviders();
  const sent: DevToolsConnectorNegotiationMessage[] = [];
  const endpoint = createDevToolsConnectorEndpoint({
    clock,
    send: message => sent.push(message),
    capability: options.capability ?? 'full',
    mutationPolicy: options.mutationPolicy ?? 'allow',
    providers,
    legacyHandshake: legacyHandshake()
  });

  let sequence = 0;
  const v2Frames = (): readonly DevToolsV2Message[] =>
    sent.filter((message): message is DevToolsV2Message => isDevToolsV2Message(message));

  return {
    clock,
    providers,
    endpoint,
    sent,
    panel(type, payload) {
      sequence += 1;
      endpoint.receive(
        createDevToolsV2Message(type, payload, {
          sessionId: type === 'PROTOCOL_HELLO' ? null : endpoint.sessionId,
          sequence,
          timestamp: TIMESTAMP,
          direction: 'panel-to-connector'
        })
      );
    },
    v2Frames,
    framesOf: type => v2Frames().filter(frame => frame.type === type)
  };
}

/** 走完 HELLO → HANDSHAKE → ACK，返回已建立 session 的 harness。 */
function connected(options: HarnessOptions = {}): Harness {
  const harness = createHarness(options);
  harness.endpoint.start();
  harness.panel('PROTOCOL_HELLO', { supportedVersions: [DEVTOOLS_PROTOCOL_VERSION_V2, 1] });
  harness.panel('HANDSHAKE_ACK', {
    protocolVersion: DEVTOOLS_PROTOCOL_VERSION_V2,
    sessionId: harness.endpoint.sessionId
  });
  return harness;
}

function request(harness: Harness, requestId: string, domain: 'database' | 'files' | 'settings', operation: string): void {
  harness.panel('REQUEST', { requestId, domain, operation, params: {} });
}

/** 跨一个宏任务，把 provider.invoke 之后排队的全部微任务放完。 */
function flush(): Promise<void> {
  return new Promise<void>(resolve => {
    setTimeout(resolve, 0);
  });
}

describe('connector endpoint session lifecycle', () => {
  it('MUST open a session only after the panel acknowledges the v2 handshake', () => {
    const harness = createHarness();
    harness.endpoint.start();
    harness.panel('PROTOCOL_HELLO', { supportedVersions: [DEVTOOLS_PROTOCOL_VERSION_V2] });

    expect(harness.endpoint.sessionOpen).toBe(false);

    harness.panel('HANDSHAKE_ACK', {
      protocolVersion: DEVTOOLS_PROTOCOL_VERSION_V2,
      sessionId: harness.endpoint.sessionId
    });

    expect(harness.endpoint.sessionOpen).toBe(true);
    expect(harness.framesOf('HANDSHAKE')).toHaveLength(1);
  });

  it('MUST ignore data-plane frames that arrive before the session exists', async () => {
    const harness = createHarness();
    harness.endpoint.start();
    request(harness, 'r1', 'database', 'inspect');
    await flush();

    // 没有 session 就没有归属，回一条错误等于告诉对端「这里有个 connector」。
    expect(harness.v2Frames()).toHaveLength(0);
    expect(harness.providers.probe.operationCalls.size).toBe(0);
  });

  it('MUST answer PING with PONG once the session is open', () => {
    const harness = connected();
    harness.panel('PING', null);

    expect(harness.framesOf('PONG')).toHaveLength(1);
  });

  it('MUST reject a data-plane frame carrying a foreign session id', () => {
    const harness = connected();
    harness.endpoint.receive(
      createDevToolsV2Message(
        'REQUEST',
        { requestId: 'r1', domain: 'database', operation: 'inspect', params: {} },
        { sessionId: FOREIGN_SESSION_ID, sequence: 9, timestamp: TIMESTAMP }
      )
    );

    expect(harness.framesOf('ERROR')[0]?.payload).toEqual({
      requestId: null,
      error: { code: 'session_invalid', retryable: false }
    });
    expect(harness.providers.probe.operationCalls.get('database.inspect')).toBeUndefined();
  });

  it('MUST close the session on DISCONNECT and ignore everything after it', async () => {
    const harness = connected();
    harness.panel('DISCONNECT', null);
    request(harness, 'r1', 'database', 'inspect');
    await flush();

    expect(harness.endpoint.sessionOpen).toBe(false);
    expect(harness.framesOf('RESPONSE')).toHaveLength(0);
    expect(harness.providers.probe.operationCalls.get('database.inspect')).toBeUndefined();
  });
});

describe('connector endpoint request dispatch', () => {
  it('MUST forward an authorized request and answer with RESPONSE', async () => {
    const harness = connected();
    request(harness, 'r1', 'database', 'inspect');
    await flush();

    expect(harness.framesOf('RESPONSE')[0]?.payload).toMatchObject({ requestId: 'r1' });
    expect(harness.providers.probe.operationCalls.get('database.inspect')).toBe(1);
    expect(harness.endpoint.inflightRequests).toBe(0);
  });

  it('MUST translate a provider failure into an ERROR frame carrying the request id', async () => {
    const harness = connected();
    request(harness, 'r1', 'settings', 'export');
    await flush();

    expect(harness.framesOf('ERROR')[0]?.payload).toEqual({
      requestId: 'r1',
      error: { code: 'export_unsupported', retryable: false }
    });
  });

  it('MUST silently drop a request the capability does not cover', async () => {
    const harness = connected({ capability: 'none' });
    request(harness, 'r1', 'database', 'inspect');
    await flush();

    // 断言的是计数器而不是沉默：静默丢弃本来就没有响应，只看帧数的测试恒绿。
    expect(harness.v2Frames().filter(frame => frame.type !== 'HANDSHAKE')).toHaveLength(0);
    expect(harness.providers.probe.operationCalls.size).toBe(0);
    expect(harness.endpoint.inflightRequests).toBe(0);
  });

  it('MUST reject a mutation with provider_unsupported when the policy omits it', async () => {
    const harness = connected({ mutationPolicy: 'omit' });
    request(harness, 'r1', 'database', 'create-branch');
    await flush();

    expect(harness.framesOf('ERROR')[0]?.payload).toEqual({
      requestId: 'r1',
      error: { code: 'provider_unsupported', retryable: false }
    });
    expect(harness.providers.probe.operationCalls.get('database.create-branch')).toBeUndefined();
  });

  it('MUST refuse a request beyond the inflight budget without touching the provider', async () => {
    const harness = connected();
    for (let index = 0; index < 32; index += 1) request(harness, `r${index}`, 'database', 'query');
    request(harness, 'overflow', 'database', 'query');

    expect(harness.framesOf('ERROR')[0]?.payload).toEqual({
      requestId: 'overflow',
      error: { code: 'request_limit_exceeded', retryable: true }
    });
    expect(harness.providers.probe.operationCalls.get('database.query')).toBe(32);
    await flush();
  });

  it('MUST report request_timeout once and drop the late result', async () => {
    const providers = createFakeProviders();
    const pending = new Promise<never>(() => undefined);
    const harness = connected({
      providers: {
        ...providers,
        provider: domain => ({ descriptor: providers.provider(domain).descriptor, invoke: () => pending })
      }
    });
    request(harness, 'r1', 'database', 'inspect');
    harness.clock.advance(DEVTOOLS_REQUEST_TIMEOUT_MS);
    await flush();

    expect(harness.framesOf('ERROR')[0]?.payload).toEqual({
      requestId: 'r1',
      error: { code: 'request_timeout', retryable: false }
    });
    expect(harness.endpoint.inflightRequests).toBe(0);
    expect(harness.clock.pendingTimers()).toBe(0);
  });

  it('MUST settle the request when the provider throws instead of returning a mapped error', async () => {
    const providers = createFakeProviders();
    const harness = connected({
      providers: {
        ...providers,
        provider: domain => ({
          descriptor: providers.provider(domain).descriptor,
          invoke: (operation, params) =>
            operation === 'inspect'
              ? Promise.reject(new Error('provider blew up'))
              : providers.provider(domain).invoke(operation, params)
        })
      }
    });
    request(harness, 'r1', 'database', 'inspect');
    await flush();

    // 契约要求 provider 只用错误联合说话，但契约挡不住 bug：一次 reject 会顺着
    // `void #invoke(...)` 逃到全局，这条请求则永不结算 —— 面板只能白等满 15 秒的时限，
    // 而这段时间里名额一直被占着。归类只能是 operation_failed：平台细节已经无从得知。
    expect(harness.framesOf('ERROR')[0]?.payload).toEqual({
      requestId: 'r1',
      error: { code: 'operation_failed', retryable: false }
    });
    expect(harness.endpoint.inflightRequests).toBe(0);
    expect(harness.clock.pendingTimers()).toBe(0);
  });
});

describe('connector endpoint events', () => {
  it('MUST NOT create an event subscription at the none tier', () => {
    const harness = connected({ capability: 'none' });

    expect(harness.providers.probe.eventSubscriptions).toBe(0);
  });

  it('MUST NOT subscribe when the descriptor declares the database domain unavailable', () => {
    const harness = connected({ providers: createFakeProviders({ kinds: { database: 'unavailable' } }) });

    // 档位只是三层授权里的第一层。事件订阅只看档位就发出去，等于 descriptor 与
    // mutationPolicy 两层在这条路径上根本不存在 —— host 侧照样被触碰一次。
    expect(harness.providers.probe.operationCalls.get('database.events')).toBeUndefined();
    expect(harness.framesOf('ERROR')[0]?.payload).toEqual({
      requestId: null,
      error: { code: 'provider_unsupported', retryable: false }
    });
  });

  it('MUST report a failed subscription instead of dropping the rejection on the floor', async () => {
    const providers = createFakeProviders();
    const harness = connected({
      providers: {
        ...providers,
        provider: domain => ({
          descriptor: providers.provider(domain).descriptor,
          invoke: () => Promise.reject(new Error('subscription blew up'))
        })
      }
    });
    await flush();

    // 被 `void` 吃掉的订阅失败没有任何迹象：面板会一直等一条永远不会来的 EVENT。
    expect(harness.framesOf('ERROR')[0]?.payload).toEqual({
      requestId: null,
      error: { code: 'operation_failed', retryable: false }
    });
  });

  it.each(['readonly', 'full'] as const)('MUST create exactly one event subscription at %s', capability => {
    const harness = connected({ capability });

    expect(harness.providers.probe.eventSubscriptions).toBe(1);
  });
});

describe('connector endpoint transfers', () => {
  const PAYLOAD = new Uint8Array([1, 2, 3, 4]);

  function startTransfer(harness: Harness, totalBytes = PAYLOAD.byteLength): void {
    harness.panel('TRANSFER_START', { transferId: 't1', requestId: 'r1', totalBytes });
  }

  it('MUST commit the sink only after a legal COMPLETE', async () => {
    const harness = connected();
    startTransfer(harness);
    harness.panel('TRANSFER_CHUNK', {
      transferId: 't1',
      chunkIndex: 0,
      offset: 0,
      dataBase64: encodeCanonicalBase64(PAYLOAD)
    });
    await flush();

    // 字节已经真的落到 sink 里了，转正的仍然只有 COMPLETE 能给。
    expect(harness.providers.committedFiles()).toEqual([]);

    harness.panel('TRANSFER_COMPLETE', { transferId: 't1' });
    await flush();

    expect(harness.providers.committedFiles()).toEqual([['t1', 4]]);
    expect(harness.endpoint.inflightTransfers).toBe(0);
  });

  it('MUST reject a non-canonical chunk without writing anything', async () => {
    const harness = connected();
    startTransfer(harness);
    harness.panel('TRANSFER_CHUNK', { transferId: 't1', chunkIndex: 0, offset: 0, dataBase64: 'SGk' });
    await flush();

    expect(harness.framesOf('ERROR')[0]?.payload).toEqual({
      requestId: 'r1',
      error: { code: 'payload_encoding_invalid', retryable: false }
    });
    expect(harness.providers.probe.peakRetainedBytes).toBe(0);
  });

  it('MUST discard the sink and report transfer_timeout when the transfer goes idle', async () => {
    const harness = connected();
    startTransfer(harness);
    harness.clock.advance(DEVTOOLS_TRANSFER_IDLE_TIMEOUT_MS);

    expect(harness.framesOf('ERROR')[0]?.payload).toEqual({
      requestId: 'r1',
      error: { code: 'transfer_timeout', retryable: false }
    });
    expect(harness.providers.committedFiles()).toEqual([]);
    expect(await harness.providers.probe.temporaryArtifacts()).toEqual([]);
    expect(harness.endpoint.inflightTransfers).toBe(0);
  });

  it('MUST silently drop a transfer at the readonly tier, allocating neither slot nor sink', async () => {
    const harness = connected({ capability: 'readonly' });
    startTransfer(harness);

    // 上传是 files 的写操作；档位不足一律静默——回帧就等于确认「这里有个可写的 files provider」。
    expect(harness.framesOf('ERROR')).toHaveLength(0);
    expect(harness.endpoint.inflightTransfers).toBe(0);
    expect(await harness.providers.probe.temporaryArtifacts()).toEqual([]);
  });

  it('MUST refuse a transfer with provider_unsupported when the mutation policy omits writes', async () => {
    const harness = connected({ mutationPolicy: 'omit' });
    startTransfer(harness);

    // 档位够、但本地没开写开关：这是「已识别的请求」，必须结构化拒绝而不是沉默。
    expect(harness.framesOf('ERROR')[0]?.payload).toEqual({
      requestId: 'r1',
      error: { code: 'provider_unsupported', retryable: false }
    });
    expect(harness.endpoint.inflightTransfers).toBe(0);
    expect(await harness.providers.probe.temporaryArtifacts()).toEqual([]);
  });

  it('MUST reject a transfer whose declared size exceeds the negotiated limit', async () => {
    const harness = connected();
    startTransfer(harness, 60_000_000);

    expect(harness.framesOf('ERROR')[0]?.payload).toEqual({
      requestId: 'r1',
      error: { code: 'transfer_size_exceeded', retryable: false }
    });
    expect(harness.endpoint.inflightTransfers).toBe(0);
    expect(await harness.providers.probe.temporaryArtifacts()).toEqual([]);
  });

  it('MUST leave the transfer id reusable after the transfer table rejects the START', () => {
    const harness = connected();
    startTransfer(harness, 60_000_000);
    startTransfer(harness);

    // 被拒的 START 什么都没建立，那个 ID 也就没被用掉。给它记一块墓碑，等于让每一次被拒
    // 都永久吃掉一格传输预算 —— 攒满上限后 session 只剩终态的 session_budget_exhausted，
    // 于是「一次超限的上传」升级成了「整条连接作废」。
    expect(harness.framesOf('ERROR')).toHaveLength(1);
    expect(harness.endpoint.inflightTransfers).toBe(1);
  });
});

/**
 * 造一帧「外层合法、payload 不合法」的原始信封。
 *
 * @remarks
 * 不能用 `createDevToolsV2Message`：它只做类型约束、不做运行时校验，而越界数值在 TS 层
 * 根本写不出来。这里手工拼信封，正是为了让 payload guard 成为唯一挡住它的东西。
 */
function malformed(harness: Harness, type: DevToolsV2MessageType, payload: unknown, sessionId?: string): unknown {
  return {
    source: RXDB_DEVTOOLS_MESSAGE,
    protocol: DEVTOOLS_PROTOCOL_VERSION_V2,
    direction: 'panel-to-connector',
    type,
    sessionId: sessionId ?? harness.endpoint.sessionId,
    payload,
    timestamp: TIMESTAMP,
    sequence: 99
  };
}

describe('connector endpoint malformed payloads', () => {
  it('MUST answer invalid_message with a null request id when the payload fails the guard', () => {
    const harness = connected();
    // requestId 本身就在不可信的 payload 里，回显它等于把攻击者的输入当成关联键。
    harness.endpoint.receive(
      malformed(harness, 'TRANSFER_START', { transferId: 't1', requestId: 'r1', totalBytes: -1 })
    );

    expect(harness.framesOf('ERROR')).toHaveLength(1);
    expect(harness.framesOf('ERROR')[0]?.payload).toEqual({
      requestId: null,
      error: { code: 'invalid_message', retryable: false }
    });
    expect(harness.endpoint.inflightTransfers).toBe(0);
  });

  it('MUST leave malformed negotiation frames to the negotiation machine', () => {
    const harness = connected();
    // 协商三帧在这里再答一次就会出现两条错误帧——错误计数是协商机的判据，不能被抢答。
    harness.endpoint.receive(malformed(harness, 'HANDSHAKE_ACK', { protocolVersion: 2 }));
    harness.endpoint.receive(malformed(harness, 'PROTOCOL_HELLO', { supportedVersions: [] }, undefined));

    expect(harness.framesOf('ERROR')).toHaveLength(0);
  });

  it('MUST prefer session_invalid over invalid_message for a foreign session', () => {
    const harness = connected();
    harness.endpoint.receive(
      malformed(harness, 'TRANSFER_START', { transferId: 't1', requestId: 'r1', totalBytes: -1 }, FOREIGN_SESSION_ID)
    );

    expect(harness.framesOf('ERROR')[0]?.payload).toEqual({
      requestId: null,
      error: { code: 'session_invalid', retryable: false }
    });
  });

  it('MUST stay silent when the capability does not cover the malformed frame', () => {
    const harness = connected({ capability: 'none' });
    // 档位不足是静默的：结构化拒绝会向未授权的发送者确认自己在听。
    harness.endpoint.receive(
      malformed(harness, 'TRANSFER_CHUNK', { transferId: 't1', chunkIndex: -1, offset: 0, dataBase64: 'AA==' })
    );

    expect(harness.framesOf('ERROR')).toHaveLength(0);
  });

  it('MUST stay silent when no session exists yet', () => {
    const harness = createHarness();
    harness.endpoint.start();
    harness.endpoint.receive(
      malformed(harness, 'TRANSFER_START', { transferId: 't1', requestId: 'r1', totalBytes: 1.5 })
    );

    expect(harness.framesOf('ERROR')).toHaveLength(0);
  });
});
