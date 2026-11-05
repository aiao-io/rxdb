import {
  isRuleGroup,
  type FieldMetadata,
  type QueryBuilderController,
  type QueryBuilderRuleGroup
} from '@aiao/rxdb-model/headless';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { operatorsFor } from './article-model';
import { QueryRuleComponent } from './query-rule.component';

/** 一个 AND / OR 分组：可递归嵌套，增删规则与分组、切换组合方式都是控制器动作。 */
@Component({
  selector: 'app-hl-query-group',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [QueryRuleComponent],
  template: `
    <div class="hl-group" [attr.aria-label]="isRoot() ? '筛选条件' : '子分组'" data-testid="qb-group" role="group">
      <div class="hl-group-head">
        <select (change)="changeCombinator($event)" aria-label="组合方式">
          <option [selected]="group().combinator === 'and'" value="and">全部满足 (AND)</option>
          <option [selected]="group().combinator === 'or'" value="or">任一满足 (OR)</option>
        </select>
        <button (click)="addRule()" type="button">添加规则</button>
        <button (click)="controller().addGroup(group().id)" type="button">添加分组</button>
        @if (!isRoot()) {
          <button (click)="controller().remove(group().id)" aria-label="删除分组" type="button">删除分组</button>
        }
      </div>
      <ul class="hl-group-body">
        @for (item of group().rules; track item.id) {
          <li>
            @if (isGroup(item)) {
              <app-hl-query-group [controller]="controller()" [fields]="fields()" [group]="item" [isRoot]="false" />
            } @else {
              <app-hl-query-rule [controller]="controller()" [fields]="fields()" [rule]="item" />
            }
          </li>
        }
      </ul>
    </div>
  `
})
export class QueryGroupComponent {
  /** 类型谓词：模板里 `@if` 据此收窄 `item`，不必再做类型转换。 */
  protected readonly isGroup = isRuleGroup;

  readonly group = input.required<QueryBuilderRuleGroup>();
  readonly controller = input.required<QueryBuilderController>();
  readonly fields = input.required<readonly FieldMetadata[]>();
  readonly isRoot = input.required<boolean>();

  protected addRule(): void {
    const [first] = this.fields();
    this.controller().addRule(this.group().id, { field: first?.name, operator: operatorsFor(first)[0]?.key });
  }

  protected changeCombinator(event: Event): void {
    this.controller().updateGroupCombinator(this.group().id, (event.target as HTMLSelectElement).value as 'and' | 'or');
  }
}
