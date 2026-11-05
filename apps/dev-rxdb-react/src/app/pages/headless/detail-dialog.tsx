import { useI18nRuntime } from '@aiao/rxdb-i18n-react';
import { useEntityDetail } from '@aiao/rxdb-model-react/headless';
import type { EntityDetailControllerOptions } from '@aiao/rxdb-model/headless';
import { useRxDB } from '@aiao/rxdb-react';
import { useEffect, useMemo, useRef } from 'react';
import {
  buildEditFields,
  createBlankArticle,
  createFields,
  detailTabs,
  errorMessage,
  type DetailData,
  type DetailResult,
  type DetailSaveResult
} from './article-model';
import { FieldRow, useFieldInputs } from './field-controls';

/**
 * 自有弹窗外壳 + 详情控制器：草稿、Tab、保存与取消来自 `useEntityDetail`，
 * 焦点约束与关闭后的焦点恢复交给原生 `<dialog>.showModal()`。
 */
export function DetailDialog({
  data,
  onSave,
  onClose
}: {
  data: DetailData;
  onSave(result: DetailSaveResult): Promise<void>;
  onClose(result: DetailResult): void;
}): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const creating = data.mode === 'create';
  const i18n = useI18nRuntime();
  const rxdb = useRxDB();
  // 弹窗每次打开都是新实例：系统字段名按打开时的应用语言翻译，新建的基线来自实例化的草稿
  const options = useMemo<EntityDetailControllerOptions>(
    () =>
      data.mode === 'create' ?
        { fields: createFields, mode: 'create', tabs: detailTabs.slice(0, 1), i18n, data: createBlankArticle(rxdb) }
      : { fields: buildEditFields(i18n), mode: 'edit', tabs: detailTabs, i18n, entity: data.record },
    [data, i18n, rxdb]
  );
  const { controller, snapshot } = useEntityDetail(options);
  const inputs = useFieldInputs(controller.form);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // 弹窗随组件卸载，浏览器不会替我们把焦点还给打开它的元素：自己记下并在关闭时恢复
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    return () => {
      dialog.close();
      opener?.focus();
    };
  }, []);

  const save = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    inputs.markAttempted();
    try {
      const result = await controller.save(onSave);
      if (result.valid) onClose('saved');
    } catch {
      // 失败原因已在 snapshot.error 暴露，弹窗保持打开让用户修正
    }
  };

  const cancel = (): void => {
    controller.cancel();
    onClose('cancelled');
  };

  const active = snapshot.activeTab;
  return (
    <dialog
      ref={dialogRef}
      className='hl-dialog'
      aria-labelledby='hl-dialog-title'
      data-testid='detail-dialog'
      onCancel={event => {
        event.preventDefault();
        cancel();
      }}
    >
      <form noValidate onSubmit={event => void save(event)}>
        <h2 id='hl-dialog-title'>{creating ? '新建文章' : '编辑文章'}</h2>
        <div role='tablist' aria-label='详情分区' className='hl-tabs'>
          {snapshot.tabs.map(tab => (
            <button
              key={tab.key}
              type='button'
              role='tab'
              id={`hl-tab-${tab.key}`}
              aria-selected={tab.key === active}
              aria-controls={`hl-panel-${tab.key}`}
              onClick={() => controller.selectTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div role='tabpanel' id={`hl-panel-${active}`} aria-labelledby={`hl-tab-${active}`}>
          {active === 'basic' &&
            snapshot.form.fieldStates
              .filter(state => !state.readonly)
              .map(state => <FieldRow key={state.config.field} idPrefix='hl-detail' state={state} inputs={inputs} />)}
          {active === 'system' && (
            <dl className='hl-system'>
              {snapshot.form.fieldStates
                .filter(state => state.readonly)
                .map(state => (
                  <div key={state.config.field}>
                    <dt>{state.config.displayName}</dt>
                    <dd data-testid={`system-${state.config.field}`}>{state.displayValue}</dd>
                  </div>
                ))}
            </dl>
          )}
        </div>
        {snapshot.error !== null && (
          <p className='hl-error' role='alert' data-testid='detail-error'>
            {errorMessage(snapshot.error)}
          </p>
        )}
        <div className='hl-actions'>
          <button type='submit' disabled={snapshot.saving}>
            保存
          </button>
          <button type='button' onClick={cancel}>
            取消
          </button>
        </div>
      </form>
    </dialog>
  );
}
