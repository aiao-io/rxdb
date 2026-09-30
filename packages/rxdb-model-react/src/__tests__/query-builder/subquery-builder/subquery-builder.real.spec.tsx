/**
 * SubqueryBuilder —— **真实加载组件源码 + 真实 QueryBuilderService**（Angular `SubqueryBuilderComponent` 的 React 移植）。
 *
 * EXISTS / NOT EXISTS 的嵌套查询条件。此前仅经 value-input 的 subquery 分支间接覆盖
 * （服务生命周期 + 空态），增删改与组合器回调从未触发；这里按 query-group spec
 * 的模式直接渲染真实组件、驱动真实 QueryGroup UI 补齐这些链路。
 */
import type { FieldMetadata, QueryBuilderRuleGroup } from '@aiao/rxdb-model';
import { act, fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SubqueryBuilder, type SubqueryBuilderProps } from '../../../query-builder/subquery-builder/subquery-builder';

const FIELDS: FieldMetadata[] = [
  { name: 'title', type: 'string' },
  { name: 'views', type: 'number' },
  { name: 'published', type: 'boolean' }
] as FieldMetadata[];

type EmittedQuery = { combinator: 'and' | 'or'; rules: unknown[] } | undefined;

/** 找到包含指定文本的按钮。 */
function buttonByText(container: HTMLElement, text: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find(b => b.textContent?.includes(text));
}

/** 找到指定 title 的按钮。 */
function buttonByTitle(container: HTMLElement, title: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find(b => b.title === title);
}

