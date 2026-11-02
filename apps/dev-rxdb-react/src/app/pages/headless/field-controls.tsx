import type { EntityFormController, EntityFormFieldSnapshot } from '@aiao/rxdb-model/headless';
import { useCallback, useEffect, useState } from 'react';

/** 数值字段用文本框承载，才能保留无法解析的原始输入并展示解析错误。 */
const NUMERIC_TYPES = new Set(['integer', 'number']);

/** 控件 id：前缀与区块标题的 id 分开命名，避免字段名恰好叫 `title` 时与标题元素撞 id。 */
export const fieldId = (prefix: string, field: string): string => `${prefix}-field-${field}`;

/** 表单输入的本地状态：原始文本、已触碰字段、是否尝试过提交。 */
export interface FieldInputs {
  readonly raw: Readonly<Record<string, string>>;
  readonly touched: ReadonlySet<string>;
  readonly attempted: boolean;
  input(field: string, value: unknown): void;
  markAttempted(): void;
}

/**
 * 管理控件的原始输入文本。
 *
 * 控制器只保存解析后的合法值；解析失败时用户键入的文本仍要留在控件里，所以由消费方保存原始文本，
 * 并在宿主重置 / 取消（控制器发出 `reset` / `cancelled`）时清空。
 */
export function useFieldInputs(controller: EntityFormController): FieldInputs {
  const [raw, setRaw] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const [attempted, setAttempted] = useState(false);

  useEffect(
    () =>
      controller.subscribe((_snapshot, event) => {
        if (event.type !== 'reset' && event.type !== 'cancelled') return;
        setRaw({});
        setTouched(new Set());
        setAttempted(false);
      }),
    [controller]
  );

  const input = useCallback(
    (field: string, value: unknown) => {
      if (typeof value === 'string') setRaw(previous => ({ ...previous, [field]: value }));
      setTouched(previous => new Set(previous).add(field));
      controller.setField(field, value);
    },
    [controller]
  );
  const markAttempted = useCallback(() => setAttempted(true), []);
  return { raw, touched, attempted, input, markAttempted };
}

/** 一个字段的标签 + 自有控件 + 错误提示；标签、错误关联与只读状态由本页自己连接。 */
export function FieldRow({
  idPrefix,
  state,
  inputs
}: {
  idPrefix: string;
  state: EntityFormFieldSnapshot;
  inputs: FieldInputs;
}): React.JSX.Element {
  const { config } = state;
  const id = fieldId(idPrefix, config.field);
  const errorId = `${id}-error`;
  const showError = state.error !== undefined && (inputs.attempted || inputs.touched.has(config.field));
  const common = {
    id,
    name: config.field,
    disabled: state.readonly,
    'aria-invalid': showError || undefined,
    'aria-describedby': showError ? errorId : undefined,
    'aria-required': config.required || undefined
  };

  let control: React.JSX.Element;
  if (config.type === 'boolean') {
    control = (
      <input
        {...common}
        type='checkbox'
        checked={state.value === true}
        onChange={event => inputs.input(config.field, event.target.checked)}
      />
    );
  } else if (config.type === 'enum') {
    control = (
      <select {...common} value={String(state.value ?? '')} onChange={event => inputs.input(config.field, event.target.value)}>
        <option value=''>请选择</option>
        {(config.enumValues ?? []).map(value => (
          <option key={value} value={value}>
            {config.options?.[value]?.label ?? value}
          </option>
        ))}
      </select>
    );
  } else {
    control = (
      <input
        {...common}
        type='text'
        inputMode={NUMERIC_TYPES.has(config.type) ? 'numeric' : undefined}
        value={inputs.raw[config.field] ?? state.displayValue}
        onChange={event => inputs.input(config.field, event.target.value)}
      />
    );
  }

  return (
    <div className='hl-field'>
      <label htmlFor={id}>{config.displayName}</label>
      {control}
      {showError && (
        <p className='hl-error' id={errorId} role='alert' data-testid={`error-${config.field}`}>
          {state.error?.message}
        </p>
      )}
    </div>
  );
}
