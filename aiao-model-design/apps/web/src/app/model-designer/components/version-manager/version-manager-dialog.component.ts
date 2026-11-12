import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MODEL_DESIGNER_TRANSLATIONS } from '../../i18n';
import {
  DesignDiffService,
  type EntityDiffEntry,
  type EntitySetDiff,
  type PropertySetDiff
} from '../../services/design-diff.service';
import { ModelDesignService } from '../../services/model-design.service';

/**
 * 版本管理弹窗
 *
 * 选择两个模型设计（目标/快照）对比实体集合差异，并可将目标设计回滚为快照设计的内容。
 * 由工具栏经 `Dialog.open()` 打开，需传入携带 {@link ModelDesignService}/{@link DesignDiffService}
 * 的 injector（两者均为 `designer.component.ts` 的组件级 provider，非根注入）。
 */
@Component({
  selector: 'lib-version-manager-dialog',
  templateUrl: './version-manager-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class VersionManagerDialogComponent {
  readonly #dialogRef = inject(DialogRef<void>);
  readonly #modelDesign = inject(ModelDesignService);
  readonly #designDiff = inject(DesignDiffService);

  protected readonly t = inject(MODEL_DESIGNER_TRANSLATIONS);
  protected readonly designs = this.#modelDesign.designs;
  protected readonly targetId = signal<string | null>(null);
  protected readonly snapshotId = signal<string | null>(null);
  protected readonly rollingBack = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly diff = computed<EntitySetDiff | null>(() => {
    const target = this.targetId();
    const snapshot = this.snapshotId();
    if (!target || !snapshot || target === snapshot) return null;
    return this.#designDiff.diffEntitySets(target, snapshot);
  });

  /**
   * 共有实体的**字段级**差异（US-103 AC#2）。
   *
   * ⚠️ 此前对话框只显示共有实体的**计数**，`diffPropertySets` 实现完整、有单测，
   * 但非测试调用点为 0——AC 原文要求的「字段级差异（新增/删除/改类型）」
   * 在 UI 上根本看不到。这里把它接上，并只保留真有差异的实体，
   * 避免把一屏「无变化」摊开给用户。
   */
  protected readonly fieldDiffs = computed<Array<{ entity: EntityDiffEntry; diff: PropertySetDiff }>>(() => {
    const d = this.diff();
    if (!d) return [];

    return d.common
      .filter(entry => entry.entityIdA && entry.entityIdB)
      .map(entry => ({
        entity: entry,
        diff: this.#designDiff.diffPropertySets(entry.entityIdA as string, entry.entityIdB as string)
      }))
      .filter(({ diff }) => diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0);
  });

  protected readonly canRollback = computed(() => {
    const target = this.targetId();
    const snapshot = this.snapshotId();
    return !!target && !!snapshot && target !== snapshot && !this.rollingBack();
  });

  onTargetChange(event: Event): void {
    this.targetId.set((event.target as HTMLSelectElement).value || null);
  }

  onSnapshotChange(event: Event): void {
    this.snapshotId.set((event.target as HTMLSelectElement).value || null);
  }

  async onRollback(): Promise<void> {
    const target = this.targetId();
    const snapshot = this.snapshotId();
    if (!target || !snapshot) return;

    this.rollingBack.set(true);
    this.error.set(null);
    try {
      const rolledBack = await this.#modelDesign.rollback(target, snapshot);
      if (rolledBack) this.#dialogRef.close();
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.rollingBack.set(false);
    }
  }

  onClose(): void {
    this.#dialogRef.close();
  }
}
