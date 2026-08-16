/**
 * @fileoverview provider 数据面 conformance 套件：AC#15–24。descriptor 跨 runtime 一致、
 * 三层授权矩阵、数值与 base64 guard、传输状态机终态、限额协商、错误映射与 `export_unsupported`。
 *
 * @remarks
 * 与控制面同一条纪律：判据落在**可读计数器、终态凭据与具体错误码**上。数据面尤其容易写出假绿——
 * 「没有提交」和「没有响应」在 wire 上长得一样，而只有前者能区分「CHUNK 阶段就写盘、终态再回滚」
 * 与「只有合法 COMPLETE 才提交」。所以每条传输用例都要问 `committedTransfers()` 与
 * `temporaryArtifacts()`，不只看错误帧。
 *
 * 三处只能验一半、且必须说清楚的地方：
 *
 * 1. **AC#21 / #22（snapshot）在 wire 上不可达。** snapshot 不是协议操作——它没有对应的
 *    `DevToolsV2MessageType`，是 provider 实现内部的物化与分页机制。给它开一条 wire 只为了
 *    测试，等于把一个下游实现细节冻进共享协议。这两条由 `provider/snapshot` 的单测覆盖，
 *    最终由 US-904 阶段 D 与 US-905 在真实独占锁上关闭。
 * 2. **AC#19 的「不得整文件驻留内存」只能用代理判据。** 峰值内存不可观测；这里断言
 *    `peakRetainedBytes` 等于**最大单块**而不是总字节数——任何整文件拼接的实现会让两者相等。
 *    真正的证明在 Rust / 主进程那一半，属 904d / 905。
 * 3. **AC#23 的穷尽性无法由本套件证明。** `operation_failed` 兜底会吸收一切漏网情况。这里做的是
 *    「每条已登记来路都复算得到同一个码」加一条 wire 上的脱敏断言；穷尽性靠 fixture 表的
 *    meta-test 逼下游**加行**而不是加分支。
 *
 * @module @aiao/rxdb-devtools/testing/data-plane.suite
 */

import { describe, expect, it } from 'vitest';

import type {
  DevToolsProviderDescriptor,
  DevToolsProviderDomain,
  DevToolsProviderRuntime
} from '../provider/descriptor.js';
import {
  DEVTOOLS_PROVIDER_RUNTIMES,
  isDevToolsProviderDescriptor,
  isDevToolsProviderDescriptorSet
} from '../provider/descriptor.js';
import { isMaxTransferBytes, resolveNegotiatedTransferLimit } from '../provider/limits.js';
import { RXDB_DEVTOOLS_MESSAGE } from '../types.js';
import { DEVTOOLS_MAX_TRANSFER_BYTES_LIMIT, DEVTOOLS_PROTOCOL_VERSION_V2 } from '../v2/constants.js';
import { mapPlatformError } from '../v2/error-mapping.js';
import { isRedactedErrorMessage } from '../v2/errors.js';
import type { DevToolsV2MessageType } from '../v2/wire.js';
import type { DevToolsConformanceDriver, DevToolsConformanceSession, DevToolsWireFrame } from './driver.js';
import { createScenario } from './driver.js';
import type { DevToolsErrorFixture } from './error-fixtures.js';
import { DEVTOOLS_ERROR_MAPPING_FIXTURES } from './error-fixtures.js';
import type { DevToolsFakeProviderKinds } from './fake-providers.js';
import { createFakeProviders } from './fake-providers.js';
import type { DevToolsAnyErrorCode } from './frames.js';
import { readErrorCodes, readV2FramesOfType } from './frames.js';
import { DEVTOOLS_SUITE_BASE_TIMESTAMP, connected, connectorOutput } from './suite-support.js';
import { assertCanonicalJsonFrame, runDevToolsWireHygieneSuite } from './wire-hygiene.suite.js';

/** 3 字节的规范 base64；内容无关紧要，长度才是判据。 */
const THREE_BYTES = 'AAAA';

/** `"Hello"` 的规范 base64，用于解码字节数的往返断言。 */
const FIVE_BYTES = 'SGVsbG8=';

