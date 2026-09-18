import type { FieldMetadata, UIRule, ValidationError } from '@aiao/rxdb-model';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { QueryRuleComponent } from '../query-rule/query-rule.component';

/**
 * UI 规则组（宽松类型）
 */
export interface UIRuleGroup {
  id: string;
  combinator: 'and' | 'or';
  rules: Array<UIRule | UIRuleGroup>;
}

export type QueryDropMode = 'before' | 'after' | 'into';

export interface QueryDragDropState {
  draggedItemId: string | null;
  targetItemId: string | null;
  dropMode: QueryDropMode | null;
  isValidTarget: boolean;
  depth?: number;
}

export class QueryDragDropHandler {
  readonly state = signal<QueryDragDropState>({
    draggedItemId: null,
    targetItemId: null,
    dropMode: null,
    isValidTarget: false
  });

  constructor(private readonly moveItemFn: (itemId: string, targetGroupId: string, targetIndex: number) => void) {}

  start(itemId: string): void {
    this.state.set({ draggedItemId: itemId, targetItemId: null, dropMode: null, isValidTarget: false });
  }

  over(targetItemId: string, dropMode: QueryDropMode, isValid: boolean, depth: number): void {
    this.state.update(current => {
      if (current.depth !== undefined && depth < current.depth) return current;
      return { ...current, targetItemId, dropMode, isValidTarget: isValid, depth };
    });
  }

  leave(): void {
    this.state.update(s => ({ ...s, targetItemId: null, dropMode: null, isValidTarget: false, depth: undefined }));
  }

  drop(itemId: string, targetGroupId: string, targetIndex: number): void {
    try {
      this.moveItemFn(itemId, targetGroupId, targetIndex);
    } catch {
      // 服务层拒绝（如循环嵌套），静默忽略
    }
    this.reset();
  }

  end(): void {
    this.reset();
  }

  private reset(): void {
    this.state.set({ draggedItemId: null, targetItemId: null, dropMode: null, isValidTarget: false });
  }
}

function calculateDropMode(clientY: number, rect: DOMRect, isGroup: boolean): QueryDropMode {
  const ratio = (clientY - rect.top) / rect.height;
  if (isGroup) {
    if (ratio < 0.25) return 'before';
    if (ratio > 0.75) return 'after';
    return 'into';
  }
  return ratio < 0.5 ? 'before' : 'after';
}

/**
 * 查询规则组组件（递归）
 *
 * @description
 * 显示一组查询规则，支持：
 * - AND/OR 切换（Teable 风格：行内 conjunction 前缀）
 * - 添加规则/子组
 * - 删除组
 * - 递归嵌套显示
 */
