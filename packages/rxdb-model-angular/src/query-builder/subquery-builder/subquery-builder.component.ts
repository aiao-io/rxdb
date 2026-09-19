import {
  createQueryBuilderService,
  type FieldMetadata,
  type QueryBuilderRuleGroup,
  type QueryBuilderService,
  type UIRule,
  type ValidationResult
} from '@aiao/rxdb-model';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, input, OnDestroy, output, Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { QueryGroupComponent, type UIRuleGroup } from '../query-group/query-group.component';

/**
 * 子查询构建器组件
 *
 * @description
 * 用于 EXISTS/NOT EXISTS 操作符的嵌套查询条件。
 * 支持：
 * - 添加子条件
 * - 嵌套规则组
 * - 清空子条件
 */
@Component({
  selector: 'rxdb-subquery-builder',
  standalone: true,
  imports: [CommonModule, QueryGroupComponent],
  template: `
    <div class="subquery-builder border-base-300 bg-base-200/50 p-2">
      @if (!hasRules()) {
        <div class="text-base-content/60 flex items-center gap-2">
          <button class="btn btn-ghost btn-xs" (click)="handleAddFirstRule()" type="button">+ 添加子条件</button>
          <span class="text-xs opacity-50">（可选）</span>
        </div>
      } @else {
        <rxdb-query-group
          [depth]="0"
          [fields]="fields()"
          [group]="rootGroup()!"
          [maxDepth]="maxDepth()"
          (addGroup)="onAddGroup($event)"
          (addRule)="onAddRule($event)"
          (removeItem)="onRemoveItem($event)"
          (updateCombinator)="onUpdateCombinator($event)"
          (updateRule)="onUpdateRule($event)"
        />
        <div class="mt-2 flex justify-end">
          <button class="btn btn-ghost btn-xs text-error" (click)="handleClear()" type="button">清空</button>
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      rxdb-query-group ::ng-deep > .rxdb-query-group {
        border: 0;
        padding: 0;
      }
    `
  ]
})
export class SubqueryBuilderComponent implements OnDestroy {
  private readonly service: QueryBuilderService<Record<string, unknown>>;
  /** initialQuery 是否已应用（只应用一次） */
  private initialQueryApplied = false;

  /** 根规则组 Signal */
  private readonly rootGroupSignal: Signal<unknown>;

  /** 验证 Signal */
  private readonly validationSignal: Signal<ValidationResult | undefined>;

  /** 字段列表 */
  readonly fields = input.required<FieldMetadata[]>();

  /** 初始查询 */
  readonly initialQuery = input<QueryBuilderRuleGroup<Record<string, unknown>>>();

  /** 最大嵌套层级 */
  readonly maxDepth = input<number>(3);

  /** 查询变更事件 */
  readonly queryChange = output<{ combinator: 'and' | 'or'; rules: unknown[] } | undefined>();

  /** 验证变更事件 */
  readonly validationChange = output<ValidationResult>();

  /** 根规则组 */
  readonly rootGroup: Signal<UIRuleGroup | undefined> = computed(() => {
    return this.rootGroupSignal() as UIRuleGroup | undefined;
  });

  /** 是否有规则 */
  readonly hasRules = computed(() => {
    const group = this.rootGroup();
    return group && group.rules.length > 0;
  });

  constructor() {
    // 在构造函数中初始化服务
    this.service = createQueryBuilderService<Record<string, unknown>>({
      config: {
        maxNestingLevel: this.maxDepth()
      }
    });

    // 转换 Observable 为 Signal
    this.rootGroupSignal = toSignal(this.service.rootGroup$, { requireSync: true });
    this.validationSignal = toSignal(this.service.validation$, { initialValue: undefined });

    // 监听字段变化并同步到服务
    effect(() => {
      const fields = this.fields();
      if (fields.length > 0) {
        this.service.setFields(fields);
      }
    });

    // 监听初始查询并加载（只应用一次，避免用户修改后被重置）
    effect(() => {
      if (!this.initialQueryApplied) {
        const initial = this.initialQuery();
        if (initial) {
          this.initialQueryApplied = true;
          this.service.fromRxDBQuery(initial);
        }
      }
    });

    // 监听查询变化并发出事件
    effect(() => {
      const group = this.rootGroup();
      if (group) {
        const query = this.service.toRxDBQuery();
        // 如果没有规则，返回 undefined 而不是空的 RuleGroup
        if (!query.rules || query.rules.length === 0) {
          this.queryChange.emit(undefined);
        } else {
          this.queryChange.emit(query);
        }
      }
    });

    // 监听验证变化并发出事件
    effect(() => {
      const validation = this.validationSignal();
      if (validation) {
        this.validationChange.emit(validation);
      }
    });

    // 同步 maxDepth 到 service
    effect(() => {
      this.service.setMaxNestingLevel(this.maxDepth());
    });
  }

  /** 销毁服务 */
  ngOnDestroy(): void {
    this.service.destroy();
  }

  /** 添加第一条规则 */
  handleAddFirstRule(): void {
    const firstField = this.fields()[0];
    if (firstField) {
      this.service.addRule(undefined, {
        field: firstField.name,
        operator:
          firstField.isRelation ? 'exists'
          : firstField.type === 'keyValue' ? 'null'
          : '=',
        value: firstField.type === 'boolean' ? false : ''
      });
    }
  }

  /** 清空所有规则 */
  handleClear(): void {
    this.service.clear();
  }

  /** 添加规则到指定组 */
  onAddRule(event: { parentId: string; rule: Omit<UIRule, 'id'> }): void {
    this.service.addRule(event.parentId, event.rule);
  }

  /** 添加子组到指定组 */
  onAddGroup(parentId: string): void {
    this.service.addGroup(parentId);
  }

  /** 删除规则或组 */
  onRemoveItem(id: string): void {
    this.service.remove(id);
  }

  /** 更新规则 */
  onUpdateRule(event: { id: string; updates: Partial<UIRule> }): void {
    this.service.updateRule(event.id, event.updates);
  }

  /** 更新组合器 */
  onUpdateCombinator(event: { id: string; combinator: 'and' | 'or' }): void {
    this.service.updateGroupCombinator(event.id, event.combinator);
  }
}
