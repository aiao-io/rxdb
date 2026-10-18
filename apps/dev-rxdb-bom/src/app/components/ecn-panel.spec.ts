import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BomDemoService } from '../bom-demo.service';
import { EcnPanel } from './ecn-panel';

const originalConfirm = Object.getOwnPropertyDescriptor(window, 'confirm');

describe('EcnPanel 取消确认', () => {
  const service = {
    ready: signal(true),
    ecns: signal(new Map()),
    demoCancelLiveEcn: vi.fn().mockResolvedValue(''),
    demoCancelEffectiveEcn: vi.fn().mockResolvedValue('已生效，请使用更正变更单')
  };

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'confirm', { configurable: true, writable: true, value: vi.fn() });
    TestBed.configureTestingModule({ providers: [{ provide: BomDemoService, useValue: service }] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalConfirm) Object.defineProperty(window, 'confirm', originalConfirm);
    else Reflect.deleteProperty(window, 'confirm');
  });

  it('拒绝确认时不取消现场变更单', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const panel = TestBed.runInInjectionContext(() => new EcnPanel());

    await panel.runCancelLiveEcn();

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('取消'));
    expect(service.demoCancelLiveEcn).not.toHaveBeenCalled();
    expect(service.demoCancelEffectiveEcn).not.toHaveBeenCalled();
    expect(panel.busy()).toBe(false);
  });

  it('确认取消现场变更后保留原服务调用及操作结果', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const panel = TestBed.runInInjectionContext(() => new EcnPanel());

    await panel.runCancelLiveEcn();

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('5 行'));
    expect(service.demoCancelLiveEcn).toHaveBeenCalledOnce();
    expect(panel.ecnActionResult()).toContain('取消成功');
  });
});
