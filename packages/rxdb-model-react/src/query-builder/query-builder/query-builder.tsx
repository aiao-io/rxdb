/**
 * @fileoverview Query Builder 主组件（Angular `QueryBuilderComponent` 的 React 移植）。
 *
 * 语义与 Angular 侧一致：提供可视化的查询条件构建界面（字段选择 / 操作符 / 值输入、
 * AND/OR 组合、拖拽重排、最大 5 层嵌套、实时验证），`fields` 优先于 `schema`，
 * `initialQuery` 仅在引用变化时加载（用户修改不覆盖），Escape 在有规则时清空。
 * 服务生命周期：挂载创建、卸载销毁（对应 Angular constructor + ngOnDestroy）；
 * `<Activity>` 隐藏再显示、StrictMode 双挂载断开 effect 后重连时，新服务从当前查询快照起步。
 *
 * @module query-builder/query-builder
 */
import {
  createQueryBuilderService,
  type FieldMetadata,
  type QueryBuilderRuleGroup,
  type QueryBuilderService,
  type QueryBuilderServiceOptions,
  type RuleGroup,
  type SchemaInfo,
  type UIRule,
  type ValidationResult
} from '@aiao/rxdb-model';
import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { QueryDragDropHandler, QueryGroup, type UIRuleGroup } from '../query-group/query-group';

/** 未传 fields / schema 时的空字段列表：引用稳定，不随每次渲染换新、反复触发字段同步 */
const EMPTY_FIELDS: FieldMetadata[] = [];

/**
 * RxDB 查询输出格式。
 */
export interface RxDBQueryOutput<T> {
  combinator: 'and' | 'or';
  rules: Array<RxDBQueryOutput<T> | { field: keyof T & string; operator: string; value: unknown }>;
}

/** {@link QueryBuilder} 的 props。 */
export interface QueryBuilderProps<T extends object = Record<string, unknown>> {
  /** Schema 信息，包含字段定义。 */
  schema?: SchemaInfo;
  /** 字段列表（直接传入，优先于 schema）。 */
  fields?: FieldMetadata[];
  /** 初始查询条件（可选）。 */
  initialQuery?: RxDBQueryOutput<T>;
  /** 最大嵌套层级，缺省 `5`。 */
  maxDepth?: number;
  /** 内容区域最大高度（超出后滚动），支持任意 CSS 长度值，如 `'400px'`、`'50vh'`，缺省 `'80vh'`。 */
  height?: string;
  /** 是否开启拖拽排序功能，缺省 `true`。 */
  enableDrag?: boolean;
  /** 是否开启分组展开/收起功能，缺省 `true`。 */
  enableCollapse?: boolean;
  /** 查询条件变更事件。 */
  onQueryChange?: (query: RxDBQueryOutput<T>) => void;
  /** 验证状态变更事件。 */
  onValidationChange?: (result: ValidationResult) => void;
}

/**
 * 新服务的查询起点：宿主新给的 initialQuery 优先；否则沿用上一服务留下的查询快照（保留规则 id，界面不重建）；
 * 都没有时为空查询。
 */
function serviceStartingPoint<T>(
  replacedQuery: RxDBQueryOutput<T> | undefined,
  snapshot: QueryBuilderRuleGroup<T> | undefined
): Pick<QueryBuilderServiceOptions<T>, 'initialQuery' | 'initialState'> {
  if (replacedQuery !== undefined) return { initialQuery: replacedQuery as unknown as RuleGroup<T> };
  return snapshot ? { initialState: { rootGroup: snapshot } } : {};
}

/**
 * Query Builder 主组件。
 */
