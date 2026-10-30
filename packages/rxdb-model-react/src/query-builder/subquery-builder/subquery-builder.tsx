/**
 * @fileoverview 子查询构建器组件（Angular `SubqueryBuilderComponent` 的 React 移植）。
 *
 * 用于 EXISTS / NOT EXISTS 操作符的嵌套查询条件：添加子条件、嵌套规则组、清空子条件。
 * `initialQuery` 只应用一次（用户修改后不被重置）；没有规则时输出 `undefined`
 * （Angular 侧 queryChange 同语义）。挂载时 queryChange、validationChange 各只发一次，
 * 值是载入 `initialQuery` 之后的查询与校验结果（Angular / Vue 同口径）。
 *
 * @module query-builder/subquery-builder
 */
import {
  createQueryBuilderService,
  type FieldMetadata,
  type QueryBuilderRuleGroup,
  type QueryBuilderService,
  type RuleGroup,
  type UIRule,
  type ValidationResult
} from '@aiao/rxdb-model';
import { useEffect, useRef, useState, type JSX } from 'react';
import { QueryGroup, type UIRuleGroup } from '../query-group/query-group';
import './subquery-builder.css';

/** {@link SubqueryBuilder} 的 props。 */
export interface SubqueryBuilderProps {
  /** 字段列表。 */
  fields: FieldMetadata[];
  /** 初始查询（只应用一次）。 */
  initialQuery?: QueryBuilderRuleGroup<Record<string, unknown>>;
  /** 最大嵌套层级，缺省 `3`。 */
  maxDepth?: number;
  /** 查询变更事件（无规则时输出 undefined）。 */
  onQueryChange?: (query: { combinator: 'and' | 'or'; rules: unknown[] } | undefined) => void;
  /** 验证状态变更事件。 */
  onValidationChange?: (result: ValidationResult) => void;
}

/**
 * 子查询构建器组件：EXISTS / NOT EXISTS 的嵌套查询条件。
 */
export function SubqueryBuilder({
  fields,
  initialQuery,
  maxDepth = 3,
  onQueryChange,
  onValidationChange
}: SubqueryBuilderProps): JSX.Element {
  const serviceRef = useRef<QueryBuilderService<Record<string, unknown>> | null>(null);
  const initialQueryAppliedRef = useRef(false);
  const onQueryChangeRef = useRef(onQueryChange);
  const onValidationChangeRef = useRef(onValidationChange);
  const [rootGroup, setRootGroup] = useState<UIRuleGroup | undefined>(undefined);
  const [validation, setValidation] = useState<ValidationResult | undefined>(undefined);

  useEffect(() => {
    onQueryChangeRef.current = onQueryChange;
  }, [onQueryChange]);

  useEffect(() => {
    onValidationChangeRef.current = onValidationChange;
  }, [onValidationChange]);

  // 服务生命周期（挂载创建 / 卸载销毁，对应 Angular constructor + ngOnDestroy）。
  // 字段与 initialQuery 在创建时就交给服务（QueryBuilder 同做法）：订阅即拿到载入之后的查询与校验结果，
  // 挂载只发一次最终值，不先发临时的空查询（undefined）与临时合法。StrictMode 双挂载 / Activity 重显
  // 重建服务时同样在创建时载入
  useEffect(() => {
    const service = createQueryBuilderService<Record<string, unknown>>({
      config: { maxNestingLevel: maxDepth },
      fields,
      initialQuery: initialQuery as unknown as RuleGroup<Record<string, unknown>> | undefined
    });
    serviceRef.current = service;
    // 「只应用一次」针对这个服务：创建时已载入，下方 effect 不再重复应用
    initialQueryAppliedRef.current = initialQuery !== undefined;

    const groupSubscription = service.rootGroup$.subscribe(group => {
      setRootGroup(group as unknown as UIRuleGroup);
      const query = service.toRxDBQuery();
      // 没有规则时返回 undefined 而不是空的 RuleGroup
      onQueryChangeRef.current?.(!query.rules || query.rules.length === 0 ? undefined : query);
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
    };
    // 服务只在挂载 / 重连时创建：maxDepth、字段、initialQuery 在创建时读取（Angular 侧 constructor 同语义），
    // 之后的变化由下方 effect 同步
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 字段变化同步到服务（Angular 侧 effect 同语义）：空列表同样同步，字段被撤下后既有子规则立即按「字段不存在」校验
  useEffect(() => {
    serviceRef.current?.setFields(fields);
  }, [fields]);

  // 初始查询只应用一次（Angular 侧 effect 同语义）
  useEffect(() => {
    const service = serviceRef.current;
    if (service && !initialQueryAppliedRef.current && initialQuery) {
      initialQueryAppliedRef.current = true;
      service.fromRxDBQuery(initialQuery);
    }
  }, [initialQuery]);

  // maxDepth 同步到服务（Angular 侧 effect 同语义）
  useEffect(() => {
    serviceRef.current?.setMaxNestingLevel(maxDepth);
  }, [maxDepth]);

  const hasRules = !!rootGroup && rootGroup.rules.length > 0;

  /** 添加第一条规则。 */
  const handleAddFirstRule = (): void => {
    const firstField = fields[0];
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
  const handleClear = (): void => {
    serviceRef.current?.clear();
  };

  const onAddRule = (event: { parentId: string; rule: Omit<UIRule, 'id'> }): void => {
    serviceRef.current?.addRule(event.parentId, event.rule);
  };

  const onAddGroup = (parentId: string): void => {
    serviceRef.current?.addGroup(parentId);
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

  return (
    <div className='rxdb-subquery-builder subquery-builder border-base-300 bg-base-200/50 p-2'>
      {!hasRules ?
        <div className='text-base-content/60 flex items-center gap-2'>
          <button className='btn btn-ghost btn-xs' onClick={handleAddFirstRule} type='button'>
            + 添加子条件
          </button>
          <span className='text-xs opacity-50'>（可选）</span>
        </div>
      : <>
          <QueryGroup
            depth={0}
            fields={fields}
            group={rootGroup!}
            maxDepth={maxDepth}
            errors={validation?.errors ?? []}
            onAddGroup={onAddGroup}
            onAddRule={onAddRule}
            onRemoveItem={onRemoveItem}
            onUpdateCombinator={onUpdateCombinator}
            onUpdateRule={onUpdateRule}
          />
          <div className='mt-2 flex justify-end'>
            <button className='btn btn-ghost btn-xs text-error' onClick={handleClear} type='button'>
              清空
            </button>
          </div>
        </>
      }
    </div>
  );
}
