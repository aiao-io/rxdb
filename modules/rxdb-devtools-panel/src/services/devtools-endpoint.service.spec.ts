import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { DEVTOOLS_TRANSPORT } from '../transport/devtools-transport';
import { FakeDevToolsTransport } from '../testing/fake-transport';
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
