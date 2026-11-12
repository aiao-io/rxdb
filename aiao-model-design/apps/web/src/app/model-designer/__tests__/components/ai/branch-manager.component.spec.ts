import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { BranchManagerComponent, type BranchItem } from '../../../components/ai/branch-manager.component';
import { DEFAULT_TRANSLATIONS, MODEL_DESIGNER_TRANSLATIONS } from '../../../i18n/translations';
import type { BranchDiff } from '../../../services/ai-branch.service';

function createComponent(branches: BranchItem[] = [], currentBranchId = 'main') {
  TestBed.configureTestingModule({
    providers: [{ provide: MODEL_DESIGNER_TRANSLATIONS, useValue: signal(DEFAULT_TRANSLATIONS) }]
  });
  const comp = TestBed.runInInjectionContext(() => new BranchManagerComponent());
  Object.defineProperty(comp, 'branches', { value: signal(branches), writable: false });
  Object.defineProperty(comp, 'currentBranchId', { value: signal(currentBranchId), writable: false });
  return comp;
}

const BRANCHES: BranchItem[] = [
  { id: 'main', parentId: null },
  { id: 'ai-model1-123', parentId: 'main' }
];

const DIFF: BranchDiff = {
  added: [{ type: 'entity', name: 'User', entityId: 'User' }],
  modified: [{ type: 'property', name: 'email', entityId: 'User' }],
  deleted: []
};

describe('BranchManagerComponent', () => {
  it('should expose branches input', () => {
    const comp = createComponent(BRANCHES);
    expect(comp.branches()).toHaveLength(2);
  });

  it('should expose currentBranchId', () => {
    const comp = createComponent(BRANCHES, 'main');
    expect(comp.currentBranchId()).toBe('main');
  });

  it('should expose branchDiff input', () => {
    const comp = createComponent(BRANCHES, 'ai-model1-123');
    Object.defineProperty(comp, 'branchDiff', { value: signal(DIFF), writable: false });
    expect(comp.branchDiff()).toEqual(DIFF);
  });

  it('should emit switchBranch', () => {
    const comp = createComponent(BRANCHES);
    const spy = vi.fn();
    comp.switchBranch.subscribe(spy);
    comp.switchBranch.emit('ai-model1-123');
    expect(spy).toHaveBeenCalledWith('ai-model1-123');
  });

  it('should emit compareBranch', () => {
    const comp = createComponent(BRANCHES);
    const spy = vi.fn();
    comp.compareBranch.subscribe(spy);
    comp.compareBranch.emit('ai-model1-123');
    expect(spy).toHaveBeenCalledWith('ai-model1-123');
  });

  it('should emit confirmMerge', () => {
    const comp = createComponent(BRANCHES, 'ai-model1-123');
    const spy = vi.fn();
    comp.confirmMerge.subscribe(spy);
    comp.confirmMerge.emit();
    expect(spy).toHaveBeenCalled();
  });

  it('should emit discardChanges', () => {
    const comp = createComponent(BRANCHES, 'ai-model1-123');
    const spy = vi.fn();
    comp.discardChanges.subscribe(spy);
    comp.discardChanges.emit();
    expect(spy).toHaveBeenCalled();
  });
});
