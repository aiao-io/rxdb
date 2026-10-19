import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BomDemoService } from '../bom-demo.service';
import { EcnPanel } from './ecn-panel';

const originalConfirm = Object.getOwnPropertyDescriptor(window, 'confirm');

describe('EcnPanel 取消确认', () => {
  const service = {
    ready: signal(true),
    dataEpoch: signal(0),
    resetting: signal(false),
    liveEcnId: signal<string | null>('ecn-live'),
    ecns: signal(new Map()),
    itemNos: signal(
      new Map([
        ['battery', 'BATT'],
        ['root', 'SC-100']
      ])
    ),
    ecnImpact: vi.fn().mockResolvedValue({
      affectedItemIds: ['battery'],
      topItems: [{ itemId: 'root', paths: [['occurrence-1']] }]
    }),
    ecnDiff: vi.fn().mockResolvedValue({ headers: [] }),
    cancelEcn: vi.fn().mockResolvedValue(''),
    demoCancelLiveEcn: vi.fn().mockResolvedValue(''),
    demoCancelEffectiveEcn: vi.fn().mockResolvedValue('已生效，请使用更正变更单')
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service.ready.set(true);
    service.dataEpoch.set(0);
    service.ecns.set(new Map());
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

  it('影响面使用物料中文名并保留原变更单与技术路径标识', async () => {
    const panel = TestBed.runInInjectionContext(() => new EcnPanel());
    panel.selectedEcnId.set('ecn-original');

    await panel.runEcnImpact();

    expect(service.ecnImpact).toHaveBeenCalledExactlyOnceWith('ecn-original');
    expect(panel.impactLines()).toEqual([
      '被改物料：电池组（BATT）',
      '受影响整机：电动滑板车（SC-100）',
      '路径 电动滑板车（SC-100）：occurrence-1'
    ]);
  });

  it('切换变更单时清除上一张的影响面和差异，取消作用于当前选中对象', async () => {
    service.ecns.set(
      new Map([
        ['ecn-a', { ecnNo: 'ECN-A', state: 'released', effectiveDate: '2099-01-01' }],
        ['ecn-b', { ecnNo: 'ECN-B', state: 'released', effectiveDate: '2099-02-01' }]
      ])
    );
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fixture = TestBed.createComponent(EcnPanel);
    await fixture.whenStable();
    const panel = fixture.componentInstance;
    panel.selectedEcnId.set('ecn-a');
    await fixture.whenStable();
    await panel.runEcnImpact();
    panel.selectedEcnId.set('ecn-b');
    await fixture.whenStable();

    expect(panel.impactLines()).toEqual([]);
    expect(panel.diffLines()).toEqual([]);
    await panel.runCancelSelectedEcn();
    expect(service.cancelEcn).toHaveBeenCalledExactlyOnceWith('ecn-b');
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('ECN-B'));
  });

  it('失败不混入旧影响结果，重置代际后忽略迟到回调', async () => {
    const fixture = TestBed.createComponent(EcnPanel);
    await fixture.whenStable();
    const panel = fixture.componentInstance;
    panel.selectedEcnId.set('ecn-a');
    await fixture.whenStable();
    await panel.runEcnImpact();
    service.ecnImpact.mockRejectedValueOnce(new Error('断线'));
    await panel.runEcnImpact();
    expect(panel.impactLines()).toEqual([]);
    let resolveImpact!: (value: { affectedItemIds: string[]; topItems: [] }) => void;
    service.ecnImpact.mockReturnValueOnce(
      new Promise(resolve => {
        resolveImpact = resolve;
      })
    );
    const pending = panel.runEcnImpact();
    service.dataEpoch.update(value => value + 1);
    await fixture.whenStable();
    resolveImpact({ affectedItemIds: ['battery'], topItems: [] });
    await pending;
    expect(panel.impactLines()).toEqual([]);
    expect(panel.queryError()).toBe('');
  });
});
