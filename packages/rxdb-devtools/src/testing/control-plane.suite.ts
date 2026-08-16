/**
 * @fileoverview 控制面 conformance 套件：AC#1–14。协商与降级、会话身份、三层授权、ID 预算、两道时限。
 *
 * @remarks
 * 判据一律落在**可读计数器与具体错误码**上，不落在「没有回帧」。协议里有大量刻意的静默
 * （档位不足即静默丢弃），断言沉默在这些路径上恒真——一个把整条链路注释掉的实现同样能绿。
 *
 * 两处只能验一半、且必须说清楚的地方：
 *
 * 1. **AC#7 的 `downgraded` 标记不在 driver 契约里。** driver 只描述 transport 与探针，
 *    panel 的本地状态不经过 wire；为一个标记在传输层开洞，等于让每个下游 driver 都要伪造
 *    panel 内部状态。这里断言它 wire 可见的那一半（facade 是终态、不改版本、不出现第二条 ACK），
 *    标记本身由 `negotiation-panel` 的单测覆盖。
 * 2. **AC#11 / #12 的 request 那一半在这里不划算。** 32 在途上限要求 32 条请求同时未结算，
 *    而 fake provider 是即答的；4,096 条 tombstone 要 4,096 轮往返。两者都由 `session` 单测
 *    精确覆盖，这里验 transfer 那一半——传输天然长命，是可跨帧观测的那个预算。
 *
 * @module @aiao/rxdb-devtools/testing/control-plane.suite
 */

import { describe, expect, it } from 'vitest';

import { createMessage } from '../types.js';
import {
  DEVTOOLS_MAX_INFLIGHT_TRANSFERS,
  DEVTOOLS_MAX_TRANSFER_TOMBSTONES,
  DEVTOOLS_NEGOTIATION_WINDOW_MS,
  DEVTOOLS_PROTOCOL_VERSION_V2,
  DEVTOOLS_TRANSFER_IDLE_TIMEOUT_MS,
  DEVTOOLS_TRANSFER_TOTAL_TIMEOUT_MS
} from '../v2/constants.js';
import { RXDB_DEVTOOLS_MESSAGE } from '../types.js';
import { createScenario } from './driver.js';
import type { DevToolsConformanceDriver, DevToolsWireFrame } from './driver.js';
import { encodeFrame, readErrorCodes, readLegacyFramesOfType, readV2FramesOfType } from './frames.js';
import {
  DEVTOOLS_SUITE_BASE_TIMESTAMP,
  connected,
  connectorOutput,
  panelOutput,
  sessionIdOf
} from './suite-support.js';
import type { DevToolsSuitePanelClient } from './suite-support.js';
import { assertCanonicalJsonFrame, runDevToolsWireHygieneSuite } from './wire-hygiene.suite.js';

/** 套件自造帧的时间戳基准；固定值让失败输出可读。 */
const BASE_TIMESTAMP = DEVTOOLS_SUITE_BASE_TIMESTAMP;

/** 规范 UUID v4，用于识破「随便一个字符串就当 session」的实现。 */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

/** 不属于任何一端的 session 身份，用于伪造。 */
const FOREIGN_SESSION_ID = '00000000-0000-4000-8000-000000000000';

/** connector 侧发出的那条 eager v1 握手；协商的证据触发就靠它。 */
function legacyHandshakeFrame(): DevToolsWireFrame {
  return JSON.stringify(createMessage('HANDSHAKE', 'page-to-devtools', null, 1));
}

/** 外壳合法、payload 不合法的 `PROTOCOL_HELLO`；`createDevToolsV2Message` 造不出来，只能手写。 */
function malformedHelloFrame(supportedVersions: unknown): DevToolsWireFrame {
  return JSON.stringify({
    source: RXDB_DEVTOOLS_MESSAGE,
    protocol: DEVTOOLS_PROTOCOL_VERSION_V2,
    direction: 'panel-to-connector',
    type: 'PROTOCOL_HELLO',
    sessionId: null,
    payload: { supportedVersions },
    timestamp: BASE_TIMESTAMP,
    sequence: 1
  });
}

