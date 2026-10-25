import type { ExplosionResult, RequirementLine } from '@aiao/rxdb-plugin-bom';
import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BomDemoService } from '../../bom-demo.service';
import { ExplosionPage } from './explosion.page';

const requirement = (): RequirementLine => ({
  path: ['line-1'],
  itemId: 'part',
  revisionId: 'part-a',
  qty: '2',
  uom: 'pcs',
  steps: {
    planned: { value: '1', uom: 'pcs' },
    assemblyScrapped: { value: '1', uom: 'pcs' },
    gross: { value: '2', uom: 'pcs' },
    componentScrapped: { value: '2', uom: 'pcs' },
    operationScrapped: null,
    converted: { value: '2', uom: 'pcs' },
    phantom: { value: false, source: 'revision', revisionId: 'part-a' }
  }
});

const result = (lines: RequirementLine[] = [requirement()]): ExplosionResult => ({
  manifest: {
    context: { bomType: 'ebom', orgId: 'org-x', asOfDate: new Date('2026-09-22') },
    parentItemId: 'root',
    parentRevisionId: 'root-a',
    headerIds: ['header'],
    occurrenceIds: ['line-1'],
    conversions: [],
    formulaGrammarVersion: 'fixture',
    algorithmVersion: 'fixture',
    unresolved: []
  },
  requirementLines: lines,
  outputs: [],
  penetrations: [],
  unresolved: [],
  truncated: null
});

const makeService = () => ({
  ready: signal(true),
  dataEpoch: signal(0),
  dataRevision: signal(0),
  resetting: signal(false),
  importedDrafts: signal([]),
  refreshImportedDrafts: vi.fn().mockResolvedValue(undefined),
  readCalculationBasis: vi.fn().mockResolvedValue(null),
  itemUoms: signal(
    new Map([
      ['SC-100', 'pcs'],
      ['B-01', 'pcs'],
      ['JOINT-MAIN', 'kg'],
      ['WIRE', 'm']
    ])
  ),
  itemNos: signal(
    new Map([
      ['root', 'SC-100'],
      ['part', 'B-01']
    ])
  ),
  designators: signal(new Map<string, string[]>()),
  explode: vi.fn<() => Promise<ExplosionResult>>().mockResolvedValue(result())
});

const mount = async (service = makeService()) => {
  TestBed.configureTestingModule({ providers: [{ provide: BomDemoService, useValue: service }, provideRouter([])] });
  const fixture = TestBed.createComponent(ExplosionPage);
  await fixture.whenStable();
  return fixture;
};

const element = (fixture: ComponentFixture<ExplosionPage>): HTMLElement => fixture.nativeElement as HTMLElement;

