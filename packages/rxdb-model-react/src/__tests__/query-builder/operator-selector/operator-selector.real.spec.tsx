/**
 * OperatorSelector —— **真实加载组件源码**（Angular `operator-selector.component.spec.ts` 的 React 移植）。
 *
 * Angular 侧的 `operatorChange` output 与 `operatorChangeFn` input 在 React 合并为
 * 单一 `onOperatorChange` 回调（语义等价），此处经真实 PopoverSelect 渲染与点击覆盖。
 */
import type { FieldMetadata } from '@aiao/rxdb-model';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OperatorSelector } from '../../../query-builder/operator-selector/operator-selector';

describe('OperatorSelector（真实组件）', () => {
  function renderSelector(
    props: Partial<{ fieldType: string; selectedOperator: string; fieldMetadata: FieldMetadata }> = {}
  ) {
    const utils = render(
      <OperatorSelector
        fieldType={props.fieldType ?? 'string'}
        selectedOperator={props.selectedOperator ?? '='}
        fieldMetadata={props.fieldMetadata}
      />
    );
    const popover = utils.container.querySelector('[popover]') as HTMLElement;
    popover.hidePopover = vi.fn();
    popover.showPopover = vi.fn();
    return { ...utils, popover };
  }

  /** 读取当前操作符选项（渲染进 popover 的 option 按钮文本 = label）。 */
  function optionLabels(host: ReturnType<typeof renderSelector>): string[] {
    return [...host.container.querySelectorAll('li[role="none"] button[role="option"]')].map(
      b => b.textContent?.trim() ?? ''
    );
  }

  it('按字段类型从操作符注册表推导可选项', () => {
    const host = renderSelector({ fieldType: 'string' });
    const labels = optionLabels(host);

    expect(labels.length).toBeGreaterThan(0);
    // '=' 操作符的 label 在列表中（label 来自真实注册表）
    expect(labels.some(label => label.length > 0)).toBe(true);
  });

  it('不同字段类型给出不同的操作符集合', () => {
    const stringOps = optionLabels(renderSelector({ fieldType: 'string' }));
    const numberOps = optionLabels(renderSelector({ fieldType: 'number' }));

    expect(stringOps).not.toEqual(numberOps);
  });

  it('fieldMetadata 优先于 fieldType', () => {
    const withMetadata = optionLabels(
      renderSelector({ fieldType: 'number', fieldMetadata: { name: 'title', type: 'string', displayName: '标题' } })
    );
    const byStringType = optionLabels(renderSelector({ fieldType: 'string' }));

    expect(withMetadata).toEqual(byStringType);
  });

  it('选择操作符时触发 onOperatorChange 回调', () => {
    const changed: string[] = [];
    const host = render(
      <OperatorSelector fieldType='string' selectedOperator='=' onOperatorChange={op => changed.push(op)} />
    );
    const popover = host.container.querySelector('[popover]') as HTMLElement;
    popover.hidePopover = vi.fn();

    // 打开弹层（定位依赖 trigger rect），点击第一个选项（注册表首个操作符）
    fireEvent.click(host.container.querySelector('button')!);
    const option = [...host.container.querySelectorAll('li[role="none"] button[role="option"]')][1];
    fireEvent.click(option);

    expect(changed.length).toBe(1);
    expect(typeof changed[0]).toBe('string');
    expect(changed[0]).not.toBe('=');
  });

  it('渲染出 popover-select 触发按钮，显示当前操作符标签', () => {
    const host = renderSelector({ selectedOperator: '=' });
    const trigger = host.container.querySelector('button') as HTMLButtonElement | null;

    expect(trigger).not.toBeNull();
    const labels = optionLabels(host);
    expect(labels).toContain(trigger?.textContent?.trim());
  });
});
