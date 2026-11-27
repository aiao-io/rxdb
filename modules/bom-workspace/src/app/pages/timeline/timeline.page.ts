import { ChangeDetectionStrategy, Component, computed, inject, viewChild } from '@angular/core';
import { BomDemoService } from '../../bom-demo.service';
import { EcnPanel } from '../../components/ecn-panel';

/** ECN 时间轴条目（按生效日升序）。 */
interface TimelineEntry {
  id: string;
  ecnNo: string;
  state: string;
  effectiveDate: string;
}

/**
 * 时间轴页：ECN 按生效日排列的时间轴 + ECN 变更管理面板（影响面/差异/现场 ECN 操作）。
 * 面板与概览页共用 bom-ecn-panel 组件。
 */
@Component({
  selector: 'bom-timeline-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EcnPanel],
  templateUrl: './timeline.page.html',
  styleUrl: './timeline.page.scss'
})
export class TimelinePage {
  private readonly service = inject(BomDemoService);
  readonly panel = viewChild(EcnPanel);

  /** 时间轴条目：ecnId → { ecnNo, state, effectiveDate } 按生效日升序。 */
  readonly entries = computed<TimelineEntry[]>(() =>
    [...this.service.ecns().entries()]
      .map(([id, entry]) => ({ id, ...entry }))
      .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.ecnNo.localeCompare(b.ecnNo))
  );
  readonly releasedCount = computed(() => this.entries().filter(entry => entry.state === 'released').length);
  readonly draftCount = computed(() => this.entries().filter(entry => entry.state === 'draft').length);

  /** 选择时间轴条目后，查询和操作继续使用同一张变更单。 */
  selectEcn(id: string): void {
    void this.panel()?.inspectEcn(id);
  }

  /** 状态中文标签（ECN 下拉里保持原样英文 state，此处仅时间轴展示用）。 */
  stateLabel(state: string): string {
    if (state === 'released') return '已发布';
    if (state === 'draft') return '草稿';
    if (state === 'cancelled') return '已取消';
    return state;
  }
}