/** 只含 `kind: 'platform'` 的 fixture；它们能被 `mapPlatformError` 直接复算。 */
const PLATFORM_FIXTURES = DEVTOOLS_ERROR_MAPPING_FIXTURES.filter(
  (fixture): fixture is Extract<DevToolsErrorFixture, { readonly kind: 'platform' }> => fixture.kind === 'platform'
);

/**
 * 从 connector 宣告的 HANDSHAKE 里读出 descriptor 集合。
 *
 * @param run - 已完成协商的会话。
 * @returns 宣告的 descriptor，顺序即 wire 上的顺序。
 * @throws Error 当协商尚未产出 HANDSHAKE 时——此时后续断言全部无意义。
 */
function announcedDescriptors(run: DevToolsConformanceSession): readonly DevToolsProviderDescriptor[] {
  const handshake = readV2FramesOfType(connectorOutput(run), 'HANDSHAKE')[0];
  if (handshake === undefined) throw new Error('data plane suite: connector never announced a v2 HANDSHAKE');
  return handshake.payload.capabilities.descriptors;
}

/**
 * 取某个领域的 descriptor。
 *
 * @param descriptors - descriptor 集合。
 * @param domain - 领域。
 * @returns 该领域的 descriptor。
 * @throws Error 当该领域缺席时。
 */
function descriptorOf(
  descriptors: readonly DevToolsProviderDescriptor[],
  domain: DevToolsProviderDomain
): DevToolsProviderDescriptor {
  const found = descriptors.find(entry => entry.domain === domain);
  if (found === undefined) throw new Error(`data plane suite: no ${domain} descriptor was announced`);
  return found;
}

/** 抹掉 `runtime` 后的规范文本；AC#15 比较的正是「除回显字段外完全相同」。 */
function withoutRuntime(descriptors: readonly DevToolsProviderDescriptor[]): string {
  return JSON.stringify(descriptors.map(descriptor => ({ ...descriptor, runtime: 'browser' })));
}

/**
 * 手写一帧原文。
 *
 * @remarks
 * `createDevToolsV2Message` 只做类型约束、不做运行时校验，越界数值在 TS 层就写不出来，
 * 所以 AC#17 的负向输入只能这样构造。
 *
 * @param type - 消息类型。
 * @param payload - 未经校验的载荷。
 * @param sessionId - 归属的 session。
 * @param overrides - 需要覆盖的信封字段，用于制造外层非法帧。
 * @returns JSON 原文。
 */
function rawFrame(
  type: DevToolsV2MessageType,
  payload: unknown,
  sessionId: string,
  overrides: Readonly<Record<string, unknown>> = {}
): DevToolsWireFrame {
  return JSON.stringify({
    source: RXDB_DEVTOOLS_MESSAGE,
    protocol: DEVTOOLS_PROTOCOL_VERSION_V2,
    direction: 'panel-to-connector',
    type,
    sessionId,
    payload,
    timestamp: DEVTOOLS_SUITE_BASE_TIMESTAMP,
    sequence: 1,
    ...overrides
  });
}

/** 一次 runtime 观测：宣告的 descriptor 与两条代表性操作的结果。 */
interface RuntimeObservation {
  readonly descriptors: readonly DevToolsProviderDescriptor[];
  readonly codes: readonly DevToolsAnyErrorCode[];
}

/**
 * 在某个 runtime 上跑一遍 descriptor 与行为观测。
 *
 * @param driver - 待验收的 driver。
 * @param runtime - 本次回显的 runtime。
 * @param kinds - 各领域伪装的语义 kind。
 * @returns 该 runtime 下的观测结果。
 */
async function observeRuntime(
  driver: DevToolsConformanceDriver,
  runtime: DevToolsProviderRuntime,
  kinds: DevToolsFakeProviderKinds
): Promise<RuntimeObservation> {
  const { descriptors } = createFakeProviders({ runtime, kinds });
  const run = await driver.open(createScenario({ runtime, descriptors, capability: 'full', mutationPolicy: 'allow' }));
  const panel = await connected(run);
  const announced = announcedDescriptors(run);

  await panel.send('REQUEST', {
    requestId: 'd1',
    domain: 'files',
    operation: 'download',
    params: { path: '/missing' }
  });
  await panel.send('REQUEST', { requestId: 'e1', domain: 'settings', operation: 'export', params: {} });
  const codes = readErrorCodes(connectorOutput(run));

  await run.dispose();
  return { descriptors: announced, codes };
}