export function QueryBuilder<T extends object = Record<string, unknown>>({
  schema,
  fields = EMPTY_FIELDS,
  initialQuery,
  maxDepth = 5,
  height = '80vh',
  enableDrag = true,
  enableCollapse = true,
  onQueryChange,
  onValidationChange
}: QueryBuilderProps<T>): JSX.Element {
  const serviceRef = useRef<QueryBuilderService<T> | null>(null);
  /** 最近一次载入服务的 initialQuery 引用：引用没换即宿主没有主动替换，用户的编辑不被它覆盖 */
  const lastAppliedInitialQueryRef = useRef<unknown>(undefined);
  /**
   * 当前查询快照（服务最近一次发出的根规则组）。Activity 隐藏 / StrictMode 模拟卸载会断开 effect、销毁服务，
   * 组件 state 与 ref 却保留；重连时新服务从这份快照起步，用户尚未回写给宿主的编辑才不会丢
   */
  const rootGroupRef = useRef<QueryBuilderRuleGroup<T> | undefined>(undefined);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const onQueryChangeRef = useRef(onQueryChange);
  const onValidationChangeRef = useRef(onValidationChange);
  const [rootGroup, setRootGroup] = useState<UIRuleGroup | undefined>(undefined);
  const [validation, setValidation] = useState<ValidationResult | undefined>(undefined);
  // 拖拽状态管理器：挂载期创建一次（moveItem 实现由服务就绪后的 effect 绑定）
  const [dragDropHandler] = useState(() => new QueryDragDropHandler());

  useEffect(() => {
    onQueryChangeRef.current = onQueryChange;
  }, [onQueryChange]);

  useEffect(() => {
    onValidationChangeRef.current = onValidationChange;
  }, [onValidationChange]);

  // 计算后的字段列表（fields 优先于 schema）
  const fieldsComputed = useMemo(
    () => (fields.length > 0 ? fields : (schema?.fields ?? EMPTY_FIELDS)),
    [fields, schema]
  );

  // 服务生命周期（挂载创建 / 卸载销毁，对应 Angular constructor + ngOnDestroy）。
  // Activity 隐藏再显示、StrictMode 双挂载会断开后重连：宿主换了 initialQuery（引用变化，含首次挂载）就从它起步，
  // 否则从查询快照起步；从快照起步时服务的首个发射就是界面与宿主已持有的那份查询，不再通知，重连不对外发临时空查询
  useEffect(() => {
    const replacesQuery = initialQuery !== undefined && initialQuery !== lastAppliedInitialQueryRef.current;
    if (replacesQuery) lastAppliedInitialQueryRef.current = initialQuery;
    const service = createQueryBuilderService<T>({
      config: { maxNestingLevel: maxDepth },
      fields: fieldsComputed,
      ...serviceStartingPoint(replacesQuery ? initialQuery : undefined, rootGroupRef.current)
    });
    serviceRef.current = service;

    // 拖拽 moveItem 实现绑定到服务（服务实例 effect 期才就绪）
    dragDropHandler.setMoveItemFn((itemId, targetGroupId, targetIndex) => {
      service.moveItem(itemId, targetGroupId, targetIndex);
    });

    const groupSubscription = service.rootGroup$.subscribe(group => {
      if (group === rootGroupRef.current) return;
      rootGroupRef.current = group;
      setRootGroup(group as unknown as UIRuleGroup);
      onQueryChangeRef.current?.(service.toRxDBQuery() as unknown as RxDBQueryOutput<T>);
    });
    const validationSubscription = service.validation$.subscribe(result => {
      setValidation(result);
      onValidationChangeRef.current?.(result);
    });

    return () => {
      groupSubscription.unsubscribe();
      validationSubscription.unsubscribe();
      service.destroy();
      serviceRef.current = null;
      // 不复位 lastAppliedInitialQueryRef：重连时据它区分「宿主替换了 initialQuery」与「沿用快照里的用户编辑」
    };
    // 服务只在挂载 / 重连时创建：maxDepth、initialQuery、字段在创建时读取（Angular 侧 constructor 同语义），
    // 之后的 initialQuery / 字段变化由下方 effect 同步
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragDropHandler]);

  // 字段变化同步到服务（Angular 侧 effect 同语义）：空列表同样同步——字段被撤下后，
  // 既有规则要立即按「字段不存在」校验，不能让服务留着界面上已经选不到的旧字段
  useEffect(() => {
    serviceRef.current?.setFields(fieldsComputed);
  }, [fieldsComputed]);

  // 初始查询加载（引用变化时重新加载；用户修改不改变 initialQuery 引用故不会覆盖）
  useEffect(() => {
    const service = serviceRef.current;
    if (!service) return;
    if (initialQuery !== undefined && initialQuery !== lastAppliedInitialQueryRef.current) {
      lastAppliedInitialQueryRef.current = initialQuery;
      service.fromRxDBQuery(initialQuery as unknown as RuleGroup<T>);
    }
  }, [initialQuery]);

  const hasRules = !!rootGroup && rootGroup.rules.length > 0;

  /** 添加第一个规则。 */
  const addFirstRule = (): void => {
    const firstField = fieldsComputed[0];
    if (firstField) {
      serviceRef.current?.addRule(undefined, {
        field: firstField.name,
        operator:
          firstField.isRelation ? 'exists'
          : firstField.type === 'keyValue' ? 'null'
          : '=',
        value: firstField.type === 'boolean' ? false : ''
      });
    }
  };

  /** 清空所有规则。 */
  const clearAll = (): void => {
    serviceRef.current?.clear();
  };

  const scrollToBottom = (): void => {
    setTimeout(() => {
      const el = scrollContainerRef.current;
      el?.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }, 0);
  };

  const onAddRule = (event: { parentId: string; rule: Omit<UIRule, 'id'> }): void => {
    serviceRef.current?.addRule(event.parentId, event.rule);
    scrollToBottom();
  };

  const onAddGroup = (parentId: string): void => {
    serviceRef.current?.addGroup(parentId);
    scrollToBottom();
  };

  const onRemoveItem = (id: string): void => {
    serviceRef.current?.remove(id);
  };

  const onUpdateRule = (event: { id: string; updates: Partial<UIRule> }): void => {
    serviceRef.current?.updateRule(event.id, event.updates);
  };

  const onUpdateCombinator = (event: { id: string; combinator: 'and' | 'or' }): void => {
    serviceRef.current?.updateGroupCombinator(event.id, event.combinator);
  };

  /** 键盘快捷键处理：Escape 在有规则时清空（Angular 侧同语义）。 */
  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'Escape' && hasRules) {
      event.preventDefault();
      clearAll();
    }
  };

  return (
    <div
      className='rxdb-query-builder bg-base-100'
      onKeyDown={onKeyDown}
      aria-label='查询条件构建器'
      role='search'
      tabIndex={0}
    >
      <div className='overflow-y-auto' ref={scrollContainerRef} style={{ maxHeight: height }}>
        <div className='mb-4 flex items-center justify-between'>
          <h3 className='text-base' id='query-builder-title'>
            查询条件
          </h3>
          <div className='flex gap-2' aria-label='查询操作' role='toolbar'>
            {hasRules && (
              <button
                className='btn btn-ghost btn-sm'
                onClick={clearAll}
                onKeyDown={event => {
                  if (event.key === 'Enter') clearAll();
                }}
                aria-label='清空所有查询条件'
                title='清空所有查询条件 (Escape)'
                type='button'
              >
                清空
              </button>
            )}
          </div>
        </div>

        {!hasRules ?
          <div className='text-base-content/60 min-w-md py-8 text-center' aria-live='polite' role='status'>
            <div className='mb-2 flex justify-center' aria-hidden='true'>
              <svg
                className='size-12 opacity-40'
                fill='none'
                stroke='currentColor'
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth='2'
                viewBox='0 0 24 24'
              >
                <circle cx='11' cy='11' r='8' />
                <path d='m21 21-4.3-4.3' />
              </svg>
            </div>
            <p className='mb-4'>还没有任何查询条件</p>
            <button className='btn btn-sm' onClick={addFirstRule} aria-label='添加第一个条件' type='button'>
              添加第一个条件
            </button>
          </div>
        : <QueryGroup
            allowCollapse={enableCollapse}
            depth={0}
            dragDropHandler={enableDrag ? dragDropHandler : undefined}
            errors={validation?.errors ?? []}
            fields={fieldsComputed}
            group={rootGroup!}
            maxDepth={maxDepth}
            onAddGroup={onAddGroup}
            onAddRule={onAddRule}
            onRemoveItem={onRemoveItem}
            onUpdateCombinator={onUpdateCombinator}
            onUpdateRule={onUpdateRule}
          />
        }
      </div>
    </div>
  );
}
