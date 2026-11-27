import type { ExpansionNode, ExpansionResult } from '@aiao/rxdb-plugin-bom';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BomDemoService } from '../bom-demo.service';
import { WhereUsedPanel } from './where-used-panel';

const usage = (itemId: string, path: string[]): ExpansionNode => ({
  itemId,
  path,
  depth: path.length,
  occurrenceId: path[0],
  revisionId: `${itemId}-revision`,
  qty: '1',
  lineNo: 10,
  effectiveFrom: new Date('2026-01-01'),
  effectiveTo: null
});

const result = (...nodes: ExpansionNode[]): ExpansionResult => ({
  context: { bomType: 'ebom', orgId: 'org-x', asOfDate: new Date('2026-09-22') },
  nodes,
  truncated: null
});

describe('WhereUsedPanel 查询反馈', () => {
  const service = {
    ready: signal(true),
    dataEpoch: signal(0),
    resetting: signal(false),
    itemNos: signal(new Map([['item-m3', 'M3']])),
    whereUsed: vi.fn<BomDemoService['whereUsed']>().mockResolvedValue(result())
  };

  beforeEach(() => {
    service.dataEpoch.set(0);
    service.itemNos.set(new Map([['item-m3', 'M3']]));
    service.whereUsed.mockReset().mockResolvedValue(result());
    TestBed.configureTestingModule({ providers: [{ provide: BomDemoService, useValue: service }] });
  });

  it('完成空结果后说明没有父件，并提示修改条件', async () => {
    const fixture = TestBed.createComponent(WhereUsedPanel);
    fixture.componentRef.setInput('asOfDate', '2026-09-22');
    fixture.detectChanges();

    await fixture.componentInstance.runWhereUsed();
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;

    expect(service.whereUsed).toHaveBeenCalledExactlyOnceWith('2026-09-22', 'item-m3');
    expect(host.textContent).toContain('未找到使用 M3 螺钉（M3） 的父件');
    expect(host.textContent).toContain('更换物料或评估日');
  });

  it('选择器与父件结果显示中文名称，反查仍提交物料标识', async () => {
    service.itemNos.set(
      new Map([
        ['item-m3', 'M3'],
        ['root', 'SC-100']
      ])
    );
    service.whereUsed.mockResolvedValue(result(usage('root', ['m3-use'])));
    const fixture = TestBed.createComponent(WhereUsedPanel);
    fixture.componentRef.setInput('asOfDate', '2026-09-22');
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    const option = host.querySelector<HTMLOptionElement>('option[value=M3]');

    expect(option?.textContent).toBe('M3 螺钉（M3）');
    expect(option?.value).toBe('M3');
    await fixture.componentInstance.runWhereUsed();
    fixture.detectChanges();

    expect(service.whereUsed).toHaveBeenCalledExactlyOnceWith('2026-09-22', 'item-m3');
    expect(host.querySelector('[data-testid=where-used-line]')?.textContent).toContain('电动滑板车（SC-100）');
  });

  it('查询失败给出可恢复提示，技术信息在折叠详情内', async () => {
    service.whereUsed.mockRejectedValue(new Error('连接断开'));
    const fixture = TestBed.createComponent(WhereUsedPanel);
    fixture.componentRef.setInput('asOfDate', '2026-09-22');
    fixture.detectChanges();

    await fixture.componentInstance.runWhereUsed();
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;

    expect(host.querySelector('[role="alert"]')?.textContent).toContain('反查未完成');
    expect(host.querySelector('details')?.textContent).toContain('连接断开');
    expect(host.querySelector('details')?.open).toBe(false);
  });

  it('反查树保留整机的直接与经线束两条路径，原始路径收在详情中', async () => {
    service.itemNos.set(
      new Map([
        ['item-m3', 'M3'],
        ['scooter', 'SC-100'],
        ['harness', 'WH-01']
      ])
    );
    service.whereUsed.mockResolvedValue(
      result(
        usage('scooter', ['scooter-screw']),
        usage('harness', ['harness-screw']),
        usage('scooter', ['scooter-harness', 'harness-screw'])
      )
    );
    const fixture = TestBed.createComponent(WhereUsedPanel);
    fixture.componentRef.setInput('asOfDate', '2026-09-22');
    fixture.detectChanges();
    await fixture.componentInstance.runWhereUsed();
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    const tree = host.querySelector('[aria-label="物料使用关系树"]');
    const harness = tree?.querySelector('[data-item="WH-01"]');

    expect(tree).not.toBeNull();
    expect(tree?.querySelectorAll('[data-testid=where-used-line]')).toHaveLength(3);
    expect(tree?.querySelectorAll('[data-item="SC-100"]')).toHaveLength(2);
    expect(harness?.querySelector('[data-item="SC-100"][data-depth="2"]')).not.toBeNull();
    expect(tree?.textContent).toContain('M3 螺钉（M3）');
    expect(tree?.textContent).not.toContain('harness-screw');
    const diagnostics = Array.from(host.querySelectorAll('details')).find(detail =>
      detail.querySelector('summary')?.textContent?.includes('查看路径记录')
    );
    expect(diagnostics?.open).toBe(false);
    expect(diagnostics?.textContent).toContain('scooter-harness → harness-screw');
  });

  it('可收起单条分支和全部分支，再次查询时恢复完整展开', async () => {
    service.itemNos.set(
      new Map([
        ['item-m3', 'M3'],
        ['scooter', 'SC-100'],
        ['harness', 'WH-01']
      ])
    );
    service.whereUsed.mockResolvedValue(
      result(
        usage('scooter', ['direct']),
        usage('harness', ['harness-screw']),
        usage('scooter', ['upper', 'harness-screw'])
      )
    );
    const fixture = TestBed.createComponent(WhereUsedPanel);
    fixture.componentRef.setInput('asOfDate', '2026-09-22');
    fixture.detectChanges();
    await fixture.componentInstance.runWhereUsed();
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    const toggle = host.querySelector<HTMLButtonElement>('button[aria-label="收起 线束组件（WH-01）"]');

    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    toggle?.click();
    fixture.detectChanges();
    expect(host.querySelectorAll('[data-testid=where-used-line]')).toHaveLength(2);
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    const expand = Array.from(host.querySelectorAll('button')).find(
      button => button.textContent?.trim() === '全部展开'
    );
    expand?.click();
    fixture.detectChanges();
    expect(host.querySelectorAll('[data-testid=where-used-line]')).toHaveLength(3);
    const collapse = Array.from(host.querySelectorAll('button')).find(
      button => button.textContent?.trim() === '全部收起'
    );
    collapse?.click();
    fixture.detectChanges();
    expect(host.querySelectorAll('[data-testid=where-used-line]')).toHaveLength(2);

    await fixture.componentInstance.runWhereUsed();
    fixture.detectChanges();
    expect(host.querySelectorAll('[data-testid=where-used-line]')).toHaveLength(3);
  });

  it('改条件后提示重新查询，重置代际后忽略迟到路径', async () => {
    const fixture = TestBed.createComponent(WhereUsedPanel);
    fixture.componentRef.setInput('asOfDate', '2026-09-22');
    await fixture.whenStable();
    await fixture.componentInstance.runWhereUsed();
    fixture.componentRef.setInput('asOfDate', '2026-10-15');
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('条件已修改');
    let resolve!: (value: ExpansionResult) => void;
    service.whereUsed.mockReturnValueOnce(
      new Promise(done => {
        resolve = done;
      })
    );
    const pending = fixture.componentInstance.runWhereUsed();
    service.dataEpoch.update(value => value + 1);
    await fixture.whenStable();
    resolve(result(usage('root', ['old'])));
    await pending;
    expect(fixture.componentInstance.result()).toBeNull();
  });
});
