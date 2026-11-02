import type { EntityFormController, EntityFormFieldSnapshot } from '@aiao/rxdb-model/headless';
import { useEffect, useState } from 'react';

/** 数值字段用文本框承载，才能保留无法解析的原始输入并展示解析错误。 */
const NUMERIC_TYPES = new Set(['integer', 'number']);

/** 控件 id：前缀与区块标题的 id 分开命名，避免字段名恰好叫 `title` 时与标题元素撞 id。 */
export const fieldId = (prefix: string, field: string): string => `${prefix}-field-${field}`;

/** 表单输入的本地状态：用户键入的原始文本（有键即“已触碰”）与是否尝试过提交。 */
export interface FieldInputs {
  readonly raw: Readonly<Record<string, string>>;
  readonly attempted: boolean;
  input(field: string, value: string): void;
  markAttempted(): void;
}

/**
 * 管理控件的原始输入文本。
 *
 * 控制器保存解析后的合法值，并私下记着尚未修正的解析失败（用来按当前语言重生成错误文案）；
 * 控件要回显用户键入的文本，仍由消费方保存，并在宿主重置 / 取消（控制器发出 `reset` / `cancelled`）时清空。
 */
export function useFieldInputs(controller: EntityFormController): FieldInputs {
  const [raw, setRaw] = useState<Record<string, string>>({});
  const [attempted, setAttempted] = useState(false);

  useEffect(
    () =>
      controller.subscribe((_snapshot, event) => {
        if (event.type !== 'reset' && event.type !== 'cancelled') return;
        setRaw({});
        setAttempted(false);
      }),
    [controller]
  );

  return {
    raw,
    attempted,
    input(field, value) {
      setRaw(previous => ({ ...previous, [field]: value }));
      controller.setField(field, value);
    },
    markAttempted: () => setAttempted(true)
  };
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
  const showError = state.error !== undefined && (inputs.attempted || config.field in inputs.raw);
  const common = {
    id,
    name: config.field,
    disabled: state.readonly,
    'aria-invalid': showError || undefined,
    'aria-describedby': showError ? errorId : undefined,
    'aria-required': config.required || undefined
  };

  const control =
    config.type === 'enum' ?
      <select
        {...common}
        value={String(state.value ?? '')}
        onChange={event => inputs.input(config.field, event.target.value)}
      >
        <option value=''>请选择</option>
        {(config.enumValues ?? []).map(value => (
          <option key={value} value={value}>
            {config.options?.[value]?.label ?? value}
          </option>
        ))}
      </select>
    : <input
        {...common}
        type='text'
        inputMode={NUMERIC_TYPES.has(config.type) ? 'numeric' : undefined}
        value={inputs.raw[config.field] ?? state.displayValue}
        onChange={event => inputs.input(config.field, event.target.value)}
      />;

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
