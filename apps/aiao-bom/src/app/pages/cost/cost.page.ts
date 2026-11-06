import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BomWorkspaceState } from '../../bom-workspace-state';
import { CostPanel } from '../../components/cost-panel';

/** 成本结果、来源明细与良率计价说明。 */
@Component({
  selector: 'bom-cost-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CostPanel, FormsModule],
  templateUrl: './cost.page.html'
})
export class CostPage {
  /** 默认评估日对应演示数据中的已发布成本与费率。 */
  readonly asOfDate = inject(BomWorkspaceState).asOfDate;
}
