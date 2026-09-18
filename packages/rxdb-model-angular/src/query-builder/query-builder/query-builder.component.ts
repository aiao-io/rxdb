import {
  createQueryBuilderService,
  type FieldMetadata,
  type QueryBuilderService,
  type SchemaInfo,
  type UIRule,
  type ValidationResult
} from '@aiao/rxdb-model';
import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  input,
  OnDestroy,
  output,
  Signal,
  viewChild
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { QueryDragDropHandler, QueryGroupComponent, type UIRuleGroup } from '../query-group/query-group.component';

/**
 * RxDB 查询输出格式
 */
export interface RxDBQueryOutput<T> {
  combinator: 'and' | 'or';
  rules: Array<RxDBQueryOutput<T> | { field: keyof T & string; operator: string; value: unknown }>;
}

/**
 * Angular Query Builder 主组件
 *
 * @description
 * 提供可视化的查询条件构建界面，支持：
 * - 传入 SchemaInfo 或 FieldMetadata[] 定义可用字段
 * - 拖拽重排规则和分组
 * - 嵌套分组（最大 5 层）
 * - 实时验证
 *
 * @example
 * ```html
 * <rxdb-query-builder
 *   [schema]="schema"
 *   (queryChange)="onQueryChange($event)"
 * />
 * ```
 */
