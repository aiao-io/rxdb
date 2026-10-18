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

  it('页面只有一个主标题，配置、文件交换和异常校验默认折叠', async () => {
    const fixture = await mount();
    const root = element(fixture);

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
    const row = root.querySelector<HTMLElement>('.requirement-row[data-item="B-01"]');
    expect(row).not.toBeNull();
    row!.click();
    await fixture.whenStable();
    expect(root.querySelector('[data-step="7. 需求"] [data-value]')?.getAttribute('data-value')).toBe('2');
    expect(root.querySelector('[data-testid=selected-material]')?.textContent).toContain('B-01');
  });

  it('查询失败清除旧结构并显示有精确原因的错误反馈', async () => {
    const service = makeService();
    const fixture = await mount(service);
    await fixture.componentInstance.runExplode();
    await fixture.whenStable();
    expect(element(fixture).querySelectorAll('.requirement-row')).toHaveLength(1);
    service.explode.mockRejectedValue(new Error('rxdb:bom_cycle:SC-100'));

    await fixture.componentInstance.runExplode();
    await fixture.whenStable();

    expect(element(fixture).querySelectorAll('.requirement-row')).toHaveLength(0);
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
