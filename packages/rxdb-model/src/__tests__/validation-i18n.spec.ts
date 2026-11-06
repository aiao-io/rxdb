import { I18n } from '@aiao/rxdb-i18n';
import { describe, expect, it } from 'vitest';
import { refreshFormValidationResult, validateForm } from '../entity-form/form-validation.js';
import { createEntityFormController } from '../entity-form/headless.js';
import type { FormFieldConfig } from '../entity-form/interfaces.js';
import { modelEnMessages, modelMessages } from '../messages.js';

const createRuntime = () =>
  new I18n({
    locale: 'zh-Hans',
    catalogs: [...modelMessages, { locale: 'en', namespace: 'rxdb-model', messages: modelEnMessages }]
  });

describe('已显示的校验错误本地化', () => {
  it('未知外部错误保留原文，不把同字段的必填规则当作错误来源', () => {
    const runtime = createRuntime();
    const result = { valid: false, errors: [{ field: 'title', message: 'Storage constraint rejected' }] };
    const field: FormFieldConfig = { field: 'title', displayName: '标题', type: 'string', required: true };
    expect(refreshFormValidationResult(result, [field], runtime)).toEqual(result);
    runtime.destroy();
  });
  it('按当前标签和语言刷新必填错误，保留原错误结果', async () => {
    const runtime = createRuntime();
    const field: FormFieldConfig = { field: 'title', displayName: '标题', type: 'string', required: true };
    const data = { title: '' };
    const result = validateForm([field], data, runtime);
    expect(result.errors[0]?.message).toBe('标题 是必填项');
    await runtime.setLocale('en');
    expect(refreshFormValidationResult(result, [{ ...field, displayName: 'Title' }], runtime).errors[0]?.message).toBe(
      'Title is required'
    );
    expect(result.errors[0]?.message).toBe('标题 是必填项');
    runtime.destroy();
  });

  it('受控输入丢弃非法输入后，已报告的解析错误仍按原输入重新翻译', async () => {
    const runtime = createRuntime();
    const field: FormFieldConfig = { field: 'count', displayName: '数量', type: 'integer' };
    const controller = createEntityFormController({ fields: [field], data: { count: 2 }, i18n: runtime });
    const failed = controller.setField('count', 'bad');
    if (failed.ok) throw new Error('应当拒绝非法整数');
    controller.discardInput('count');
    expect(controller.snapshot.data.count).toBe(2);
    await runtime.setLocale('en');
    const refreshed = refreshFormValidationResult(failed.result, [{ ...field, displayName: 'Count' }], runtime);
    expect(refreshed.errors[0]?.message).toBe('Count Must be an integer');
    expect(controller.snapshot.data.count).toBe(2);
    expect(refreshed.errors[0]?.reason).toEqual({ kind: 'parse', value: 'bad' });
    controller.dispose();
    runtime.destroy();
  });
});
