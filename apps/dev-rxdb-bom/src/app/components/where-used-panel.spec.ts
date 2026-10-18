import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BomDemoService } from '../bom-demo.service';
import { WhereUsedPanel } from './where-used-panel';

describe('WhereUsedPanel 查询反馈', () => {
  const service = {
    ready: signal(true),
    itemNos: signal(new Map([['item-m3', 'M3']])),
    whereUsed: vi.fn().mockResolvedValue({ nodes: [] })
  };

  beforeEach(() => {
    service.whereUsed.mockReset().mockResolvedValue({ nodes: [] });
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
    expect(host.textContent).toContain('未找到使用 M3 的父件');
    expect(host.textContent).toContain('更换物料或评估日');
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
});
