import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { WhereUsedPanel } from '../../components/where-used-panel';

/**
 * 反查页：where-used 全部父件与路径（含虚拟件路径，US-510 AC#6）。
 * 与概览页共用 bom-where-used-panel 组件。
 */
@Component({
  selector: 'bom-where-used-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, WhereUsedPanel],
  templateUrl: './where-used.page.html'
})
export class WhereUsedPage {
  /** 评估日（种子 ECN 生效前口径，与验收面板默认一致）。 */
  readonly asOfDate = signal('2026-09-22');
}
