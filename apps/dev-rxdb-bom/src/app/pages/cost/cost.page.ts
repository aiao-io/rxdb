import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CostPanel } from '../../components/cost-panel';

/**
 * 成本卷算页：逐层明细树 + 缺成本整体报缺失演示（US-525 AC#14/#15）。
 * 与概览页共用 bom-cost-panel 组件。
 */
@Component({
  selector: 'bom-cost-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CostPanel, FormsModule],
  templateUrl: './cost.page.html'
})
export class CostPage {
  /** 评估日（阶段 D 的成本/费率输入在 2026-10-15 口径完整）。 */
  readonly asOfDate = signal('2026-10-15');
}
