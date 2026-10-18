import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BomDemoService } from '../../bom-demo.service';
import { InstancesPage } from './instances.page';

const originalConfirm = Object.getOwnPropertyDescriptor(window, 'confirm');

describe('InstancesPage 危险操作确认', () => {
  const service = {
    ready: signal(true),
    instanceRoots: signal([]),
    firstInstanceId: 'instance-1',
    protectedInstanceSourceId: 'source-1',
    replaceDemoInstance: vi.fn().mockResolvedValue(undefined),
    deleteDemoInstanceSource: vi.fn().mockResolvedValue('来源受到实例引用保护')
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

  it.each(['replace', 'deleteSource'] as const)('%s 拒绝确认时保留安装记录和来源', async action => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const page = TestBed.runInInjectionContext(() => new InstancesPage());

    await page[action]();

    expect(window.confirm).toHaveBeenCalledOnce();
    expect(service.replaceDemoInstance).not.toHaveBeenCalled();
    expect(service.deleteDemoInstanceSource).not.toHaveBeenCalled();
    expect(page.busy()).toBe(false);
    expect(page.replaced()).toBe(false);
  });

  it('确认换件时点名旧电池并按原日期保存', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const page = TestBed.runInInjectionContext(() => new InstancesPage());
    page.replaceDate.set('2026-11-02');

    await page.replace();

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('PACK-001'));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('2026-11-02'));
    expect(service.replaceDemoInstance).toHaveBeenCalledExactlyOnceWith('2026-11-02');
    expect(page.actionResult()).toContain('换件成功');
  });
});
