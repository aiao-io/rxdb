import { describe, expect, it, vi } from 'vitest';
import { createEntityFormController, type FormFieldConfig } from '../../entity-form/headless.js';

const fields: FormFieldConfig[] = [
  { field: 'title', displayName: '标题', type: 'string', required: true },
  { field: 'count', displayName: '数量', type: 'integer' },
  { field: 'locked', displayName: '锁定', type: 'string', readonly: true }
];

describe('EntityFormController', () => {
  it('在 Node 环境提供字段解析、错误定位和提交变更集', () => {
    const controller = createEntityFormController({
      fields,
      data: { title: '初始', count: 1, locked: '系统值' },
      mode: 'edit'
    });
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    const changed = controller.setField('count', '2');
    expect(changed.ok).toBe(true);
    expect(controller.snapshot.data.count).toBe(2);
    expect(controller.snapshot.dirty).toBe(true);
    expect(controller.getFieldState('count')).toMatchObject({ value: 2, readonly: false, displayValue: '2' });

    const invalid = controller.setField('count', '不是数字');
    expect(invalid.ok).toBe(false);
    expect(controller.snapshot.data.count).toBe(2);
    expect(controller.snapshot.errors[0]?.field).toBe('count');
    expect(controller.getFieldState('count')?.error?.field).toBe('count');

    const submitted = controller.submit();
    expect(submitted).toEqual({
      valid: true,
      data: { title: '初始', count: 2, locked: '系统值' },
      changes: { count: 2 }
    });
    expect(listener).toHaveBeenCalled();

    unsubscribe();
    controller.dispose();
    expect(() => controller.setField('title', '已销毁')).toThrow(/disposed/);
  });

  it('view 模式阻止写入和提交，取消恢复最近一次输入', () => {
    const controller = createEntityFormController({ fields, data: { title: '标题', count: 1 }, mode: 'view' });
    const readonly = controller.setField('title', '新标题');
    expect(readonly.ok).toBe(true);
    expect(controller.snapshot.data.title).toBe('标题');
    expect(controller.submit()).toEqual({ valid: false, result: { valid: false, errors: [] } });

    controller.setMode('edit');
    controller.setField('title', '修改');
    expect(controller.snapshot.dirty).toBe(true);
    expect(controller.cancel()).toEqual({ title: '标题', count: 1 });
    expect(controller.snapshot.dirty).toBe(false);
  });

  it('宿主数据更新会清掉旧错误和输入残留', () => {
    const controller = createEntityFormController({ fields, data: { title: 'A', count: 1 }, mode: 'edit' });
    controller.setField('count', 'bad');
    controller.setData({ title: 'B', count: 3 });
    expect(controller.snapshot.data).toEqual({ title: 'B', count: 3 });
    expect(controller.snapshot.errors).toEqual([]);
    expect(controller.snapshot.dirty).toBe(false);
  });

  it('初始非法值、多个字段错误和嵌套值都保持可观察且隔离', () => {
    const nested = { enabled: true };
    const controller = createEntityFormController({
      fields: [
        { field: 'count', displayName: '数量', type: 'integer', required: true },
        { field: 'json', displayName: 'JSON', type: 'json' }
      ],
      data: { count: 'bad', json: nested },
      mode: 'edit'
    });
    expect(controller.snapshot.valid).toBe(false);
    const snapshotValue = controller.snapshot.data.json as { enabled: boolean };
    snapshotValue.enabled = false;
    expect((controller.snapshot.data.json as { enabled: boolean }).enabled).toBe(true);
    controller.setField('count', 'still bad');
    controller.setField('json', '{bad');
    expect(controller.snapshot.errors.map(error => error.field)).toEqual(['count', 'json']);
    controller.validate();
    expect(controller.snapshot.errors.map(error => error.field)).toEqual(['count']);
  });
});