@Component({
  selector: 'rxdb-query-builder',
  standalone: true,
  imports: [CommonModule, QueryGroupComponent],
  template: `
    <div
      class="rxdb-query-builder bg-base-100"
      (keydown)="onKeyDown($event)"
      aria-label="查询条件构建器"
      role="search"
      tabindex="0"
    >
      <div class="overflow-y-auto" #scrollContainer [style.max-height]="height()">
        <!-- 标题栏 -->
        <div class="mb-4 flex items-center justify-between">
          <h3 class="text-base" id="query-builder-title">查询条件</h3>
          <div class="flex gap-2" aria-label="查询操作" role="toolbar">
            @if (hasRules()) {
              <button
                class="btn btn-ghost btn-sm"
                (click)="clearAll()"
                (keydown.enter)="clearAll()"
                aria-label="清空所有查询条件"
                title="清空所有查询条件 (Escape)"
                type="button"
              >
                清空
              </button>
            }
          </div>
        </div>

        <!-- 空状态提示 -->
        @if (!hasRules()) {
          <div class="text-base-content/60 min-w-md py-8 text-center" aria-live="polite" role="status">
            <div class="mb-2 flex justify-center" aria-hidden="true">
              <svg
                class="size-12 opacity-40"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </div>
            <p class="mb-4">还没有任何查询条件</p>
            <button class="btn btn-sm" (click)="addFirstRule()" aria-label="添加第一个条件" type="button">
              添加第一个条件
            </button>
          </div>
        } @else {
          <!-- 根规则组 -->
          <rxdb-query-group
            [allowCollapse]="enableCollapse()"
            [depth]="0"
            [dragDropHandler]="enableDrag() ? dragDropHandler : undefined"
            [errors]="validationErrors()"
            [fields]="fieldsComputed()"
            [group]="rootGroup()!"
            [maxDepth]="maxDepth()"
            (addGroup)="onAddGroup($event)"
            (addRule)="onAddRule($event)"
            (removeItem)="onRemoveItem($event)"
            (updateCombinator)="onUpdateCombinator($event)"
            (updateRule)="onUpdateRule($event)"
            role="region"
          />
        }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class QueryBuilderComponent<T extends object> implements OnDestroy {
  private readonly service: QueryBuilderService<T>;
  /** 上次应用的 initialQuery 引用，用于检测是否有新查询需要加载 */
  private lastAppliedInitialQuery: unknown = undefined;

  private readonly scrollContainer = viewChild<ElementRef<HTMLElement>>('scrollContainer');

  /** 根规则组 Signal */
  private readonly rootGroupSignal: Signal<unknown>;

  /** 验证 Signal */
  private readonly validationSignal: Signal<ValidationResult | undefined>;

  /**
   * Schema 信息，包含字段定义
   */
  readonly schema = input<SchemaInfo>();

  /**
   * 字段列表（直接传入，优先于 schema）
   */
  readonly fields = input<FieldMetadata[]>([]);

  /**
   * 初始查询条件（可选）
   */
  readonly initialQuery = input<RxDBQueryOutput<T>>();

  /**
   * 最大嵌套层级（默认 5）
   */
  readonly maxDepth = input<number>(5);

  /**
   * 内容区域最大高度（超出后滚动），支持任意 CSS 长度值，如 `'400px'`、`'50vh'`
   */
  readonly height = input<string>('80vh');

  /**
   * 是否开启拖拽排序功能（默认开启）
   */
  readonly enableDrag = input<boolean>(true);

  /**
   * 是否开启分组展开/收起功能（默认开启）
   */
  readonly enableCollapse = input<boolean>(true);

  readonly dragDropHandler: QueryDragDropHandler;

  /**
   * 查询条件变更事件
   */
  readonly queryChange = output<RxDBQueryOutput<T>>();

  /**
   * 验证状态变更事件
   */
  readonly validationChange = output<ValidationResult>();

  /** 计算后的字段列表 */
  readonly fieldsComputed: Signal<FieldMetadata[]> = computed(() => {
    // 优先使用直接传入的 fields
    const directFields = this.fields();
    if (directFields && directFields.length > 0) {
      return directFields;
    }
    // 否则从 schema 获取
    const schemaInfo = this.schema();
    return schemaInfo?.fields ?? [];
  });

  /** 根规则组 */
  readonly rootGroup: Signal<UIRuleGroup | undefined> = computed(() => {
    return this.rootGroupSignal() as UIRuleGroup | undefined;
  });

  /** 验证错误列表 */
  readonly validationErrors = computed(() => {
    const validation = this.validationSignal();
    return validation?.errors ?? [];
  });

  /** 是否有规则 */
  readonly hasRules = computed(() => {
    const group = this.rootGroup();
    return group && group.rules.length > 0;
  });

  constructor() {
    // 在构造函数中初始化服务（非 reactive context）
    this.service = createQueryBuilderService<T>({
      config: {
        maxNestingLevel: this.maxDepth()
      }
    });

    this.dragDropHandler = new QueryDragDropHandler((itemId, targetGroupId, targetIndex) =>
      this.service.moveItem(itemId, targetGroupId, targetIndex)
    );

    // 转换 Observable 为 Signal（必须在 reactive context 外部）
    this.rootGroupSignal = toSignal(this.service.rootGroup$, { requireSync: true });
    this.validationSignal = toSignal(this.service.validation$, { initialValue: undefined });

    // 监听字段变化并同步到服务
    effect(() => {
      const fields = this.fieldsComputed();
      if (fields.length > 0) {
        this.service.setFields(fields);
      }
    });

    // 监听初始查询并加载（引用变化时重新加载，用户修改不影响此 signal 故不会覆盖）
    effect(() => {
      const initial = this.initialQuery();
      if (initial !== undefined && initial !== this.lastAppliedInitialQuery) {
        this.lastAppliedInitialQuery = initial;
        this.service.fromRxDBQuery(initial as any);
      }
    });

    // 监听查询变化并发出事件
    effect(() => {
      const group = this.rootGroup();
      if (group) {
        const query = this.service.toRxDBQuery();
        this.queryChange.emit(query as RxDBQueryOutput<T>);
      }
    });

    // 监听验证变化并发出事件
    effect(() => {
      const validation = this.validationSignal();
      if (validation) {
        this.validationChange.emit(validation);
      }
    });
  }

  /** 销毁服务 */
  ngOnDestroy(): void {
    this.service.destroy();
  }

  /** 添加第一个规则 */
  addFirstRule(): void {
    const firstField = this.fieldsComputed()[0];
    if (firstField) {
      this.service.addRule(undefined, {
        field: firstField.name,
        operator:
          firstField.isRelation ? 'exists'
          : firstField.type === 'keyValue' ? 'null'
          : '=',
        value: firstField.type === 'boolean' ? false : ''
      } as any);
    }
  }

  /** 清空所有规则 */
  clearAll(): void {
    this.service.clear();
  }

  /** 添加规则到指定组 */
  onAddRule(event: { parentId: string; rule: Omit<UIRule, 'id'> }): void {
    this.service.addRule(event.parentId, event.rule as any);
    this.scrollToBottom();
  }

  /** 添加子组到指定组 */
  onAddGroup(parentId: string): void {
    this.service.addGroup(parentId);
    this.scrollToBottom();
  }

  /** 删除规则或组 */
  onRemoveItem(id: string): void {
    this.service.remove(id);
  }

  /** 更新规则 */
  onUpdateRule(event: { id: string; updates: Partial<UIRule> }): void {
    this.service.updateRule(event.id, event.updates as any);
  }

  /** 更新组合器 */
  onUpdateCombinator(event: { id: string; combinator: 'and' | 'or' }): void {
    this.service.updateGroupCombinator(event.id, event.combinator);
  }

  /** 键盘快捷键处理 */
  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.hasRules()) {
      event.preventDefault();
      this.clearAll();
      return;
    }
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      const el = this.scrollContainer()?.nativeElement;
      el?.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }, 0);
  }
}
