import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { DEFAULT_TRANSLATIONS, MODEL_DESIGNER_TRANSLATIONS } from '../../../i18n/translations';
import type { BranchDiff } from '../../../services/ai-branch.service';
import { BranchDiffViewComponent } from '../../../components/ai/branch-diff-view.component';

function createComponent(diff?: BranchDiff) {
  TestBed.configureTestingModule({
    providers: [{ provide: MODEL_DESIGNER_TRANSLATIONS, useValue: signal(DEFAULT_TRANSLATIONS) }]
  });
  const comp = TestBed.runInInjectionContext(() => new BranchDiffViewComponent());
  if (diff) {
    Object.defineProperty(comp, 'diff', { value: signal(diff), writable: false });
  }
  return comp;
}

describe('BranchDiffViewComponent', () => {
  it('should group diff items by entity', () => {
    const comp = createComponent({
      added: [
        { type: 'entity', name: 'User' },
        { type: 'property', name: 'email', entityId: 'User' }
      ],
      modified: [{ type: 'property', name: 'age', entityId: 'User' }],
      deleted: []
    });
    const groups = comp.groups();
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe('User');
    expect(groups[0].items).toHaveLength(3);
  });

  it('should return empty groups for no diff', () => {
    const comp = createComponent();
    expect(comp.groups()).toHaveLength(0);
  });

  it('should return empty groups for empty diff', () => {
    const comp = createComponent({ added: [], modified: [], deleted: [] });
    expect(comp.groups()).toHaveLength(0);
  });

  it('should return correct color classes', () => {
    const comp = createComponent({ added: [], modified: [], deleted: [] });
    expect(comp['kindColor']('added')).toContain('success');
    expect(comp['kindColor']('modified')).toContain('warning');
    expect(comp['kindColor']('deleted')).toContain('error');
  });
});
