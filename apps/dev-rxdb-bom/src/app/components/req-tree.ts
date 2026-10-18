import type { ExplosionResult, OutputLine, RequirementLine } from '@aiao/rxdb-plugin-bom';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { formatDecimal } from '../presentation/decimal-format';

/** 保留发生项路径与原始数量的物料需求结构。 */
@Component({
  selector: 'bom-req-tree',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (result().truncated; as truncated) {
      <div class="error-box" role="alert">
        <p>结构尚未完整展开，当前数量仅供查看。请缩小范围后重试。</p>
        <details>
          <summary>查看限制原因</summary>
          <code>{{ truncated.reason }}</code>
        </details>
      </div>
    }
    @for (unresolved of result().manifest.unresolved; track $index) {
      <div class="panel-inset" data-testid="unit-unresolved">
        <h3>
          {{ unresolved.reason === 'unit' || unresolved.reason === 'lot' ? '请填写序列号或批次' : '请选择备选方案' }}
        </h3>
        <p class="hint">补齐适用条件后，才能确定这部分物料的需求。</p>
        @for (candidate of unresolved.candidates; track $index) {
          <div class="where-used-row" data-testid="unit-candidate">
            <strong>{{
              candidate.childItemId ? itemNo(candidate.childItemId) : '备选方案 ' + candidate.alternativeNo
            }}</strong>
            @if (candidate.unitFrom !== undefined || candidate.unitTo !== undefined) {
              <span>序列 {{ candidate.unitFrom ?? 1 }} ～ {{ candidate.unitTo ?? '不限' }}</span>
            }
            @if (candidate.lotCodes?.length) {
              <span>批次 {{ candidate.lotCodes.join('、') }}</span>
            }
          </div>
        }
      </div>
    }
    @for (group of result().unresolved; track group.groupCode) {
      <div class="panel-inset">
        <h3>请选择替代物料 · {{ group.groupCode }}</h3>
        <p class="hint">这个替代组需要明确选择，当前结果不能直接用于完整用量计算。</p>
        @for (candidate of group.candidates; track candidate.occurrenceId) {
          <div class="where-used-row">{{ itemNo(candidate.itemId) }}</div>
        }
      </div>
    }
    @for (item of result().outputs; track item.path.join('>') + item.direction) {
      <div
        class="requirement-row output"
        [attr.data-direction]="item.direction"
        [attr.data-output]="itemNo(item.itemId)"
      >
        <span class="item-code">{{ itemNo(item.itemId) }}</span>
        <span class="qty" [attr.data-qty]="item.qty" [title]="item.qty + ' ' + item.uom">
          {{ quantity(item.qty) }} {{ item.uom }}
        </span>
        <span class="designators">{{ outputLabel(item.direction) }}</span>
      </div>
    }
    @for (line of result().requirementLines; track line.path.join('>')) {
      <div
        class="requirement-row"
        [attr.aria-current]="selected() === line ? 'true' : null"
        [attr.data-item]="itemNo(line.itemId)"
        [class.selected]="selected() === line"
        [style.paddingLeft.px]="8 + depth(line) * 20"
        (click)="rowSelect.emit(line)"
        (keydown.enter)="rowSelect.emit(line)"
        (keydown.space)="selectWithSpace($event, line)"
        role="button"
        tabindex="0"
      >
        <span class="item-code">{{ itemNo(line.itemId) }}</span>
        <span class="qty" [attr.data-qty]="line.qty" [title]="line.qty + ' ' + line.uom">
          {{ quantity(line.qty) }} {{ line.uom }}
        </span>
        @if (designatorsOf(line).length > 0) {
          <span class="designators" [attr.data-designators]="designatorsOf(line).join(',')">
            位号：{{ designatorsOf(line).join(', ') }}
          </span>
        }
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }

      .requirement-row {
        flex-wrap: wrap;
      }

      .item-code {
        min-width: 0;
        font-weight: 600;
        overflow-wrap: anywhere;
      }

      .designators {
        flex-basis: 100%;
        overflow-wrap: anywhere;
      }

      .where-used-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
    `
  ]
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

  /** 数量仅作展示舍入，原值继续保存在数据属性和提示中。 */
  quantity(value: string): string {
    return formatDecimal(value, { fractionDigits: 6, trimTrailingZeros: true });
  }

  outputLabel(direction: OutputLine['direction']): string {
    const labels = { by_product: '副产品', scrap_out: '废料', produce: '联产品' };
    return labels[direction];
  }

  depth(line: RequirementLine): number {
    return line.path.length - 1;
  }

  designatorsOf(line: RequirementLine): string[] {
    return this.designators().get(line.path[line.path.length - 1]) ?? [];
  }

  /** Space 选择需求行时阻止页面滚动。 */
  selectWithSpace(event: Event, line: RequirementLine): void {
    event.preventDefault();
    this.rowSelect.emit(line);
  }
}
