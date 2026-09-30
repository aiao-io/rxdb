/**
 * @fileoverview 值输入组件（Angular `ValueInputComponent` 的 React 移植）。
 *
 * 根据字段类型和操作符显示合适的输入控件：
 * - string: 文本输入框；number: 数字输入框；boolean: 切换开关；date: 日期选择器；
 * - enum: 下拉选择器；array: 逗号分隔文本；range: 范围输入；
 * - null/notNull: 无输入；exists/notExists: 子查询构建器（`SubqueryBuilder`）。
 *
 * 差异：Angular 侧动态 `import()` 装配子查询组件（懒加载 chunk），React 直接渲染
 * `SubqueryBuilder` —— 对外行为一致（存在/不存在 + 关系字段时渲染子查询构建器）。
 * Angular 侧的 `valueChange`/`whereChange` output 与 `*Fn` input 在 React 合并为
 * `onValueChange` / `onWhereChange` 回调 prop（语义等价）。
 *
 * @module query-builder/value-input
 */
import {
  cn,
  getDefaultValueForType,
  getInputType,
  parseCommaSeparatedInput,
  UUID_RE,
  type FieldMetadata,
  type QueryBuilderRuleGroup
} from '@aiao/rxdb-model';
import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { PopoverSelect } from '../popover-select/popover-select';
import { SubqueryBuilder } from '../subquery-builder/subquery-builder';

/** {@link ValueInput} 的 props。 */
export interface ValueInputProps {
  /** 字段类型，缺省 `'string'`。 */
  fieldType?: string;
  /** 操作符，缺省 `'='`。 */
  operator?: string;
  /** 当前值，缺省 `''`。 */
  value?: unknown;
  /** 枚举选项列表。 */
  enumOptions?: unknown[];
  /** 关系字段的目标字段列表（exists 子查询用）。 */
  relationFields?: FieldMetadata[];
  /** exists 规则的 where 子查询。 */
  where?: QueryBuilderRuleGroup<Record<string, unknown>>;
  /** 校验错误提示（显示为 tooltip 与错误样式）。 */
  errorMessage?: string;
  /** 值变更回调。 */
  onValueChange?: (value: unknown) => void;
  /** 子查询变更回调。 */
  onWhereChange?: (where: QueryBuilderRuleGroup<Record<string, unknown>> | undefined) => void;
}

/** 按值初始化各输入形态的本地状态（Angular 侧 ngOnInit 同语义）。 */
function initialStates(
  value: unknown,
  inputType: string,
  fieldType: string
): {
  currentValue: unknown;
  rangeMin: unknown;
  rangeMax: unknown;
  arrayInputValue: string;
  currentDateStr: string;
  dateRangeStart: string;
  dateRangeEnd: string;
} {
  if (inputType === 'range' && Array.isArray(value)) {
    if (fieldType === 'date') {
      return {
        currentValue: '',
        rangeMin: null,
        rangeMax: null,
        arrayInputValue: '',
        currentDateStr: '',
        dateRangeStart: String(value[0] ?? ''),
        dateRangeEnd: String(value[1] ?? '')
      };
    }
    return {
      currentValue: '',
      rangeMin: value[0],
      rangeMax: value[1],
      arrayInputValue: '',
      currentDateStr: '',
      dateRangeStart: '',
      dateRangeEnd: ''
    };
  }
  if (inputType === 'array' && Array.isArray(value)) {
    return {
      currentValue: '',
      rangeMin: null,
      rangeMax: null,
      arrayInputValue: value.join(', '),
      currentDateStr: '',
      dateRangeStart: '',
      dateRangeEnd: ''
    };
  }
  if (inputType === 'enum-array') {
    return {
      currentValue: Array.isArray(value) ? value : [],
      rangeMin: null,
      rangeMax: null,
      arrayInputValue: '',
      currentDateStr: '',
      dateRangeStart: '',
      dateRangeEnd: ''
    };
  }
  if (inputType === 'date') {
    return {
      currentValue: '',
      rangeMin: null,
      rangeMax: null,
      arrayInputValue: '',
      currentDateStr: typeof value === 'string' ? value : '',
      dateRangeStart: '',
      dateRangeEnd: ''
    };
  }
  if (inputType === 'uuid') {
    return {
      currentValue: typeof value === 'string' ? value : '',
      rangeMin: null,
      rangeMax: null,
      arrayInputValue: '',
      currentDateStr: '',
      dateRangeStart: '',
      dateRangeEnd: ''
    };
  }
  return {
    currentValue: fieldType === 'number' && value === '' ? null : value,
    rangeMin: null,
    rangeMax: null,
    arrayInputValue: '',
    currentDateStr: '',
    dateRangeStart: '',
    dateRangeEnd: ''
  };
}

/**
 * 值输入组件：按字段类型 + 操作符推导输入形态。
 */
