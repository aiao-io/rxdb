import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ValueInput from '../../../query-builder/value-input/ValueInput.vue';

/**
 * ValueInput —— **真实加载组件源码**（对齐 Angular 侧）。
 *
 * 每个 handler 都走「更新内部状态 + emit valueChange + 调 valueChangeFn 回调」三件事，
 * 这里同时断言 emit 与回调，覆盖动态组件注入路径。
 */

type ValueInputVM = InstanceType<typeof ValueInput> & {
  inputType: string;
  uuidError: string;
  hasError: boolean;
  currentValue: unknown;
  rangeMin: unknown;
  rangeMax: unknown;
  arrayInputValue: string;
  currentDateStr: string;
  dateRangeStart: string;
  dateRangeEnd: string;
  enumSelectOptions: Array<{ value: string; label: string }>;
  onValueChange(value: unknown): void;
  onUuidChange(value: string): void;
  onNumberInputChange(value: string): void;
  onEnumArrayChange(event: Event): void;
  isEnumSelected(opt: unknown): boolean;
  onEnumSelect(value: string): void;
  onNativeDateChange(value: string): void;
  onDateRangeStartChange(value: string): void;
  onDateRangeEndChange(value: string): void;
  onRangeMinChange(value: string): void;
  onRangeMaxChange(value: string): void;
  onArrayInputChange(value: string): void;
  handleWhereChange(where: { combinator: 'and' | 'or'; rules: unknown[] } | undefined): void;
};

