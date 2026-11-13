import { DialogRef } from '@angular/cdk/dialog';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { VersionManagerDialogComponent } from '../../components/version-manager/version-manager-dialog.component';
import { DEFAULT_TRANSLATIONS, MODEL_DESIGNER_TRANSLATIONS } from '../../i18n/translations';
import { DesignDiffService, type EntitySetDiff } from '../../services/design-diff.service';
import { ModelDesignService } from '../../services/model-design.service';

const DESIGNS = [
  { id: 'd1', name: 'Blog' },
  { id: 'd2', name: 'Blog 副本' }
];

const DIFF: EntitySetDiff = {
  added: [{ name: 'Comment', entityIdA: null, entityIdB: 'e2' }],
  removed: [],
  common: [{ name: 'Post', entityIdA: 'e1a', entityIdB: 'e1b' }]
};

function changeEvent(value: string): Event {
  return { target: { value } } as unknown as Event;
}

/** 无字段差异的属性集对比（共有实体默认不展开） */
const NO_FIELD_DIFF = { added: [], removed: [], changed: [], unchanged: [] };

function createComponent(
  options: {
    rollback?: ReturnType<typeof vi.fn>;
    diffEntitySets?: ReturnType<typeof vi.fn>;
    diffPropertySets?: ReturnType<typeof vi.fn>;
  } = {}
) {
  const closeSpy = vi.fn();
  const rollbackSpy = options.rollback ?? vi.fn().mockResolvedValue(true);
  const diffEntitySetsSpy = options.diffEntitySets ?? vi.fn().mockReturnValue(DIFF);
  const diffPropertySetsSpy = options.diffPropertySets ?? vi.fn().mockReturnValue(NO_FIELD_DIFF);

  TestBed.configureTestingModule({
    providers: [
      { provide: MODEL_DESIGNER_TRANSLATIONS, useValue: signal(DEFAULT_TRANSLATIONS) },
      { provide: DialogRef, useValue: { close: closeSpy } },
      { provide: ModelDesignService, useValue: { designs: signal(DESIGNS), rollback: rollbackSpy } },
      {
        provide: DesignDiffService,
        useValue: { diffEntitySets: diffEntitySetsSpy, diffPropertySets: diffPropertySetsSpy }
      }
    ]
  });

  const fixture = TestBed.createComponent(VersionManagerDialogComponent);
  return { comp: fixture.componentInstance, fixture, closeSpy, rollbackSpy, diffEntitySetsSpy, diffPropertySetsSpy };
}

