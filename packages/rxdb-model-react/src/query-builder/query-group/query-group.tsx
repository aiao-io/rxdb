/**
 * @fileoverview 查询规则组组件（Angular `QueryGroupComponent` 的 React 移植）。
 *
 * 语义与 Angular 侧一致：AND/OR 切换（Teable 风格行内 conjunction 前缀）、
 * 添加规则/子组、删除组、递归嵌套显示、折叠、嵌套层级上限提示与拖拽重排。
 * `QueryDragDropHandler` 保留类 API（start/over/leave/drop/end），状态经
 * `subscribe` + `useSyncExternalStore` 接入 React 渲染。
 *
 * @module query-builder/query-group
 */
import type { FieldMetadata, UIRule, ValidationError } from '@aiao/rxdb-model';
import { useState, useSyncExternalStore, type JSX } from 'react';
import { QueryRule } from '../query-rule/query-rule';
import './query-group.css';

/** UI 规则组（宽松类型）。 */
export interface UIRuleGroup {
  id: string;
  combinator: 'and' | 'or';
  rules: Array<UIRule | UIRuleGroup>;
}

/** 拖拽放置模式。 */
export type QueryDropMode = 'before' | 'after' | 'into';

/** 拖拽状态快照。 */
export interface QueryDragDropState {
  draggedItemId: string | null;
  targetItemId: string | null;
  dropMode: QueryDropMode | null;
  isValidTarget: boolean;
  depth?: number;
}

const INITIAL_DRAG_STATE: QueryDragDropState = {
  draggedItemId: null,
  targetItemId: null,
  dropMode: null,
  isValidTarget: false
};

/**
 * 拖拽状态管理器（Angular 侧同款类；signal → 订阅模型，React 侧经 useSyncExternalStore 消费）。
 *
 * @remarks
 * Angular 的构造函数直接收 `moveItemFn`；React 侧服务实例在 effect 期就绪，
 * 拖拽管理器又必须在首次渲染创建（React Compiler 规则禁止在渲染期创建读取 ref 的闭包），
 * 因此 `moveItemFn` 改为可选构造参数 + `setMoveItemFn` 后期绑定 —— 行为等价。
 */
export class QueryDragDropHandler {
  #state: QueryDragDropState = { ...INITIAL_DRAG_STATE };
  readonly #listeners = new Set<() => void>();
  #moveItemFn: ((itemId: string, targetGroupId: string, targetIndex: number) => void) | undefined;

  constructor(moveItemFn?: (itemId: string, targetGroupId: string, targetIndex: number) => void) {
    this.#moveItemFn = moveItemFn;
  }

  /** 绑定 / 替换 moveItem 实现。 */
  setMoveItemFn(moveItemFn: (itemId: string, targetGroupId: string, targetIndex: number) => void): void {
    this.#moveItemFn = moveItemFn;
  }

  /** 当前状态快照。 */
  getState(): QueryDragDropState {
    return this.#state;
  }

  /** 订阅状态变更（useSyncExternalStore 的 subscribe）。 */
  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  /** 记录被拖项。 */
  start(itemId: string): void {
    this.#set({ draggedItemId: itemId, targetItemId: null, dropMode: null, isValidTarget: false });
  }

  /** 记录目标与放置模式（更深层的 over 优先：浅层事件不覆盖深层目标）。 */
  over(targetItemId: string, dropMode: QueryDropMode, isValid: boolean, depth: number): void {
    const current = this.#state;
    if (current.depth !== undefined && depth < current.depth) return;
    this.#set({ ...current, targetItemId, dropMode, isValidTarget: isValid, depth });
  }

  /** 清掉目标但保留被拖项。 */
  leave(): void {
    this.#set({ ...this.#state, targetItemId: null, dropMode: null, isValidTarget: false, depth: undefined });
  }

