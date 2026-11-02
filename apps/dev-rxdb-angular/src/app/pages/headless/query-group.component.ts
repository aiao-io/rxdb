import {
  isRuleGroup,
  type FieldMetadata,
  type QueryBuilderController,
  type QueryBuilderRule,
  type QueryBuilderRuleGroup
} from '@aiao/rxdb-model/headless';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { operatorsFor } from './query-operators';
import { QueryRuleComponent } from './query-rule.component';

/** 一个 AND / OR 分组：可递归嵌套，增删规则与分组、切换组合方式都是控制器动作。 */
@Component({
  selector: 'app-hl-query-group',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [QueryRuleComponent],
  template: `
    <div class="hl-group" role="group" [attr.aria-label]="isRoot() ? '筛选条件' : '子分组'" data-testid="qb-group">
      <div class="hl-group-head">
        <select aria-label="组合方式" (change)="changeCombinator($event)">
          <option value="and" [selected]="group().combinator === 'and'">全部满足 (AND)</option>
          <option value="or" [selected]="group().combinator === 'or'">任一满足 (OR)</option>
        </select>
        <button type="button" (click)="addRule()">添加规则</button>
        <button type="button" (click)="controller().addGroup(group().id)">添加分组</button>
        @if (!isRoot()) {
          <button type="button" aria-label="删除分组" (click)="controller().remove(group().id)">删除分组</button>
        }
      </div>
      <ul class="hl-group-body">
        @for (item of group().rules; track item.id) {
          <li>
            @if (isGroup(item)) {
              <app-hl-query-group
                [group]="asGroup(item)"
                [controller]="controller()"
                [fields]="fields()"
                [isRoot]="false"
              />
            } @else {
              <app-hl-query-rule [rule]="asRule(item)" [controller]="controller()" [fields]="fields()" />
            }
          </li>
        }
      </ul>
    </div>
  `
})
export class QueryGroupComponent {
  readonly group = input.required<QueryBuilderRuleGroup>();
  readonly controller = input.required<QueryBuilderController>();
  readonly fields = input.required<readonly FieldMetadata[]>();
  readonly isRoot = input.required<boolean>();

  protected isGroup(item: QueryBuilderRule | QueryBuilderRuleGroup): boolean {
    return isRuleGroup(item);
  }

  protected asGroup(item: QueryBuilderRule | QueryBuilderRuleGroup): QueryBuilderRuleGroup {
    return item as QueryBuilderRuleGroup;
  }

  protected asRule(item: QueryBuilderRule | QueryBuilderRuleGroup): QueryBuilderRule {
    return item as QueryBuilderRule;
  }

  protected addRule(): void {
    const [first] = this.fields();
    this.controller().addRule(this.group().id, { field: first?.name, operator: operatorsFor(first)[0]?.key });
  }

  protected changeCombinator(event: Event): void {
    this.controller().updateGroupCombinator(this.group().id, (event.target as HTMLSelectElement).value as 'and' | 'or');
  }
}