export function ValueInput({
  fieldType = 'string',
  operator = '=',
  value = '',
  enumOptions = [],
  relationFields = [],
  where,
  errorMessage = '',
  onValueChange,
  onWhereChange
}: ValueInputProps): JSX.Element {
  const inputType = useMemo(() => getInputType(fieldType, operator, enumOptions), [fieldType, operator, enumOptions]);

  const [currentValue, setCurrentValue] = useState<unknown>(
    () => initialStates(value, inputType, fieldType).currentValue
  );
  const [rangeMin, setRangeMin] = useState<unknown>(() => initialStates(value, inputType, fieldType).rangeMin);
  const [rangeMax, setRangeMax] = useState<unknown>(() => initialStates(value, inputType, fieldType).rangeMax);
  const [arrayInputValue, setArrayInputValue] = useState(
    () => initialStates(value, inputType, fieldType).arrayInputValue
  );
  const [currentDateStr, setCurrentDateStr] = useState(() => initialStates(value, inputType, fieldType).currentDateStr);
  const [dateRangeStart, setDateRangeStart] = useState(() => initialStates(value, inputType, fieldType).dateRangeStart);
  const [dateRangeEnd, setDateRangeEnd] = useState(() => initialStates(value, inputType, fieldType).dateRangeEnd);

  const previousInputTypeRef = useRef<string | null>(null);
  const onValueChangeRef = useRef(onValueChange);
  useEffect(() => {
    onValueChangeRef.current = onValueChange;
  }, [onValueChange]);

  // 输入形态切换 → 重置为该形态的默认值并 emit（Angular 侧 effect 同语义）
  useEffect(() => {
    const previous = previousInputTypeRef.current;
    if (previous !== null && previous !== inputType) {
      const defaultValue = getDefaultValueForType(inputType);
      setCurrentValue(defaultValue);
      onValueChangeRef.current?.(defaultValue);
    }
    previousInputTypeRef.current = inputType;
  }, [inputType]);

  const hasError = !!errorMessage;

  /** UUID 格式校验错误（基于 currentValue 派生，inputType 不是 uuid 时自动为空）。 */
  const uuidError =
    inputType !== 'uuid' ? '' : (
      (() => {
        const val = String(currentValue ?? '').trim();
        return val && !UUID_RE.test(val) ? '请输入合法的 UUID 格式' : '';
      })()
    );

  const enumSelectOptions = useMemo(
    () => enumOptions.map(option => ({ value: String(option), label: String(option) })),
    [enumOptions]
  );

  /** 通用值变更（string / boolean…）。 */
  const onValueChangeHandler = (nextValue: unknown): void => {
    setCurrentValue(nextValue);
    onValueChange?.(nextValue);
  };

  /** 数字输入变更：空串 → null，其余转数字。 */
  const onNumberInputChange = (raw: string): void => {
    const num = raw === '' ? null : Number(raw);
    setCurrentValue(num);
    onValueChange?.(num);
  };

  /** 枚举多选变更。 */
  const onEnumArrayChange = (event: React.ChangeEvent<HTMLSelectElement>): void => {
    const selectedValues = Array.from(event.target.selectedOptions).map(option => option.value);
    setCurrentValue(selectedValues);
    onValueChange?.(selectedValues);
  };

  /** 枚举选项是否选中。 */
  const isEnumSelected = (option: unknown): boolean => Array.isArray(currentValue) && currentValue.includes(option);

  /** 原生日期输入变更。 */
  const onNativeDateChange = (raw: string): void => {
    setCurrentDateStr(raw);
    onValueChange?.(raw || '');
  };

  /** 日期范围变更（两端齐全才 emit 区间，缺一端 emit 空数组）。 */
  const onDateRangePartChange = (start: string, end: string): void => {
    if (start && end) onValueChange?.([start, end]);
    else onValueChange?.([]);
  };

  /** 数值范围变更（两端齐全才 emit 区间，缺一端 emit 空数组）。 */
  const onRangeChange = (min: unknown, max: unknown): void => {
    if (min != null && max != null) onValueChange?.([min, max]);
    else onValueChange?.([]);
  };

  /** 数组输入值变更（逗号分隔字符串）。 */
  const onArrayInputChange = (raw: string): void => {
    setArrayInputValue(raw);
    onValueChange?.(parseCommaSeparatedInput(raw, fieldType));
  };

  /** 子查询条件变更。 */
  const handleWhereChange = (nextWhere: QueryBuilderRuleGroup<Record<string, unknown>> | undefined): void => {
    onWhereChange?.(nextWhere);
  };

  switch (inputType) {
    case 'none':
      return <span className='text-base-content/50 px-2 text-sm italic'>无需输入值</span>;
    case 'uuid':
      return (
        <div
          data-tip={uuidError || errorMessage || null}
          className={cn((uuidError || hasError) && 'tooltip tooltip-top')}
        >
          <input
            className={cn('input input-sm font-mono', (hasError || !!uuidError) && 'input-error')}
            value={String(currentValue)}
            onChange={event => {
              const raw = event.target.value;
              setCurrentValue(raw);
              const trimmed = raw.trim();
              onValueChange?.(trimmed.toLowerCase() || '');
            }}
            placeholder='输入 UUID'
            style={{ minWidth: '16rem' }}
            type='text'
          />
        </div>
      );
    case 'subquery':
      return (
        <div className='subquery-container w-full'>
          {!relationFields || relationFields.length === 0 ?
            <span className='text-base-content/50 px-2 text-sm italic'>存在/不存在（无子条件）</span>
          : <SubqueryBuilder
              fields={relationFields}
              initialQuery={where}
              onQueryChange={query =>
                handleWhereChange(query as QueryBuilderRuleGroup<Record<string, unknown>> | undefined)
              }
            />
          }
        </div>
      );
    case 'boolean':
      return (
        <input
          className='toggle toggle-sm'
          checked={!!currentValue}
          onChange={event => onValueChangeHandler(event.target.checked)}
          type='checkbox'
        />
      );
    case 'enum':
      return (
        <PopoverSelect
          options={enumSelectOptions}
          selected={String(currentValue ?? '')}
          onSelectChange={value => onValueChangeHandler(value)}
          minWidth='12rem'
          placeholder='选择值'
        />
      );
    case 'enum-array':
      return (
        <div data-tip={errorMessage || null} className={hasError ? 'tooltip tooltip-top' : ''}>
          <select
            className={cn('select select-sm', hasError && 'select-error')}
            onChange={onEnumArrayChange}
            multiple
            style={{ minWidth: '12rem', minHeight: '6rem' }}
          >
            {enumOptions.map(option => {
              const str = String(option);
              return (
                <option key={str} value={str} selected={isEnumSelected(option)}>
                  {str}
                </option>
              );
            })}
          </select>
        </div>
      );
    case 'range':
      if (fieldType === 'date') {
        return (
          <div className='flex items-center gap-2' data-tip={errorMessage || null}>
            <input
              className={cn('input input-sm', hasError && 'input-error')}
              value={dateRangeStart}
              onChange={event => {
                setDateRangeStart(event.target.value);
                onDateRangePartChange(event.target.value, dateRangeEnd);
              }}
              style={{ width: '9rem' }}
              type='date'
            />
            <span className='text-base-content/50'>至</span>
            <input
              className={cn('input input-sm', hasError && 'input-error')}
              value={dateRangeEnd}
              onChange={event => {
                setDateRangeEnd(event.target.value);
                onDateRangePartChange(dateRangeStart, event.target.value);
              }}
              style={{ width: '9rem' }}
              type='date'
            />
          </div>
        );
      }
      return (
        <div className='flex items-center gap-2' data-tip={errorMessage || null}>
          <input
            className={cn('input input-sm', hasError && 'input-error')}
            value={String(rangeMin ?? '')}
            onChange={event => {
              const min = event.target.value === '' ? null : Number(event.target.value);
              setRangeMin(min);
              onRangeChange(min, rangeMax);
            }}
            placeholder='最小值'
            style={{ width: '7rem' }}
            type='number'
          />
          <span className='text-base-content/50'>至</span>
          <input
            className={cn('input input-sm', hasError && 'input-error')}
            value={String(rangeMax ?? '')}
            onChange={event => {
              const max = event.target.value === '' ? null : Number(event.target.value);
              setRangeMax(max);
              onRangeChange(rangeMin, max);
            }}
            placeholder='最大值'
            style={{ width: '7rem' }}
            type='number'
          />
        </div>
      );
    case 'number':
      return (
        <div data-tip={errorMessage || null} className={hasError ? 'tooltip tooltip-top' : ''}>
          <input
            className={cn('input input-sm', hasError && 'input-error')}
            value={String(currentValue ?? '')}
            onChange={event => onNumberInputChange(event.target.value)}
            placeholder='输入数值'
            type='number'
          />
        </div>
      );
    case 'date':
      return (
        <div data-tip={errorMessage || null} className={hasError ? 'tooltip tooltip-top' : ''}>
          <input
            className={cn('input input-sm', hasError && 'input-error')}
            value={currentDateStr}
            onChange={event => onNativeDateChange(event.target.value)}
            style={{ width: '10rem' }}
            type='date'
          />
        </div>
      );
    case 'array':
      return (
        <div data-tip={errorMessage || null} className={hasError ? 'tooltip tooltip-top' : ''}>
          <input
            className={cn('input input-sm', hasError && 'input-error')}
            value={arrayInputValue}
            onChange={event => onArrayInputChange(event.target.value)}
            placeholder='输入多个值，用逗号分隔'
            style={{ width: '100%', minWidth: '12rem' }}
            type='text'
          />
        </div>
      );
    default:
      return (
        <div data-tip={errorMessage || null} className={hasError ? 'tooltip tooltip-top' : ''}>
          <input
            className={cn('input input-sm', hasError && 'input-error')}
            value={String(currentValue ?? '')}
            onChange={event => onValueChangeHandler(event.target.value)}
            placeholder='输入值'
            style={{ width: '100%', minWidth: '12rem' }}
            type='text'
          />
        </div>
      );
  }
}
