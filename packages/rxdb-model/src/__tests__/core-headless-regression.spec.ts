import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { createEntityFormController, type FormFieldConfig } from '../entity-form/headless.js';
import type { QueryBuilderRule } from '../query-builder/models/query-builder-state.js';
import { createQueryBuilderController, type QueryBuilderController } from '../query-builder/services/headless.js';
import { cloneStructured, structuralEqual } from '../structural-equal.js';

const numericFields: FormFieldConfig[] = [
  { field: 'first', displayName: '第一个数', type: 'integer', required: true },
  { field: 'second', displayName: '第二个数', type: 'integer', required: true }
];

describe('headless 表单状态回归', () => {
  it('合法解析出空值时仍能读取必填字段错误', () => {
    const form = createEntityFormController({ fields: numericFields, data: { first: 1, second: 2 } });
    form.setField('first', '');
    expect(form.snapshot.valid).toBe(false);
    expect(form.snapshot.errors.map(error => error.field)).toContain('first');
  });

  it('宿主替换为非法数据后立即提供错误', () => {
    const form = createEntityFormController({ fields: numericFields, data: { first: 1, second: 2 } });
    form.setData({ first: null, second: null });
    expect(form.snapshot.valid).toBe(false);
    expect(form.snapshot.errors.map(error => error.field).sort()).toEqual(['first', 'second']);
  });

  it('取消恢复的非法初始数据仍有字段错误', () => {
    const form = createEntityFormController({ fields: numericFields, data: { first: null, second: null } });
    form.setField('first', '3');
    form.cancel();
    expect(form.snapshot.valid).toBe(false);
    expect(form.getFieldState('first')?.error?.field).toBe('first');
  });

  it('解析错误独立保留，修改其他字段和字段配置不会吞掉它', () => {
    const form = createEntityFormController({ fields: numericFields, data: { first: 1, second: 2 } });
    form.setField('first', 'not integer');
    form.setField('second', 'also not integer');
    expect(form.snapshot.errors.map(error => error.field).sort()).toEqual(['first', 'second']);
    form.setFields(numericFields.map(field => ({ ...field, helpText: '新提示' })));
    expect(form.snapshot.valid).toBe(false);
    expect(form.snapshot.errors.map(error => error.field).sort()).toEqual(['first', 'second']);
  });

  it('关系 provider、枚举和多选标签可刷新，快照不会污染字段配置', () => {
    const fields: FormFieldConfig[] = [
      {
        field: 'owner',
        displayName: '负责人',
        type: 'manyToOne',
        relatedEntityName: 'Person',
        relatedNamespace: 'team'
      },
      { field: 'state', displayName: '状态', type: 'enum', options: { open: { label: '开启' } } },
      {
        field: 'flags',
        displayName: '标签',
        type: 'stringArray',
        options: { one: { label: '一' }, two: { label: '二' } }
      }
    ];
    const firstProvider = vi.fn(() => [{ id: 'owner-id', displayName: '小明' }]);
    const form = createEntityFormController({
      fields,
      data: { owner: 'owner-id', state: 'open', flags: ['one', 'two'] },
      mode: 'view',
      relatedEntityProvider: firstProvider
    });
    expect(form.getFieldState('owner')).toMatchObject({ displayValue: '小明', readonly: true });
    expect(firstProvider).toHaveBeenCalledWith('Person', 'team');
    expect(form.getFieldState('state')?.displayValue).toBe('开启');
    expect(form.getFieldState('flags')?.displayValue).toBe('一, 二');
    form.setRelatedEntityProvider(() => [{ id: 'owner-id', displayName: '小红' }]);
    expect(form.getFieldState('owner')?.displayValue).toBe('小红');
    const snapshot = form.snapshot;
    snapshot.fields[1]!.options!['open']!.label = '被污染';
    expect(form.getFieldState('state')?.displayValue).toBe('开启');
  });

  it('Date、Uint8Array 和循环数据的输入、快照互不别名', () => {
    const date = new Date('2026-10-31T00:00:00.000Z');
    const bytes = new Uint8Array([1, 2]);
    const circular: { label: string; self?: unknown } = { label: 'root' };
    circular.self = circular;
    const form = createEntityFormController({
      fields: [
        { field: 'date', displayName: '日期', type: 'date' },
        { field: 'bytes', displayName: '字节', type: 'binary' },
        { field: 'json', displayName: '结构', type: 'json' }
      ],
      data: { date, bytes, json: circular }
    });
    date.setTime(0);
    bytes[0] = 9;
    circular.label = 'source changed';
    const data = form.snapshot.data;
    expect(data.date).toEqual(new Date('2026-10-31T00:00:00.000Z'));
    expect(data.bytes).toEqual(new Uint8Array([1, 2]));
    expect((data.json as { label: string }).label).toBe('root');
    expect((data.json as { self: unknown }).self).toBe(data.json);
    (data.date as Date).setTime(1);
    (data.bytes as Uint8Array)[0] = 7;
    expect(form.snapshot.data.date).toEqual(new Date('2026-10-31T00:00:00.000Z'));
    expect(form.snapshot.data.bytes).toEqual(new Uint8Array([1, 2]));
    expect(structuralEqual(cloneStructured(form.snapshot.data), form.snapshot.data)).toBe(true);
  });

  it('Date 与字节序列按值比较，循环结构克隆后保持自己的引用', () => {
    expect(structuralEqual(new Date(1), new Date(2))).toBe(false);
    expect(structuralEqual(new Uint8Array([1]), new Uint8Array([2]))).toBe(false);
    const circular: { self?: unknown } = {};
    circular.self = circular;
    const copy = cloneStructured(circular);
    expect(copy).not.toBe(circular);
    expect(copy.self).toBe(copy);
    expect(structuralEqual(circular, copy)).toBe(true);
  });

  it('字段变更返回值和监听事件不会泄漏内部旧值', () => {
    const form = createEntityFormController({
      fields: [{ field: 'json', displayName: '结构', type: 'json' }],
      data: { json: { value: 'initial' } }
    });
    let previous: { value: string } | undefined;
    form.subscribe((_snapshot, event) => {
      if (event.type === 'fieldChanged') previous = event.event.previousValue as { value: string };
    });
    form.setField('json', { value: 'updated' });
    previous!.value = 'listener changed';
    form.cancel();
    expect(form.snapshot.data.json).toEqual({ value: 'initial' });
  });
});