describe('整机展开的主任务流程', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('修改计划量后保留旧结果并明确标记待更新，不能导出未核对的新结构', async () => {
    const fixture = await mount();
    await fixture.componentInstance.runExplode();
    await fixture.whenStable();
    fixture.componentInstance.plannedQty.set('20');
    await fixture.whenStable();

    expect(element(fixture).querySelector('[data-testid=result-stale]')?.textContent).toContain('条件已修改');
    expect(element(fixture).querySelector<HTMLButtonElement>('[data-testid=export-bom]')?.disabled).toBe(true);
    expect(element(fixture).querySelectorAll('.requirement-row')).toHaveLength(1);
  });

  it('重置期间晚返回的展开不能写回旧结构', async () => {
    const service = makeService();
    let finish: (value: ExplosionResult) => void = () => undefined;
    service.explode.mockReturnValue(
      new Promise(resolve => {
        finish = resolve;
      })
    );
    const fixture = await mount(service);
    const running = fixture.componentInstance.runExplode();
    service.dataEpoch.update(value => value + 1);
    service.ready.set(false);
    await fixture.whenStable();
    finish(result());
    await running;
    await fixture.whenStable();

    expect(element(fixture).querySelectorAll('.requirement-row')).toHaveLength(0);
    expect(fixture.componentInstance.busy()).toBe(false);
  });

  it('页面只有一个主标题，配置、文件交换和异常校验默认折叠', async () => {
    const fixture = await mount();
    const root = element(fixture);

    const option = root.querySelector<HTMLOptionElement>('[data-testid=root-select] option[value="SC-100"]');
    expect(option?.textContent).toBe('电动滑板车（SC-100）');
    expect(option?.value).toBe('SC-100');

    expect(root.querySelectorAll('h1')).toHaveLength(1);
    expect(root.querySelector('h1')?.textContent).toBe('整机展开');
    const advanced = Array.from(root.querySelectorAll<HTMLDetailsElement>('details[data-testid=explosion-more]'));
    expect(advanced).toHaveLength(3);
    expect(advanced.every(detail => !detail.open)).toBe(true);
    expect(advanced.map(detail => detail.querySelector('summary')?.textContent?.trim())).toEqual([
      '按产品配置展开',
      '导入与导出',
      '异常校验示例'
    ]);
  });

  it('展开期间显示加载反馈，成功后按行选择查看计算依据', async () => {
    const service = makeService();
    let finish: (value: ExplosionResult) => void = () => undefined;
    const pending = new Promise<ExplosionResult>(resolve => {
      finish = resolve;
    });
    service.explode.mockReturnValue(pending);
    const fixture = await mount(service);
    const root = element(fixture);

    const running = fixture.componentInstance.runExplode();
    fixture.detectChanges();
    const pendingMessage = root.querySelector('[data-testid=explosion-loading]')?.textContent;
    const pendingText = root.textContent;
    finish(result());
    await running;
    await fixture.whenStable();

    expect(pendingMessage).toContain('正在展开');
    expect(pendingText).not.toContain('尚未展开');
    expect(service.explode).toHaveBeenCalledExactlyOnceWith('2026-09-22', '1', 'SC-100', {
      unit: 137,
      plannedUom: 'pcs',
      configSelection: { 颜色: ['红'] }
    });
    const row = root.querySelector<HTMLElement>('.requirement-row[data-item="B-01"]');
    expect(row).not.toBeNull();
    expect(row?.textContent).toContain('合规演示件（B-01）');
    row!.click();
    await fixture.whenStable();
    expect(root.querySelector('[data-step="7. 需求"] [data-value]')?.getAttribute('data-value')).toBe('2');
    expect(root.querySelector('[data-testid=selected-material]')?.textContent).toContain('合规演示件（B-01）');
  });

  it('同名替代组的选择按组 ID 分别传给数量引擎', async () => {
    const service = makeService();
    const fixture = await mount(service);
    for (const groupId of ['group-a', 'group-b']) {
      const request = {
        kind: 'substitute' as const,
        groupId,
        groupCode: 'G1',
        memberKey: groupId === 'group-a' ? 'part-a' : 'part-b'
      };
      await fixture.componentInstance.applyCondition(request);
    }
    expect(service.explode).toHaveBeenLastCalledWith('2026-09-22', '1', 'SC-100', {
      unit: 137,
      plannedUom: 'pcs',
      configSelection: { 颜色: ['红'] },
      substituteSelections: { 'group-a': { memberKey: 'part-a' }, 'group-b': { memberKey: 'part-b' } }
    });
  });

  it('查询失败清除旧结构并显示有精确原因的错误反馈', async () => {
    const service = makeService();
    const fixture = await mount(service);
    await fixture.componentInstance.runExplode();
    await fixture.whenStable();
    expect(element(fixture).querySelectorAll('[data-kind=requirement]')).toHaveLength(1);
    service.explode.mockRejectedValue(new Error('rxdb:bom_cycle:SC-100'));

    await fixture.componentInstance.runExplode();
    await fixture.whenStable();

    expect(element(fixture).querySelectorAll('[data-kind=requirement]')).toHaveLength(0);
    expect(element(fixture).querySelector('[role=alert]')?.textContent).toContain('rxdb:bom_cycle:SC-100');
  });

  it('查询成功但没有需求行时显示结果空态，不再提示尚未展开', async () => {
    const service = makeService();
    service.explode.mockResolvedValue(result([]));
    const fixture = await mount(service);

    await fixture.componentInstance.runExplode();
    await fixture.whenStable();

    expect(element(fixture).querySelector('[data-testid=explosion-empty]')?.textContent).toContain('没有');
    expect(element(fixture).textContent).not.toContain('尚未展开');
  });
});
