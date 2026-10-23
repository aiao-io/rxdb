import type { CostRollupResult, ExplosionResult, RequirementLine } from '@aiao/rxdb-plugin-bom';
import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BomDemoService } from '../../bom-demo.service';
import { BomWorkspaceState, type BomWorkspaceContext } from '../../bom-workspace-state';
import type { RequirementCalculationBasis } from '../../components/step-panel';
import type { BomChangeReview } from '../../presentation/change-review';
import { ReviewPage } from './review.page';

const context: BomWorkspaceContext = {
  rootKey: 'SC-100',
  asOfDate: '2026-10-01',
  plannedQty: '10',
  plannedUom: 'pcs',
  unit: 137,
  lot: '',
  alternativeNo: null,
  configSelection: { 颜色: ['红'] },
  substituteSelections: {}
};
const line = (qty: string): RequirementLine => ({
  itemId: 'resistor',
  revisionId: 'resistor-a',
  path: ['resistor-occurrence'],
  qty,
  uom: 'pcs',
  steps: {
    planned: { value: '10', uom: 'pcs' },
    assemblyScrapped: { value: '10', uom: 'pcs' },
    gross: { value: qty, uom: 'pcs' },
    componentScrapped: { value: qty, uom: 'pcs' },
    operationScrapped: null,
    converted: { value: qty, uom: 'pcs' },
    phantom: { value: false, source: 'revision', revisionId: 'resistor-a' }
  }
});
const explosion = (date: string, qty: string): ExplosionResult => ({
  manifest: {
    context: { bomType: 'ebom', orgId: 'org-x', asOfDate: new Date(date) },
    parentItemId: 'scooter',
    parentRevisionId: 'scooter-a',
    headerIds: ['scooter-head'],
    occurrenceIds: ['resistor-occurrence'],
    conversions: [],
    formulaGrammarVersion: '1',
    algorithmVersion: '1',
    unresolved: []
  },
  requirementLines: [line(qty)],
  outputs: [],
  penetrations: [],
  unresolved: [],
  truncated: null
});
const cost = (date: string, amount: string): CostRollupResult => ({
  context: { bomType: 'ebom', orgId: 'org-x', asOfDate: new Date(date), rateDate: new Date(date), currency: 'CNY' },
  root: {
    headerId: 'scooter-head',
    itemId: 'scooter',
    batchQty: '10',
    baseUom: 'pcs',
    costLotQty: '1',
    batchCost: amount,
    unitCost: '41',
    material: [],
    processing: [],
    overhead: '0',
    overheadReason: '无路线',
    credits: [],
    children: []
  }
});
const review = (): BomChangeReview => ({
  ecnId: 'ecn-014',
  ecnNo: 'ECN-2026-014',
  beforeDate: '2026-09-30',
  afterDate: '2026-10-01',
  context,
  before: { explosion: explosion('2026-09-30', '20'), cost: cost('2026-09-30', '410') },
  after: { explosion: explosion('2026-10-01', '30'), cost: cost('2026-10-01', '421.25') },
  changes: [
    {
      key: 'resistor:pcs',
      itemId: 'resistor',
      uom: 'pcs',
      beforeQty: '20',
      afterQty: '30',
      delta: '10',
      kind: 'changed',
      beforeLines: [line('20')],
      afterLines: [line('30')]
    }
  ],
  costDelta: '11.25',
  revisions: {
    'scooter-a': { revisionNo: 'A', effectiveFrom: '2026-01-01' },
    'resistor-a': { revisionNo: 'A', effectiveFrom: '2026-01-01' }
  },
  impact: {
    ecnId: 'ecn-014',
    ecnNo: 'ECN-2026-014',
    state: 'released',
    effectiveDate: new Date('2026-10-01'),
    affectedItemIds: ['scooter'],
    topItems: [{ itemId: 'scooter', paths: [[]] }]
  },
  diff: { ecnId: 'ecn-014', ecnNo: 'ECN-2026-014', effectiveDate: new Date('2026-10-01'), headers: [] }
});
const makeService = () => ({
  ready: signal(true),
  resetting: signal(false),
  dataEpoch: signal(0),
  dataRevision: signal(0),
  itemNos: signal(
    new Map([
      ['scooter', 'SC-100'],
      ['resistor', 'R10K']
    ])
  ),
  ecns: signal(new Map([['ecn-014', { ecnNo: 'ECN-2026-014', state: 'released', effectiveDate: '2026-10-01' }]])),
  reviewChange: vi
    .fn<(id: string, value: BomWorkspaceContext) => Promise<BomChangeReview>>()
    .mockResolvedValue(review()),
  readCalculationBasis: vi.fn<(value: RequirementLine) => Promise<RequirementCalculationBasis>>().mockResolvedValue({
    headerId: 'scooter-head',
    occurrenceId: 'resistor-occurrence',
    baseQty: '1',
    baseUom: 'pcs',
    assemblyScrap: '0',
    assemblyScrapConvention: 'additive',
    qty: '2',
    qtyFormula: null,
    isFixedQty: false,
    componentScrap: '0',
    componentScrapConvention: 'additive',
    componentScrapFixed: '0',
    occurrenceUom: 'pcs',
    occurrenceUomConversion: null,
    itemUomConversion: null,
    stockUom: 'pcs',
    uomDecimals: 0
  })
});
const mount = async (service = makeService()) => {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: BomDemoService, useValue: service },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ ecn: 'ecn-014' }) } } }
    ]
  });
  const workspace = TestBed.inject(BomWorkspaceState);
  workspace.update(structuredClone(context));
  const fixture = TestBed.createComponent(ReviewPage);
  await fixture.whenStable();
  return { fixture, service, workspace };
};
const find = <T extends HTMLElement>(fixture: ComponentFixture<ReviewPage>, id: string): T => {
  const result = (fixture.nativeElement as HTMLElement).querySelector<T>(`[data-testid="${id}"]`);
  expect(result, `缺少可操作的 ${id}`).not.toBeNull();
  return result!;
};
const run = async (fixture: ComponentFixture<ReviewPage>) => {
  find<HTMLButtonElement>(fixture, 'review-run').click();
  await fixture.whenStable();
};
const confirm = async (fixture: ComponentFixture<ReviewPage>) => {
  find<HTMLInputElement>(fixture, 'review-ack').click();
  await fixture.whenStable();
  find<HTMLButtonElement>(fixture, 'review-complete').click();
  await fixture.whenStable();
};

afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('生产改版核对的决策流程', () => {
  it('计算和人工确认后把键盘焦点移到当前结果，完成操作的结论立即可见', async () => {
    const { fixture } = await mount();
    await run(fixture);
    expect(document.activeElement?.id).toBe('review-result-title');
    await confirm(fixture);
    expect(document.activeElement?.id).toBe('review-conclusion-title');
  });

  it('从真实计划条件计算并显示未舍入的前后成本与差额，确认前没有完成结论', async () => {
    const { fixture, service } = await mount();
    await run(fixture);
    expect(service.reviewChange).toHaveBeenCalledWith('ecn-014', context);
    expect(find(fixture, 'review-before-cost').getAttribute('data-amount')).toBe('410');
    expect(find(fixture, 'review-after-cost').getAttribute('data-amount')).toBe('421.25');
    expect(find(fixture, 'review-cost-delta').getAttribute('data-amount')).toBe('11.25');
    expect(find<HTMLButtonElement>(fixture, 'review-complete').disabled).toBe(true);
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid=review-conclusion]')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('10kΩ 电阻');
  });

  it('人工核对后才生成结论，修改批量使旧结论待更新且禁用下载', async () => {
    const { fixture, workspace } = await mount();
    await run(fixture);
    await confirm(fixture);
    expect(find(fixture, 'review-conclusion').textContent).toContain('已完成用料与成本核对');
    expect(find<HTMLButtonElement>(fixture, 'review-download').disabled).toBe(false);
    workspace.plannedQty.set('20');
    await fixture.whenStable();
    expect(find(fixture, 'review-stale').textContent).toContain('重新核对');
    expect(find<HTMLButtonElement>(fixture, 'review-download').disabled).toBe(true);
    expect(find<HTMLInputElement>(fixture, 'review-ack').checked).toBe(false);
  });

  it('重新计算后必须再次确认，不能沿用上一份核对结论', async () => {
    const { fixture, workspace, service } = await mount();
    await run(fixture);
    await confirm(fixture);
    workspace.plannedQty.set('20');
    service.reviewChange.mockResolvedValue({ ...review(), context: { ...context, plannedQty: '20' } });
    await fixture.whenStable();
    await run(fixture);
    expect(find<HTMLInputElement>(fixture, 'review-ack').checked).toBe(false);
    expect(find<HTMLButtonElement>(fixture, 'review-complete').disabled).toBe(true);
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid=review-download]')).toBeNull();
  });

  it('缺价或未裁决导致核对失败时保留输入，提供重试而不显示成功结论', async () => {
    const service = makeService();
    service.reviewChange.mockRejectedValue(new Error('电池管理板缺少成本，无法完成核对'));
    const { fixture } = await mount(service);
    await run(fixture);
    expect(find(fixture, 'review-error').textContent).toContain('缺少成本');
    expect(find<HTMLInputElement>(fixture, 'review-qty').value).toBe('10');
    expect(find<HTMLButtonElement>(fixture, 'review-run').disabled).toBe(false);
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid=review-conclusion]')).toBeNull();
  });

  it('在途条件改变后晚返回结果不冒充当前计划的核对结果', async () => {
    const service = makeService();
    let resolve: (result: BomChangeReview) => void = () => undefined;
    service.reviewChange.mockReturnValue(
      new Promise(done => {
        resolve = done;
      })
    );
    const { fixture, workspace } = await mount(service);
    find<HTMLButtonElement>(fixture, 'review-run').click();
    await fixture.whenStable();
    workspace.plannedQty.set('20');
    await fixture.whenStable();
    resolve(review());
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid=review-before-cost]')).toBeNull();
    expect(find<HTMLButtonElement>(fixture, 'review-run').disabled).toBe(false);
  });

  it('数据写入后旧结果必须重验，重置后清除旧核对结果', async () => {
    const { fixture, service } = await mount();
    await run(fixture);
    await confirm(fixture);
    service.dataRevision.update(value => value + 1);
    await fixture.whenStable();
    expect(find<HTMLButtonElement>(fixture, 'review-download').disabled).toBe(true);
    service.ready.set(false);
    service.dataEpoch.update(value => value + 1);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid=review-conclusion]')).toBeNull();
    expect(find<HTMLButtonElement>(fixture, 'review-run').disabled).toBe(true);
  });

  it('非法计划量不会发起核对请求', async () => {
    const { fixture, workspace, service } = await mount();
    workspace.plannedQty.set('-1');
    await fixture.whenStable();
    await run(fixture);
    expect(service.reviewChange).not.toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('大于 0');
  });

  it('展开使用路径时加载真实系数，能够核对单件用量与头基准量', async () => {
    const { fixture, service } = await mount();
    await run(fixture);
    const details = (fixture.nativeElement as HTMLElement).querySelector<HTMLDetailsElement>('.path-evidence')!;
    expect(details).not.toBeNull();
    details.open = true;
    details.dispatchEvent(new Event('toggle'));
    await fixture.whenStable();
    expect(service.readCalculationBasis).toHaveBeenCalledWith(line('20'));
    expect(details.querySelector('[data-step="3. G"] .source')?.textContent).toContain('2 pcs');
    expect(details.querySelector('[data-step="3. G"] .source')?.textContent).toContain('基准量 1 pcs');
  });

  it('旧结果失效后的成本下钻仍绑定原核对计划，不能混入新批量', async () => {
    const { fixture, workspace } = await mount();
    await run(fixture);
    workspace.plannedQty.set('20');
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    Array.from(root.querySelectorAll<HTMLButtonElement>('.review-tabs button'))
      .find(button => button.textContent?.includes('成本来源'))!
      .click();
    await fixture.whenStable();
    const link = Array.from(root.querySelectorAll<HTMLAnchorElement>('a')).find(anchor =>
      anchor.textContent?.includes('查看改版前完整成本')
    )!;
    const url = new URL(link.href, 'http://localhost');
    expect(url.searchParams.get('qty')).toBe('10');
    expect(url.searchParams.get('date')).toBe('2026-09-30');
    expect(url.searchParams.get('ecn')).toBe('ecn-014');
  });

  it('共享链接恢复的变更单与选择框一致，改选后编辑数量仍保留同一核对对象', async () => {
    const { fixture, workspace, service } = await mount();
    service.ecns.update(
      rows => new Map([...rows, ['ecn-next', { ecnNo: 'ECN-NEXT', state: 'released', effectiveDate: '2026-11-01' }]])
    );
    workspace.restore({ ecn: 'ecn-next' });
    await fixture.whenStable();
    expect(find<HTMLSelectElement>(fixture, 'review-ecn').value).toBe('ecn-next');
    workspace.plannedQty.set('20');
    await fixture.whenStable();
    expect(workspace.queryParams()['ecn']).toBe('ecn-next');
    expect(find<HTMLSelectElement>(fixture, 'review-ecn').value).toBe('ecn-next');
  });

  it('同量换修订的页面与下载保留前后真实版本和需求路径', async () => {
    const service = makeService();
    const value = review();
    value.after.explosion.requirementLines = [{ ...line('20'), revisionId: 'resistor-b' }];
    value.changes[0] = {
      ...value.changes[0],
      afterQty: '20',
      delta: '0',
      afterLines: value.after.explosion.requirementLines
    };
    value.revisions['resistor-b'] = { revisionNo: 'B', effectiveFrom: '2026-10-01' };
    service.reviewChange.mockResolvedValue(value);
    let exported: Blob | undefined;
    const createObjectURL = vi.fn((blob: Blob) => {
      exported = blob;
      return 'blob:review';
    });
    const revokeObjectURL = vi.fn();
    vi.stubGlobal(
      'URL',
      new Proxy(URL, {
        get(target, key, receiver) {
          if (key === 'createObjectURL') return createObjectURL;
          if (key === 'revokeObjectURL') return revokeObjectURL;
          return Reflect.get(target, key, receiver);
        }
      })
    );
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const { fixture } = await mount(service);
    await run(fixture);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('修订变化');
    const labels = (fixture.nativeElement as HTMLElement).querySelectorAll('.path-revision');
    expect(labels[0].textContent).toContain('A · 生效 2026-01-01');
    expect(labels[1].textContent).toContain('B · 生效 2026-10-01');
    await confirm(fixture);
    find<HTMLButtonElement>(fixture, 'review-download').click();
    expect(exported).toBeDefined();
    const report = JSON.parse(await exported!.text()) as {
      context: BomWorkspaceContext;
      revisions: Record<string, { revisionNo: string }>;
      changeRows: {
        itemId: string;
        beforeLines: { revisionId: string; path: string[] }[];
        afterLines: { revisionId: string; path: string[] }[];
      }[];
    };
    expect(report.context.plannedQty).toBe('10');
    expect(report.revisions['resistor-a'].revisionNo).toBe('A');
    expect(report.revisions['resistor-b'].revisionNo).toBe('B');
    expect(report.changeRows[0]).toMatchObject({
      itemId: 'resistor',
      beforeLines: [{ revisionId: 'resistor-a', path: ['resistor-occurrence'] }],
      afterLines: [{ revisionId: 'resistor-b', path: ['resistor-occurrence'] }]
    });
  });

  it('主动取消人工确认后撤回完成状态，重新确认后才能再次生成结论', async () => {
    const { fixture } = await mount();
    await run(fixture);
    await confirm(fixture);
    find<HTMLInputElement>(fixture, 'review-ack').click();
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid=review-conclusion]')).toBeNull();
    expect(find<HTMLButtonElement>(fixture, 'review-complete').disabled).toBe(true);
    await confirm(fixture);
    expect(find<HTMLButtonElement>(fixture, 'review-download').disabled).toBe(false);
  });
});