describe('SubqueryBuilder（真实组件）', () => {
  function renderBuilder(over: Partial<SubqueryBuilderProps> = {}) {
    const onQueryChange = vi.fn();
    const onValidationChange = vi.fn();
    const utils = render(
      <SubqueryBuilder
        fields={over.fields ?? FIELDS}
        {...(over.initialQuery ? { initialQuery: over.initialQuery } : {})}
        {...(over.maxDepth !== undefined ? { maxDepth: over.maxDepth } : {})}
        onQueryChange={onQueryChange}
        onValidationChange={onValidationChange}
      />
    );
    return { ...utils, onQueryChange, onValidationChange };
  }

  function lastQuery(spy: ReturnType<typeof vi.fn>): EmittedQuery {
    return spy.mock.calls.at(-1)?.[0] as EmittedQuery;
  }

  let host: ReturnType<typeof renderBuilder>;

  beforeEach(() => {
    host = renderBuilder();
  });

  it('空态渲染「添加子条件」，挂载即发射空查询与初始验证', () => {
    expect(host.container.textContent).toContain('添加子条件');
    expect(host.container.textContent).toContain('（可选）');
    expect(host.container.textContent).not.toContain('清空');

    // rootGroup$/validation$ 是 BehaviorSubject 派生流，订阅即发射
    expect(lastQuery(host.onQueryChange)).toBeUndefined();
    expect(host.onValidationChange).toHaveBeenCalled();
  });

  it('点击「添加子条件」用首个字段建规则并渲染规则区', () => {
    act(() => {
      fireEvent.click(buttonByText(host.container, '添加子条件')!);
    });

    expect(buttonByText(host.container, '+ 条件')).toBeDefined();
    expect(buttonByText(host.container, '+ 分组')).toBeDefined();
    expect(buttonByText(host.container, '清空')).toBeDefined();
    expect(lastQuery(host.onQueryChange)?.rules.length).toBe(1);
    expect(lastQuery(host.onQueryChange)?.rules[0]).toMatchObject({ field: 'title', operator: '=' });
  });

  it('首个字段默认规则：关系字段 exists、keyValue 用 null、boolean 默认 false', () => {
    const relation = renderBuilder({
      fields: [{ name: 'author', type: 'string', isRelation: true } as FieldMetadata]
    });
    act(() => {
      fireEvent.click(buttonByText(relation.container, '添加子条件')!);
    });
    expect(lastQuery(relation.onQueryChange)?.rules[0]).toMatchObject({ operator: 'exists' });

    const keyValue = renderBuilder({ fields: [{ name: 'tags', type: 'keyValue' } as FieldMetadata] });
    act(() => {
      fireEvent.click(buttonByText(keyValue.container, '添加子条件')!);
    });
    expect(lastQuery(keyValue.onQueryChange)?.rules[0]).toMatchObject({ operator: 'null' });

    const boolean = renderBuilder({ fields: [FIELDS[2]] });
    act(() => {
      fireEvent.click(buttonByText(boolean.container, '添加子条件')!);
    });
    expect(lastQuery(boolean.onQueryChange)?.rules[0]).toMatchObject({ value: false });
  });

  it('fields 为空时「添加子条件」是 no-op', () => {
    const empty = renderBuilder({ fields: [] });
    act(() => {
      fireEvent.click(buttonByText(empty.container, '添加子条件')!);
    });

    expect(buttonByText(empty.container, '添加子条件')).toBeDefined();
    expect(empty.container.textContent).not.toContain('清空');
  });

  it('initialQuery 载入既有条件，直接渲染规则区', () => {
    const withInitial = renderBuilder({
      initialQuery: {
        id: 'root',
        combinator: 'and',
        rules: [{ id: 'r1', field: 'title', operator: '=', value: 'hello' }]
      }
    });

    expect(buttonByText(withInitial.container, '清空')).toBeDefined();
    expect(lastQuery(withInitial.onQueryChange)?.rules.length).toBe(1);
  });

  it('initialQuery 只应用一次：用户加规则后变更 initialQuery 不重置', () => {
    const withInitial = renderBuilder({
      initialQuery: {
        id: 'root',
        combinator: 'and',
        rules: [{ id: 'r1', field: 'title', operator: '=', value: 'hello' }]
      }
    });
    act(() => {
      fireEvent.click(buttonByText(withInitial.container, '+ 条件')!);
    });
    expect(lastQuery(withInitial.onQueryChange)?.rules.length).toBe(2);

    const replacement: QueryBuilderRuleGroup<Record<string, unknown>> = {
      id: 'root2',
      combinator: 'or',
      rules: [{ id: 'r2', field: 'views', operator: '>', value: 1 }]
    };
    withInitial.rerender(
      <SubqueryBuilder fields={FIELDS} initialQuery={replacement} onQueryChange={withInitial.onQueryChange} />
    );

    expect(lastQuery(withInitial.onQueryChange)?.rules.length).toBe(2);
    expect(lastQuery(withInitial.onQueryChange)?.rules[0]).toMatchObject({ field: 'title' });
  });

  it('「+ 条件」向根组追加规则（onAddRule）', () => {
    act(() => {
      fireEvent.click(buttonByText(host.container, '添加子条件')!);
    });
    act(() => {
      fireEvent.click(buttonByText(host.container, '+ 条件')!);
    });

    expect(lastQuery(host.onQueryChange)?.rules.length).toBe(2);
  });

  it('「+ 分组」建子组，「删除组」移除它（onAddGroup / onRemoveItem）', () => {
    act(() => {
      fireEvent.click(buttonByText(host.container, '添加子条件')!);
    });
    act(() => {
      fireEvent.click(buttonByText(host.container, '+ 分组')!);
    });
    expect(lastQuery(host.onQueryChange)?.rules.length).toBe(2);

    act(() => {
      fireEvent.click(buttonByTitle(host.container, '删除组')!);
    });
    expect(lastQuery(host.onQueryChange)?.rules.length).toBe(1);
  });

  it('「删除条件」移除规则（onRemoveItem 规则分支）', () => {
    act(() => {
      fireEvent.click(buttonByText(host.container, '添加子条件')!);
    });
    act(() => {
      fireEvent.click(buttonByTitle(host.container, '删除条件')!);
    });

    expect(lastQuery(host.onQueryChange)).toBeUndefined();
    expect(buttonByText(host.container, '添加子条件')).toBeDefined();
  });

  it('OR 切换根组组合器（onUpdateCombinator）', () => {
    act(() => {
      fireEvent.click(buttonByText(host.container, '添加子条件')!);
    });
    act(() => {
      fireEvent.click(buttonByText(host.container, 'OR')!);
    });

    expect(lastQuery(host.onQueryChange)?.combinator).toBe('or');
  });

  it('值输入变更触发规则更新（onUpdateRule）', () => {
    act(() => {
      fireEvent.click(buttonByText(host.container, '添加子条件')!);
    });

    act(() => {
      fireEvent.change(host.container.querySelector('input[placeholder="输入值"]')!, {
        target: { value: 'hello' }
      });
    });

    expect(lastQuery(host.onQueryChange)?.rules[0]).toMatchObject({ value: 'hello' });
  });

  it('「清空」移除全部规则并回到空态（handleClear）', () => {
    act(() => {
      fireEvent.click(buttonByText(host.container, '添加子条件')!);
    });
    act(() => {
      fireEvent.click(buttonByText(host.container, '清空')!);
    });

    expect(lastQuery(host.onQueryChange)).toBeUndefined();
    expect(buttonByText(host.container, '添加子条件')).toBeDefined();
  });

  it('maxDepth 变更同步到服务', () => {
    const shallow = renderBuilder({ maxDepth: 1 });
    shallow.rerender(<SubqueryBuilder fields={FIELDS} maxDepth={2} onQueryChange={shallow.onQueryChange} />);

    expect(shallow.container.textContent).toContain('添加子条件');
  });

  it('卸载销毁服务后不再抛错', () => {
    act(() => {
      fireEvent.click(buttonByText(host.container, '添加子条件')!);
    });
    expect(() => host.unmount()).not.toThrow();
  });
});