/**
 * 跑 provider 数据面 conformance 套件。
 *
 * @param driver - 待验收的 driver。
 */
export function runDevToolsDataPlaneSuite(driver: DevToolsConformanceDriver): void {
  runDevToolsWireHygieneSuite(driver);

  describe(`data plane: descriptors [${driver.name}]`, () => {
    it.each([
      { label: 'default kinds', kinds: {} },
      { label: 'native kinds', kinds: { files: 'native-files', settings: 'sqlite' } }
    ] as const)('AC#15 MUST keep $label identical across every runtime but the echoed field', async ({ kinds }) => {
      const observations = await Promise.all(
        DEVTOOLS_PROVIDER_RUNTIMES.map(runtime => observeRuntime(driver, runtime, kinds))
      );

      const [reference] = observations;
      if (reference === undefined) throw new Error('data plane suite: no runtime was observed');

      for (const [index, observation] of observations.entries()) {
        const runtime = DEVTOOLS_PROVIDER_RUNTIMES[index];
        // runtime 只回显：抹掉它以后两份声明必须逐字节相同，行为也必须给出同一串错误码。
        expect(observation.descriptors.every(descriptor => descriptor.runtime === runtime)).toBe(true);
        expect(withoutRuntime(observation.descriptors)).toBe(withoutRuntime(reference.descriptors));
        expect(observation.codes).toEqual(['resource_not_found', 'export_unsupported']);
      }
    });

    it('AC#15 MUST reject unknown, duplicate and structurally invalid descriptor sets at the guard', () => {
      const { descriptors } = createFakeProviders();
      expect(isDevToolsProviderDescriptorSet(descriptors)).toBe(true);

      const files = descriptorOf(descriptors, 'files');
      const database = descriptorOf(descriptors, 'database');

      // 重复领域：两份同域声明会让「用哪一份判权限」变成顺序依赖。
      expect(isDevToolsProviderDescriptorSet([...descriptors, files])).toBe(false);
      expect(isDevToolsProviderDescriptorSet([{ ...files, domain: 'storage' }])).toBe(false);
      expect(isDevToolsProviderDescriptor({ ...files, extra: 1 })).toBe(false);
      expect(isDevToolsProviderDescriptor({ ...files, limits: undefined })).toBe(false);
      expect(isDevToolsProviderDescriptor({ ...database, kind: 'opfs' })).toBe(false);
      expect(isDevToolsProviderDescriptor({ ...files, operations: ['delete', 'list'] })).toBe(false);
      expect(isDevToolsProviderDescriptor({ ...files, operations: ['list', 'list'] })).toBe(false);
      // `unavailable` 必须无操作且带 reason；其余 kind 必须没有 reason。
      expect(isDevToolsProviderDescriptor({ ...files, kind: 'unavailable' })).toBe(false);
      expect(isDevToolsProviderDescriptor({ ...files, reason: 'not_configured' })).toBe(false);
    });
  });

  describe(`data plane: authorization matrix [${driver.name}]`, () => {
    it.each([
      { capability: 'none', mutationPolicy: 'omit', reads: 0, writes: 0, codes: [] },
      { capability: 'none', mutationPolicy: 'allow', reads: 0, writes: 0, codes: [] },
      { capability: 'readonly', mutationPolicy: 'omit', reads: 1, writes: 0, codes: [] },
      { capability: 'readonly', mutationPolicy: 'allow', reads: 1, writes: 0, codes: [] },
      { capability: 'full', mutationPolicy: 'omit', reads: 1, writes: 0, codes: ['provider_unsupported'] },
      { capability: 'full', mutationPolicy: 'allow', reads: 1, writes: 1, codes: [] }
    ] as const)(
      'AC#16 MUST hold capability × policy at $capability / $mutationPolicy',
      async ({ capability, mutationPolicy, reads, writes, codes }) => {
        const run = await driver.open(createScenario({ capability, mutationPolicy }));
        const panel = await connected(run);

        await panel.send('REQUEST', { requestId: 'r1', domain: 'files', operation: 'list', params: {} });
        await panel.send('REQUEST', {
          requestId: 'w1',
          domain: 'files',
          operation: 'delete',
          params: { path: '/db.sqlite' }
        });

        expect(run.provider.operationCalls.get('files.list') ?? 0).toBe(reads);
        expect(run.provider.operationCalls.get('files.delete') ?? 0).toBe(writes);
        expect(run.provider.hostReads).toBe(reads + writes);
        // 档位不足静默、descriptor/policy 不足结构化——两种拒绝不能混成一件事。
        expect(readErrorCodes(connectorOutput(run))).toEqual(codes);

        await run.dispose();
      }
    );

    it('AC#16 MUST answer provider_unsupported for an unavailable domain without touching the host', async () => {
      const { descriptors } = createFakeProviders({ kinds: { files: 'unavailable' } });
      const run = await driver.open(createScenario({ capability: 'full', mutationPolicy: 'allow', descriptors }));
      const panel = await connected(run);

      await panel.send('REQUEST', { requestId: 'r1', domain: 'files', operation: 'list', params: {} });

      expect(readErrorCodes(connectorOutput(run))).toEqual(['provider_unsupported']);
      expect(run.provider.operationCalls.get('files.list')).toBeUndefined();
      expect(run.provider.hostReads).toBe(0);

      await run.dispose();
    });
  });

  describe(`data plane: numeric and encoding guards [${driver.name}]`, () => {
    it.each([
      { label: 'null', value: null },
      { label: 'negative', value: -1 },
      { label: 'fractional', value: 1.5 },
      { label: 'beyond the safe-integer range', value: 2 ** 53 },
      { label: 'a numeric string', value: '16' }
    ])('AC#17 MUST reject totalBytes that is $label before allocating anything', async ({ value }) => {
      const run = await driver.open(createScenario({ capability: 'full', mutationPolicy: 'allow' }));
      const panel = await connected(run);

      await run
        .segment('panel')
        .inject(
          rawFrame('TRANSFER_START', { transferId: 't1', requestId: 'req1', totalBytes: value }, panel.sessionId),
          'panel-to-connector'
        );
      await run.settle();

      expect(readErrorCodes(connectorOutput(run))).toEqual(['invalid_message']);
      expect(await run.provider.temporaryArtifacts()).toEqual([]);
      expect(await run.provider.committedTransfers()).toEqual([]);

      await run.dispose();
    });

    it.each([
      { label: 'null', value: null },
      { label: 'negative', value: -1 },
      { label: 'fractional', value: 1.5 },
      { label: 'beyond the safe-integer range', value: 2 ** 53 },
      { label: 'a numeric string', value: '0' }
    ])('AC#17 MUST reject chunkIndex that is $label before touching the transfer table', async ({ value }) => {
      const run = await driver.open(createScenario({ capability: 'full', mutationPolicy: 'allow' }));
      const panel = await connected(run);
      await panel.send('TRANSFER_START', { transferId: 't1', requestId: 'req1', totalBytes: 8 });

      await run
        .segment('panel')
        .inject(
          rawFrame(
            'TRANSFER_CHUNK',
            { transferId: 't1', chunkIndex: value, offset: 0, dataBase64: THREE_BYTES },
            panel.sessionId
          ),
          'panel-to-connector'
        );
      await run.settle();

      expect(readErrorCodes(connectorOutput(run))).toEqual(['invalid_message']);
      expect(await run.provider.committedTransfers()).toEqual([]);

      await run.dispose();
    });

    it('AC#17 MUST stay silent when the envelope itself carries an illegal number', async () => {
      // 外层非法的帧**根本不是 v2 帧**，回一条 `invalid_message` 等于向任意发送者确认自己在听。
      // 这是刻意的语义差别，不是遗漏：内层非法才有结构化拒绝。
      const run = await driver.open(createScenario({ capability: 'full', mutationPolicy: 'allow' }));
      const panel = await connected(run);
      const before = connectorOutput(run).length;

      await run
        .segment('panel')
        .inject(rawFrame('PING', null, panel.sessionId, { sequence: 1.5 }), 'panel-to-connector');
      await run.settle();

      expect(connectorOutput(run)).toHaveLength(before);
      expect(readErrorCodes(connectorOutput(run))).toEqual([]);

      await run.dispose();
    });

    it.each([
      { label: 'unpadded', dataBase64: 'SGk' },
      { label: 'whitespace-bearing', dataBase64: 'SG k=' },
      { label: 'URL-safe', dataBase64: '-_8=' },
      { label: 'over-padded', dataBase64: 'SGk==' }
    ])('AC#18 MUST reject $label base64 and write nothing', async ({ dataBase64 }) => {
      const run = await driver.open(createScenario({ capability: 'full', mutationPolicy: 'allow' }));
      const panel = await connected(run);

      await panel.send('TRANSFER_START', { transferId: 't1', requestId: 'req1', totalBytes: 8 });
      await panel.send('TRANSFER_CHUNK', { transferId: 't1', chunkIndex: 0, offset: 0, dataBase64 });

      expect(readErrorCodes(connectorOutput(run))).toEqual(['payload_encoding_invalid']);
      expect(await run.provider.committedTransfers()).toEqual([]);

      await run.dispose();
    });

    it('AC#18 MUST commit exactly the decoded byte count for canonical base64', async () => {
      const run = await driver.open(createScenario({ capability: 'full', mutationPolicy: 'allow' }));
      const panel = await connected(run);

      await panel.send('TRANSFER_START', { transferId: 't1', requestId: 'req1', totalBytes: 5 });
      await panel.send('TRANSFER_CHUNK', { transferId: 't1', chunkIndex: 0, offset: 0, dataBase64: FIVE_BYTES });
      await panel.send('TRANSFER_COMPLETE', { transferId: 't1' });

      expect(readErrorCodes(connectorOutput(run))).toEqual([]);
      expect(await run.provider.committedTransfers()).toEqual([['t1', 5]]);

      await run.dispose();
    });
  });

  describe(`data plane: transfer state machine [${driver.name}]`, () => {
    it('AC#19 MUST commit a zero-byte transfer and leave no temporary artifact', async () => {
      const run = await driver.open(createScenario({ capability: 'full', mutationPolicy: 'allow' }));
      const panel = await connected(run);

      await panel.send('TRANSFER_START', { transferId: 't1', requestId: 'req1', totalBytes: 0 });
      await panel.send('TRANSFER_COMPLETE', { transferId: 't1' });

      expect(readErrorCodes(connectorOutput(run))).toEqual([]);
      expect(await run.provider.committedTransfers()).toEqual([['t1', 0]]);
      expect(await run.provider.temporaryArtifacts()).toEqual([]);

      await run.dispose();
    });

    it('AC#19 MUST stream a multi-chunk transfer without ever retaining the whole file', async () => {
      const run = await driver.open(createScenario({ capability: 'full', mutationPolicy: 'allow' }));
      const panel = await connected(run);

      await panel.send('TRANSFER_START', { transferId: 't1', requestId: 'req1', totalBytes: 6 });
      await panel.send('TRANSFER_CHUNK', { transferId: 't1', chunkIndex: 0, offset: 0, dataBase64: THREE_BYTES });
      await panel.send('TRANSFER_CHUNK', { transferId: 't1', chunkIndex: 1, offset: 3, dataBase64: THREE_BYTES });
      await panel.send('TRANSFER_COMPLETE', { transferId: 't1' });

      expect(await run.provider.committedTransfers()).toEqual([['t1', 6]]);
      // 峰值等于**最大单块**而不是总量：任何整文件拼接的实现会让这两个数字相等。
      expect(run.provider.peakRetainedBytes).toBe(3);

      await run.dispose();
    });

    it.each([
      {
        label: 'an out-of-order chunk',
        chunk: { chunkIndex: 1, offset: 3, dataBase64: THREE_BYTES },
        code: 'transfer_sequence_invalid'
      },
      {
        label: 'a chunk whose offset disagrees with the ledger',
        chunk: { chunkIndex: 0, offset: 3, dataBase64: THREE_BYTES },
        code: 'transfer_sequence_invalid'
      },
      {
        label: 'a zero-byte chunk',
        chunk: { chunkIndex: 0, offset: 0, dataBase64: '' },
        code: 'transfer_sequence_invalid'
      }
    ])('AC#19 MUST reject $label without committing', async ({ chunk, code }) => {
      const run = await driver.open(createScenario({ capability: 'full', mutationPolicy: 'allow' }));
      const panel = await connected(run);

      await panel.send('TRANSFER_START', { transferId: 't1', requestId: 'req1', totalBytes: 6 });
      await panel.send('TRANSFER_CHUNK', { transferId: 't1', ...chunk });

      expect(readErrorCodes(connectorOutput(run))).toEqual([code]);
      expect(await run.provider.committedTransfers()).toEqual([]);

      await run.dispose();
    });

    it('AC#19 MUST reject a duplicate chunk and a chunk that overruns the declared size', async () => {
      const run = await driver.open(createScenario({ capability: 'full', mutationPolicy: 'allow' }));
      const panel = await connected(run);

      await panel.send('TRANSFER_START', { transferId: 't1', requestId: 'req1', totalBytes: 4 });
      await panel.send('TRANSFER_CHUNK', { transferId: 't1', chunkIndex: 0, offset: 0, dataBase64: THREE_BYTES });
      await panel.send('TRANSFER_CHUNK', { transferId: 't1', chunkIndex: 0, offset: 0, dataBase64: THREE_BYTES });
      // 账本只剩 1 字节，再来 3 字节必须是「超量」而不是「乱序」。
      await panel.send('TRANSFER_CHUNK', { transferId: 't1', chunkIndex: 1, offset: 3, dataBase64: THREE_BYTES });

      expect(readErrorCodes(connectorOutput(run))).toEqual(['transfer_sequence_invalid', 'transfer_size_exceeded']);
      expect(await run.provider.committedTransfers()).toEqual([]);

      await run.dispose();
    });

    it('AC#19 MUST treat a short COMPLETE as non-terminal and still allow the sender to finish', async () => {
      const run = await driver.open(createScenario({ capability: 'full', mutationPolicy: 'allow' }));
      const panel = await connected(run);

      await panel.send('TRANSFER_START', { transferId: 't1', requestId: 'req1', totalBytes: 6 });
      await panel.send('TRANSFER_CHUNK', { transferId: 't1', chunkIndex: 0, offset: 0, dataBase64: THREE_BYTES });
      await panel.send('TRANSFER_COMPLETE', { transferId: 't1' });

      expect(readErrorCodes(connectorOutput(run))).toEqual(['transfer_incomplete']);
      expect(await run.provider.committedTransfers()).toEqual([]);

      await panel.send('TRANSFER_CHUNK', { transferId: 't1', chunkIndex: 1, offset: 3, dataBase64: THREE_BYTES });
      await panel.send('TRANSFER_COMPLETE', { transferId: 't1' });

      expect(readErrorCodes(connectorOutput(run))).toEqual(['transfer_incomplete']);
      expect(await run.provider.committedTransfers()).toEqual([['t1', 6]]);

      await run.dispose();
    });

    it('AC#19 MUST discard a cancelled transfer and refuse every later frame', async () => {
      const run = await driver.open(createScenario({ capability: 'full', mutationPolicy: 'allow' }));
      const panel = await connected(run);

      await panel.send('TRANSFER_START', { transferId: 't1', requestId: 'req1', totalBytes: 6 });
      await panel.send('TRANSFER_CHUNK', { transferId: 't1', chunkIndex: 0, offset: 0, dataBase64: THREE_BYTES });
      await panel.send('TRANSFER_CANCEL', { transferId: 't1' });

      expect(await run.provider.committedTransfers()).toEqual([]);
      expect(await run.provider.temporaryArtifacts()).toEqual([]);

      await panel.send('TRANSFER_CHUNK', { transferId: 't1', chunkIndex: 1, offset: 3, dataBase64: THREE_BYTES });
      await panel.send('TRANSFER_COMPLETE', { transferId: 't1' });

      expect(readErrorCodes(connectorOutput(run))).toEqual(['transfer_closed', 'transfer_closed']);
      expect(await run.provider.committedTransfers()).toEqual([]);

      await run.dispose();
    });

    it('AC#19 MUST refuse a late frame that arrives after a successful COMPLETE', async () => {
      const run = await driver.open(createScenario({ capability: 'full', mutationPolicy: 'allow' }));
      const panel = await connected(run);

      await panel.send('TRANSFER_START', { transferId: 't1', requestId: 'req1', totalBytes: 3 });
      await panel.send('TRANSFER_CHUNK', { transferId: 't1', chunkIndex: 0, offset: 0, dataBase64: THREE_BYTES });
      await panel.send('TRANSFER_COMPLETE', { transferId: 't1' });
      await panel.send('TRANSFER_CHUNK', { transferId: 't1', chunkIndex: 1, offset: 3, dataBase64: THREE_BYTES });

      expect(readErrorCodes(connectorOutput(run))).toEqual(['transfer_closed']);
      // 迟到帧不得让已提交的传输再被写一次。
      expect(await run.provider.committedTransfers()).toEqual([['t1', 3]]);

      await run.dispose();
    });
  });

  describe(`data plane: transfer limits [${driver.name}]`, () => {
    it('AC#20 MUST accept only in-range limits and take the minimum of the three declarations', () => {
      expect(isMaxTransferBytes(0)).toBe(true);
      expect(isMaxTransferBytes(DEVTOOLS_MAX_TRANSFER_BYTES_LIMIT)).toBe(true);
      expect(isMaxTransferBytes(DEVTOOLS_MAX_TRANSFER_BYTES_LIMIT + 1)).toBe(false);
      expect(isMaxTransferBytes(-1)).toBe(false);
      expect(isMaxTransferBytes(1.5)).toBe(false);
      expect(isMaxTransferBytes('16')).toBe(false);

      expect(resolveNegotiatedTransferLimit([100, 50, 200])).toBe(50);
      // 缺失与非法都返回 `undefined`——**不跳过非法项继续取最小值**，否则写错的一方仍按自己的值工作。
      expect(resolveNegotiatedTransferLimit([])).toBeUndefined();
      expect(resolveNegotiatedTransferLimit([100, -1])).toBeUndefined();
      expect(resolveNegotiatedTransferLimit(undefined)).toBeUndefined();
    });

    it('AC#20 MUST reject a files descriptor that declares transfers with a zero limit', () => {
      const files = descriptorOf(createFakeProviders().descriptors, 'files');

      expect(isDevToolsProviderDescriptor({ ...files, limits: { maxTransferBytes: 0 } })).toBe(false);
      expect(
        isDevToolsProviderDescriptor({ ...files, limits: { maxTransferBytes: DEVTOOLS_MAX_TRANSFER_BYTES_LIMIT + 1 } })
      ).toBe(false);
      // 不声明 transfer 操作时，0 是合法的。
      expect(isDevToolsProviderDescriptor({ ...files, operations: ['list'], limits: { maxTransferBytes: 0 } })).toBe(
        true
      );
    });

    it('AC#20 MUST answer transfer_size_exceeded beyond the negotiated total without opening a sink', async () => {
      const { descriptors } = createFakeProviders({ maxTransferBytes: 8 });
      const run = await driver.open(createScenario({ capability: 'full', mutationPolicy: 'allow', descriptors }));
      const panel = await connected(run);

      await panel.send('TRANSFER_START', { transferId: 't1', requestId: 'req1', totalBytes: 16 });

      expect(readErrorCodes(connectorOutput(run))).toEqual(['transfer_size_exceeded']);
      expect(await run.provider.temporaryArtifacts()).toEqual([]);

      await panel.send('TRANSFER_START', { transferId: 't2', requestId: 'req2', totalBytes: 8 });
      expect(readErrorCodes(connectorOutput(run))).toEqual(['transfer_size_exceeded']);

      await run.dispose();
    });
  });

  describe(`data plane: shared error mapping [${driver.name}]`, () => {
    it('AC#23 MUST map every registered platform failure to the same shared code', () => {
      expect(PLATFORM_FIXTURES.length).toBeGreaterThan(0);

      for (const fixture of PLATFORM_FIXTURES) {
        const mapped = mapPlatformError(fixture.origin, fixture.error);
        expect(mapped.code, fixture.name).toBe(fixture.expected);
        expect(mapped.message === undefined || isRedactedErrorMessage(mapped.message), fixture.name).toBe(true);
      }
    });

    it.each(DEVTOOLS_PROVIDER_RUNTIMES)(
      'AC#23 MUST answer resource_not_found on %s without leaking the requested path',
      async runtime => {
        const run = await driver.open(createScenario({ runtime, capability: 'full', mutationPolicy: 'allow' }));
        const panel = await connected(run);

        await panel.send('REQUEST', {
          requestId: 'r1',
          domain: 'files',
          operation: 'download',
          params: { path: '/missing' }
        });

        expect(readErrorCodes(connectorOutput(run))).toEqual(['resource_not_found']);
        const errors = readV2FramesOfType(connectorOutput(run), 'ERROR');
        expect(errors).toHaveLength(1);
        // 路径、stack 与平台 code 都不得出现在出站帧里——脱敏要在整帧上成立，不只是在 message 字段上。
        for (const frame of connectorOutput(run)) expect(frame).not.toContain('/missing');

        await run.dispose();
      }
    );
  });

  describe(`data plane: database export [${driver.name}]`, () => {
    it.each(
      DEVTOOLS_PROVIDER_RUNTIMES.flatMap(runtime =>
        (['opfs', 'idb', 'sqlite'] as const).map(kind => ({ runtime, kind }))
      )
    )('AC#24 MUST answer export_unsupported on $runtime / $kind with zero host reads', async ({ runtime, kind }) => {
      const { descriptors } = createFakeProviders({ runtime, kinds: { settings: kind } });
      const run = await driver.open(
        createScenario({ runtime, descriptors, capability: 'full', mutationPolicy: 'allow' })
      );
      const panel = await connected(run);

      await panel.send('REQUEST', { requestId: 'r1', domain: 'settings', operation: 'export', params: {} });

      expect(readErrorCodes(connectorOutput(run))).toEqual(['export_unsupported']);
      // provider 被调用了一次（否则「恒返回该码」无从谈起），但它必须在任何 host 动作之前返回。
      expect(run.provider.operationCalls.get('settings.export')).toBe(1);
      expect(run.provider.hostReads).toBe(0);
      expect(await run.provider.temporaryArtifacts()).toEqual([]);

      await run.dispose();
    });

    it('MUST keep every frame it produced canonical across the whole data-plane run', async () => {
      const run = await driver.open(createScenario({ capability: 'full', mutationPolicy: 'allow' }));
      const panel = await connected(run);

      await panel.send('REQUEST', { requestId: 'r1', domain: 'database', operation: 'inspect', params: {} });
      await panel.send('REQUEST', { requestId: 'r2', domain: 'settings', operation: 'export', params: {} });
      await panel.send('TRANSFER_START', { transferId: 't1', requestId: 'req1', totalBytes: 3 });
      await panel.send('TRANSFER_CHUNK', { transferId: 't1', chunkIndex: 0, offset: 0, dataBase64: THREE_BYTES });
      await panel.send('TRANSFER_COMPLETE', { transferId: 't1' });

      expect(readV2FramesOfType(connectorOutput(run), 'RESPONSE')).toHaveLength(1);
      for (const frame of connectorOutput(run)) expect(() => assertCanonicalJsonFrame(frame)).not.toThrow();

      await run.dispose();
    });
  });
}
