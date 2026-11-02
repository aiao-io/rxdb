import { useI18nRuntime } from '@aiao/rxdb-i18n-react';
import { useEntityForm } from '@aiao/rxdb-model-react/headless';
import { useRxDB } from '@aiao/rxdb-react';
import { useMemo, useState } from 'react';
import { createBlankArticle, createFields } from './article-model';
import { FieldRow, fieldId, useFieldInputs } from './field-controls';

/** 新建文章表单：字段、校验与提交都来自 `useEntityForm`，控件与布局是本页自己的；校验文案用应用的 i18n 运行时。 */
export function ArticleForm({
  onCreate
}: {
  onCreate(data: Record<string, unknown>): Promise<unknown>;
}): React.JSX.Element {
  const i18n = useI18nRuntime();
  const rxdb = useRxDB();
  const blank = useMemo(() => createBlankArticle(rxdb), [rxdb]);
  const { controller, snapshot } = useEntityForm({ fields: createFields, data: blank, mode: 'create', i18n });
  const inputs = useFieldInputs(controller);
  const [failure, setFailure] = useState<string | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    inputs.markAttempted();
    const result = controller.submit();
    if (!result.valid) {
      const [first] = result.result.errors;
      if (first) document.getElementById(fieldId('hl-form', first.field))?.focus();
      return;
    }
    try {
      await onCreate(result.data);
      setFailure(null);
      controller.cancel();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <section className='hl-section' aria-labelledby='hl-form-title' data-testid='headless-form'>
      <h2 id='hl-form-title'>新建文章</h2>
      <form noValidate onSubmit={event => void submit(event)} aria-labelledby='hl-form-title'>
        {snapshot.fieldStates.map(state => (
          <FieldRow key={state.config.field} idPrefix='hl-form' state={state} inputs={inputs} />
        ))}
        <div className='hl-actions'>
          <button type='submit'>提交</button>
          <button type='button' onClick={() => controller.cancel()}>
            取消
          </button>
        </div>
        <p role='status' data-testid='form-state'>
          {snapshot.dirty ? '有未提交的修改' : '没有修改'}
        </p>
        {failure && (
          <p className='hl-error' role='alert' data-testid='form-failure'>
            {failure}
          </p>
        )}
      </form>
    </section>
  );
}
