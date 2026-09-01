/**
 * OPFS 上传走**真实 wire**的契约。
 *
 * @remarks
 * `opfs-files-provider.spec.ts` 按「先 await `invoke('upload')`、再 `createChunkSink()`」的顺序
 * 调用 provider，因此测不到本文件盯的东西：协议规定 `TRANSFER_START` **紧跟在** upload 请求
 * 之后上线，不等 RESPONSE（见 `panel-endpoint.ts` 的 `upload`），而 connector 的
 * `receive → #route → #dispatchFrame` 全同步。于是 connector 处理 START 时，provider 的
 * `upload` 还停在 `await getRootDirectory()` 上，登记表里空空如也。
 *
 * 把两端真的对接起来才能让这条顺序参与断言——所以这里不用替身 provider，用生产装配
 * （{@link createConnectorProviders}）接内存 OPFS。
 *
 * @module __tests__/browser/opfs-upload-wire
 */

import { describe, expect, it } from 'vitest';

import { createConnectorProviders } from '../../connector-providers.js';
import { createFakeClock } from '../../testing/fake-clock.js';
import { createMessage } from '../../types.js';
import type { DevToolsConnectorEndpoint } from '../../v2/endpoint.js';
import { createDevToolsConnectorEndpoint } from '../../v2/endpoint.js';
import type { DevToolsPanelEndpoint } from '../../v2/panel-endpoint.js';
import { createDevToolsPanelEndpoint } from '../../v2/panel-endpoint.js';
import type { DevToolsV2Message } from '../../v2/wire.js';
import { createDevToolsV2Message, isDevToolsV2Message } from '../../v2/wire.js';
import { createFakeOpfsRoot, type FakeOpfsRoot } from './fake-opfs.js';

interface Harness {
  readonly panel: DevToolsPanelEndpoint;
  readonly connector: DevToolsConnectorEndpoint;
  readonly root: FakeOpfsRoot;
  /** 面板收到的全部 v2 帧。 */
  inbound(): readonly DevToolsV2Message[];
}

/**
 * 把真实的两端对接到内存 OPFS 上。
 *
 * @remarks
 * 同步投递，与 `v2/download.spec.ts` 的 `loopback` 同理：用队列异步投递会把
 * 「START 早于 RESPONSE」这条协议顺序偷偷放松成「先后无所谓」。
 */
function harness(): Harness {
  const root = createFakeOpfsRoot();
  const inbound: DevToolsV2Message[] = [];
  const providers = createConnectorProviders({ getRootDirectory: () => Promise.resolve(root.handle) });

  // 两端互相引用，只能有一端后声明；投递全部发生在 `start()` 之后，闭包读不到 TDZ。
  const connector = createDevToolsConnectorEndpoint({
    clock: createFakeClock(),
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
    clock: createFakeClock(),
    send: message => connector.receive(message)
  });

  connector.start();
  panel.start();
  return { panel, connector, root, inbound: () => inbound };
}

/** 一个跨不整块的字节源；内容按下标可预测，落盘错位必然测得出来。 */
function source(totalBytes: number) {
  const bytes = Uint8Array.from({ length: totalBytes }, (_unused, index) => index % 251);
  return {
    totalBytes,
    read: (offset: number, length: number): Promise<Uint8Array> => Promise.resolve(bytes.slice(offset, offset + length))
  };
}

describe('OPFS 上传 — 走 wire', () => {
  it('MUST 在 START 早于 upload 应答时仍把字节落到目标文件', async () => {
    const { panel, root } = harness();

    const result = await panel.upload({
      source: source(40),
      params: transferId => ({ transferId, path: '', name: 'uploaded.bin', size: 40 })
    });

    expect(result.outcome).toBe('sent');
    // `'sent'` 按契约只说「字节已按协议发出」，落盘（connector 侧的 commit）发生在
    // TRANSFER_COMPLETE 之后的异步收口里；让出一次宏任务等它落地。
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(root.exists('uploaded.bin')).toBe(true);
    expect(root.fileSize('uploaded.bin')).toBe(40);
  });

  it('MUST 在 sink 建不起来时回 ERROR 帧，而不是把异常抛回投递栈', () => {
    const { connector, inbound } = harness();

    // 这个 transferId 从来没有对应的 upload 请求。端点必须把它变成一条 ERROR 帧，
    // 而不是让 `createChunkSink` 的抛出一路逃回 `receive()` 的调用者——那会连带
    // 打断同一条通道上排在后面的消息，症状与这次传输毫无关联线索。
    const frame = createDevToolsV2Message(
      'TRANSFER_START',
      { transferId: 'trf-never-registered', requestId: 'req-never-registered', totalBytes: 4 },
      {
        sessionId: connector.sessionId,
        sequence: 999,
        timestamp: 1_700_000_000_000,
        direction: 'panel-to-connector'
      }
    );

    expect(() => connector.receive(frame)).not.toThrow();
    expect(inbound().some(message => message.type === 'ERROR')).toBe(true);
  });
});
