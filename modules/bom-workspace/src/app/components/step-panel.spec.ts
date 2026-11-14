import type { RequirementLine } from '@aiao/rxdb-plugin-bom';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { StepPanel, type RequirementCalculationBasis } from './step-panel';

describe('所选物料的数量计算说明', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('未关联工序表示本步无需调整，不误报功能未交付', async () => {
    const line: RequirementLine = {
      path: ['part'],
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
    };
    const fixture = TestBed.createComponent(StepPanel);
    fixture.componentRef.setInput('line', line);
    fixture.componentRef.setInput(
      'itemNos',
      new Map([
        ['part', 'B-01'],
        ['wire', 'WH-01']
      ])
    );
    fixture.componentRef.setInput('penetrations', [
      {
        path: ['wire'],
        occurrenceId: 'wire-line',
        childItemId: 'wire',
        revisionId: 'wire-a',
        source: 'revision',
        converted: { value: '2', uom: 'pcs' },
        childPlanned: { value: '2', uom: 'pcs' }
      }
    ]);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).not.toContain('未交付');
    expect(root.querySelector('[data-step="5. G″"]')?.textContent).toMatch(/无需.*调整|无.*工序/);
    expect(root.querySelector('[data-step="7. 需求"] [data-value]')?.getAttribute('data-value')).toBe('2');
    expect(root.querySelector('[data-step=penetration]')?.textContent).toMatch(/[\u4e00-\u9fff]+（WH-01）/);
  });
});

describe('数量系数与来源的只读展示', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('阶梯说明使用损耗前计划量与原命中区间，不用损耗后数量重新选档', async () => {
    const line: RequirementLine = {
      path: ['tier-occurrence'],
      itemId: 'part',
      revisionId: 'part-a',
      qty: '45',
      uom: 'pcs',
      steps: {
        planned: { value: '10', uom: 'pcs' },
        assemblyScrapped: { value: '15', uom: 'pcs' },
        gross: { value: '45', uom: 'pcs' },
        componentScrapped: { value: '45', uom: 'pcs' },
        operationScrapped: null,
        converted: { value: '45', uom: 'pcs' },
        phantom: { value: false, source: 'revision', revisionId: 'part-a' }
      }
    };
    const fixture = TestBed.createComponent(StepPanel);
    fixture.componentRef.setInput('line', line);
    fixture.componentRef.setInput('itemNos', new Map([['part', 'PCBA']]));
    fixture.componentRef.setInput('basis', {
      headerId: 'header-tier',
      occurrenceId: 'tier-occurrence',
      baseQty: '1',
      baseUom: 'pcs',
      assemblyScrap: '0.5',
      assemblyScrapConvention: 'additive',
      qty: '3',
      qtyFormula: null,
      isFixedQty: false,
      componentScrap: '0',
      componentScrapConvention: 'additive',
      componentScrapFixed: '0',
      occurrenceUom: 'pcs',
      occurrenceUomConversion: null,
      itemUomConversion: null,
      stockUom: 'pcs',
      uomDecimals: 0,
      tierGroupNo: 'batch-A',
      lotsizeFrom: '10',
      lotsizeTo: '15'
    });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const gross = root.querySelector('[data-step="3. G"]');

    expect(gross?.textContent).toContain('损耗前计划量 P=10 pcs');
    expect(gross?.textContent).toContain('阶梯组 batch-A');
    expect(gross?.textContent).toContain('命中 [10, 15)');
    expect(gross?.querySelector('[data-value]')?.getAttribute('data-value')).toBe('45');
  });

  it('按传入的真实系数说明七步，不用它们重算或覆盖领域返回的中间量', async () => {
    const line: RequirementLine = {
      path: ['occ-42'],
      itemId: 'part',
      revisionId: 'part-a',
      qty: '18.7654321',
      uom: 'pcs',
      steps: {
        planned: { value: '10', uom: 'set' },
        assemblyScrapped: { value: '10.1', uom: 'set' },
        gross: { value: '15.15', uom: 'box' },
        componentScrapped: { value: '17.25', uom: 'box' },
        operationScrapped: { value: '18.5', uom: 'box' },
        converted: { value: '18.7654321', uom: 'pcs' },
        phantom: { value: false, source: 'override', revisionId: 'part-a' }
      }
    };
    const basis: RequirementCalculationBasis = {
      headerId: 'header-17',
      occurrenceId: 'occ-42',
      baseQty: '2',
      baseUom: 'set',
      assemblyScrap: '0.01',
      assemblyScrapConvention: 'additive',
      qty: '3',
      qtyFormula: null,
      isFixedQty: false,
      componentScrap: '0.02',
      componentScrapConvention: 'yield',
      componentScrapFixed: '0.5',
      occurrenceUom: 'box',
      occurrenceUomConversion: '12',
      itemUomConversion: null,
      stockUom: 'pcs',
      uomDecimals: 3,
      operations: [{ operationSeq: 20, scrap: '0.03', scrapConvention: 'yield' }]
    };
    const fixture = TestBed.createComponent(StepPanel);
    fixture.componentRef.setInput('line', line);
    fixture.componentRef.setInput('basis', basis);
    fixture.componentRef.setInput('itemNos', new Map([['part', 'PCBA']]));
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('0.01');
    expect(root.textContent).toContain('0.02');
    expect(root.textContent).toContain('0.5');
    expect(root.textContent).toContain('header-17');
    expect(root.textContent).toContain('occ-42');
    expect(root.querySelector('[data-step="3. G"]')?.textContent).toMatch(/3.*2/s);
    expect(root.querySelector('[data-step="5. G″"]')?.textContent).toMatch(/20.*0.03/s);
    const conversion = root.querySelector('[data-step="6. D"]')?.textContent;
    expect(conversion).toContain('12');
    expect(conversion).toContain('发生项换算率');
    expect(root.querySelector('[data-step="7. 需求"] [data-value]')?.getAttribute('data-value')).toBe('18.7654321');
  });
});
