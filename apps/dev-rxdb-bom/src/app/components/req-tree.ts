import type { ExplosionResult, RequirementLine } from '@aiao/rxdb-plugin-bom';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * 需求树（展开结果展示）：产出行 + 需求行，逐层缩进、行级位号、点选联动。
 * overview（整机展开）/ explosion（专项页）/ mapping（EBOM·MBOM 双图）三处复用，
 * testid 与 .requirement-row/.designators CSS 类面统一。
 */
@Component({
  selector: 'bom-req-tree',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (result().truncated) {
      <div class="error-box">截断：{{ result().truncated!.reason }}</div>
    }
    @for (output of result().outputs; track output.path.join('>') + output.direction) {
      <div
        class="requirement-row output"
        [attr.data-direction]="output.direction"
        [attr.data-output]="itemNo(output.itemId)"
      >
        <span class="qty" [attr.data-qty]="output.qty">{{ output.qty }} {{ output.uom }}</span>
        <span>{{ itemNo(output.itemId) }}</span>
        <span class="designators">产出（{{ output.direction === 'by_product' ? '副产' : '废料' }}）</span>
      </div>
    }
    @for (line of result().requirementLines; track line.path.join('>')) {
      <div
        class="requirement-row"
        [attr.data-item]="itemNo(line.itemId)"
        [class.selected]="selected() === line"
        [style.paddingLeft.px]="8 + depth(line) * 20"
        (click)="rowSelect.emit(line)"
        (keydown.enter)="rowSelect.emit(line)"
        role="button"
        tabindex="0"
      >
        <span class="qty" [attr.data-qty]="line.qty">{{ line.qty }} {{ line.uom }}</span>
        <span>{{ itemNo(line.itemId) }}</span>
        @if (designatorsOf(line).length > 0) {
          <span class="designators" [attr.data-designators]="designatorsOf(line).join(',')">
            位号：{{ designatorsOf(line).join(', ') }}
          </span>
        }
      </div>
    }
  `
})
export class ReqTree {
  readonly result = input.required<ExplosionResult>();
  readonly selected = input<RequirementLine | null>(null);
  readonly itemNos = input.required<Map<string, string>>();
  readonly designators = input.required<Map<string, string[]>>();
  readonly rowSelect = output<RequirementLine>();

  itemNo(itemId: string): string {
    return this.itemNos().get(itemId) ?? itemId.slice(0, 8);
  }

  /** 行在树里的缩进层级（path 长度 - 1）。 */
  depth(line: RequirementLine): number {
    return line.path.length - 1;
  }

  /** 行对应的位号清单（AC#2 的行级位号展示）。 */
  designatorsOf(line: RequirementLine): string[] {
    const occurrenceId = line.path[line.path.length - 1];
    return this.designators().get(occurrenceId) ?? [];
  }
}
