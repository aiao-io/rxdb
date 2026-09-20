import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { OperatorSelectorComponent } from '../../../query-builder/operator-selector/operator-selector.component';

/**
 * OperatorSelectorComponent —— **真实加载组件源码**的测试。
 *
 * ⚠️ 本包此前 6 个 spec 全是 `import { describe, expect, it } from 'vitest'`
 * 后在文件内**内联复制**被测逻辑，4,658 LOC 实测覆盖率 0%（specs/027 T025a）。
 * 复制品可以与真实实现静默漂移——这是「测试写了，但测的不是被测代码」。
 * 新增测试一律 import 真实组件并用 TestBed 渲染。
 */
describe('OperatorSelectorComponent（真实组件）', () => {
  function render(inputs: Partial<{ fieldType: string; selectedOperator: string }> = {}) {
    const fixture = TestBed.createComponent(OperatorSelectorComponent);
    fixture.componentRef.setInput('fieldType', inputs.fieldType ?? 'string');
    fixture.componentRef.setInput('selectedOperator', inputs.selectedOperator ?? '=');
    fixture.detectChanges();
    return fixture;
  }

  it('按字段类型从操作符注册表推导可选项', () => {
    const fixture = render({ fieldType: 'string' });
    const options = fixture.componentInstance.operatorOptions();

    expect(options.length).toBeGreaterThan(0);
    expect(options.every(o => typeof o.value === 'string' && typeof o.label === 'string')).toBe(true);
    expect(options.map(o => o.value)).toContain('=');
  });

  it('不同字段类型给出不同的操作符集合', () => {
    const stringOps = render({ fieldType: 'string' })
      .componentInstance.operatorOptions()
      .map(o => o.value);
    const numberOps = render({ fieldType: 'number' })
      .componentInstance.operatorOptions()
      .map(o => o.value);

    expect(stringOps).not.toEqual(numberOps);
  });

  it('fieldMetadata 优先于 fieldType', () => {
    const fixture = TestBed.createComponent(OperatorSelectorComponent);
    fixture.componentRef.setInput('fieldType', 'number');
    fixture.componentRef.setInput('fieldMetadata', { name: 'title', type: 'string' });
    fixture.detectChanges();

    const withMetadata = fixture.componentInstance.operatorOptions().map(o => o.value);
    const byStringType = render({ fieldType: 'string' })
      .componentInstance.operatorOptions()
      .map(o => o.value);
    expect(withMetadata).toEqual(byStringType);
  });

  it('选择操作符时同时 emit output 与调用 operatorChangeFn 回调', () => {
    const fixture = render();
    const emitted: string[] = [];
    const viaCallback: string[] = [];
    fixture.componentInstance.operatorChange.subscribe(op => emitted.push(op));
    fixture.componentRef.setInput('operatorChangeFn', (op: string) => viaCallback.push(op));
    fixture.detectChanges();

    fixture.componentInstance.onOperatorChange('!=');

    expect(emitted).toEqual(['!=']);
    expect(viaCallback).toEqual(['!=']);
  });

  it('未提供 operatorChangeFn 时只 emit output，不抛错', () => {
    const fixture = render();
    const emitted: string[] = [];
    fixture.componentInstance.operatorChange.subscribe(op => emitted.push(op));

    expect(() => fixture.componentInstance.onOperatorChange('>')).not.toThrow();
    expect(emitted).toEqual(['>']);
  });

  it('渲染出 popover-select 触发按钮，显示当前操作符标签', () => {
    const fixture = render({ selectedOperator: '=' });
    const trigger = fixture.nativeElement.querySelector('button') as HTMLButtonElement | null;

    expect(trigger).not.toBeNull();
    const expectedLabel = fixture.componentInstance.operatorOptions().find(o => o.value === '=')?.label;
    expect(trigger?.textContent?.trim()).toBe(expectedLabel);
  });
});
