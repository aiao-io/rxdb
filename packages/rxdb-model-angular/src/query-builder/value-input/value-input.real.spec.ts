import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ValueInputComponent } from './value-input.component';

/**
 * ValueInputComponent —— **真实加载组件源码**（specs/027 T025a）。
 *
 * 每个 handler 都走「更新内部 signal + emit output + 调 xxxFn 回调」三件事，
 * 这里同时断言 output 与回调，覆盖 NgComponentOutlet 注入路径。
 */
describe('ValueInputComponent（真实组件）', () => {
  function render(
    inputs: Partial<{
      fieldType: string;
      operator: string;
      value: unknown;
      enumOptions: unknown[];
      errorMessage: string;
    }> = {}
  ) {
    const fixture = TestBed.createComponent(ValueInputComponent);
    fixture.componentRef.setInput('fieldType', inputs.fieldType ?? 'string');
    fixture.componentRef.setInput('operator', inputs.operator ?? '=');
    fixture.componentRef.setInput('value', inputs.value ?? '');
    if (inputs.enumOptions) fixture.componentRef.setInput('enumOptions', inputs.enumOptions);
    if (inputs.errorMessage) fixture.componentRef.setInput('errorMessage', inputs.errorMessage);

    const emitted: unknown[] = [];
    const viaCallback: unknown[] = [];
    fixture.componentInstance.valueChange.subscribe(v => emitted.push(v));
    fixture.componentRef.setInput('valueChangeFn', (v: unknown) => viaCallback.push(v));
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, emitted, viaCallback };
  }

  it('按 fieldType + operator 推导输入形态', () => {
    expect(render({ fieldType: 'string' }).component.inputType()).toBe('string');
    expect(render({ fieldType: 'number' }).component.inputType()).toBe('number');
    expect(render({ fieldType: 'boolean' }).component.inputType()).toBe('boolean');
    expect(render({ fieldType: 'number', operator: 'between' }).component.inputType()).toBe('range');
    expect(render({ fieldType: 'string', operator: 'in' }).component.inputType()).toBe('array');
    // 有枚举选项时 in → enum-array，单值 → enum
    expect(render({ fieldType: 'string', operator: 'in', enumOptions: ['a'] }).component.inputType()).toBe(
      'enum-array'
    );
    expect(render({ fieldType: 'string', enumOptions: ['a'] }).component.inputType()).toBe('enum');
    // null / notNull 不需要值输入
    expect(render({ fieldType: 'string', operator: 'null' }).component.inputType()).toBe('none');
  });

  it('onValueChange 同步 signal、emit、并调回调', () => {
    const host = render();
    host.component.onValueChange('hello');

    expect(host.component.currentValue()).toBe('hello');
    expect(host.emitted).toEqual(['hello']);
    expect(host.viaCallback).toEqual(['hello']);
  });

  it('onNumberInputChange 把空串转 null，其余转数字', () => {
    const host = render({ fieldType: 'number' });
    host.component.onNumberInputChange('42');
    expect(host.emitted.at(-1)).toBe(42);

    host.component.onNumberInputChange('');
    expect(host.emitted.at(-1)).toBeNull();
    expect(host.component.currentValue()).toBeNull();
  });

  it('onUuidChange 去空白并转小写', () => {
    const host = render({ fieldType: 'uuid' });
    host.component.onUuidChange('  8B1A7C2E-0000-4000-8000-000000000000  ');

    expect(host.emitted.at(-1)).toBe('8b1a7c2e-0000-4000-8000-000000000000');
    // signal 保留用户原始输入，emit 的是规范化后的值
    expect(host.component.currentValue()).toContain('8B1A7C2E');
  });

  it('uuidError 只在 uuid 形态且格式非法时有值', () => {
    const uuidHost = render({ fieldType: 'uuid' });
    uuidHost.component.onUuidChange('not-a-uuid');
    expect(uuidHost.component.uuidError()).toContain('UUID');

    uuidHost.component.onUuidChange('8b1a7c2e-0000-4000-8000-000000000000');
    expect(uuidHost.component.uuidError()).toBe('');

    // 空值不报错（未填 ≠ 格式错）
    uuidHost.component.onUuidChange('');
    expect(uuidHost.component.uuidError()).toBe('');

    // 非 uuid 形态即使值不合法也不报
    const textHost = render({ fieldType: 'string' });
    textHost.component.onValueChange('not-a-uuid');
    expect(textHost.component.uuidError()).toBe('');
  });

  it('hasError 跟随 errorMessage', () => {
    expect(render().component.hasError()).toBe(false);
    expect(render({ errorMessage: '字段必填' }).component.hasError()).toBe(true);
  });

  it('数值范围：两端齐全才 emit 区间，缺一端 emit 空数组', () => {
    const host = render({ fieldType: 'number', operator: 'between' });

    host.component.onRangeMinChange('1');
    expect(host.emitted.at(-1)).toEqual([]);

    host.component.onRangeMaxChange('10');
    expect(host.emitted.at(-1)).toEqual([1, 10]);

    host.component.onRangeMaxChange('');
    expect(host.emitted.at(-1)).toEqual([]);
  });

  it('日期范围：同样是两端齐全才 emit', () => {
    const host = render({ fieldType: 'date', operator: 'between' });

    host.component.onDateRangeStartChange('2026-01-01');
    expect(host.emitted.at(-1)).toEqual([]);

    host.component.onDateRangeEndChange('2026-12-31');
    expect(host.emitted.at(-1)).toEqual(['2026-01-01', '2026-12-31']);
  });

  it('onArrayInputChange 按逗号切分并按字段类型转换', () => {
    const stringHost = render({ fieldType: 'string', operator: 'in' });
    stringHost.component.onArrayInputChange('a, b ,c');
    expect(stringHost.emitted.at(-1)).toEqual(['a', 'b', 'c']);

    const numberHost = render({ fieldType: 'number', operator: 'in' });
    numberHost.component.onArrayInputChange('1, 2, 3');
    expect(numberHost.emitted.at(-1)).toEqual([1, 2, 3]);
  });

  it('枚举单选 emit 选中值；多选从 select 读 selectedOptions', () => {
    const host = render({ fieldType: 'string', enumOptions: ['draft', 'published'] });
    host.component.onEnumSelect('published');
    expect(host.emitted.at(-1)).toBe('published');

    const select = document.createElement('select');
    select.multiple = true;
    for (const v of ['draft', 'published']) {
      const opt = document.createElement('option');
      opt.value = v;
      select.appendChild(opt);
    }
    (select.options[1] as HTMLOptionElement).selected = true;
    host.component.onEnumArrayChange({ target: select } as unknown as Event);

    expect(host.emitted.at(-1)).toEqual(['published']);
    expect(host.component.isEnumSelected('published')).toBe(true);
    expect(host.component.isEnumSelected('draft')).toBe(false);
  });

  it('enumSelectOptions 把原始枚举值转成 {value,label}', () => {
    const host = render({ enumOptions: ['a', 1, true] });

    expect(host.component.enumSelectOptions()).toEqual([
      { value: 'a', label: 'a' },
      { value: '1', label: '1' },
      { value: 'true', label: 'true' }
    ]);
  });

  it('ngOnInit 按输入形态回填既有值', () => {
    const range = render({ fieldType: 'number', operator: 'between', value: [5, 9] });
    expect(range.component.rangeMin()).toBe(5);
    expect(range.component.rangeMax()).toBe(9);

    const dateRange = render({ fieldType: 'date', operator: 'between', value: ['2026-01-01', '2026-02-01'] });
    expect(dateRange.component.dateRangeStart()).toBe('2026-01-01');
    expect(dateRange.component.dateRangeEnd()).toBe('2026-02-01');

    const array = render({ fieldType: 'string', operator: 'in', value: ['x', 'y'] });
    expect(array.component.arrayInputValue()).toBe('x, y');

    const date = render({ fieldType: 'date', value: '2026-07-26' });
    expect(date.component.currentDateStr()).toBe('2026-07-26');

    // number 字段的空串归一为 null，避免把 '' 当成 0
    const emptyNumber = render({ fieldType: 'number', value: '' });
    expect(emptyNumber.component.currentValue()).toBeNull();
  });

  it('切换输入形态时重置为该形态的默认值并 emit', () => {
    const host = render({ fieldType: 'string' });
    host.component.onValueChange('leftover');
    host.emitted.length = 0;

    host.fixture.componentRef.setInput('fieldType', 'number');
    host.fixture.detectChanges();

    expect(host.component.inputType()).toBe('number');
    expect(host.emitted.length).toBeGreaterThan(0);
    expect(host.component.currentValue()).not.toBe('leftover');
  });

  it('handleWhereChange 同时 emit output 与调 whereChangeFn', () => {
    const fixture = TestBed.createComponent(ValueInputComponent);
    fixture.componentRef.setInput('fieldType', 'string');
    const emitted: unknown[] = [];
    const viaCallback: unknown[] = [];
    fixture.componentInstance.whereChange.subscribe(w => emitted.push(w));
    fixture.componentRef.setInput('whereChangeFn', (w: unknown) => viaCallback.push(w));
    fixture.detectChanges();

    const where = { combinator: 'and' as const, rules: [] };
    fixture.componentInstance.handleWhereChange(where);

    expect(emitted).toEqual([where]);
    expect(viaCallback).toEqual([where]);
  });

  it('销毁组件不抛错（子查询容器清理路径）', () => {
    const host = render();
    expect(() => host.fixture.destroy()).not.toThrow();
  });
});
