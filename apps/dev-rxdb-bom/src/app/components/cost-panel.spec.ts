import type { CostNodeDetail, CostRollupResult } from '@aiao/rxdb-plugin-bom';
import { COPRODUCT_DATASET } from '@aiao/rxdb-plugin-bom/testing';
import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { BomDemoService } from '../bom-demo.service';
import { CostPage } from '../pages/cost/cost.page';
import { CostPanel } from './cost-panel';

const LONG_COST = '8.020408163265306122448979591836735';

const node = (overrides: Partial<CostNodeDetail> = {}): CostNodeDetail => ({
  headerId: 'root-header',
  itemId: 'root',
  batchQty: '1',
  baseUom: 'pcs',
  costLotQty: '1',
  batchCost: '104',
  unitCost: '104',
  material: [
    { occurrenceId: 'child-line', childItemId: 'child', demand: '1', demandUom: 'pcs', unitCost: '100', amount: '100' }
  ],
  processing: [
    {
      operationSeq: 10,
      setup: '0',
      run: '1',
      fixed: '0',
      hours: '1',
      timeUom: 'h',
      rateHours: '1',
      rateUom: 'h',
      rate: '3',
      amount: '3'
    }
  ],
  overhead: '2',
  overheadReason: '按工时计',
  credits: [
    { occurrenceId: 'credit-line', childItemId: 'offcut', outQty: '1', outUom: 'pcs', creditPrice: '1', amount: '1' }
  ],
  children: [],
  ...overrides
});

const result = (root: CostNodeDetail = node()): CostRollupResult => ({
  context: {
    bomType: 'ebom',
    orgId: 'org-x',
    asOfDate: new Date('2026-10-15T00:00:00Z'),
    currency: 'CNY',
    rateDate: new Date('2026-10-15T00:00:00Z')
  },
  root
});

const serviceDouble = (value: CostRollupResult = result()) => ({
  ready: signal(true),
  dataEpoch: signal(0),
  dataRevision: signal(0),
  resetting: signal(false),
  itemUoms: signal(
    new Map([
      ['SC-100', 'pcs'],
      ['COST-DEMO', 'pcs'],
      ['JOINT-MAIN', 'kg'],
      ['JOINT-CONSUMER', 'kg']
    ])
  ),
  itemNos: signal(
    new Map([
      ['root', 'SC-100'],
      ['child', 'PCBA'],
      ['offcut', 'OFFCUT']
    ])
  ),
  rollup: vi.fn<BomDemoService['rollup']>().mockResolvedValue(value),
  loadCoproductDemo: vi.fn<BomDemoService['loadCoproductDemo']>().mockResolvedValue(undefined)
});

const mount = async (service: ReturnType<typeof serviceDouble>) => {
  TestBed.configureTestingModule({ providers: [{ provide: BomDemoService, useValue: service }] });
  const fixture = TestBed.createComponent(CostPanel);
  fixture.componentRef.setInput('asOfDate', '2026-10-15');
  await fixture.whenStable();
  return fixture;
};

const element = (fixture: ComponentFixture<unknown>): HTMLElement => fixture.nativeElement as HTMLElement;

const required = <T extends Element>(root: ParentNode, selector: string): T => {
  const found = root.querySelector<T>(selector);
  if (found === null) throw new Error(`缺少可见成本界面元素：${selector}`);
  return found;
};

const click = async (fixture: ComponentFixture<CostPanel>, name: string): Promise<void> => {
  const button = Array.from(element(fixture).querySelectorAll('button')).find(
    button => button.textContent?.trim() === name
  );
  if (button === undefined) throw new Error(`缺少成本操作：${name}`);
  button.click();
  await fixture.whenStable();
};

const text = (root: ParentNode, id: string): string =>
  required(root, `[data-testid="${id}"]`).textContent?.trim() ?? '';