describe('ValueInput（真实组件）', () => {
  function render(
    inputs: Partial<{
      fieldType: string;
      operator: string;
      value: unknown;
      enumOptions: unknown[];
      errorMessage: string;
    }> = {}
  ) {
    const wrapper = mount(ValueInput, {
      props: {
        fieldType: inputs.fieldType ?? 'string',
        operator: inputs.operator ?? '=',
        value: inputs.value ?? '',
        ...(inputs.enumOptions ? { enumOptions: inputs.enumOptions } : {}),
        ...(inputs.errorMessage ? { errorMessage: inputs.errorMessage } : {})
      }
    });
    const viaCallback: unknown[] = [];
    return { wrapper, viaCallback, vm: wrapper.vm as unknown as ValueInputVM };
  }

  it('按 fieldType + operator 推导输入形态', () => {
    expect(render({ fieldType: 'string' }).vm.inputType).toBe('string');
    expect(render({ fieldType: 'number' }).vm.inputType).toBe('number');
    expect(render({ fieldType: 'boolean' }).vm.inputType).toBe('boolean');
    expect(render({ fieldType: 'number', operator: 'between' }).vm.inputType).toBe('range');
    expect(render({ fieldType: 'string', operator: 'in' }).vm.inputType).toBe('array');
    // 有枚举选项时 in → enum-array，单值 → enum
    expect(render({ fieldType: 'string', operator: 'in', enumOptions: ['a'] }).vm.inputType).toBe('enum-array');
    expect(render({ fieldType: 'string', enumOptions: ['a'] }).vm.inputType).toBe('enum');
    // null / notNull 不需要值输入
    expect(render({ fieldType: 'string', operator: 'null' }).vm.inputType).toBe('none');
  });

  it('onValueChange 同步状态、emit、并调回调', async () => {
    const host = render();
    await host.wrapper.setProps({ valueChangeFn: (v: unknown) => host.viaCallback.push(v) });

    host.vm.onValueChange('hello');

    expect(host.vm.currentValue).toBe('hello');
    expect(host.wrapper.emitted('valueChange')).toEqual([['hello']]);
    expect(host.viaCallback).toEqual(['hello']);
  });

  it('onNumberInputChange 把空串转 null，其余转数字', async () => {
    const host = render({ fieldType: 'number' });
    await host.wrapper.setProps({ valueChangeFn: (v: unknown) => host.viaCallback.push(v) });
    host.vm.onNumberInputChange('42');
    expect(host.wrapper.emitted('valueChange')?.at(-1)).toEqual([42]);

    host.vm.onNumberInputChange('');
    expect(host.wrapper.emitted('valueChange')?.at(-1)).toEqual([null]);
    expect(host.vm.currentValue).toBeNull();
  });

  it('onUuidChange 去空白并转小写', async () => {
    const host = render({ fieldType: 'uuid' });
    await host.wrapper.setProps({ valueChangeFn: (v: unknown) => host.viaCallback.push(v) });
    host.vm.onUuidChange('  8B1A7C2E-0000-4000-8000-000000000000  ');

    expect(host.wrapper.emitted('valueChange')?.at(-1)).toEqual(['8b1a7c2e-0000-4000-8000-000000000000']);
    // 状态保留用户原始输入，emit 的是规范化后的值
    expect(String(host.vm.currentValue)).toContain('8B1A7C2E');
  });

  it('uuidError 只在 uuid 形态且格式非法时有值', () => {
    const uuidHost = render({ fieldType: 'uuid' });
    uuidHost.vm.onUuidChange('not-a-uuid');
    expect(uuidHost.vm.uuidError).toContain('UUID');

    uuidHost.vm.onUuidChange('8b1a7c2e-0000-4000-8000-000000000000');
    expect(uuidHost.vm.uuidError).toBe('');

    // 空值不报错（未填 ≠ 格式错）
    uuidHost.vm.onUuidChange('');
    expect(uuidHost.vm.uuidError).toBe('');

    // 非 uuid 形态即使值不合法也不报
    const textHost = render({ fieldType: 'string' });
    textHost.vm.onValueChange('not-a-uuid');
    expect(textHost.vm.uuidError).toBe('');
  });

  it('hasError 跟随 errorMessage', () => {
    expect(render().vm.hasError).toBe(false);
    expect(render({ errorMessage: '字段必填' }).vm.hasError).toBe(true);
  });

  it('数值范围：两端齐全才 emit 区间，缺一端 emit 空数组', () => {
    const host = render({ fieldType: 'number', operator: 'between' });

    host.vm.onRangeMinChange('1');
    expect(host.wrapper.emitted('valueChange')?.at(-1)).toEqual([[]]);

    host.vm.onRangeMaxChange('10');
    expect(host.wrapper.emitted('valueChange')?.at(-1)).toEqual([[1, 10]]);

    host.vm.onRangeMaxChange('');
    expect(host.wrapper.emitted('valueChange')?.at(-1)).toEqual([[]]);
  });

  it('日期范围：同样是两端齐全才 emit', () => {
    const host = render({ fieldType: 'date', operator: 'between' });

    host.vm.onDateRangeStartChange('2026-01-01');
    expect(host.wrapper.emitted('valueChange')?.at(-1)).toEqual([[]]);

    host.vm.onDateRangeEndChange('2026-12-31');
    expect(host.wrapper.emitted('valueChange')?.at(-1)).toEqual([['2026-01-01', '2026-12-31']]);
  });

  it('onArrayInputChange 按逗号切分并按字段类型转换', () => {
    const stringHost = render({ fieldType: 'string', operator: 'in' });
    stringHost.vm.onArrayInputChange('a, b ,c');
    expect(stringHost.wrapper.emitted('valueChange')?.at(-1)).toEqual([['a', 'b', 'c']]);

    const numberHost = render({ fieldType: 'number', operator: 'in' });
    numberHost.vm.onArrayInputChange('1, 2, 3');
    expect(numberHost.wrapper.emitted('valueChange')?.at(-1)).toEqual([[1, 2, 3]]);
  });

  it('枚举单选 emit 选中值；多选从 select 读 selectedOptions', () => {
    const host = render({ fieldType: 'string', enumOptions: ['draft', 'published'] });
    host.vm.onEnumSelect('published');
    expect(host.wrapper.emitted('valueChange')?.at(-1)).toEqual(['published']);

    const select = document.createElement('select');
    select.multiple = true;
    for (const v of ['draft', 'published']) {
      const opt = document.createElement('option');
      opt.value = v;
      select.appendChild(opt);
    }
    (select.options[1] as HTMLOptionElement).selected = true;
    host.vm.onEnumArrayChange({ target: select } as unknown as Event);

    expect(host.wrapper.emitted('valueChange')?.at(-1)).toEqual([['published']]);
    expect(host.vm.isEnumSelected('published')).toBe(true);
    expect(host.vm.isEnumSelected('draft')).toBe(false);
  });

  it('enumSelectOptions 把原始枚举值转成 {value,label}', () => {
    const host = render({ enumOptions: ['a', 1, true] });

    expect(host.vm.enumSelectOptions).toEqual([
      { value: 'a', label: 'a' },
      { value: '1', label: '1' },
      { value: 'true', label: 'true' }
    ]);
  });

  it('初始化按输入形态回填既有值', () => {
    const range = render({ fieldType: 'number', operator: 'between', value: [5, 9] });
    expect(range.vm.rangeMin).toBe(5);
    expect(range.vm.rangeMax).toBe(9);

    const dateRange = render({ fieldType: 'date', operator: 'between', value: ['2026-01-01', '2026-02-01'] });
    expect(dateRange.vm.dateRangeStart).toBe('2026-01-01');
    expect(dateRange.vm.dateRangeEnd).toBe('2026-02-01');

    const array = render({ fieldType: 'string', operator: 'in', value: ['x', 'y'] });
    expect(array.vm.arrayInputValue).toBe('x, y');

    const date = render({ fieldType: 'date', value: '2026-07-26' });
    expect(date.vm.currentDateStr).toBe('2026-07-26');

    // number 字段的空串归一为 null，避免把 '' 当成 0
    const emptyNumber = render({ fieldType: 'number', value: '' });
    expect(emptyNumber.vm.currentValue).toBeNull();
  });

  it('初始化边界：日期范围缺端、date/uuid 非字符串、enum-array 非数组都回退安全默认', () => {
    const sparseRange = render({ fieldType: 'date', operator: 'between', value: [undefined, undefined] });
    expect(sparseRange.vm.dateRangeStart).toBe('');
    expect(sparseRange.vm.dateRangeEnd).toBe('');

    const nullDate = render({ fieldType: 'date', value: null });
    expect(nullDate.vm.currentDateStr).toBe('');

    const numberUuid = render({ fieldType: 'uuid', value: 42 });
    expect(numberUuid.vm.currentValue).toBe('');

    const nonArrayEnum = render({ fieldType: 'string', operator: 'in', enumOptions: ['a'], value: 'a' });
    expect(nonArrayEnum.vm.currentValue).toEqual([]);
  });

  it('onNativeDateChange 回显并 emit；空串走 value || "" 兜底', async () => {
    const host = render({ fieldType: 'date' });
    await host.wrapper.setProps({ valueChangeFn: (v: unknown) => host.viaCallback.push(v) });

    host.vm.onNativeDateChange('2026-01-01');
    expect(host.vm.currentDateStr).toBe('2026-01-01');
    expect(host.wrapper.emitted('valueChange')?.at(-1)).toEqual(['2026-01-01']);
    expect(host.viaCallback.at(-1)).toBe('2026-01-01');

    host.vm.onNativeDateChange('');
    expect(host.wrapper.emitted('valueChange')?.at(-1)).toEqual(['']);
    expect(host.viaCallback.at(-1)).toBe('');
  });

  it('onRangeMinChange 空串归一为 null 后走缺端分支', () => {
    const host = render({ fieldType: 'number', operator: 'between' });

    host.vm.onRangeMinChange('');
    expect(host.vm.rangeMin).toBeNull();
    expect(host.wrapper.emitted('valueChange')?.at(-1)).toEqual([[]]);
  });

  it('uuidError 对 null 当前值不报错（?? 兜底空串）', () => {
    const host = render({ fieldType: 'uuid' });

    host.vm.onValueChange(null);
    expect(host.vm.uuidError).toBe('');
  });

  it('切换输入形态时重置为该形态的默认值并 emit', async () => {
    const host = render({ fieldType: 'string' });
    host.vm.onValueChange('leftover');
    host.wrapper.emitted('valueChange')!.length = 0;

    await host.wrapper.setProps({ fieldType: 'number' });

    expect(host.vm.inputType).toBe('number');
    expect(host.wrapper.emitted('valueChange')!.length).toBeGreaterThan(0);
    expect(host.vm.currentValue).not.toBe('leftover');
  });

  it('handleWhereChange 同时 emit output 与调 whereChangeFn', async () => {
    const host = render();
    const viaCallback: unknown[] = [];
    await host.wrapper.setProps({ whereChangeFn: (w: unknown) => viaCallback.push(w) });

    const where = { combinator: 'and' as const, rules: [] };
    host.vm.handleWhereChange(where);

    expect(host.wrapper.emitted('whereChange')).toEqual([[where]]);
    expect(viaCallback).toEqual([where]);
  });

  it('销毁组件不抛错（子查询容器清理路径）', () => {
    const host = render();
    expect(() => host.wrapper.unmount()).not.toThrow();
  });
});
