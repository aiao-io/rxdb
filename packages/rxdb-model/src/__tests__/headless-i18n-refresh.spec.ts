import { I18n } from '@aiao/rxdb-i18n';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createEntityDetailController,
  createEntityFormController,
  createQueryBuilderController,
  modelEnMessages,
  modelMessages,
  type FormFieldConfig
} from '../headless.js';

const fields: FormFieldConfig[] = [
  { field: 'title', displayName: '标题', type: 'string', required: true },
  { field: 'count', displayName: '数量', type: 'integer' }
];

const runtimes: I18n[] = [];

/** 与应用一致的双语运行时：随包中文目录 + 英文目录，默认中文。 */
const bilingual = (): I18n => {
  const runtime = new I18n({
    defaultLocale: 'zh-Hans',
    deviceLocale: 'zh-Hans',
    catalogs: [...modelMessages, { locale: 'en', namespace: 'rxdb-model', messages: modelEnMessages }]
  });
  runtimes.push(runtime);
  return runtime;
};

afterEach(() => {
  for (const runtime of runtimes.splice(0)) runtime.destroy();
});

describe('语言切换时控制器刷新已生成的文案', () => {
  it('表单：已显示的必填校验文案跟随语言刷新，并以 messagesChanged 通知订阅方', async () => {
    const i18n = bilingual();
    const form = createEntityFormController({ fields, mode: 'create', i18n });
    const listener = vi.fn();
    form.subscribe(listener);
    expect(form.getFieldState('title')?.error?.message).toBe('标题 是必填项');
    // 订阅时回放的当前值不算变化
    expect(listener).not.toHaveBeenCalled();

    await i18n.setLocale('en');

    expect(form.getFieldState('title')?.error?.message).toBe('标题 is required');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[1]).toMatchObject({
      type: 'messagesChanged',
      result: { valid: false, errors: [{ field: 'title', message: '标题 is required' }] }
    });
    expect(form.snapshot.valid).toBe(false);
  });

  it('表单：解析失败的文案同样刷新，输入状态与提交约束不变', async () => {
    const i18n = bilingual();
    const form = createEntityFormController({ fields, data: { title: '有标题', count: 1 }, mode: 'edit', i18n });
    form.setField('count', 'abc');
    expect(form.getFieldState('count')?.error?.message).toBe('数量 必须是整数');

    await i18n.setLocale('en');

    expect(form.getFieldState('count')?.error?.message).toBe('数量 Must be an integer');
    expect(form.snapshot.data.count).toBe(1);
    expect(form.submit()).toMatchObject({ valid: false, result: { errors: [{ field: 'count' }] } });

    form.setField('count', '3');
    expect(form.getFieldState('count')?.error).toBeUndefined();
    expect(form.submit()).toMatchObject({ valid: true, changes: { count: 3 } });
  });

  it('表单：丢弃输入后不再保留解析失败，换语言也不会让它复活', async () => {
    const i18n = bilingual();
    const form = createEntityFormController({ fields, data: { title: '有标题', count: 1 }, mode: 'edit', i18n });
    form.setField('count', 'abc');
    form.discardInput('count');
    expect(form.snapshot.valid).toBe(true);

    await i18n.setLocale('en');

    expect(form.snapshot.valid).toBe(true);
    expect(form.getFieldState('count')?.error).toBeUndefined();
  });

  it('表单：换字段后，解析失败的文案按新字段配置重建；字段类型变了则丢弃', () => {
    const i18n = bilingual();
    const form = createEntityFormController({ fields, data: { title: '有标题', count: 1 }, mode: 'edit', i18n });
    form.setField('count', 'abc');

    form.setFields([fields[0]!, { ...fields[1]!, displayName: 'Count' }]);
    expect(form.getFieldState('count')?.error?.message).toBe('Count 必须是整数');

    form.setFields([fields[0]!, { field: 'count', displayName: 'Count', type: 'string' }]);
    expect(form.getFieldState('count')?.error).toBeUndefined();
  });

  it('表单：销毁后取消订阅，运行时之后的变化不再触发刷新', async () => {
    const i18n = bilingual();
    const form = createEntityFormController({ fields, mode: 'create', i18n });
    expect(i18n.changes$.observed).toBe(true);

    form.dispose();
    expect(i18n.changes$.observed).toBe(false);
    await expect(i18n.setLocale('en')).resolves.toBeUndefined();
  });

  it('表单：运行时没有 changes$ 时照常工作', () => {
    const form = createEntityFormController({ fields, mode: 'create', i18n: { t: key => key } });
    expect(form.snapshot.valid).toBe(false);
    form.dispose();
  });

  it('详情：语言切换只刷新文案，不使进行中的保存会话失效', async () => {
    const i18n = bilingual();
    const detail = createEntityDetailController({
      fields,
      data: { title: '有标题', count: 1 },
      mode: 'create',
      i18n
    });
    let entered!: () => void;
    const started = new Promise<void>(resolve => {
      entered = resolve;
    });
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const saving = detail.save(async () => {
      entered();
      await gate;
    });
    await started;

    await i18n.setLocale('en');
    release();
    const result = await saving;

    expect(result.valid).toBe(true);
    expect(detail.snapshot.saving).toBe(false);
    expect(detail.snapshot.open).toBe(false);
    detail.dispose();
  });

  it('详情：已显示的错误跟随语言刷新', async () => {
    const i18n = bilingual();
    const detail = createEntityDetailController({ fields, mode: 'create', i18n });
    expect(detail.snapshot.form.fieldStates[0]?.error?.message).toBe('标题 是必填项');

    await i18n.setLocale('en');

    expect(detail.snapshot.form.fieldStates[0]?.error?.message).toBe('标题 is required');
    detail.dispose();
  });

  it('查询构建器：校验文案跟随语言刷新，并以 validationChanged 通知订阅方', async () => {
    const i18n = bilingual();
    const builder = createQueryBuilderController({
      fields: [{ name: 'title', displayName: '标题', type: 'string' }],
      i18n
    });
    builder.addRule(null, { field: 'title', operator: 'contains', value: '' });
    expect(builder.snapshot.validation.errors?.[0]?.message).toBe('标题需要提供一个值');
    const listener = vi.fn();
    builder.subscribe(listener);

    await i18n.setLocale('en');

    expect(builder.snapshot.validation.errors?.[0]?.message).toBe('标题 requires a value');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[1]).toMatchObject({ type: 'validationChanged' });
    expect(builder.snapshot.valid).toBe(false);
  });

  it('查询构建器：销毁后取消订阅；运行时没有 changes$ 时照常工作', () => {
    const i18n = bilingual();
    const builder = createQueryBuilderController({ fields: [], i18n });
    expect(i18n.changes$.observed).toBe(true);
    builder.dispose();
    expect(i18n.changes$.observed).toBe(false);

    const quiet = createQueryBuilderController({ fields: [], i18n: { t: key => key } });
    expect(quiet.snapshot.valid).toBe(true);
    quiet.dispose();
  });

  it('运行时在订阅后同步回放当前值时不触发刷新，之后的通知才刷新', () => {
    const changes$ = new Subject<number>();
    const form = createEntityFormController({
      fields,
      mode: 'create',
      i18n: { t: (key: string) => key, changes$ }
    });
    const listener = vi.fn();
    form.subscribe(listener);

    changes$.next(1);

    expect(listener).toHaveBeenCalledTimes(1);
    form.dispose();
    changes$.next(2);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