  /** 放置：调用 moveItemFn 并复位；moveItemFn 抛错（如循环嵌套被服务层拒绝）时静默复位。 */
  drop(itemId: string, targetGroupId: string, targetIndex: number): void {
    try {
      this.#moveItemFn?.(itemId, targetGroupId, targetIndex);
    } catch {
      // 服务层拒绝（如循环嵌套），静默忽略
    }
    this.reset();
  }

  /** 结束拖拽（复位状态）。 */
  end(): void {
    this.reset();
  }

  reset(): void {
    this.#set({ ...INITIAL_DRAG_STATE });
  }

  #set(next: QueryDragDropState): void {
    this.#state = next;
    for (const listener of this.#listeners) listener();
  }
}

/** 按 clientY 与目标矩形计算放置模式（组模式支持 into）。 */
function calculateDropMode(clientY: number, rect: DOMRect, isGroup: boolean): QueryDropMode {
  const ratio = (clientY - rect.top) / rect.height;
  if (isGroup) {
    if (ratio < 0.25) return 'before';
    if (ratio > 0.75) return 'after';
    return 'into';
  }
  return ratio < 0.5 ? 'before' : 'after';
}

const EMPTY_HANDLER_STATE: QueryDragDropState = { ...INITIAL_DRAG_STATE };

/** 无 handler 时的稳定订阅（useSyncExternalStore 需要 subscribe 参数）。 */
const noopSubscribe = (): (() => void) => () => undefined;

/** {@link QueryGroup} 的 props。 */
export interface QueryGroupProps {
  /** 规则组。 */
  group: UIRuleGroup;
  /** 字段列表。 */
  fields: FieldMetadata[];
  /** 校验错误列表。 */
  errors?: ValidationError[];
  /** 嵌套深度，缺省 `0`。 */
  depth?: number;
  /** 最大嵌套层级，缺省 `5`。 */
  maxDepth?: number;
  /** 拖拽状态管理器；缺省时不渲染拖拽手柄。 */
  dragDropHandler?: QueryDragDropHandler;
  /** 是否允许展开/收起组，缺省 `true`。 */
  allowCollapse?: boolean;
  /** 添加规则。 */
  onAddRule?: (event: { parentId: string; rule: Omit<UIRule, 'id'> }) => void;
  /** 添加子组。 */
  onAddGroup?: (parentId: string) => void;
  /** 删除规则或组。 */
  onRemoveItem?: (id: string) => void;
  /** 更新规则。 */
  onUpdateRule?: (event: { id: string; updates: Partial<UIRule> }) => void;
  /** 更新组合器。 */
  onUpdateCombinator?: (event: { id: string; combinator: 'and' | 'or' }) => void;
}

/**
 * 查询规则组组件（递归）。
 */
