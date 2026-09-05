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
