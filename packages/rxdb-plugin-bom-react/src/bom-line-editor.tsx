import {
  BOM_VIEW_STYLES,
  bomEditorFields,
  bomErrorText,
  parseBomEditorFields,
  type BomEditorFields,
  type BomViewCommands,
  type BomViewState
} from '@aiao/rxdb-plugin-bom';
import { useEffect, useId, useState, type ReactElement } from 'react';

const inputs: readonly { field: keyof BomEditorFields; label: string; type: string }[] = [
  { field: 'qty', label: '用量', type: 'text' },
  { field: 'componentScrap', label: '组件损耗', type: 'text' },
  { field: 'operationSeq', label: '投料工序', type: 'number' },
  { field: 'effectiveFrom', label: '生效起点', type: 'datetime-local' },
  { field: 'effectiveTo', label: '生效终点', type: 'datetime-local' }
];

/**
 * 编辑共享状态中当前发生项的已交付字段，保存沿用领域仓储（对齐 Angular `ao-bom-line-editor`、Vue `BomLineEditor`）。
 *
 * @remarks
 * 生效期按 UTC 填写与显示（`datetime-local` 不带时区），说明经 `aria-describedby` 关联到日期字段；
 * 保存失败与共享字段校验失败原样展示，切换发生项时重置表单。
 *
 * @param props - 共享状态与命令
 * @returns 有标签、只读原因与原始错误的原生表单
 */
export const BomLineEditor = ({
  state,
  commands
}: {
  state: BomViewState;
  commands: BomViewCommands;
}): ReactElement => {
  const { editor } = state;
  const utcHintId = useId();
  const [fields, setFields] = useState(() => bomEditorFields(editor.value));
  const [formError, setFormError] = useState<unknown>(null);
  useEffect(() => {
    setFields(bomEditorFields(editor.value));
    setFormError(null);
  }, [editor.value]);
  const disabled = editor.saving || !editor.value?.editable;
  const save = async (): Promise<void> => {
    if (disabled) return;
    setFormError(null);
    try {
      await commands.saveOccurrence(parseBomEditorFields(fields));
    } catch (error) {
      setFormError(error);
    }
  };
  const error = formError ?? editor.error;
  return (
    <section
      className='bom-view bom-line-editor'
      aria-label='BOM 行编辑器'
      aria-busy={editor.saving || editor.phase === 'loading'}
    >
      <style>{BOM_VIEW_STYLES}</style>
      {editor.value === null && (
        <p role='status'>{editor.phase === 'loading' ? '正在加载发生项…' : '请选择一条 BOM 行进行编辑'}</p>
      )}
      {editor.value !== null && (
        <form
          onSubmit={event => {
            event.preventDefault();
            void save();
          }}
        >
          <h3>BOM 行编辑</h3>
          <p id={utcHintId}>生效期按 UTC 填写与显示</p>
          {inputs.map(({ field, label, type }) => (
            <label key={field}>
              {label}
              <input
                aria-describedby={type === 'datetime-local' ? utcHintId : undefined}
                name={field}
                type={type}
                step={type === 'datetime-local' ? '0.001' : undefined}
                value={fields[field]}
                disabled={disabled}
                onChange={event => {
                  const value = event.currentTarget.value;
                  setFields(current => ({ ...current, [field]: value }));
                }}
              />
            </label>
          ))}
          {editor.value.readOnlyReason !== null && <p role='note'>{editor.value.readOnlyReason}</p>}
          {editor.saving && <p role='status'>正在保存发生项…</p>}
          <button type='submit' disabled={disabled}>
            {editor.saving ? '保存中…' : '保存'}
          </button>
        </form>
      )}
      {error !== null && <p role='alert'>{bomErrorText(error)}</p>}
    </section>
  );
};
