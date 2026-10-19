import type { ExplosionResult } from '@aiao/rxdb-plugin-bom';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BomDemoService } from '../bom-demo.service';
import { MappingPanel } from './mapping-panel';

const result: ExplosionResult = {
  manifest: {
    context: { bomType: 'ebom', orgId: 'org-x', asOfDate: new Date('2026-09-22') },
    parentItemId: 'root',
    parentRevisionId: 'root-a',
    headerIds: [],
    occurrenceIds: [],
    conversions: [],
    formulaGrammarVersion: 'fixture',
    algorithmVersion: 'fixture',
    unresolved: []
  },
  requirementLines: [],
  outputs: [],
  penetrations: [],
  unresolved: [],
  truncated: null
};

describe('设计与制造清单的物料名称', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('两张清单的描述同时包含中文名称与完整编码', async () => {
    const service = {
      ready: signal(true),
      dataEpoch: signal(0),
      resetting: signal(false),
      itemNos: signal(new Map<string, string>()),
      designators: signal(new Map<string, string[]>()),
      dualExplode: vi.fn().mockResolvedValue({ ebom: result, mbom: result })
    };
    TestBed.configureTestingModule({ providers: [{ provide: BomDemoService, useValue: service }] });
    const fixture = TestBed.createComponent(MappingPanel);
    fixture.componentRef.setInput('asOfDate', '2026-09-22');
    await fixture.whenStable();
    await fixture.componentInstance.runDualExplode();
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[data-testid=ebom-tree] .panel-desc')?.textContent).toMatch(
      /[\u4e00-\u9fff]+（SHEET-ASSY）/
    );
    expect(host.querySelector('[data-testid=mbom-tree] .panel-desc')?.textContent).toMatch(
      /[\u4e00-\u9fff]+（SHEET-ASSY-M）/
    );
    expect(service.dualExplode).toHaveBeenCalledExactlyOnceWith('2026-09-22');
  });

  it('评估日变化标记结果过期，失败清除旧双图，重置后不接收迟到结果', async () => {
    const service = {
      ready: signal(true),
      dataEpoch: signal(0),
      resetting: signal(false),
      itemNos: signal(new Map<string, string>()),
      designators: signal(new Map<string, string[]>()),
      dualExplode: vi.fn().mockResolvedValue({ ebom: result, mbom: result }),
      mappingLabels: vi.fn().mockResolvedValue(new Map<string, string>())
    };
    TestBed.configureTestingModule({ providers: [{ provide: BomDemoService, useValue: service }] });
    const fixture = TestBed.createComponent(MappingPanel);
    fixture.componentRef.setInput('asOfDate', '2026-09-22');
    await fixture.whenStable();
    await fixture.componentInstance.runDualExplode();
    fixture.componentRef.setInput('asOfDate', '2026-10-15');
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('条件已修改');
    service.dualExplode.mockRejectedValueOnce(new Error('读取失败'));
    await fixture.componentInstance.runDualExplode();
    expect(fixture.componentInstance.dualView()).toBeNull();
    let resolve!: (value: { ebom: ExplosionResult; mbom: ExplosionResult }) => void;
    service.dualExplode.mockReturnValueOnce(
      new Promise(done => {
        resolve = done;
      })
    );
    const pending = fixture.componentInstance.runDualExplode();
    service.dataEpoch.update(value => value + 1);
    await fixture.whenStable();
    resolve({ ebom: result, mbom: result });
    await pending;
    expect(fixture.componentInstance.dualView()).toBeNull();
  });

  it('缺口显示业务路径并在确认后重新读取缺口', async () => {
    const gap = {
      mappingId: 'mapping-full-id',
      relation: 'equivalent',
      targetLineId: 'target-line',
      undecidable: null,
      differences: [
        {
          kind: 'changed',
          baseline: { lineId: 'source-line', occurrenceId: 'old', revisionId: 'a' },
          current: { lineId: 'source-line', occurrenceId: 'new', revisionId: 'b' }
        }
      ],
      appeared: []
    };
    const service = {
      ready: signal(true),
      dataEpoch: signal(0),
      resetting: signal(false),
      itemNos: signal(new Map<string, string>()),
      designators: signal(new Map<string, string[]>()),
      mappingLabels: vi.fn().mockResolvedValue(new Map([['source-line', '钣金外壳 · 行10 · 板材']])),
      mapGaps: vi
        .fn()
        .mockResolvedValueOnce({ scopeId: 'scope', gaps: [gap] })
        .mockResolvedValue({ scopeId: 'scope', gaps: [] }),
      confirmMap: vi.fn().mockResolvedValue(undefined)
    };
    TestBed.configureTestingModule({ providers: [{ provide: BomDemoService, useValue: service }] });
    const fixture = TestBed.createComponent(MappingPanel);
    fixture.componentRef.setInput('asOfDate', '2026-10-15');
    await fixture.whenStable();
    await fixture.componentInstance.runGaps();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('钣金外壳 · 行10 · 板材');
    const confirm = host.querySelector<HTMLButtonElement>('[data-testid=mapping-confirm]');
    expect(confirm).not.toBeNull();
    confirm?.click();
    await fixture.whenStable();
    expect(service.confirmMap).toHaveBeenCalledExactlyOnceWith('mapping-full-id', '2026-10-15');
    expect(service.mapGaps).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain('已确认');
  });
});
