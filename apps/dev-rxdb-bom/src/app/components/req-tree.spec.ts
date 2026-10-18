import type { ExplosionResult } from '@aiao/rxdb-plugin-bom';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { ReqTree } from './req-tree';

describe('展开结构的产出分类', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('联产品、副产品和废料分别标识，保留原始数量属性', async () => {
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
      outputs: [
        { path: ['joint'], itemId: 'joint', direction: 'produce', qty: '2', uom: 'kg' },
        { path: ['by-product'], itemId: 'by-product', direction: 'by_product', qty: '3', uom: 'kg' },
        { path: ['scrap'], itemId: 'scrap', direction: 'scrap_out', qty: '4', uom: 'kg' }
      ],
      requirementLines: [],
      penetrations: [],
      unresolved: [],
      truncated: null
    };
    const fixture = TestBed.createComponent(ReqTree);
    fixture.componentRef.setInput('result', result);
    fixture.componentRef.setInput('itemNos', new Map([['joint', 'JOINT-SECOND']]));
    fixture.componentRef.setInput('designators', new Map<string, string[]>());
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('[data-direction=produce]')?.textContent).toContain('联产品');
    expect(root.querySelector('[data-direction=by_product]')?.textContent).toContain('副产品');
    expect(root.querySelector('[data-direction=scrap_out]')?.textContent).toContain('废料');
    expect(root.querySelector('[data-direction=produce] [data-qty]')?.getAttribute('data-qty')).toBe('2');
  });
});
