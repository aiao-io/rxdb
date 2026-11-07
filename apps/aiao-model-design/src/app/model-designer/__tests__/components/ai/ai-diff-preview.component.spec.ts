import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { AiDiffPreviewComponent } from '../../../components/ai/ai-diff-preview.component';
import { DEFAULT_TRANSLATIONS, MODEL_DESIGNER_TRANSLATIONS } from '../../../i18n/translations';
import type { ChatChangeProposal } from '../../../types/ai-schemas';

function createComponent(proposal?: ChatChangeProposal) {
  TestBed.configureTestingModule({
    providers: [{ provide: MODEL_DESIGNER_TRANSLATIONS, useValue: signal(DEFAULT_TRANSLATIONS) }]
  });
  const comp = TestBed.runInInjectionContext(() => new AiDiffPreviewComponent());
  if (proposal) {
    Object.defineProperty(comp, 'proposal', { value: signal(proposal), writable: false });
  }
  return comp;
}

const USER_ENTITY_ID = '11111111-1111-4111-8111-111111111111';
const ORDER_ENTITY_ID = '22222222-2222-4222-8222-222222222222';

const MOCK_PROPOSAL: ChatChangeProposal = {
  description: '增加用户和订单实体',
  changes: [
    { action: 'addEntity', entityId: USER_ENTITY_ID, entityName: 'User', details: {} },
    {
      action: 'addProperty',
      entityId: USER_ENTITY_ID,
      entityName: 'User',
      details: { name: 'email', propertyType: 'string' }
    },
    { action: 'modifyEntity', entityId: ORDER_ENTITY_ID, entityName: 'Order', details: { displayName: '订单' } },
    { action: 'removeProperty', entityId: ORDER_ENTITY_ID, entityName: 'Order', details: { name: 'legacy' } }
  ]
};

describe('AiDiffPreviewComponent', () => {
  it('should group changes by entity', () => {
    const comp = createComponent(MOCK_PROPOSAL);
    const groups = comp.groups();
    expect(groups).toHaveLength(2);
    expect(groups[0].entityName).toBe('User');
    expect(groups[0].changes).toHaveLength(2);
    expect(groups[1].entityName).toBe('Order');
  });

  it('should assign added kind to addEntity', () => {
    const comp = createComponent(MOCK_PROPOSAL);
    const userGroup = comp.groups().find(g => g.entityName === 'User');
    expect(userGroup?.kind).toBe('added');
  });

  it('should merge kinds to modified when mixed', () => {
    const comp = createComponent(MOCK_PROPOSAL);
    const orderGroup = comp.groups().find(g => g.entityName === 'Order');
    // modifyEntity + removeProperty → mixed → modified
    expect(orderGroup?.kind).toBe('modified');
  });

  it('should return empty groups for no proposal', () => {
    const comp = createComponent();
    expect(comp.groups()).toHaveLength(0);
  });

  it('should return correct border class for each kind', () => {
    const comp = createComponent(MOCK_PROPOSAL);
    expect(comp['borderClass']('added')).toContain('success');
    expect(comp['borderClass']('modified')).toContain('warning');
    expect(comp['borderClass']('removed')).toContain('error');
  });

  it('should return correct text class for each kind', () => {
    const comp = createComponent(MOCK_PROPOSAL);
    expect(comp['textClass']('added')).toContain('success');
    expect(comp['textClass']('removed')).toContain('error');
  });

  it('should generate detail summaries', () => {
    const comp = createComponent(MOCK_PROPOSAL);
    const propChange = MOCK_PROPOSAL.changes[1];
    expect(comp['detailSummary'](propChange)).toBe('email');
  });
});
