/**
 * @fileoverview 单条查询规则组件（Angular `QueryRuleComponent` 的 React 移植）。
 *
 * 语义与 Angular 侧一致：字段选择器 + 操作符选择器 + 值输入（exists 时子查询），
 * 字段变更的默认操作符推导、错误去重与 tooltip、主题插槽（默认主题 + 自定义主题）。
 * Angular 侧 NgComponentOutlet 的 `*Fn` 回调 input 在 React 合并为主题组件的
 * `onXxxChange` 回调 prop（语义等价）。
 *
 * @module query-builder/query-rule
 */
import type { FieldMetadata, QueryBuilderRuleGroup, UIRule, ValidationError } from '@aiao/rxdb-model';
import { useContext, useMemo, useState, type JSX } from 'react';
import { DEFAULT_QUERY_BUILDER_THEME } from '../theme/default-query-builder-theme';
import { QUERY_BUILDER_THEME } from '../theme/query-builder-theme';

/** 带 where 子查询的规则类型。 */
export type UIRuleWithWhere = UIRule & {
  where?: QueryBuilderRuleGroup<Record<string, unknown>>;
};

const EXISTS_OPERATORS = new Set(['exists', 'notExists']);
const NO_VALUE_OPERATORS = new Set(['null', 'notNull']);

/** {@link QueryRule} 的 props。 */
export interface QueryRuleProps {
  /** 规则。 */
  rule: UIRuleWithWhere;
  /** 字段列表。 */
  fields: FieldMetadata[];
  /** 校验错误列表。 */
  errors?: ValidationError[];
  /** 规则更新。 */
  onUpdate?: (event: { id: string; updates: Partial<UIRuleWithWhere> }) => void;
  /** 删除规则。 */
  onRemove?: () => void;
}

/**
 * 单条查询规则组件：字段 / 操作符 / 值输入 + 删除按钮；exists 时支持子查询。
 */
export function QueryRule({ rule, fields, errors = [], onUpdate, onRemove }: QueryRuleProps): JSX.Element {
  const theme = useContext(QUERY_BUILDER_THEME) ?? DEFAULT_QUERY_BUILDER_THEME;
  const ThemeFieldSelector = theme.fieldSelector;
  const ThemeOperatorSelector = theme.operatorSelector;
  const ThemeValueInput = theme.valueInput;

  const [showSubquery, setShowSubquery] = useState(false);

  /** 子查询面板是否展开（已有 where 规则时自动展开）。 */
  const subqueryVisible = (rule.where && rule.where.rules && rule.where.rules.length > 0) || showSubquery;

  // 子条件清空/全部删除时自动收起面板并恢复 +子条件 按钮（Angular 侧 effect 同语义；渲染期调整状态）
  const [prevWhere, setPrevWhere] = useState(rule.where);
  if (prevWhere !== rule.where) {
    setPrevWhere(rule.where);
    const hasRules = !!rule.where && !!rule.where.rules && rule.where.rules.length > 0;
    if (!hasRules) setShowSubquery(false);
  }

  const isExistsOperator = EXISTS_OPERATORS.has(rule.operator);
  const isNoValueOperator = NO_VALUE_OPERATORS.has(rule.operator);

  /** 规则错误：只保留本字段错误并按消息去重。 */
  const ruleErrors = useMemo(() => {
    const seen = new Set<string>();
    return errors.filter(error => {
      if (error.field !== rule.field) return false;
      if (seen.has(error.message)) return false;
      seen.add(error.message);
      return true;
    });
  }, [errors, rule.field]);

  const errorTooltip = ruleErrors.map(error => error.message).join(' | ');

  const currentField = useMemo(() => fields.find(field => field.name === rule.field), [fields, rule.field]);
  const currentFieldType = currentField?.type ?? 'string';
  const currentEnumOptions = currentField?.enum ?? [];
  const currentRelationFields = currentField?.relationFields ?? [];

  /** 字段变更：按字段类型推导默认操作符并重置子查询。 */
  const onFieldChange = (fieldName: string): void => {
    const field = fields.find(f => f.name === fieldName);
    onUpdate?.({
      id: rule.id,
      updates: {
        field: fieldName,
        operator:
          field?.isRelation ? 'exists'
          : field?.type === 'keyValue' ? 'null'
          : '=',
        value: field?.type === 'boolean' ? false : '',
        where: undefined
      }
    });
  };

  /** 添加子条件：展开面板并创建一条默认子规则。 */
  const onAddSubcondition = (): void => {
    setShowSubquery(true);
    const firstField = currentRelationFields[0];
    if (firstField) {
      const where: QueryBuilderRuleGroup<Record<string, unknown>> = {
        id: '',
        combinator: 'and',
        rules: [
          {
            id: '',
            field: firstField.name,
            operator:
              firstField.isRelation ? 'exists'
              : firstField.type === 'keyValue' ? 'null'
              : '=',
            value: firstField.type === 'boolean' ? false : ''
          }
        ]
      };
      onUpdate?.({ id: rule.id, updates: { where } });
    }
  };

  /** 操作符变更：exists/null 类清空 value；切回普通操作符清掉 where。 */
  const onOperatorChange = (operator: string): void => {
    const updates: Partial<UIRuleWithWhere> = { operator };
    if (EXISTS_OPERATORS.has(operator) || NO_VALUE_OPERATORS.has(operator)) {
      updates.value = null;
    }
    if (!EXISTS_OPERATORS.has(operator)) {
      updates.where = undefined;
      setShowSubquery(false);
    }
    onUpdate?.({ id: rule.id, updates });
  };

  const onValueChange = (value: unknown): void => {
    onUpdate?.({ id: rule.id, updates: { value } });
  };

  const onWhereChange = (where: QueryBuilderRuleGroup<Record<string, unknown>> | undefined): void => {
    onUpdate?.({ id: rule.id, updates: { where } });
  };

  return (
    <div className='rxdb-query-rule group flex flex-col rounded p-1'>
      <div className='flex flex-wrap items-center gap-2'>
        <ThemeFieldSelector fields={fields} selectedField={rule.field} onFieldChange={onFieldChange} />
        <ThemeOperatorSelector
          fieldMetadata={currentField}
          fieldType={currentFieldType}
          selectedOperator={rule.operator}
          onOperatorChange={onOperatorChange}
        />
        {isExistsOperator ?
          !subqueryVisible && (
            <button className='btn btn-ghost btn-xs' onClick={onAddSubcondition} title='添加子条件' type='button'>
              + 子条件（可选）
            </button>
          )
        : !isNoValueOperator && (
            <ThemeValueInput
              fieldType={currentFieldType}
              operator={rule.operator}
              value={rule.value}
              enumOptions={currentEnumOptions}
              relationFields={currentRelationFields}
              where={rule.where}
              errorMessage={errorTooltip}
              onValueChange={onValueChange}
              onWhereChange={onWhereChange}
            />
          )
        }
        <button
          className='btn btn-ghost btn-xs btn-square text-base-content/30 hover:text-error ml-auto'
          onClick={onRemove}
          title='删除条件'
          type='button'
        >
          ✕
        </button>
      </div>
      {isExistsOperator && subqueryVisible && (
        <ThemeValueInput
          fieldType={currentFieldType}
          operator={rule.operator}
          value={rule.value}
          enumOptions={currentEnumOptions}
          relationFields={currentRelationFields}
          where={rule.where}
          errorMessage={errorTooltip}
          onValueChange={onValueChange}
          onWhereChange={onWhereChange}
        />
      )}
    </div>
  );
}