/** 一次完整的合法上传：START → CHUNK → COMPLETE。 */
async function uploadOneByte(panel: DevToolsSuitePanelClient, transferId: string): Promise<void> {
  await panel.send('TRANSFER_START', { transferId, requestId: `req-${transferId}`, totalBytes: 1 });
  await panel.send('TRANSFER_CHUNK', { transferId, chunkIndex: 0, offset: 0, dataBase64: 'AA==' });
  await panel.send('TRANSFER_COMPLETE', { transferId });
}

/**
 * 跑控制面 conformance 套件。
 *
 * @param driver - 待验收的 driver。
 */
export function runDevToolsControlPlaneSuite(driver: DevToolsConformanceDriver): void {
  runDevToolsWireHygieneSuite(driver);

  describe(`control plane: negotiation [${driver.name}]`, () => {
    it('AC#1 MUST settle on v2 and mint exactly one session even when the relay forges a legacy ACK', async () => {
      const run = await driver.open(createScenario({ relayAcksLegacyHandshake: true, hopDelayMs: 1 }));
      await run.advanceTime(100);

      // connector 对每条 HELLO 都重新要约（panel 的第一条可能丢在半路），所以要约帧不止一条；
      // 「恰好一个 session」说的是身份唯一，不是帧数唯一——按帧数断言会把正确的补发判成错。
      const handshakes = readV2FramesOfType(connectorOutput(run), 'HANDSHAKE');
      expect(handshakes.length).toBeGreaterThan(0);
      expect(new Set(handshakes.map(message => message.payload.sessionId)).size).toBe(1);
      expect(handshakes[0]?.payload.sessionId).toMatch(UUID_V4);

      // ACK 由 panel 独占产出；relay 代发的那条挑不出格式毛病，只能靠所有权规则识破。
      expect(readV2FramesOfType(panelOutput(run), 'HANDSHAKE_ACK')).toHaveLength(1);
      expect(readLegacyFramesOfType(panelOutput(run), 'HANDSHAKE_ACK')).toHaveLength(0);
      expect(readLegacyFramesOfType(run.segment('background').sent, 'HANDSHAKE_ACK').length).toBeGreaterThan(0);

      await run.dispose();
    });

    it('AC#2 MUST NOT downgrade merely because the panel started before the connector', async () => {
      // panel 先起、relay 5 秒后才就绪（等 chrome.permissions.request），第一条 HELLO 因此丢失。
      const run = await driver.open(createScenario({ relayReadyDelayMs: 5_000, hopDelayMs: 3 }));
      await run.advanceTime(5_000);
      await run.advanceTime(100);

      // 补发是承重的：暂存 legacy 握手的同一 tick 内必须再发一次 HELLO，否则协商永远起不来。
      expect(readV2FramesOfType(panelOutput(run), 'PROTOCOL_HELLO').length).toBeGreaterThanOrEqual(2);
      expect(readV2FramesOfType(panelOutput(run), 'HANDSHAKE_ACK')).toHaveLength(1);
      expect(readLegacyFramesOfType(panelOutput(run), 'HANDSHAKE_ACK')).toHaveLength(0);

      // 窗口已在选定 v2 时作废，继续推进也不会迟到地退回 v1。
      await run.advanceTime(DEVTOOLS_NEGOTIATION_WINDOW_MS * 2);
      expect(readLegacyFramesOfType(panelOutput(run), 'HANDSHAKE_ACK')).toHaveLength(0);

      await run.dispose();
    });

    it('AC#3 MUST measure the window from the first stash, not from panel init', async () => {
      const run = await driver.open(createScenario({ connectorProtocol: 'v1', relayReadyDelayMs: 5_000 }));
      await run.advanceTime(5_000);

      // 距 panel init 已 5 秒，远超 1,000 ms 窗口；但暂存才刚发生，窗口这时才起算。
      expect(readLegacyFramesOfType(panelOutput(run), 'HANDSHAKE_ACK')).toHaveLength(0);

      await run.advanceTime(DEVTOOLS_NEGOTIATION_WINDOW_MS);
      expect(readLegacyFramesOfType(panelOutput(run), 'HANDSHAKE_ACK')).toHaveLength(1);
      expect(readV2FramesOfType(panelOutput(run), 'HANDSHAKE_ACK')).toHaveLength(0);

      await run.dispose();
    });

    it('AC#4 MUST start the window once and never extend it under a handshake flood', async () => {
      const run = await driver.open(createScenario({ connectorProtocol: 'v1' }));
      await run.settle();

      for (const at of [400, 400]) {
        await run.advanceTime(at);
        await run.segment('connector').inject(legacyHandshakeFrame(), 'connector-to-panel');
        await run.settle();
      }
      // t = 800：若每条握手都续期，这里已经被推到 1,800，ACK 不会出现。
      expect(readLegacyFramesOfType(panelOutput(run), 'HANDSHAKE_ACK')).toHaveLength(0);

      await run.advanceTime(200);
      expect(readLegacyFramesOfType(panelOutput(run), 'HANDSHAKE_ACK')).toHaveLength(1);

      await run.dispose();
    });

    it('AC#5 MUST enter the v1 facade with no wait when the panel itself only speaks v1', async () => {
      const run = await driver.open(createScenario({ panelProtocol: 'v1', relayAcksLegacyHandshake: true }));
      await run.settle();

      expect(readLegacyFramesOfType(panelOutput(run), 'HANDSHAKE_ACK')).toHaveLength(1);
      expect(readV2FramesOfType(panelOutput(run), 'PROTOCOL_HELLO')).toHaveLength(0);
      // 没有 HELLO 就没有要约：connector 停在 announced，不会铸出 session。
      expect(readV2FramesOfType(connectorOutput(run), 'HANDSHAKE')).toHaveLength(0);

      await run.dispose();
    });

    it('AC#6 MUST separate a legal-but-disjoint version set from a malformed one', async () => {
      const run = await driver.open(createScenario({ panelProtocol: 'v1' }));
      await run.settle();

      await run.segment('panel').inject(
        encodeFrame('PROTOCOL_HELLO', { supportedVersions: [7] }, {
          sessionId: null,
          sequence: 1,
          timestamp: BASE_TIMESTAMP
        }),
        'panel-to-connector'
      );
      await run.settle();
      expect(readErrorCodes(connectorOutput(run))).toEqual(['protocol_unsupported']);

      await run.segment('panel').inject(malformedHelloFrame([0]), 'panel-to-connector');
      await run.settle();
      expect(readErrorCodes(connectorOutput(run))).toEqual(['protocol_unsupported', 'invalid_message']);

      // 两条都不该建立 session。
      expect(readV2FramesOfType(connectorOutput(run), 'HANDSHAKE')).toHaveLength(0);

      await run.dispose();
    });

    it('AC#7 MUST treat the v1 facade as terminal when a legal v2 HANDSHAKE arrives late', async () => {
      const run = await driver.open(createScenario({ connectorProtocol: 'v1' }));
      await run.settle();
      await run.advanceTime(DEVTOOLS_NEGOTIATION_WINDOW_MS);
      expect(readLegacyFramesOfType(panelOutput(run), 'HANDSHAKE_ACK')).toHaveLength(1);

      await run.segment('connector').inject(
        encodeFrame(
          'HANDSHAKE',
          {
            protocolVersion: DEVTOOLS_PROTOCOL_VERSION_V2,
            sessionId: FOREIGN_SESSION_ID,
            capabilities: { capability: 'full', descriptors: [] }
          },
          { sessionId: FOREIGN_SESSION_ID, sequence: 9, timestamp: BASE_TIMESTAMP }
        ),
        'connector-to-panel'
      );
      await run.settle();

      // facade 是终态：不升版本、不开第二个状态机、不补发 v2 ACK。
      expect(readV2FramesOfType(panelOutput(run), 'HANDSHAKE_ACK')).toHaveLength(0);
      expect(readLegacyFramesOfType(panelOutput(run), 'HANDSHAKE_ACK')).toHaveLength(1);

      await run.dispose();
    });

    it('AC#8 MUST reject forged, duplicate and late negotiation frames once v2 is established', async () => {
      const run = await driver.open(createScenario());
      const panel = await connected(run);
      const offersBefore = readV2FramesOfType(connectorOutput(run), 'HANDSHAKE').length;

      // 伪造 ACK（已 v2，不再处于 offered）、重复 HELLO（迟到帧）、他人 session 的 ACK。
      await panel.send('HANDSHAKE_ACK', { protocolVersion: DEVTOOLS_PROTOCOL_VERSION_V2, sessionId: panel.sessionId });
      await panel.send('PROTOCOL_HELLO', { supportedVersions: [2, 1] }, FOREIGN_SESSION_ID);
      await panel.send('HANDSHAKE_ACK', {
        protocolVersion: DEVTOOLS_PROTOCOL_VERSION_V2,
        sessionId: FOREIGN_SESSION_ID
      });

      // 协商已定局：迟到的 HELLO 不再换来新要约，session 身份也不变。
      expect(readV2FramesOfType(connectorOutput(run), 'HANDSHAKE')).toHaveLength(offersBefore);
      expect(sessionIdOf(run)).toBe(panel.sessionId);

      // 会话仍然健在——拒绝迟到帧不等于把连接一起拆掉。
      await panel.send('PING', null);
      expect(readV2FramesOfType(connectorOutput(run), 'PONG')).toHaveLength(1);

      await run.dispose();
    });
  });

  describe(`control plane: authorization [${driver.name}]`, () => {
    it('AC#9 MUST produce zero provider work at the none tier, before and after the handshake', async () => {
      const run = await driver.open(createScenario({ capability: 'none' }));
      const panel = await connected(run);

      await panel.send('REQUEST', { requestId: 'r1', domain: 'database', operation: 'inspect', params: {} });
      await panel.send('REQUEST', { requestId: 'r2', domain: 'database', operation: 'query', params: {} });

      expect(run.provider.operationCalls.size).toBe(0);
      expect(run.provider.eventSubscriptions).toBe(0);
      expect(run.provider.bufferedEvents).toBe(0);
      expect(run.provider.hostReads).toBe(0);
      expect(readV2FramesOfType(connectorOutput(run), 'RESPONSE')).toHaveLength(0);
      expect(readV2FramesOfType(connectorOutput(run), 'EVENT')).toHaveLength(0);
      // 静默丢弃：连错误帧都不该有，否则 none 档就成了一个可探测的目录。
      expect(readErrorCodes(connectorOutput(run))).toEqual([]);

      await run.dispose();
    });

    it.each([
      { capability: 'none', mutationPolicy: 'allow', reads: 0, writes: 0 },
      { capability: 'readonly', mutationPolicy: 'allow', reads: 1, writes: 0 },
      { capability: 'full', mutationPolicy: 'omit', reads: 1, writes: 0 },
      { capability: 'full', mutationPolicy: 'allow', reads: 1, writes: 1 }
    ] as const)(
      'AC#10 MUST hold the matrix at $capability / $mutationPolicy',
      async ({ capability, mutationPolicy, reads, writes }) => {
        const run = await driver.open(createScenario({ capability, mutationPolicy }));
        const panel = await connected(run);

        await panel.send('REQUEST', { requestId: 'r1', domain: 'database', operation: 'query', params: {} });
        await panel.send('REQUEST', { requestId: 'r2', domain: 'database', operation: 'create-branch', params: { name: 'wip' } });

        expect(run.provider.operationCalls.get('database.query') ?? 0).toBe(reads);
        expect(run.provider.operationCalls.get('database.create-branch') ?? 0).toBe(writes);

        await run.dispose();
      }
    );

    it('AC#10 MUST NOT let a wire-claimed capability widen the local trusted config', async () => {
      const run = await driver.open(createScenario({ capability: 'readonly', mutationPolicy: 'omit' }));
      const panel = await connected(run);

      // connector 宣告的档位来自本地可信配置，不是别人告诉它的。
      const announced = readV2FramesOfType(connectorOutput(run), 'HANDSHAKE')[0];
      expect(announced?.payload.capabilities.capability).toBe('readonly');

      // 往链路里塞一条自称 full 的 HANDSHAKE（它只可能是下行帧），再立刻发写操作。
      await run.segment('connector').inject(
        encodeFrame(
          'HANDSHAKE',
          {
            protocolVersion: DEVTOOLS_PROTOCOL_VERSION_V2,
            sessionId: panel.sessionId,
            capabilities: { capability: 'full', descriptors: [] }
          },
          { sessionId: panel.sessionId, sequence: 99, timestamp: BASE_TIMESTAMP }
        ),
        'connector-to-panel'
      );
      await run.settle();
      await panel.send('REQUEST', { requestId: 'w1', domain: 'files', operation: 'delete', params: { path: '/db.sqlite' } });

      expect(run.provider.operationCalls.get('files.delete')).toBeUndefined();
      expect(readErrorCodes(connectorOutput(run))).toEqual([]);

      await run.dispose();
    });
  });

  describe(`control plane: budgets and deadlines [${driver.name}]`, () => {
    it('AC#11 MUST refuse the transfer beyond the inflight cap without allocating anything', async () => {
      const run = await driver.open(createScenario({ capability: 'full', mutationPolicy: 'allow' }));
      const panel = await connected(run);

      for (let index = 0; index < DEVTOOLS_MAX_INFLIGHT_TRANSFERS; index += 1) {
        await panel.send('TRANSFER_START', { transferId: `t${index}`, requestId: `req${index}`, totalBytes: 16 });
      }
      expect(readErrorCodes(connectorOutput(run))).toEqual([]);

      await panel.send('TRANSFER_START', { transferId: 'overflow', requestId: 'reqX', totalBytes: 16 });

      expect(readErrorCodes(connectorOutput(run))).toEqual(['transfer_limit_exceeded']);
      // 被拒的 START 不得留下 sink：临时产物只应有前两条在途传输的。
      expect(await run.provider.temporaryArtifacts()).toHaveLength(DEVTOOLS_MAX_INFLIGHT_TRANSFERS);

      await run.dispose();
    });

    it('AC#12 MUST answer session_budget_exhausted rather than evict a tombstone', async () => {
      const run = await driver.open(createScenario({ capability: 'full', mutationPolicy: 'allow' }));
      const panel = await connected(run);

      for (let index = 0; index < DEVTOOLS_MAX_TRANSFER_TOMBSTONES; index += 1) {
        await uploadOneByte(panel, `t${index}`);
      }
      expect(readErrorCodes(connectorOutput(run))).toEqual([]);
      expect(await run.provider.committedTransfers()).toHaveLength(DEVTOOLS_MAX_TRANSFER_TOMBSTONES);

      // 全新 ID：预算已满，且**不允许**靠淘汰最老的墓碑腾位置。
      await panel.send('TRANSFER_START', { transferId: 'fresh', requestId: 'reqF', totalBytes: 1 });
      // 复用最老的 ID：它必须仍被记得，否则「ID 永不复用」就被淘汰悄悄破坏了。
      await panel.send('TRANSFER_START', { transferId: 't0', requestId: 'req0', totalBytes: 1 });

      expect(readErrorCodes(connectorOutput(run))).toEqual(['session_budget_exhausted', 'transfer_duplicate']);
      expect(await run.provider.committedTransfers()).toHaveLength(DEVTOOLS_MAX_TRANSFER_TOMBSTONES);

      await run.dispose();
    });

    it('AC#13 MUST release timers and resources on disconnect and ignore late frames', async () => {
      const run = await driver.open(createScenario({ capability: 'full', mutationPolicy: 'allow' }));
      const panel = await connected(run);

      await panel.send('TRANSFER_START', { transferId: 't1', requestId: 'req1', totalBytes: 32 });
      await panel.send('TRANSFER_CHUNK', { transferId: 't1', chunkIndex: 0, offset: 0, dataBase64: 'AAAA' });
      await panel.send('DISCONNECT', null);

      // 断开即丢弃：半写的传输不得留下临时产物，也不得偷偷提交。
      expect(await run.provider.temporaryArtifacts()).toEqual([]);
      expect(await run.provider.committedTransfers()).toEqual([]);

      const before = connectorOutput(run).length;
      await panel.send('TRANSFER_CHUNK', { transferId: 't1', chunkIndex: 1, offset: 3, dataBase64: 'AAAA' });
      await panel.send('TRANSFER_COMPLETE', { transferId: 't1' });
      // 计时器已随 session 一并释放，推过 idle 与总时限都不该再冒出 transfer_timeout。
      await run.advanceTime(DEVTOOLS_TRANSFER_TOTAL_TIMEOUT_MS);

      expect(connectorOutput(run)).toHaveLength(before);
      expect(await run.provider.committedTransfers()).toEqual([]);

      await run.dispose();
    });

    it('AC#14 MUST NOT let a rejected frame refresh the idle deadline', async () => {
      const run = await driver.open(createScenario({ capability: 'full', mutationPolicy: 'allow' }));
      const panel = await connected(run);

      await panel.send('TRANSFER_START', { transferId: 't1', requestId: 'req1', totalBytes: 64 });
      await run.advanceTime(DEVTOOLS_TRANSFER_IDLE_TIMEOUT_MS - 1);

      // 非规范 base64：先被拒，**再**谈刷新——否则非法帧就成了免费的续命手段。
      await panel.send('TRANSFER_CHUNK', { transferId: 't1', chunkIndex: 0, offset: 0, dataBase64: 'SGk' });
      expect(readErrorCodes(connectorOutput(run))).toEqual(['payload_encoding_invalid']);

      await run.advanceTime(1);
      expect(readErrorCodes(connectorOutput(run))).toEqual(['payload_encoding_invalid', 'transfer_timeout']);
      expect(await run.provider.temporaryArtifacts()).toEqual([]);
      expect(await run.provider.committedTransfers()).toEqual([]);

      await run.dispose();
    });

    it('AC#14 MUST expire on the total deadline even while chunks keep refreshing idle', async () => {
      const run = await driver.open(createScenario({ capability: 'full', mutationPolicy: 'allow' }));
      const panel = await connected(run);

      const step = DEVTOOLS_TRANSFER_IDLE_TIMEOUT_MS - 1_000;
      const rounds = Math.ceil(DEVTOOLS_TRANSFER_TOTAL_TIMEOUT_MS / step) + 1;
      await panel.send('TRANSFER_START', { transferId: 't1', requestId: 'req1', totalBytes: rounds + 8 });

      for (let index = 0; index < rounds; index += 1) {
        await run.advanceTime(step);
        if (readErrorCodes(connectorOutput(run)).length > 0) break;
        await panel.send('TRANSFER_CHUNK', { transferId: 't1', chunkIndex: index, offset: index, dataBase64: 'AA==' });
      }

      expect(readErrorCodes(connectorOutput(run))).toEqual(['transfer_timeout']);
      expect(await run.provider.temporaryArtifacts()).toEqual([]);
      expect(await run.provider.committedTransfers()).toEqual([]);

      await run.dispose();
    });

    it('MUST keep every frame it produced canonical across the whole control-plane run', async () => {
      const run = await driver.open(createScenario({ capability: 'full', mutationPolicy: 'allow' }));
      const panel = await connected(run);
      await uploadOneByte(panel, 't1');
      await panel.send('PING', null);

      for (const frame of [...connectorOutput(run), ...panelOutput(run)]) {
        expect(() => assertCanonicalJsonFrame(frame)).not.toThrow();
      }

      await run.dispose();
    });
  });
}