describe('成本结果展示', () => {
  it('物料展示中文名称和编码，选择与成本行继续保留原编码', async () => {
    const service = serviceDouble();
    const fixture = await mount(service);
    const root = element(fixture);
    const select = required<HTMLSelectElement>(root, '[data-testid="cost-root-select"]');
    const option = required<HTMLOptionElement>(select, 'option[value="SC-100"]');

    expect(select.value).toBe('SC-100');
    expect(option.textContent).toMatch(/[\u4e00-\u9fff]+（SC-100）/);
    expect(required<HTMLOptionElement>(select, 'option[value="COST-DEMO"]').textContent).toMatch(
      /[\u4e00-\u9fff]+（COST-DEMO）/
    );

    await click(fixture, '卷算');

    expect(service.rollup).toHaveBeenLastCalledWith('SC-100', '2026-10-15', {
      unit: 137,
      plannedUom: 'pcs',
      configSelection: { 颜色: ['红'] },
      plannedQty: { value: '1', uom: 'pcs' }
    });
    expect(required(root, '.cost-context strong').textContent).toMatch(/[\u4e00-\u9fff]+（SC-100）/);
    expect(required(root, '.cost-row[data-kind="material"][data-item="PCBA"] .label').textContent).toBe(
      '材料 控制板（PCBA）'
    );
  });

  it('根成本先汇总当前层投入，不重复累加子件明细，并保留每行原始金额', async () => {
    const child = node({
      itemId: 'child',
      headerId: 'child-header',
      batchCost: '100',
      unitCost: '100',
      material: [
        { occurrenceId: 'leaf-line', childItemId: 'leaf', demand: '1', demandUom: 'pcs', unitCost: '99', amount: '99' }
      ],
      processing: [
        {
          operationSeq: 20,
          setup: '0',
          run: '1',
          fixed: '0',
          hours: '1',
          timeUom: 'h',
          rateHours: '1',
          rateUom: 'h',
          rate: '1',
          amount: '1'
        }
      ],
      overhead: '0',
      credits: []
    });
    const value = result(node({ children: [child] }));
    const original = structuredClone(value);
    const service = serviceDouble(value);
    const fixture = await mount(service);
    await click(fixture, '卷算');
    const root = element(fixture);

    expect(text(root, 'cost-summary-total')).toBe('CNY 104.00');
    expect(text(root, 'cost-summary-unit')).toBe('CNY 104 / pcs');
    expect(text(root, 'cost-summary-quantity')).toBe('1 pcs');
    expect(text(root, 'cost-summary-material')).toBe('CNY 100.00');
    expect(text(root, 'cost-summary-processing')).toBe('CNY 3.00');
    expect(text(root, 'cost-summary-overhead')).toBe('CNY 2.00');
    expect(text(root, 'cost-summary-credit')).toBe('− CNY 1.00');
    expect(root.textContent).toContain('子件成本已计入材料');
    expect(root.querySelector('table')).not.toBeNull();
    const amount = required<HTMLElement>(root, '.cost-row[data-kind="head"][data-item="SC-100"] [data-amount]');
    expect(amount.getAttribute('data-amount')).toBe('104');
    expect(amount.textContent?.trim()).toBe('104.00');
    expect(amount.closest('td')?.classList.contains('num')).toBe(true);
    expect(value).toEqual(original);
    expect(root.textContent).not.toMatch(/US-\d+|AC#|十进制|kernel|half-even/);
  });

  it('两条虚拟件路径穿透后的相同材料、工序和抵减保留独立行及原值展开状态', async () => {
    const shared = node();
    const value = result(
      node({
        batchCost: '306',
        unitCost: '306',
        material: [shared.material[0], { ...shared.material[0], demand: '2', amount: '200' }],
        processing: [shared.processing[0], { ...shared.processing[0], hours: '2', rateHours: '2', amount: '6' }],
        overhead: '0',
        credits: [shared.credits[0], { ...shared.credits[0], outQty: '2', amount: '2' }]
      })
    );
    const original = structuredClone(value);
    const fixture = await mount(serviceDouble(value));
    await fixture.componentInstance.runRollup();

    const rows = fixture.componentInstance.costRows();
    expect(rows).toHaveLength(7);
    expect(new Set(rows.map(row => row.key)).size).toBe(rows.length);
    await fixture.whenStable();
    const root = element(fixture);
    const amounts = (kind: string): (string | null)[] =>
      Array.from(root.querySelectorAll(`.cost-row[data-kind="${kind}"] [data-amount]`)).map(amount =>
        amount.getAttribute('data-amount')
      );

    expect(amounts('material')).toEqual(['100', '200']);
    expect(amounts('processing')).toEqual(['3', '6']);
    expect(amounts('credit')).toEqual(['-1', '-2']);
    expect(text(root, 'cost-summary-total')).toBe('CNY 306.00');
    const materialDetails = root.querySelectorAll<HTMLDetailsElement>('.cost-row[data-kind="material"] details');
    required<HTMLElement>(materialDetails[0], 'summary').click();
    await fixture.whenStable();
    expect(materialDetails[0].open).toBe(true);
    expect(materialDetails[1].open).toBe(false);
    expect(value).toEqual(original);
  });

  it.each([
    [LONG_COST, '8.02', '8.020408'],
    ['9007199254740993.125', '9,007,199,254,740,993.12', '9,007,199,254,740,993.125'],
    ['-1.235', '-1.24', '-1.235'],
    ['999.995', '1,000.00', '999.995'],
    ['1.2345645', '1.23', '1.234564'],
    ['1.2345655', '1.23', '1.234566'],
    ['0.0000004', '0.00', '0'],
    ['-0.005', '0.00', '-0.005']
  ])('金额 %s 按两位显示，单位成本最多六位，完整原值仍能展开查看', async (raw, money, unit) => {
    const value = result(
      node({ batchCost: raw, unitCost: raw, material: [], processing: [], overhead: '0', credits: [] })
    );
    const fixture = await mount(serviceDouble(value));
    await click(fixture, '卷算');
    const root = element(fixture);
    expect(text(root, 'cost-summary-total')).toBe(`CNY ${money}`);
    expect(text(root, 'cost-summary-unit')).toBe(`CNY ${unit} / pcs`);
    const row = required<HTMLElement>(root, '.cost-row[data-kind="head"][data-item="SC-100"]');
    const amount = required<HTMLElement>(row, '[data-amount]');
    expect(amount.getAttribute('data-amount')).toBe(raw);
    expect(amount.textContent?.trim()).toBe(money);
    const details = required<HTMLDetailsElement>(row, 'details');
    expect(required(details, 'summary').textContent).toContain('原值');
    required<HTMLElement>(details, 'summary').click();
    await fixture.whenStable();
    expect(details.open).toBe(true);
    expect(required(details, 'code').textContent).toContain(raw);
    expect(value.root.batchCost).toBe(raw);
    expect(value.root.unitCost).toBe(raw);
  });

  it('缺成本时清除上一份汇总和明细，显示原始错误而不展示零成本', async () => {
    const service = serviceDouble();
    const fixture = await mount(service);
    await click(fixture, '卷算');
    expect(text(element(fixture), 'cost-summary-total')).toBe('CNY 104.00');
    service.rollup.mockRejectedValueOnce(new Error('物料 COST-MISSING 缺成本，不以 0 兜底'));
    fixture.componentInstance.costRootKey.set('COST-DEMO');
    await fixture.whenStable();
    await click(fixture, '卷算');
    expect(text(element(fixture), 'cost-error')).toContain('COST-MISSING 缺成本');
    expect(element(fixture).querySelector('[data-testid="cost-summary"]')).toBeNull();
    expect(element(fixture).querySelectorAll('.cost-row')).toHaveLength(0);
  });

  it('加工计价依据使用费率对应工时，原始分钟工时仍可查看', async () => {
    const value = result(
      node({
        batchCost: '2',
        unitCost: '2',
        material: [],
        processing: [
          {
            operationSeq: 10,
            setup: '0',
            run: '60',
            fixed: '0',
            hours: '60',
            timeUom: 'min',
            rateHours: '1',
            rateUom: 'h',
            rate: '2',
            amount: '2'
          }
        ],
        overhead: '0',
        credits: []
      })
    );
    const fixture = await mount(serviceDouble(value));
    await click(fixture, '卷算');
    const row = required<HTMLElement>(element(fixture), '.cost-row[data-kind="processing"]');
    expect(required(row, '.cost-basis').textContent).toContain('1 h × 费率 CNY 2 / h');
    const details = required<HTMLDetailsElement>(row, 'details');
    required<HTMLElement>(details, 'summary').click();
    await fixture.whenStable();
    expect(details.open).toBe(true);
    expect(details.textContent).toContain('工时（min）');
    expect(details.textContent).toContain('60');
  });

  it('联合生产保留分配金额，消费联产品继续要求显式生产来源', async () => {
    const value = result(
      node({
        itemId: 'joint-main',
        batchQty: '100',
        baseUom: 'kg',
        batchCost: '132',
        unitCost: '1.32',
        jointCost: {
          netCost: '220',
          outputs: [
            {
              kind: 'primary',
              itemId: 'joint-main',
              revisionId: 'main-revision',
              lineId: null,
              occurrenceId: null,
              lineNo: null,
              qty: '100',
              uom: 'kg',
              share: '0.6',
              batchCost: '132',
              unitCost: '1.32'
            },
            {
              kind: 'coproduct',
              itemId: 'joint-co',
              revisionId: 'co-revision',
              lineId: 'co-line',
              occurrenceId: 'co-occurrence',
              lineNo: 10,
              qty: '50',
              uom: 'kg',
              share: '0.4',
              batchCost: '88',
              unitCost: '1.76'
            }
          ]
        }
      })
    );
    const service = serviceDouble(value);
    service.loadCoproductDemo.mockImplementation(async () => {
      service.itemNos.update(items => new Map([...items, ['joint-main', 'JOINT-MAIN'], ['joint-co', 'JOINT-CO']]));
    });
    const fixture = await mount(service);
    await click(fixture, '装载联产演示');
    await click(fixture, '卷算');
    const root = element(fixture);
    const rootSelect = required<HTMLSelectElement>(root, '[data-testid="cost-root-select"]');
    expect(required(rootSelect, 'option[value="JOINT-MAIN"]').textContent).toMatch(/[\u4e00-\u9fff]+（JOINT-MAIN）/);
    expect(required(rootSelect, 'option[value="JOINT-CONSUMER"]').textContent).toMatch(
      /[\u4e00-\u9fff]+（JOINT-CONSUMER）/
    );
    expect(service.rollup).toHaveBeenLastCalledWith('JOINT-MAIN', '2026-10-15', {
      unit: 137,
      plannedUom: 'kg',
      configSelection: { 颜色: ['红'] },
      plannedQty: { value: '100', uom: 'kg' }
    });
    expect(required(root, '[data-testid="cost-joint-net"] [data-amount]').getAttribute('data-amount')).toBe('220');
    expect(
      required(root, '.cost-row[data-kind="joint-output"][data-item="JOINT-MAIN"] [data-amount]').getAttribute(
        'data-amount'
      )
    ).toBe('132');
    expect(
      required(root, '.cost-row[data-kind="joint-output"][data-item="JOINT-CO"] [data-amount]').getAttribute(
        'data-amount'
      )
    ).toBe('88');
    expect(required(root, '.cost-row[data-kind="joint-output"][data-item="JOINT-CO"] .label').textContent).toMatch(
      /联产品 [\u4e00-\u9fff]+（JOINT-CO）/
    );
    expect(root.textContent).toContain('1.76');

    fixture.componentInstance.costRootKey.set('JOINT-CONSUMER');
    fixture.componentInstance.changeRoot('JOINT-CONSUMER');
    await fixture.whenStable();
    service.rollup.mockRejectedValueOnce(new Error('来源未解析'));
    await click(fixture, '卷算');
    expect(text(root, 'cost-error')).toContain('来源未解析');
    expect(service.rollup).toHaveBeenLastCalledWith('JOINT-CONSUMER', '2026-10-15', {
      unit: 137,
      plannedUom: 'kg',
      configSelection: { 颜色: ['红'] },
      plannedQty: { value: '1', uom: 'kg' }
    });
    const source = required<HTMLSelectElement>(root, '[data-testid="joint-source-select"]');
    expect(required(source, 'option[value="JOINT-MAIN"]').textContent).toMatch(/[\u4e00-\u9fff]+（JOINT-MAIN）/);
    source.value = 'JOINT-MAIN';
    source.dispatchEvent(new Event('change', { bubbles: true }));
    await fixture.whenStable();
    await click(fixture, '卷算');
    expect(service.rollup).toHaveBeenLastCalledWith('JOINT-CONSUMER', '2026-10-15', {
      unit: 137,
      plannedUom: 'kg',
      configSelection: { 颜色: ['红'] },
      plannedQty: { value: '1', uom: 'kg' },
      jointCostSources: { [COPRODUCT_DATASET.ids.coproductRevisionId]: COPRODUCT_DATASET.ids.producerHeaderId }
    });
    expect(root.querySelector('[data-testid="cost-error"]')).toBeNull();
  });

  it('成本页用良率例子解释长小数，保留唯一主标题和评估日控件', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: BomDemoService, useValue: serviceDouble() }] });
    const fixture = TestBed.createComponent(CostPage);
    await fixture.whenStable();
    const root = element(fixture);
    expect(Array.from(root.querySelectorAll('h1')).map(heading => heading.textContent?.trim())).toEqual(['成本卷算']);
    expect(root.textContent).toContain('98%');
    expect(root.textContent).toContain('1 ÷ 0.98');
    expect(root.textContent).not.toMatch(/US-\d+|AC#|十进制|kernel|half-even/);
    expect(required<HTMLInputElement>(root, '[data-testid="as-of-date"]').type).toBe('date');
  });
});