export function QueryGroup({
  group,
  fields,
  errors = [],
  depth = 0,
  maxDepth = 5,
  dragDropHandler,
  allowCollapse = true,
  onAddRule,
  onAddGroup,
  onRemoveItem,
  onUpdateRule,
  onUpdateCombinator
}: QueryGroupProps): JSX.Element {
  const [collapsed, setCollapsed] = useState(false);

  const handlerState = useSyncExternalStore(
    dragDropHandler?.subscribe ?? noopSubscribe,
    () => dragDropHandler?.getState() ?? EMPTY_HANDLER_STATE
  );

  const canAddGroup = depth < maxDepth - 1;
  const nestingLimitHint = `已达最大嵌套层级（${maxDepth} 层）`;

  const isDragging = (itemId: string): boolean => handlerState.draggedItemId === itemId;
  const isDropTarget = (itemId: string, mode: QueryDropMode): boolean =>
    !!handlerState &&
    handlerState.targetItemId === itemId &&
    handlerState.dropMode === mode &&
    handlerState.isValidTarget;
  const isDropInvalid = (itemId: string): boolean =>
    !!handlerState &&
    handlerState.targetItemId === itemId &&
    !handlerState.isValidTarget &&
    !!handlerState.draggedItemId;

  /** 添加规则：用首个字段构造规则；boolean 默认 false、关系字段用 exists、keyValue 用 null。 */
  const handleAddRule = (): void => {
    const firstField = fields[0];
    if (firstField) {
      onAddRule?.({
        parentId: group.id,
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
  };

  /** 添加子组：按钮的 disabled 挡不住键盘/程序化调用，这里再守一次。 */
  const handleAddGroup = (): void => {
    if (!canAddGroup) return;
    onAddGroup?.(group.id);
  };

  const onItemDragStart = (event: React.DragEvent, item: UIRule | UIRuleGroup): void => {
    if (!dragDropHandler || !event.dataTransfer) return;
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', item.id);
    const row = (event.target as HTMLElement).closest('.rxdb-drag-item') as HTMLElement | null;
    if (row) {
      const rect = row.getBoundingClientRect();
      event.dataTransfer.setDragImage(row, event.clientX - rect.left, event.clientY - rect.top);
    }
    dragDropHandler.start(item.id);
  };

  const onItemDragOver = (event: React.DragEvent, item: UIRule | UIRuleGroup, isGroup: boolean): void => {
    event.preventDefault();
    event.stopPropagation();
    if (!dragDropHandler || !event.dataTransfer) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const dropMode = calculateDropMode(event.clientY, rect, isGroup);
    const draggedId = dragDropHandler.getState().draggedItemId;
    const isValid = !!draggedId && draggedId !== item.id && (dropMode !== 'into' || isGroup);
    event.dataTransfer.dropEffect = isValid ? 'move' : 'none';
    dragDropHandler.over(item.id, dropMode, isValid, depth);
  };

  const onItemDragLeave = (event: React.DragEvent): void => {
    const target = event.currentTarget as HTMLElement;
    const related = event.relatedTarget as Node | null;
    if (!related || !target.contains(related)) {
      dragDropHandler?.leave();
    }
  };

  const onItemDrop = (
    event: React.DragEvent,
    targetItem: UIRule | UIRuleGroup,
    targetIndex: number,
    isGroup: boolean
  ): void => {
    event.preventDefault();
    event.stopPropagation();
    if (!dragDropHandler) return;
    const state = dragDropHandler.getState();
    if (!state.draggedItemId || !state.isValidTarget || !state.dropMode) {
      dragDropHandler.end();
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
      finalTargetGroupId = group.id;
      const rules = group.rules;
      const draggedIndex = rules.findIndex(r => r.id === state.draggedItemId);
      const isInSameGroup = draggedIndex !== -1;
      let adjustedIndex = targetIndex;
      if (isInSameGroup && draggedIndex < targetIndex) {
        adjustedIndex--;
      }
      finalTargetIndex = dropMode === 'before' ? adjustedIndex : adjustedIndex + 1;
    }
    dragDropHandler.drop(state.draggedItemId, finalTargetGroupId, finalTargetIndex);
  };

  /** 类型守卫：是否为规则组。 */
  const isRuleGroup = (item: UIRuleGroup | UIRule): item is UIRuleGroup => 'combinator' in item && 'rules' in item;

  const renderItem = (item: UIRule | UIRuleGroup, index: number): JSX.Element => {
    const itemIsGroup = isRuleGroup(item);
    const classes = ['rxdb-drag-item'];
    if (isDragging(item.id)) classes.push('dragging');
    if (isDropInvalid(item.id)) classes.push('drop-invalid');
    if (isDropTarget(item.id, 'after')) classes.push('drop-target-after');
    if (isDropTarget(item.id, 'before')) classes.push('drop-target-before');
    if (isDropTarget(item.id, 'into')) classes.push('drop-target-into');

    const dragHandle = dragDropHandler && (
      <span
        className='btn btn-ghost btn-xs btn-square text-base-content/30 hover:text-base-content/60 mt-1 cursor-grab'
        draggable='true'
        onDragStart={event => onItemDragStart(event, item)}
      >
        ⠿
      </span>
    );

    if (itemIsGroup) {
      const subGroup = item as UIRuleGroup;
      return (
        <div
          className={classes.join(' ')}
          key={item.id}
          onDragEnd={() => dragDropHandler?.end()}
          onDragLeave={onItemDragLeave}
          onDragOver={event => onItemDragOver(event, item, true)}
          onDrop={event => onItemDrop(event, item, index, true)}
        >
          <div className='flex items-start gap-1'>
            {dragHandle}
            <div className='min-w-0 flex-1'>
              <QueryGroup
                allowCollapse={allowCollapse}
                depth={depth + 1}
                dragDropHandler={dragDropHandler}
                errors={errors}
                fields={fields}
                group={subGroup}
                maxDepth={maxDepth}
                onAddGroup={onAddGroup}
                onAddRule={onAddRule}
                onRemoveItem={onRemoveItem}
                onUpdateCombinator={onUpdateCombinator}
                onUpdateRule={onUpdateRule}
              />
            </div>
          </div>
        </div>
      );
    }

    const rule = item as UIRule;
    return (
      <div
        className={classes.join(' ')}
        key={item.id}
        onDragEnd={() => dragDropHandler?.end()}
        onDragLeave={onItemDragLeave}
        onDragOver={event => onItemDragOver(event, item, false)}
        onDrop={event => onItemDrop(event, item, index, false)}
      >
        <div className='flex items-center gap-1'>
          {dragHandle}
          <div className='min-w-0 flex-1'>
            <QueryRule
              errors={errors}
              fields={fields}
              rule={rule}
              onRemove={() => onRemoveItem?.(rule.id)}
              onUpdate={onUpdateRule}
            />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      className={`rxdb-query-group border-base-300 my-1 rounded-lg border p-2${depth % 2 === 1 ? 'bg-base-200' : ''}`}
    >
      <div className={`flex items-center gap-2${collapsed ? '' : 'mb-2'}`}>
        <div className='join'>
          <button
            className={`btn btn-xs join-item${group.combinator === 'and' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => {
              if (group.combinator !== 'and') onUpdateCombinator?.({ id: group.id, combinator: 'and' });
            }}
            type='button'
          >
            AND
          </button>
          <button
            className={`btn btn-xs join-item${group.combinator === 'or' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => {
              if (group.combinator !== 'or') onUpdateCombinator?.({ id: group.id, combinator: 'or' });
            }}
            type='button'
          >
            OR
          </button>
        </div>

        {allowCollapse && (
          <button
            className='btn btn-ghost btn-xs btn-square'
            title={collapsed ? '展开' : '收起'}
            type='button'
            onClick={() => setCollapsed(value => !value)}
          >
            <svg
              className={`h-3 w-3 transition-transform duration-200${collapsed ? '-rotate-90' : ''}`}
              fill='none'
              stroke='currentColor'
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth='2.5'
              viewBox='0 0 24 24'
            >
              <polyline points='6 9 12 15 18 9' />
            </svg>
          </button>
        )}

        <div className='flex-1' />

        {!collapsed && (
          <>
            <button className='btn btn-ghost btn-xs' onClick={handleAddRule} type='button'>
              + 条件
            </button>

            <button
              className='btn btn-ghost btn-xs'
              aria-disabled={!canAddGroup}
              title={canAddGroup ? undefined : nestingLimitHint}
              disabled={!canAddGroup}
              onClick={handleAddGroup}
              type='button'
            >
              + 分组
            </button>
            {!canAddGroup && (
              <span className='text-base-content/50 text-xs' role='status'>
                {nestingLimitHint}
              </span>
            )}

            {depth > 0 && (
              <button
                className='btn btn-ghost btn-xs btn-square text-base-content/40 hover:text-error'
                onClick={() => onRemoveItem?.(group.id)}
                title='删除组'
                type='button'
              >
                ✕
              </button>
            )}
          </>
        )}
      </div>

      {!collapsed && (
        <>
          <div className='space-y-1'>{group.rules.map((item, index) => renderItem(item, index))}</div>
          {group.rules.length === 0 && (
            <div className='text-base-content/50 py-2 text-center text-sm select-none'>暂无条件</div>
          )}
        </>
      )}
    </div>
  );
}
