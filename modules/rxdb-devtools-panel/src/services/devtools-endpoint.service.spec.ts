import { createDevToolsV2Message, createSessionId } from '@aiao/rxdb-devtools';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RXDB_DEVTOOLS_MESSAGE } from '@modules/rxdb-devtools-panel/wire';
import { describe, expect, it } from 'vitest';
import { FakeDevToolsTransport } from '../testing/fake-transport';
import { DEVTOOLS_TRANSPORT } from '../transport/devtools-transport';
import { DevToolsEndpointService } from './devtools-endpoint.service';

/** 取一帧的 `type`；非对象帧回 `undefined`。 */
const frameType = (frame: unknown): string | undefined =>
  typeof frame === 'object' && frame !== null ? (frame as { type?: string }).type : undefined;

describe('DevToolsEndpointService（平台中立 v2 端点接线）', () => {
  it('建链后发出首个 PROTOCOL_HELLO', async () => {
    const transport = new FakeDevToolsTransport();
    transport.connectionEpoch.set(1);

    const service = TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: DEVTOOLS_TRANSPORT, useValue: transport },
        DevToolsEndpointService
      ]
    }).inject(DevToolsEndpointService);

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(transport.frames.map(frameType)).toContain('PROTOCOL_HELLO');
    expect(service.resolve()).not.toBeNull();

    service.ngOnDestroy();
  });

  /**
   * US-905 阶段 1 AC#5：被检查页刷新之后，connector 会重新 eager 发一条 legacy 握手。
   * 本端协商已经落定时，那条握手是「对端重启了」的唯一证据——必须换新端点重新协商。
   *
   * 不修的后果是**镜像**于 US-904 AC#51 的那条缺陷：面板一直对着一个已经不存在的 session
   * 说话，而连接守卫因为收到 v1 握手照样显示「已连接」。
   */
  it('协商落定后再收到 legacy 握手，换新端点重新协商', async () => {
    const transport = new FakeDevToolsTransport();
    transport.connectionEpoch.set(1);

    const service = TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: DEVTOOLS_TRANSPORT, useValue: transport },
        DevToolsEndpointService
      ]
    }).inject(DevToolsEndpointService);

    await new Promise(resolve => setTimeout(resolve, 0));
    const first = service.resolve();
    // 走 `emitFrame` 而不是 `emit`：端点订阅的是**原始帧**车道（`subscribeFrames`），
    // v1 车道那条经 `isDevToolsMessage` 过滤，根本到不了协商机。
    const legacyHandshake = {
      source: RXDB_DEVTOOLS_MESSAGE,
      direction: 'page-to-devtools',
      type: 'HANDSHAKE',
      payload: null,
      timestamp: 0,
      sequence: 0
    };
    // 让本端落定到 v1 facade：1,000ms 决策窗口内只见 legacy 握手、没有 v2 应答。
    transport.emitFrame(legacyHandshake);
    await new Promise(resolve => setTimeout(resolve, 1100));
    expect(service.state()).toBe('v1-facade');

    transport.frames.length = 0;
    // 对端重启：又来一条 legacy 握手。
    transport.emitFrame({ ...legacyHandshake, sequence: 1 });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(service.resolve(), '没有换端点——面板会继续对着旧 session 说话').not.toBe(first);
    expect(transport.frames.map(frameType), '新端点没有重新开口协商').toContain('PROTOCOL_HELLO');

    service.ngOnDestroy();
  });

  /**
   * 1,000 ms 决策窗口量的是「对端答得多快」，不是「对端会不会说 v2」。答慢了就落进终态
   * `v1-facade`，而随后到达的那条 v2 `HANDSHAKE` 恰恰推翻了这个结论——此刻 connector 正
   * 停在 `offered` 上等一条永远不会来的 ACK（它那侧没有计时器），两端各说各话，v2 数据面
   * 整条不可用，且协商机自己出不来。
   *
   * 2026-09-09 `devtools-smoke` 的那条红就是这个终态（`sessionIds: []` + 一条不带 session 的
   * legacy `HANDSHAKE_ACK`）。真因是 Tauri connector 抢在入站监听登记之前发了 eager 握手；
   * 这条用例守的是**第二道**：无论那条 HELLO 因为什么迟到，面板都必须能爬回 v2。
   */
  it('落进 v1 facade 之后收到迟到的 v2 要约，换新端点并 ACK 回去', async () => {
    const transport = new FakeDevToolsTransport();
    transport.connectionEpoch.set(1);

    const service = TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: DEVTOOLS_TRANSPORT, useValue: transport },
        DevToolsEndpointService
      ]
    }).inject(DevToolsEndpointService);

    await new Promise(resolve => setTimeout(resolve, 0));
    const first = service.resolve();
    transport.emitFrame({
      source: RXDB_DEVTOOLS_MESSAGE,
      direction: 'page-to-devtools',
      type: 'HANDSHAKE',
      payload: null,
      timestamp: 0,
      sequence: 0
    });
    await new Promise(resolve => setTimeout(resolve, 1100));
    expect(service.state()).toBe('v1-facade');

    transport.frames.length = 0;
    // connector 的要约迟到了：帧本身完全合法，只是晚于决策窗口。用库自己的构造器造，
    // 免得手写信封漂出 `isDevToolsV2Message` 的严 guard 而把用例骗绿。
    const sessionId = createSessionId();
    transport.emitFrame(
      createDevToolsV2Message(
        'HANDSHAKE',
        { protocolVersion: 2, sessionId, capabilities: { capability: 'full', descriptors: [] } },
        { sessionId, sequence: 1, timestamp: 1 }
      )
    );
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(service.resolve(), '没有换端点——面板会一直卡在 v1 facade').not.toBe(first);
    expect(service.state(), '没有爬回 v2').toBe('v2');
    // ACK 必须真的发出去：connector 那侧没有计时器，收不到就永远停在 `offered`。
    expect(transport.frames.map(frameType), '没有把 ACK 回给还在等的 connector').toContain('HANDSHAKE_ACK');

    service.ngOnDestroy();
  });

  it('重连（epoch 递增）后换新端点，重新发出 PROTOCOL_HELLO', async () => {
    const transport = new FakeDevToolsTransport();
    transport.connectionEpoch.set(1);

    const service = TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: DEVTOOLS_TRANSPORT, useValue: transport },
        DevToolsEndpointService
      ]
    }).inject(DevToolsEndpointService);

    await new Promise(resolve => setTimeout(resolve, 0));
    const firstEndpoint = service.resolve();
    expect(firstEndpoint).not.toBeNull();

    transport.connectionEpoch.update(epoch => epoch + 1);
    await new Promise(resolve => setTimeout(resolve, 0));

    // 旧端点已释放、新端点已挂上，且新端点重新发了一次 HELLO。
    expect(service.resolve()).not.toBeNull();
    expect(service.resolve()).not.toBe(firstEndpoint);
    expect(transport.frames.filter(frame => frameType(frame) === 'PROTOCOL_HELLO')).toHaveLength(2);

    service.ngOnDestroy();
  });

  it('未建链（epoch 0）时不 attach、不发出任何帧', async () => {
    const transport = new FakeDevToolsTransport();
    transport.connectionEpoch.set(0);

    const service = TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: DEVTOOLS_TRANSPORT, useValue: transport },
        DevToolsEndpointService
      ]
    }).inject(DevToolsEndpointService);

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(service.resolve()).toBeNull();
    expect(transport.frames).toEqual([]);

    service.ngOnDestroy();
  });

  it('destroy 后释放端点', async () => {
    const transport = new FakeDevToolsTransport();
    transport.connectionEpoch.set(1);

    const service = TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: DEVTOOLS_TRANSPORT, useValue: transport },
        DevToolsEndpointService
      ]
    }).inject(DevToolsEndpointService);

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(service.resolve()).not.toBeNull();

    service.ngOnDestroy();
    expect(service.resolve()).toBeNull();
  });
});
