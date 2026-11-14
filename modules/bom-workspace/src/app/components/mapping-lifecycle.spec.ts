import type { ExplosionResult, MappingGap, RequirementLine } from '@aiao/rxdb-plugin-bom';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BomDemoService } from '../bom-demo.service';
import { MappingPanel } from './mapping-panel';
const result: ExplosionResult = {
  manifest: {
    context: { bomType: 'ebom', orgId: 'org-x', asOfDate: new Date('2026-11-14') },
    parentItemId: 'r',
    parentRevisionId: 'a',
    headerIds: [],
    occurrenceIds: [],
    conversions: [],
    formulaGrammarVersion: 'test',
    algorithmVersion: 'test',
    unresolved: []
  },
  requirementLines: [],
  outputs: [],
  penetrations: [],
  unresolved: [],
  truncated: null
};
const gap: MappingGap = {
  mappingId: 'm',
  relation: 'equivalent',
  targetLineId: 'target',
  undecidable: null,
  invalid: null,
  differences: [],
  appeared: []
};
const setup = async () => {
  const operation = () => vi.fn<(...args: unknown[]) => Promise<unknown>>();
  const service = {
    ready: signal(true),
    dataEpoch: signal(0),
    resetting: signal(false),
    itemNos: signal(new Map<string, string>()),
    designators: signal(new Map<string, string[]>()),
    dualExplode: operation().mockResolvedValue({ ebom: result, mbom: result }),
    mappingLabels: operation().mockResolvedValue(new Map([['l', '设计清单 行10']])),
    mapCoverage: operation().mockResolvedValue({
      covered: [{ lineId: 'l', pathKey: 'l>o' }],
      uncovered: [{ lineId: 'u', paths: [['u']] }],
      invalid: [{ reason: '路径失效' }]
    }),
    mapGaps: operation().mockResolvedValue({ scopeId: 's', gaps: [gap] }),
    confirmMap: operation().mockResolvedValue(undefined)
  };
  TestBed.configureTestingModule({ providers: [{ provide: BomDemoService, useValue: service }] });
  const fixture = TestBed.createComponent(MappingPanel);
  fixture.componentRef.setInput('asOfDate', '2026-11-14');
  await fixture.whenStable();
  fixture.componentInstance.gapsDate.set('2026-11-14');
  return { page: fixture.componentInstance, service, fixture };
};
afterEach(() => TestBed.resetTestingModule());
const actions = [
  { name: '展开', method: 'dualExplode', execute: (page: MappingPanel) => page.runDualExplode() },
  { name: '覆盖', method: 'mapCoverage', execute: (page: MappingPanel) => page.runCoverage() },
  { name: '缺口', method: 'mapGaps', execute: (page: MappingPanel) => page.runGaps() },
  { name: '定位', method: 'dualExplode', execute: (page: MappingPanel) => page.locateGap(gap) },
  { name: '确认', method: 'confirmMap', execute: (page: MappingPanel) => page.confirmGap(gap) }
] as const;
describe('双图异步隔离与跟进状态', () => {
  it.each(actions)('$name 失败后显示原因并可重试', async ({ method, execute }) => {
    const { page, service } = await setup();
    service[method].mockRejectedValueOnce(new Error('查询失败'));
    await execute(page);
    expect(page.error()).toContain('查询失败');
    expect(page.busy()).toBe(false);
  });
  it.each(actions)('$name 重置后忽略迟到拒绝，不污染新工作区', async ({ method, execute }) => {
    const { page, service, fixture } = await setup();
    let reject!: (error: Error) => void;
    service[method].mockReturnValueOnce(
      new Promise((_, fail) => {
        reject = fail;
      })
    );
    const work = execute(page);
    service.dataEpoch.update(value => value + 1);
    await fixture.whenStable();
    reject(new Error('迟到错误'));
    await work;
    expect(page.error()).toBe('');
    expect(page.dualView()).toBeNull();
  });
  it.each(actions)('$name 忙碌和未就绪时不发重复请求', async ({ method, execute }) => {
    const { page, service } = await setup();
    page.busy.set(true);
    await execute(page);
    page.busy.set(false);
    service.ready.set(false);
    await execute(page);
    expect(service[method]).not.toHaveBeenCalled();
  });
  it('覆盖统计逐路径计算，失效原因单列', async () => {
    const { page } = await setup();
    await page.runCoverage();
    expect(page.coverageSummary()).toEqual({ covered: 1, uncovered: 1, invalid: 1 });
    expect(page.coverageLines().join(' ')).toContain('路径失效');
    expect(page.coverageLines().join(' ')).toContain('设计清单 行10');
  });
  it('无差异、缺失、变化、新增、不可判定分别呈现', async () => {
    const { page, service } = await setup();
    const baseline = { lineId: 'old', occurrenceId: 'old-o', revisionId: 'old-r' };
    const step = { lineId: 'new', occurrenceId: 'new-o', revisionId: 'new-r' };
    service.mapGaps.mockResolvedValueOnce({
      scopeId: 's',
      gaps: [
        gap,
        { ...gap, mappingId: 'missing', differences: [{ kind: 'missing', baseline, current: null }] },
        { ...gap, mappingId: 'changed', differences: [{ kind: 'changed', baseline, current: step }], appeared: [step] },
        { ...gap, mappingId: 'unknown', undecidable: { reason: '缺少目标' } }
      ]
    });
    await page.runGaps();
    expect(page.gapLines().join(' ')).toContain('消失');
    expect(page.gapLines().join(' ')).toContain('变化');
    expect(page.gapLines().join(' ')).toContain('新出现');
    expect(page.gapLines().join(' ')).toContain('无法判定');
    expect(page.pendingCount()).toBe(3);
  });
  it('路径消失明确显示，已有双图可复用，无法定位不返回旧行', async () => {
    const { page, service } = await setup();
    await page.runDualExplode();
    await page.locateGap(gap);
    expect(service.dualExplode).toHaveBeenCalledOnce();
    expect(page.locatedLine()).toBeNull();
    expect(page.locatedPath()).toContain('原路径已消失');
    const line = { path: ['new-o'] } as RequirementLine;
    page.dualView.set({ ebom: { ...result, requirementLines: [line] }, mbom: result });
    await page.locateGap({
      ...gap,
      differences: [
        {
          kind: 'changed',
          baseline: { lineId: 'l', occurrenceId: 'o', revisionId: 'a' },
          current: { lineId: 'new', occurrenceId: 'new-o', revisionId: 'b' }
        }
      ],
      appeared: []
    });
    expect(page.locatedLine()).toBe(line);
  });
  it('确认成功但回读失败时明确区分已保存与未确认', async () => {
    const { page, service } = await setup();
    service.mapGaps.mockRejectedValueOnce(new Error('回读失败'));
    await page.confirmGap(gap);
    expect(page.errorTitle()).toContain('确认已保存');
    expect(page.error()).toContain('回读失败');
  });
  it('过期结果阻止确认和定位，无法判定的缺口不能确认', async () => {
    const { page, service, fixture } = await setup();
    await page.runGaps();
    fixture.componentRef.setInput('asOfDate', '2026-12-01');
    await fixture.whenStable();
    await page.confirmGap(gap);
    await page.locateGap(gap);
    expect(service.confirmMap).not.toHaveBeenCalled();
    expect(service.dualExplode).not.toHaveBeenCalled();
    fixture.componentRef.setInput('asOfDate', '2026-11-14');
    await fixture.whenStable();
    await page.confirmGap({ ...gap, undecidable: { reason: '无法解析' } });
    expect(service.confirmMap).not.toHaveBeenCalled();
  });
});
