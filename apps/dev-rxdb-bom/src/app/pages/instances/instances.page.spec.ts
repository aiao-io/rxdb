import type { BomInstanceNodeView, BomInstanceTreeResult } from '@aiao/rxdb-plugin-bom';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BomDemoService } from '../../bom-demo.service';
import { InstancesPage } from './instances.page';

const originalConfirm = Object.getOwnPropertyDescriptor(window, 'confirm');

const instanceNode = (id: string, itemNo: string): BomInstanceNodeView => ({
  id,
  itemRevisionId: `${id}-revision`,
  itemId: `${id}-item`,
  itemNo,
  revisionNo: 'A',
  parentInstanceId: null,
  sourceOccurrenceId: null,
  serialNumber: id,
  lotCode: null,
  installedAt: new Date('2026-10-01'),
  removedAt: null
});

describe('InstancesPage 危险操作确认', () => {
  const service = {
    ready: signal(true),
    dataEpoch: signal(0),
    resetting: signal(false),
    instanceRoots: signal([{ id: 'instance-1', itemNo: 'SC-100', serialNumber: 'SN-001' }]),
    firstInstanceId: 'instance-1',
    protectedInstanceSourceId: 'source-1',
    replaceDemoInstance: vi.fn().mockResolvedValue(undefined),
    instanceTree: vi.fn().mockResolvedValue({ rootId: 'instance-1', nodes: [], truncated: false }),
    readDemoInstanceState: vi.fn().mockResolvedValue({ replacementDate: null, masterRevised: false }),
    deleteDemoInstanceSource: vi.fn().mockResolvedValue('来源受到实例引用保护')
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service.dataEpoch.set(0);
    service.readDemoInstanceState.mockResolvedValue({ replacementDate: null, masterRevised: false });
    Object.defineProperty(window, 'confirm', { configurable: true, writable: true, value: vi.fn() });
    TestBed.configureTestingModule({ providers: [{ provide: BomDemoService, useValue: service }] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalConfirm) Object.defineProperty(window, 'confirm', originalConfirm);
    else Reflect.deleteProperty(window, 'confirm');
    TestBed.resetTestingModule();
  });

  it('整机选项与装机物料显示中文名，实例值和物料编码保持可查询', async () => {
    const fixture = TestBed.createComponent(InstancesPage);
    const node = instanceNode('battery-1', 'BATT');
    const tree: BomInstanceTreeResult = {
      rootId: 'instance-1',
      nodes: [{ ...node, depth: 1, path: ['instance-1', node.id] }],
      truncated: false
    };
    await fixture.whenStable();
    fixture.componentInstance.tree.set(tree);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const option = root.querySelector<HTMLOptionElement>('[data-testid=instance-root-select] option');

    expect(option?.textContent).toContain('电动滑板车（SC-100）');
    expect(option?.value).toBe('instance-1');
    expect(root.querySelector('[data-item="BATT"]')?.textContent).toContain('电池组（BATT）');
    expect(node.itemNo).toBe('BATT');
  });

  it('实际追溯路径显示每层中文物料名与编码', () => {
    const page = TestBed.runInInjectionContext(() => new InstancesPage());
    const root = instanceNode('instance-1', 'SC-100');
    const node = instanceNode('battery-1', 'BATT');

    expect(page.tracePath({ node, root, path: [root, node] })).toBe('电动滑板车（SC-100） → 电池组（BATT）');
    expect(node.itemNo).toBe('BATT');
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
    expect(service.instanceTree).toHaveBeenCalledWith('instance-1', '2026-11-02');
    expect(page.asOfDate()).toBe('2026-11-02');
  });

  it('刷新页面后从实际记录恢复换件完成状态', async () => {
    service.readDemoInstanceState.mockResolvedValue({ replacementDate: '2026-11-02', masterRevised: true });
    const fixture = TestBed.createComponent(InstancesPage);
    await fixture.whenStable();
    expect(fixture.componentInstance.replaced()).toBe(true);
    expect(fixture.componentInstance.revised()).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('2026-11-02');
  });

  it('清库代际变化后不回填旧实例查询', async () => {
    const fixture = TestBed.createComponent(InstancesPage);
    await fixture.whenStable();
    let resolve!: (value: BomInstanceTreeResult) => void;
    service.instanceTree.mockReturnValueOnce(
      new Promise(done => {
        resolve = done;
      })
    );
    const pending = fixture.componentInstance.loadTree();
    service.dataEpoch.update(value => value + 1);
    await fixture.whenStable();
    resolve({ rootId: 'instance-1', nodes: [], truncated: false });
    await pending;
    expect(fixture.componentInstance.tree()).toBeNull();
  });
});
