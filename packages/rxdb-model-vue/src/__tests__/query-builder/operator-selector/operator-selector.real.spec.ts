import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import OperatorSelector from '../../../query-builder/operator-selector/OperatorSelector.vue';

/**
 * OperatorSelector —— **真实加载组件源码**的测试（对齐 Angular 侧）。
 *
 * 本包此前 6 个 spec 全是文件内**内联复制**被测逻辑（specs/027 T025a）；
 * 新增测试一律 import 真实组件并渲染，断言真实的操作符注册表链路。
 */

type OperatorSelectorVM = InstanceType<typeof OperatorSelector> & {
  operatorOptions: Array<{ value: string; label: string }>;
  onOperatorChange(op: string): void;
};

describe('OperatorSelector（真实组件）', () => {
  function render(inputs: Partial<{ fieldType: string; selectedOperator: string }> = {}) {
    const wrapper = mount(OperatorSelector, {
      props: { fieldType: inputs.fieldType ?? 'string', selectedOperator: inputs.selectedOperator ?? '=' }
    });
    return wrapper;
  }

  it('按字段类型从操作符注册表推导可选项', () => {
    const wrapper = render({ fieldType: 'string' });
    const options = (wrapper.vm as unknown as OperatorSelectorVM).operatorOptions;

    expect(options.length).toBeGreaterThan(0);
    expect(options.every(o => typeof o.value === 'string' && typeof o.label === 'string')).toBe(true);
    expect(options.map(o => o.value)).toContain('=');
  });

  it('不同字段类型给出不同的操作符集合', () => {
    const stringOps = (render({ fieldType: 'string' }).vm as unknown as OperatorSelectorVM).operatorOptions.map(
      o => o.value
    );
    const numberOps = (render({ fieldType: 'number' }).vm as unknown as OperatorSelectorVM).operatorOptions.map(
      o => o.value
    );

    expect(stringOps).not.toEqual(numberOps);
  });

  it('fieldMetadata 优先于 fieldType', () => {
    const wrapper = mount(OperatorSelector, {
      props: { fieldType: 'number', fieldMetadata: { name: 'title', type: 'string', displayName: '标题' } }
    });

    const withMetadata = (wrapper.vm as unknown as OperatorSelectorVM).operatorOptions.map(o => o.value);
    const byStringType = (render({ fieldType: 'string' }).vm as unknown as OperatorSelectorVM).operatorOptions.map(
      o => o.value
    );
    expect(withMetadata).toEqual(byStringType);
  });

  it('选择操作符时同时 emit output 与调用 operatorChangeFn 回调', async () => {
    const wrapper = render();
    const viaCallback: string[] = [];
    await wrapper.setProps({ operatorChangeFn: (op: string) => viaCallback.push(op) });

    (wrapper.vm as unknown as OperatorSelectorVM).onOperatorChange('!=');

    expect(wrapper.emitted('operatorChange')).toEqual([['!=']]);
    expect(viaCallback).toEqual(['!=']);
  });

  it('未提供 operatorChangeFn 时只 emit output，不抛错', () => {
    const wrapper = render();

    expect(() => (wrapper.vm as unknown as OperatorSelectorVM).onOperatorChange('>')).not.toThrow();
    expect(wrapper.emitted('operatorChange')).toEqual([['>']]);
  });

  it('渲染出 popover-select 触发按钮，显示当前操作符标签', () => {
    const wrapper = render({ selectedOperator: '=' });
    const trigger = wrapper.element.querySelector('button') as HTMLButtonElement | null;

    expect(trigger).not.toBeNull();
    const expectedLabel = (wrapper.vm as unknown as OperatorSelectorVM).operatorOptions.find(
      o => o.value === '='
    )?.label;
    expect(trigger?.textContent?.trim()).toBe(expectedLabel);
  });
});