@Component({
  selector: 'rxdb-query-group',
  standalone: true,
  imports: [CommonModule, QueryRuleComponent],
  template: `
    <div class="rxdb-query-group border-base-300 my-1 rounded-lg border p-2" [class.bg-base-200]="depth() % 2 === 1">
      <!-- 组合器 + 操作按钮（同一行） -->
      <div class="flex items-center gap-2" [class.mb-2]="!collapsed()">
        <div class="join">
          <button
            class="btn btn-xs join-item"
            [class.btn-ghost]="group().combinator !== 'and'"
            [class.btn-primary]="group().combinator === 'and'"
            (click)="toggleCombinator('and')"
            type="button"
          >
            AND
          </button>
          <button
            class="btn btn-xs join-item"
            [class.btn-ghost]="group().combinator !== 'or'"
            [class.btn-primary]="group().combinator === 'or'"
            (click)="toggleCombinator('or')"
            type="button"
          >
            OR
          </button>
        </div>

        @if (allowCollapse()) {
          <button
            class="btn btn-ghost btn-xs btn-square"
            [title]="collapsed() ? '展开' : '收起'"
            (click)="toggleCollapse()"
            type="button"
          >
            <svg
              class="h-3 w-3 transition-transform duration-200"
              [class.-rotate-90]="collapsed()"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2.5"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        }

        <div class="flex-1"></div>

        @if (!collapsed()) {
          <button class="btn btn-ghost btn-xs" (click)="onAddRule()" type="button">+ 条件</button>

          <!--
            ⚠️ 达到上限时保留按钮并禁用，而不是整个条件渲染掉。
            此前用条件渲染，按钮到达上限就直接消失、页面上零解释文案，
            用户不知道是「不支持」还是「用错了」（US-210 AC#3 要求「可达上限；超过提示」）。
          -->
          <button
            class="btn btn-ghost btn-xs"
            [attr.aria-disabled]="!canAddGroup()"
            [attr.title]="canAddGroup() ? null : nestingLimitHint()"
            [disabled]="!canAddGroup()"
            (click)="onAddGroup()"
            type="button"
          >
            + 分组
          </button>
          @if (!canAddGroup()) {
            <span class="text-base-content/50 text-xs" role="status">{{ nestingLimitHint() }}</span>
          }

          @if (depth() > 0) {
            <button
              class="btn btn-ghost btn-xs btn-square text-base-content/40 hover:text-error"
              (click)="onRemove()"
              title="删除组"
              type="button"
            >
              ✕
            </button>
          }
        }
      </div>

      <!-- 规则列表 -->
      @if (!collapsed()) {
        <div class="space-y-1">
          @for (item of group().rules; track trackByItem(item); let idx = $index) {
            @if (isRuleGroup(item)) {
              <div
                class="rxdb-drag-item"
                [class.dragging]="isDragging(item.id)"
                [class.drop-invalid]="isDropInvalid(item.id)"
                [class.drop-target-after]="isDropTarget(item.id, 'after')"
                [class.drop-target-before]="isDropTarget(item.id, 'before')"
                [class.drop-target-into]="isDropTarget(item.id, 'into')"
                (dragend)="onItemDragEnd()"
                (dragleave)="onItemDragLeave($event)"
                (dragover)="onItemDragOver($event, item, idx, true)"
                (drop)="onItemDrop($event, item, idx, true)"
              >
                <div class="flex items-start gap-1">
                  @if (dragDropHandler()) {
                    <span
                      class="btn btn-ghost btn-xs btn-square text-base-content/30 hover:text-base-content/60 mt-1 cursor-grab"
                      (dragstart)="onItemDragStart($event, item)"
                      draggable="true"
                      >⠿</span
                    >
                  }
                  <div class="min-w-0 flex-1">
                    <rxdb-query-group
                      [allowCollapse]="allowCollapse()"
                      [depth]="depth() + 1"
                      [dragDropHandler]="dragDropHandler()"
                      [errors]="errors()"
                      [fields]="fields()"
                      [group]="asRuleGroup(item)"
                      [maxDepth]="maxDepth()"
                      (addGroup)="addGroup.emit($event)"
                      (addRule)="addRule.emit($event)"
                      (removeItem)="removeItem.emit($event)"
                      (updateCombinator)="updateCombinator.emit($event)"
                      (updateRule)="updateRule.emit($event)"
                    />
                  </div>
                </div>
              </div>
            } @else {
              <div
                class="rxdb-drag-item"
                [class.dragging]="isDragging(item.id)"
                [class.drop-invalid]="isDropInvalid(item.id)"
                [class.drop-target-after]="isDropTarget(item.id, 'after')"
                [class.drop-target-before]="isDropTarget(item.id, 'before')"
                (dragend)="onItemDragEnd()"
                (dragleave)="onItemDragLeave($event)"
                (dragover)="onItemDragOver($event, item, idx, false)"
                (drop)="onItemDrop($event, item, idx, false)"
              >
                <div class="flex items-center gap-1">
                  @if (dragDropHandler()) {
                    <span
                      class="btn btn-ghost btn-xs btn-square text-base-content/30 hover:text-base-content/60 cursor-grab"
                      (dragstart)="onItemDragStart($event, item)"
                      draggable="true"
                      >⠿</span
                    >
                  }
                  <div class="min-w-0 flex-1">
                    <rxdb-query-rule
                      [errors]="errors()"
                      [fields]="fields()"
                      [rule]="asRule(item)"
                      (remove)="onRuleRemove(asRule(item).id)"
                      (update)="onRuleUpdate($event)"
                    />
                  </div>
                </div>
              </div>
            }
          }
        </div>

        <!-- 空状态 -->
        @if (group().rules.length === 0) {
          <div class="text-base-content/50 py-2 text-center text-sm select-none">暂无条件</div>
        }
      }
    </div>
  `,

  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .rxdb-drag-item {
      position: relative;
    }
    .rxdb-drag-item.dragging {
      opacity: 0.4;
    }
    .rxdb-drag-item.drop-target-before::before {
      content: '';
      position: absolute;
      top: -2px;
      left: 0;
      right: 0;
      height: 3px;
      background: oklch(0.6 0.2 250);
      border-radius: 2px;
      z-index: 1;
    }
    .rxdb-drag-item.drop-target-after::after {
      content: '';
      position: absolute;
      bottom: -2px;
      left: 0;
      right: 0;
      height: 3px;
      background: oklch(0.6 0.2 250);
      border-radius: 2px;
      z-index: 1;
    }
    .rxdb-drag-item.drop-target-into {
      outline: 2px dashed oklch(0.6 0.2 250);
      outline-offset: -2px;
      border-radius: 0.5rem;
      background: oklch(0.6 0.2 250 / 10%);
    }
    .rxdb-drag-item.drop-invalid {
      outline: 2px dashed oklch(0.6 0.2 30);
      outline-offset: -2px;
      border-radius: 0.5rem;
    }
  `
})
export class QueryGroupComponent {
  readonly group = input.required<UIRuleGroup>();
  readonly fields = input.required<FieldMetadata[]>();
  readonly errors = input<ValidationError[]>([]);
  readonly depth = input<number>(0);
  readonly maxDepth = input<number>(5);
  readonly dragDropHandler = input<QueryDragDropHandler>();
  /** 是否允许展开/收起组（默认开启） */
  readonly allowCollapse = input<boolean>(true);

  readonly addRule = output<{ parentId: string; rule: Omit<UIRule, 'id'> }>();
  readonly addGroup = output<string>();
  readonly removeItem = output<string>();
  readonly updateRule = output<{ id: string; updates: Partial<UIRule> }>();
  readonly updateCombinator = output<{ id: string; combinator: 'and' | 'or' }>();

  /** 当前组是否已折叠 */
  readonly collapsed = signal(false);

  /** 是否可以添加子组（未达到最大深度） */
  readonly canAddGroup = computed(() => this.depth() < this.maxDepth() - 1);

  /** 达到嵌套上限时展示给用户的原因（AC 要求「超过提示」，不能静默） */
  readonly nestingLimitHint = computed(() => `已达最大嵌套层级（${this.maxDepth()} 层）`);

  /** 切换折叠状态 */
  toggleCollapse(): void {
    this.collapsed.update(v => !v);
  }

  /** 切换组合器 */
  toggleCombinator(combinator: 'and' | 'or'): void {
    if (this.group().combinator !== combinator) {
      this.updateCombinator.emit({ id: this.group().id, combinator });
    }
  }

  /** 添加规则 */
  onAddRule(): void {
    const firstField = this.fields()[0];
    if (firstField) {
      this.addRule.emit({
        parentId: this.group().id,
        rule: {
          field: firstField.name,
          operator:
            firstField.isRelation ? 'exists'
            : firstField.type === 'keyValue' ? 'null'
            : '=',
          value: firstField.type === 'boolean' ? false : ''
        }
      });
    }
  }

  /** 添加子组 */
  onAddGroup(): void {
    // 按钮的 disabled 挡不住键盘/程序化调用，这里再守一次
    if (!this.canAddGroup()) return;
    this.addGroup.emit(this.group().id);
  }

  /** 删除此组 */
  onRemove(): void {
    this.removeItem.emit(this.group().id);
  }

  /** 规则更新 */
  onRuleUpdate(event: { id: string; updates: Partial<UIRule> }): void {
    this.updateRule.emit(event);
  }

  /** 删除规则 */
  onRuleRemove(id: string): void {
    this.removeItem.emit(id);
  }

  /** 类型守卫：是否为规则组 */
  isRuleGroup(item: UIRuleGroup | UIRule): item is UIRuleGroup {
    return 'combinator' in item && 'rules' in item;
  }

  /** 类型转换：转为规则组 */
  asRuleGroup(item: UIRuleGroup | UIRule): UIRuleGroup {
    return item as UIRuleGroup;
  }

  /** 类型转换：转为规则 */
  asRule(item: UIRuleGroup | UIRule): UIRule {
    return item as UIRule;
  }

  /** 追踪函数 */
  trackByItem(item: UIRuleGroup | UIRule): string {
    return item.id;
  }

  isDragging(itemId: string): boolean {
    return this.dragDropHandler()?.state().draggedItemId === itemId;
  }

  isDropTarget(itemId: string, mode: QueryDropMode): boolean {
    const state = this.dragDropHandler()?.state();
    return !!state && state.targetItemId === itemId && state.dropMode === mode && state.isValidTarget;
  }

  isDropInvalid(itemId: string): boolean {
    const state = this.dragDropHandler()?.state();
    return !!state && state.targetItemId === itemId && !state.isValidTarget && !!state.draggedItemId;
  }

  onItemDragStart(event: DragEvent, item: UIRule | UIRuleGroup): void {
    const handler = this.dragDropHandler();
    if (!handler || !event.dataTransfer) return;
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', item.id);
    const row = (event.target as HTMLElement).closest('.rxdb-drag-item') as HTMLElement | null;
    if (row) {
      const rect = row.getBoundingClientRect();
      event.dataTransfer.setDragImage(row, event.clientX - rect.left, event.clientY - rect.top);
    }
    handler.start(item.id);
  }

  onItemDragOver(event: DragEvent, item: UIRule | UIRuleGroup, index: number, isGroup: boolean): void {
    event.preventDefault();
    event.stopPropagation();
    const handler = this.dragDropHandler();
    if (!handler || !event.dataTransfer) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const dropMode = calculateDropMode(event.clientY, rect, isGroup);
    const draggedId = handler.state().draggedItemId;
    const isValid = !!draggedId && draggedId !== item.id && (dropMode !== 'into' || isGroup);
    event.dataTransfer.dropEffect = isValid ? 'move' : 'none';
    handler.over(item.id, dropMode, isValid, this.depth());
  }

  onItemDragLeave(event: DragEvent): void {
    const target = event.currentTarget as HTMLElement;
    const related = event.relatedTarget as Node | null;
    if (!related || !target.contains(related)) {
      this.dragDropHandler()?.leave();
    }
  }

  onItemDrop(event: DragEvent, targetItem: UIRule | UIRuleGroup, targetIndex: number, isGroup: boolean): void {
    event.preventDefault();
    event.stopPropagation();
    const handler = this.dragDropHandler();
    const state = handler?.state();
    if (!handler || !state?.draggedItemId || !state.isValidTarget || !state.dropMode) {
      handler?.end();
      return;
    }
    const dropMode = state.dropMode;
    let finalTargetGroupId: string;
    let finalTargetIndex: number;
    if (dropMode === 'into' && isGroup) {
      const subGroup = targetItem as UIRuleGroup;
      finalTargetGroupId = subGroup.id;
      const draggedInTarget = subGroup.rules.some(r => r.id === state.draggedItemId);
      finalTargetIndex = draggedInTarget ? subGroup.rules.length - 1 : subGroup.rules.length;
    } else {
      finalTargetGroupId = this.group().id;
      const rules = this.group().rules;
      const draggedIndex = rules.findIndex(r => r.id === state.draggedItemId);
      const isInSameGroup = draggedIndex !== -1;
      let adjustedIndex = targetIndex;
      if (isInSameGroup && draggedIndex < targetIndex) {
        adjustedIndex--;
      }
      finalTargetIndex = dropMode === 'before' ? adjustedIndex : adjustedIndex + 1;
    }
    handler.drop(state.draggedItemId, finalTargetGroupId, finalTargetIndex);
  }

  onItemDragEnd(): void {
    this.dragDropHandler()?.end();
  }
}
