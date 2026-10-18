import type { RequirementLine } from '@aiao/rxdb-plugin-bom';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { StepPanel } from './step-panel';

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
    fixture.componentRef.setInput('itemNos', new Map([['part', 'B-01']]));
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).not.toContain('未交付');
    expect(root.querySelector('[data-step="5. G″"]')?.textContent).toMatch(/无需.*调整|无.*工序/);
    expect(root.querySelector('[data-step="7. 需求"] [data-value]')?.getAttribute('data-value')).toBe('2');
  });
});
