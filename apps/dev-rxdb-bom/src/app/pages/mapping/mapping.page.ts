import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MappingPanel } from '../../components/mapping-panel';

/**
 * 双图映射页：EBOM/MBOM 双图并排 + 映射覆盖率与跟进缺口（US-525 AC#13）。
 * 与概览页共用 bom-mapping-panel 组件。
 */
@Component({
  selector: 'bom-mapping-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MappingPanel],
  templateUrl: './mapping.page.html'
})
export class MappingPage {
  /** 评估日（阶段 D 的双图与 split 映射在 2026-10-15 口径完整）。 */
  readonly asOfDate = signal('2026-10-15');
}