describe('headless 查询构建器封装回归', () => {
  it('readonly 的公共类型和运行时都不暴露可绕过权限的 service', () => {
    const query = createQueryBuilderController({ readonly: true });
    expectTypeOf<'service' extends keyof QueryBuilderController ? true : false>().toEqualTypeOf<false>();
    expect('service' in query).toBe(false);
    expect(() => query.addRule()).toThrow(/readonly/);
    expect(() => query.clear()).toThrow(/readonly/);
    expect(() => query.fromRxDBQuery({ combinator: 'and', rules: [] })).toThrow(/readonly/);
  });

  it('query initialQuery 与字段元数据修改不会绕过控制器动作', () => {
    const initialQuery = {
      combinator: 'and' as const,
      rules: [{ field: 'title', operator: '=' as const, value: 'original' }]
    };
    const fields = [{ name: 'title', displayName: '标题', type: 'string' as const }];
    const query = createQueryBuilderController({ fields, initialQuery });
    initialQuery.rules[0]!.value = 'source changed';
    fields[0]!.displayName = 'source changed';
    expect((query.snapshot.state.rootGroup.rules[0] as QueryBuilderRule).value).toBe('original');
    expect(query.snapshot.fields[0]!.displayName).toBe('标题');
  });

  it('查询的初始数据和 add/update 值不与宿主对象共享引用', () => {
    const value = { nested: ['original'] };
    const query = createQueryBuilderController({ fields: [{ name: 'json', displayName: '结构', type: 'object' }] });
    const id = query.addRule(null, { field: 'json', operator: '=', value });
    value.nested[0] = 'source changed';
    expect((query.snapshot.state.rootGroup.rules[0] as QueryBuilderRule).value).toEqual({ nested: ['original'] });
    const next = { nested: ['next'] };
    query.updateRule(id, { value: next });
    next.nested[0] = 'next source changed';
    expect((query.snapshot.state.rootGroup.rules[0] as QueryBuilderRule).value).toEqual({ nested: ['next'] });
  });

  it('订阅事件也不能直接修改查询内部状态', () => {
    const query = createQueryBuilderController({ fields: [{ name: 'title', displayName: '标题', type: 'string' }] });
    query.subscribe((_snapshot, event) => {
      if (event.type === 'stateChanged') {
        const first = event.state.rootGroup.rules[0] as QueryBuilderRule | undefined;
        if (first) first.value = 'listener changed';
      }
    });
    query.addRule(null, { field: 'title', operator: '=', value: 'original' });
    expect((query.snapshot.state.rootGroup.rules[0] as QueryBuilderRule).value).toBe('original');
  });
});
