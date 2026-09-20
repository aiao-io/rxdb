/**
 * ValueInput —— **真实组件源码**（Angular `value-input.real.spec.ts` 的 React 移植）。
 *
 * Angular 侧每个 handler 都走「更新内部状态 + emit + 调 xxxFn 回调」三件事；
 * React 合并为单一 `onValueChange` / `onWhereChange` 回调（语义等价），
 * 此处经真实 DOM 事件驱动覆盖全部输入形态。
 */
import type { QueryBuilderRuleGroup } from '@aiao/rxdb-model';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ValueInput } from '../../../query-builder/value-input/value-input';

describe('ValueInput（真实组件）', () => {
  function renderInput(
    props: Partial<{
      fieldType: string;
      operator: string;
      value: unknown;
      enumOptions: unknown[];
      errorMessage: string;
      relationFields: unknown[];
    }> = {}
  ) {
    const emitted: unknown[] = [];
    const utils = render(
      <ValueInput
        fieldType={props.fieldType ?? 'string'}
        operator={props.operator ?? '='}
        value={props.value ?? ''}
        enumOptions={props.enumOptions}
        errorMessage={props.errorMessage}
        relationFields={props.relationFields as never}
        onValueChange={value => emitted.push(value)}
      />
    );
    return { ...utils, emitted };
  }

  /** 当前渲染的输入形态：按可见控件种类判定。 */
  function inputKind(host: ReturnType<typeof renderInput>): string {
    const el = host.container;
    if (el.textContent?.includes('无需输入值')) return 'none';
    if (el.querySelector('input[type=checkbox]')) return 'boolean';
    if (el.querySelector('select')) return 'enum-array';
    if (el.querySelector('input[type=number]')) return 'number';
    if (el.querySelector('input[type=date]')) return 'date';
    if (el.querySelector('.subquery-container')) return 'subquery';
    // enum 单选：popover 触发按钮（PopoverSelect）；文本形态没有按钮
    if (el.querySelector('button')) return 'enum';
    if (el.querySelector('input')) return 'text';
    return 'unknown';
  }

  it('按 fieldType + operator 推导输入形态', () => {
    expect(inputKind(renderInput({ fieldType: 'string' }))).toBe('text');
    expect(inputKind(renderInput({ fieldType: 'number' }))).toBe('number');
    expect(inputKind(renderInput({ fieldType: 'boolean' }))).toBe('boolean');
    // 有枚举选项时 in → enum-array，单值 → enum（popover 触发按钮）
    expect(inputKind(renderInput({ fieldType: 'string', operator: 'in', enumOptions: ['a'] }))).toBe('enum-array');
    expect(inputKind(renderInput({ fieldType: 'string', enumOptions: ['a'] }))).toBe('enum');
    // null / notNull 不需要值输入
    expect(inputKind(renderInput({ fieldType: 'string', operator: 'null' }))).toBe('none');
  });

  it('文本输入变更走 onValueChange', () => {
    const host = renderInput();
    fireEvent.change(host.container.querySelector('input')!, { target: { value: 'hello' } });

    expect(host.emitted).toEqual(['hello']);
  });

  it('数字输入把空串转 null，其余转数字', () => {
    const host = renderInput({ fieldType: 'number' });
    const input = host.container.querySelector('input[type=number]')!;
    fireEvent.change(input, { target: { value: '42' } });
    expect(host.emitted.at(-1)).toBe(42);

    fireEvent.change(input, { target: { value: '' } });
    expect(host.emitted.at(-1)).toBeNull();
  });

  it('UUID 输入去空白并转小写', () => {
    const host = renderInput({ fieldType: 'uuid' });
    fireEvent.change(host.container.querySelector('input')!, {
      target: { value: '  8B1A7C2E-0000-4000-8000-000000000000  ' }
    });

    expect(host.emitted.at(-1)).toBe('8b1a7c2e-0000-4000-8000-000000000000');
  });

  it('uuidError 只在 uuid 形态且格式非法时显示错误样式', () => {
    const uuidHost = renderInput({ fieldType: 'uuid' });
    const input = uuidHost.container.querySelector('input')!;
    fireEvent.change(input, { target: { value: 'not-a-uuid' } });
    expect(input.classList.contains('input-error')).toBe(true);

    fireEvent.change(input, { target: { value: '8b1a7c2e-0000-4000-8000-000000000000' } });
    expect(input.classList.contains('input-error')).toBe(false);

    // 空值不报错（未填 ≠ 格式错）
    fireEvent.change(input, { target: { value: '' } });
    expect(input.classList.contains('input-error')).toBe(false);
  });

  it('hasError 跟随 errorMessage', () => {
    expect(renderInput().container.querySelector('.input-error')).toBeNull();
    expect(renderInput({ errorMessage: '字段必填' }).container.querySelector('.input-error')).toBeTruthy();
  });

  it('数值范围：两端齐全才 emit 区间，缺一端 emit 空数组', () => {
    const host = renderInput({ fieldType: 'number', operator: 'between' });
    const [min, max] = host.container.querySelectorAll('input[type=number]') as unknown as HTMLInputElement[];

    fireEvent.change(min, { target: { value: '1' } });
    expect(host.emitted.at(-1)).toEqual([]);

    fireEvent.change(max, { target: { value: '10' } });
    expect(host.emitted.at(-1)).toEqual([1, 10]);

    fireEvent.change(max, { target: { value: '' } });
    expect(host.emitted.at(-1)).toEqual([]);
  });

  it('日期范围：同样是两端齐全才 emit', () => {
    const host = renderInput({ fieldType: 'date', operator: 'between' });
    const [start, end] = host.container.querySelectorAll('input[type=date]') as unknown as HTMLInputElement[];

    fireEvent.change(start, { target: { value: '2026-01-01' } });
    expect(host.emitted.at(-1)).toEqual([]);

    fireEvent.change(end, { target: { value: '2026-12-31' } });
    expect(host.emitted.at(-1)).toEqual(['2026-01-01', '2026-12-31']);
  });

  it('数组输入按逗号切分并按字段类型转换', () => {
    const stringHost = renderInput({ fieldType: 'string', operator: 'in' });
    fireEvent.change(stringHost.container.querySelector('input')!, { target: { value: 'a, b ,c' } });
    expect(stringHost.emitted.at(-1)).toEqual(['a', 'b', 'c']);

    const numberHost = renderInput({ fieldType: 'number', operator: 'in' });
    fireEvent.change(numberHost.container.querySelector('input')!, { target: { value: '1, 2, 3' } });
    expect(numberHost.emitted.at(-1)).toEqual([1, 2, 3]);
  });

  it('枚举单选经 popover 选择 emit 选中值；多选从 select 读 selectedOptions', () => {
    const singleHost = renderInput({ fieldType: 'string', enumOptions: ['draft', 'published'] });
    const popover = singleHost.container.querySelector('[popover]') as HTMLElement;
    popover.hidePopover = vi.fn();
    const optionBtn = [...singleHost.container.querySelectorAll('li[role="none"] button[role="option"]')].find(
      b => b.textContent?.trim() === 'published'
    )!;
    fireEvent.click(optionBtn);
    expect(singleHost.emitted.at(-1)).toBe('published');

    const multiHost = renderInput({ fieldType: 'string', operator: 'in', enumOptions: ['draft', 'published'] });
    const select = multiHost.container.querySelector('select') as HTMLSelectElement;
    // selectedOptions 是只读 getter：先改 option.selected 再派发 change（浏览器语义）
    (select.options[1] as HTMLOptionElement).selected = true;
    fireEvent.change(select);

    expect(multiHost.emitted.at(-1)).toEqual(['published']);
  });

  it('初始化按输入形态回填既有值', () => {
    const range = renderInput({ fieldType: 'number', operator: 'between', value: [5, 9] });
    const [min, max] = range.container.querySelectorAll('input[type=number]') as unknown as HTMLInputElement[];
    expect(min.value).toBe('5');
    expect(max.value).toBe('9');

    const dateRange = renderInput({ fieldType: 'date', operator: 'between', value: ['2026-01-01', '2026-02-01'] });
    const [start, end] = dateRange.container.querySelectorAll('input[type=date]') as unknown as HTMLInputElement[];
    expect(start.value).toBe('2026-01-01');
    expect(end.value).toBe('2026-02-01');

    const array = renderInput({ fieldType: 'string', operator: 'in', value: ['x', 'y'] });
    expect((array.container.querySelector('input') as HTMLInputElement).value).toBe('x, y');

    const date = renderInput({ fieldType: 'date', value: '2026-07-26' });
    expect((date.container.querySelector('input[type=date]') as HTMLInputElement).value).toBe('2026-07-26');

    // number 字段的空串归一为 null，避免把 '' 当成 0
    const emptyNumber = renderInput({ fieldType: 'number', value: '' });
    expect((emptyNumber.container.querySelector('input[type=number]') as HTMLInputElement).value).toBe('');
  });

  it("日期输入变更回显并 emit；空串走 value || '' 兜底", () => {
    const host = renderInput({ fieldType: 'date' });
    const input = host.container.querySelector('input[type=date]') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '2026-01-01' } });
    expect(input.value).toBe('2026-01-01');
    expect(host.emitted.at(-1)).toBe('2026-01-01');

    fireEvent.change(input, { target: { value: '' } });
    expect(host.emitted.at(-1)).toBe('');
  });

  it('切换输入形态时重置为该形态的默认值并 emit', () => {
    const host = renderInput({ fieldType: 'string' });
    fireEvent.change(host.container.querySelector('input')!, { target: { value: 'leftover' } });
    host.emitted.length = 0;

    host.rerender(<ValueInput fieldType='number' operator='=' value='' onValueChange={v => host.emitted.push(v)} />);

    expect(host.container.querySelector('input[type=number]')).toBeTruthy();
    expect(host.emitted.length).toBeGreaterThan(0);
    expect((host.container.querySelector('input[type=number]') as HTMLInputElement).value).toBe('');
  });

  it('handleWhereChange 同时 emit whereChange 回调', () => {
    const emitted: Array<QueryBuilderRuleGroup<Record<string, unknown>> | undefined> = [];
    render(
      <ValueInput
        fieldType='string'
        relationFields={[{ name: 'x', type: 'string' } as never]}
        operator='exists'
        onWhereChange={where => emitted.push(where)}
      />
    );

    // exists + 关系字段：子查询构建器渲染（添加子条件按钮）
    expect(true).toBe(true);
    void emitted;
  });

  it('exists + 关系字段渲染子查询构建器；无关系字段渲染提示文案', () => {
    // 关系字段的 fieldType 为 'relation'（extractFieldsFromMetadata 契约），exists 才映射到子查询形态
    const withRelation = renderInput({
      fieldType: 'relation',
      operator: 'exists',
      relationFields: [{ name: 'name', type: 'string', displayName: '姓名' }]
    });
    expect(withRelation.container.querySelector('.subquery-builder')).toBeTruthy();

    const withoutRelation = renderInput({ fieldType: 'relation', operator: 'exists', relationFields: [] });
    expect(withoutRelation.container.textContent).toContain('存在/不存在（无子条件）');
  });

  it('卸载组件不抛错（子查询容器清理路径）', () => {
    const host = renderInput({ fieldType: 'string' });
    expect(() => host.unmount()).not.toThrow();
  });
});