describe('VersionManagerDialogComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('MUST expose the design list', () => {
    const { comp } = createComponent();
    expect(comp['designs']()).toEqual(DESIGNS);
  });

  it('renders a visible CDK dialog surface', () => {
    const { fixture } = createComponent();
    fixture.detectChanges();
    const surface = fixture.nativeElement.querySelector(
      '[data-testid="version-manager-dialog-surface"]'
    ) as HTMLElement;

    expect(surface).not.toBeNull();
    expect(surface.classList).not.toContain('modal-box');
    expect(surface.classList).toContain('bg-base-100');
  });

  it('MUST have no diff before both target and snapshot are selected', () => {
    const { comp, diffEntitySetsSpy } = createComponent();
    expect(comp['diff']()).toBeNull();
    expect(diffEntitySetsSpy).not.toHaveBeenCalled();
  });

  it('MUST NOT diff when target and snapshot are the same design', () => {
    const { comp, diffEntitySetsSpy } = createComponent();
    comp.onTargetChange(changeEvent('d1'));
    comp.onSnapshotChange(changeEvent('d1'));
    expect(comp['diff']()).toBeNull();
    expect(diffEntitySetsSpy).not.toHaveBeenCalled();
  });

  it('MUST compute the diff once both designs are selected and differ', () => {
    const { comp, diffEntitySetsSpy } = createComponent();
    comp.onTargetChange(changeEvent('d1'));
    comp.onSnapshotChange(changeEvent('d2'));
    expect(comp['diff']()).toEqual(DIFF);
    expect(diffEntitySetsSpy).toHaveBeenCalledWith('d1', 'd2');
  });

  it('MUST disable rollback until both designs are selected and differ', () => {
    const { comp } = createComponent();
    expect(comp['canRollback']()).toBe(false);
    comp.onTargetChange(changeEvent('d1'));
    expect(comp['canRollback']()).toBe(false);
    comp.onSnapshotChange(changeEvent('d1'));
    expect(comp['canRollback']()).toBe(false);
    comp.onSnapshotChange(changeEvent('d2'));
    expect(comp['canRollback']()).toBe(true);
  });

  describe('字段级差异（US-103 AC#2）', () => {
    // ⚠️ `diffPropertySets` 实现完整、有单测，但此前**非测试调用点为 0**——
    // 对话框只显示共有实体的计数，AC 要求的字段级差异在 UI 上根本看不到。
    // 这几条钉住「它真的被调用且结果真的到了展示层」。

    function selectBoth(comp: ReturnType<typeof createComponent>['comp']) {
      comp.onTargetChange(changeEvent('d1'));
      comp.onSnapshotChange(changeEvent('d2'));
    }

    it('对每个共有实体调用 diffPropertySets', () => {
      const { comp, diffPropertySetsSpy } = createComponent();
      selectBoth(comp);

      expect(comp['fieldDiffs']()).toBeDefined();
      expect(diffPropertySetsSpy).toHaveBeenCalledWith('e1a', 'e1b');
    });

    it('有字段差异时列出新增/删除/变更', () => {
      const withChanges = vi.fn().mockReturnValue({
        added: [{ name: 'slug', propertyIdA: null, propertyIdB: 'p9', changedFields: [] }],
        removed: [{ name: 'legacy', propertyIdA: 'p1', propertyIdB: null, changedFields: [] }],
        changed: [{ name: 'title', propertyIdA: 'p2', propertyIdB: 'p2b', changedFields: ['type'] }],
        unchanged: []
      });
      const { comp } = createComponent({ diffPropertySets: withChanges });
      selectBoth(comp);

      const diffs = comp['fieldDiffs']();
      expect(diffs).toHaveLength(1);
      expect(diffs[0].entity.name).toBe('Post');
      expect(diffs[0].diff.added[0].name).toBe('slug');
      expect(diffs[0].diff.removed[0].name).toBe('legacy');
      expect(diffs[0].diff.changed[0].changedFields).toEqual(['type']);
    });

    it('无字段差异的实体不进列表（不把一屏「无变化」摊给用户）', () => {
      const { comp } = createComponent();
      selectBoth(comp);

      expect(comp['fieldDiffs']()).toEqual([]);
    });

    it('未选够两个设计时不算字段差异', () => {
      const { comp, diffPropertySetsSpy } = createComponent();
      comp.onTargetChange(changeEvent('d1'));

      expect(comp['fieldDiffs']()).toEqual([]);
      expect(diffPropertySetsSpy).not.toHaveBeenCalled();
    });
  });

  it('MUST call ModelDesignService.rollback and close the dialog when it performs the rollback', async () => {
    const { comp, closeSpy, rollbackSpy } = createComponent();
    comp.onTargetChange(changeEvent('d1'));
    comp.onSnapshotChange(changeEvent('d2'));

    await comp.onRollback();

    expect(rollbackSpy).toHaveBeenCalledWith('d1', 'd2');
    expect(closeSpy).toHaveBeenCalled();
  });

  it('MUST keep the dialog open when the user cancels the confirmation inside rollback', async () => {
    const rollbackSpy = vi.fn().mockResolvedValue(false);
    const { comp, closeSpy } = createComponent({ rollback: rollbackSpy });
    comp.onTargetChange(changeEvent('d1'));
    comp.onSnapshotChange(changeEvent('d2'));

    await comp.onRollback();

    expect(rollbackSpy).toHaveBeenCalledWith('d1', 'd2');
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('MUST surface the error and keep the dialog open when rollback rejects', async () => {
    const rollbackSpy = vi.fn().mockRejectedValue(new Error('boom'));
    const { comp, closeSpy } = createComponent({ rollback: rollbackSpy });
    comp.onTargetChange(changeEvent('d1'));
    comp.onSnapshotChange(changeEvent('d2'));

    await comp.onRollback();

    expect(comp['error']()).toBe('boom');
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('MUST do nothing when rollback is triggered without both designs selected', async () => {
    const { comp, closeSpy, rollbackSpy } = createComponent();
    await comp.onRollback();
    expect(rollbackSpy).not.toHaveBeenCalled();
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('MUST close the dialog without rolling back on cancel', () => {
    const { comp, closeSpy, rollbackSpy } = createComponent();
    comp.onClose();
    expect(closeSpy).toHaveBeenCalled();
    expect(rollbackSpy).not.toHaveBeenCalled();
  });
});
