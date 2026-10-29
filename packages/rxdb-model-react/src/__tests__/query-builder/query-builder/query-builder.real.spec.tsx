/**
 * QueryBuilder —— **真实加载组件源码 + 真实 QueryBuilderService**（Angular
 * `query-builder.real.spec.ts` 的 React 移植）。
 *
 * import 真实组件、用 Testing Library 渲染、断言真实的 service ↔ 状态 ↔ 回调链路；
 * 所有交互经 DOM（按钮点击 / Escape / 规则控件）驱动 —— 对应 Angular 侧
 * 直接调用组件方法的覆盖点。
 */
import type { FieldMetadata, SchemaInfo, ValidationResult } from '@aiao/rxdb-model';
import { fireEvent, render } from '@testing-library/react';
import { Activity, StrictMode, type JSX } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { QueryBuilder, type RxDBQueryOutput } from '../../../query-builder/query-builder/query-builder';

const FIELDS: FieldMetadata[] = [
  { name: 'title', type: 'string', displayName: '标题' },
  { name: 'views', type: 'number', displayName: '浏览量' },
  { name: 'published', type: 'boolean', displayName: '已发布' }
];

describe('QueryBuilder（真实组件）', () => {
  function renderBuilder(
    props: Partial<{
      fields: FieldMetadata[];
      schema: { fields: unknown[] };
      initialQuery: RxDBQueryOutput<object>;
    }> = {}
  ) {
    const emitted: Array<RxDBQueryOutput<object>> = [];
    const utils = render(
      <QueryBuilder<object>
        fields={props.fields ?? FIELDS}
        schema={props.schema as never}
        initialQuery={props.initialQuery}
        onQueryChange={query => emitted.push(query)}
      />
    );
    return { ...utils, emitted };
  }

  /** 点击「添加第一个条件」。 */
  function addFirstRule(host: ReturnType<typeof renderBuilder>): void {
    fireEvent.click(host.container.querySelector('[aria-label="添加第一个条件"]') as HTMLElement);
  }

  let host: ReturnType<typeof renderBuilder>;

  beforeEach(() => {
    host = renderBuilder();
  });

  it('无规则时渲染空态与「添加第一个条件」按钮', () => {
    const text = host.container.textContent as string;
    expect(text).toContain('还没有任何查询条件');
    expect(text).toContain('添加第一个条件');
  });

  it('fields 优先于 schema', () => {
    const both = renderBuilder({ fields: FIELDS, schema: { fields: [{ name: 'other', type: 'string' }] } });

    // 空态下字段列表体现在「添加第一个条件」后创建的规则里
    addFirstRule(both);
    expect(both.emitted.at(-1)?.rules[0]).toMatchObject({ field: 'title' });
  });

  it('未传 fields 时回退到 schema.fields', () => {
    const fromSchema = renderBuilder({ fields: [], schema: { fields: [{ name: 'fromSchema', type: 'string' }] } });

    addFirstRule(fromSchema);
    expect(fromSchema.emitted.at(-1)?.rules[0]).toMatchObject({ field: 'fromSchema' });
  });

  it('addFirstRule 用首个字段建规则，空态切换为规则区', () => {
    addFirstRule(host);

    expect(host.container.textContent).not.toContain('还没有任何查询条件');
    expect(host.container.querySelector('.rxdb-query-group')).toBeTruthy();
  });

  it('规则变化时 emit RxDB 查询结构', () => {
    addFirstRule(host);

    const last = host.emitted.at(-1);
    expect(last?.combinator).toBe('and');
    expect(last?.rules.length).toBe(1);
    expect(last?.rules[0]).toMatchObject({ field: 'title', operator: '=' });
  });

  it('boolean 字段的首规则默认值为 false，关系字段用 exists 操作符', () => {
    const boolFirst = renderBuilder({ fields: [FIELDS[2], FIELDS[0]] });
    addFirstRule(boolFirst);
    expect(boolFirst.emitted.at(-1)?.rules[0]).toMatchObject({ field: 'published', value: false });

    const relationFirst = renderBuilder({
      fields: [{ name: 'author', type: 'string', isRelation: true } as FieldMetadata]
    });
    addFirstRule(relationFirst);
    expect(relationFirst.emitted.at(-1)?.rules[0]).toMatchObject({ operator: 'exists' });
  });

  it('fields 为空时 addFirstRule 是 no-op', () => {
    const empty = renderBuilder({ fields: [] });

    fireEvent.click(empty.container.querySelector('[aria-label="添加第一个条件"]') as HTMLElement);

    expect(empty.container.textContent).toContain('还没有任何查询条件');
  });

  it('clearAll 清空全部规则', () => {
    addFirstRule(host);
    fireEvent.click(
      [...host.container.querySelectorAll('button')].find(b => b.textContent?.includes('+ 条件')) as HTMLElement
    );

    fireEvent.click(host.container.querySelector('[aria-label="清空所有查询条件"]') as HTMLElement);
    expect(host.container.textContent).toContain('还没有任何查询条件');
  });

  it('Escape 键在有规则时清空，无规则时不拦截', () => {
    addFirstRule(host);
    const builder = host.container.querySelector('.rxdb-query-builder') as HTMLElement;

    // fireEvent 返回 false 表示事件被 preventDefault 拦截
    const withRules = fireEvent.keyDown(builder, { key: 'Escape' });
    expect(withRules).toBe(false);
    expect(host.container.textContent).toContain('还没有任何查询条件');

    const withoutRules = fireEvent.keyDown(builder, { key: 'Escape' });
    expect(withoutRules).toBe(true);
  });

  it('「+ 分组」建子组，删除组按钮删掉它', () => {
    addFirstRule(host);

    fireEvent.click(
      [...host.container.querySelectorAll('button')].find(b => b.textContent?.includes('+ 分组')) as HTMLElement
    );
    // 嵌套子组渲染（2 个组容器）
    expect(host.container.querySelectorAll('.rxdb-query-group').length).toBe(2);

    fireEvent.click([...host.container.querySelectorAll('button')].find(b => b.title === '删除组') as HTMLElement);
    expect(host.container.querySelectorAll('.rxdb-query-group').length).toBe(1);
  });

  it('值输入变更反映到 emit 的查询里', () => {
    addFirstRule(host);
    const input = host.container.querySelector('input[placeholder="输入值"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'hello' } });

    expect(host.emitted.at(-1)?.rules[0]).toMatchObject({ field: 'title', operator: '=', value: 'hello' });
  });

  it('OR 组合器按钮把根组切换为 or', () => {
    addFirstRule(host);

    fireEvent.click(
      [...host.container.querySelectorAll('button')].find(b => b.textContent?.trim() === 'OR') as HTMLElement
    );

    expect(host.emitted.at(-1)?.combinator).toBe('or');
  });

  it('initialQuery 载入既有条件', () => {
    const { container } = renderBuilder({
      initialQuery: {
        combinator: 'and',
        rules: [{ field: 'title', operator: '=', value: 'hello' }]
      } as RxDBQueryOutput<object>
    });

    expect(container.querySelector('.rxdb-query-group')).toBeTruthy();
    expect((container.querySelector('input[placeholder="输入值"]') as HTMLInputElement).value).toBe('hello');
  });

  it('StrictMode 双挂载重建服务后仍载入 initialQuery', () => {
    const emitted: Array<RxDBQueryOutput<object>> = [];
    const { container } = render(
      <StrictMode>
        <QueryBuilder<object>
          fields={FIELDS}
          initialQuery={
            { combinator: 'and', rules: [{ field: 'title', operator: '=', value: 'hello' }] } as RxDBQueryOutput<object>
          }
          onQueryChange={query => emitted.push(query)}
        />
      </StrictMode>
    );

    expect((container.querySelector('input[placeholder="输入值"]') as HTMLInputElement | null)?.value).toBe('hello');
    expect(emitted.at(-1)?.rules).toEqual([expect.objectContaining({ field: 'title', operator: '=', value: 'hello' })]);
  });

  it('卸载销毁服务后不再抛错', () => {
    addFirstRule(host);
    expect(() => host.unmount()).not.toThrow();
  });

  /** 规则区里第一个值输入框。 */
  const valueInput = (container: HTMLElement): HTMLInputElement | null =>
    container.querySelector('input[placeholder="输入值"]');

  /** 单条 `title = value` 的查询。 */
  const titleQuery = (value: string): RxDBQueryOutput<object> =>
    ({ combinator: 'and', rules: [{ field: 'title', operator: '=', value }] }) as RxDBQueryOutput<object>;

  describe('字段集合变化（含清空）同步给服务', () => {
    const SCHEMA: SchemaInfo = { entityName: 'Post', fields: [FIELDS[0]] };
    const TITLE_OK = titleQuery('ok');

    function renderWith(initial: { fields?: FieldMetadata[]; schema?: SchemaInfo }) {
      const queries: Array<RxDBQueryOutput<object>> = [];
      const validations: ValidationResult[] = [];
      const element = (props: { fields?: FieldMetadata[]; schema?: SchemaInfo }): JSX.Element => (
        <QueryBuilder<object>
          fields={props.fields}
          schema={props.schema}
          initialQuery={TITLE_OK}
          onQueryChange={query => queries.push(query)}
          onValidationChange={result => validations.push(result)}
        />
      );
      const utils = render(element(initial));
      return {
        ...utils,
        queries,
        validations,
        update: (props: { fields?: FieldMetadata[]; schema?: SchemaInfo }) => utils.rerender(element(props))
      };
    }

    /** 最近一次 onValidationChange 是否报了 title 的 fieldExists。 */
    const titleMissing = (validations: ValidationResult[]): boolean =>
      validations.at(-1)?.valid === false &&
      !!validations.at(-1)?.errors?.some(error => error.field === 'title' && error.rule === 'fieldExists');

    it('fields 由非空切空：既有规则立即失效且后续改规则仍按空字段集校验，恢复后转回合法；全程不多发查询', () => {
      const host = renderWith({ fields: [FIELDS[0]] });
      expect(host.validations.at(-1)?.valid).toBe(true);
      const queryCount = host.queries.length;

      host.update({ fields: [] });

      expect(titleMissing(host.validations)).toBe(true);
      expect(host.queries).toHaveLength(queryCount);

      fireEvent.change(valueInput(host.container) as HTMLInputElement, { target: { value: 'changed' } });
      expect(titleMissing(host.validations)).toBe(true);
      const afterEdit = host.queries.length;

      host.update({ fields: [FIELDS[0]] });

      expect(host.validations.at(-1)?.valid).toBe(true);
      expect(host.queries).toHaveLength(afterEdit);
    });

    it('schema 由有值切 undefined（未传 fields）：同样立即失效，恢复后转回合法', () => {
      const host = renderWith({ schema: SCHEMA });
      expect(host.validations.at(-1)?.valid).toBe(true);
      const queryCount = host.queries.length;

      host.update({ schema: undefined });

      expect(titleMissing(host.validations)).toBe(true);

      host.update({ schema: SCHEMA });

      expect(host.validations.at(-1)?.valid).toBe(true);
      expect(host.queries).toHaveLength(queryCount);
    });
  });

  describe('Activity 隐藏再显示（effect 断开后重连，state / ref 保留）', () => {
    function renderInActivity(initialQuery?: RxDBQueryOutput<object>, strict = false) {
      const queries: Array<RxDBQueryOutput<object>> = [];
      const element = (mode: 'visible' | 'hidden', initial: RxDBQueryOutput<object> | undefined): JSX.Element => {
        const tree = (
          <Activity mode={mode}>
            <QueryBuilder<object> fields={FIELDS} initialQuery={initial} onQueryChange={query => queries.push(query)} />
          </Activity>
        );
        return strict ? <StrictMode>{tree}</StrictMode> : tree;
      };
      const utils = render(element('visible', initialQuery));
      return {
        ...utils,
        queries,
        hide: (initial = initialQuery) => utils.rerender(element('hidden', initial)),
        show: (initial = initialQuery) => utils.rerender(element('visible', initial))
      };
    }

    it('无 initialQuery：用户建的条件在反复隐藏 / 显示后仍在，重接不对外发任何查询', () => {
      const host = renderInActivity();
      fireEvent.click(host.container.querySelector('[aria-label="添加第一个条件"]') as HTMLElement);
      fireEvent.change(valueInput(host.container) as HTMLInputElement, { target: { value: 'draft' } });
      const emitted = host.queries.length;

      host.hide();
      host.show();
      host.hide();
      host.show();

      expect(valueInput(host.container)?.value).toBe('draft');
      expect(host.queries.slice(emitted)).toEqual([]);
    });

    it('稳定 initialQuery 后用户修改：重显保留用户的值，不回退到 initialQuery，也不先发空查询', () => {
      const host = renderInActivity(titleQuery('hello'));
      fireEvent.change(valueInput(host.container) as HTMLInputElement, { target: { value: 'world' } });
      const emitted = host.queries.length;

      host.hide();
      host.show();

      expect(valueInput(host.container)?.value).toBe('world');
      expect(host.queries.slice(emitted)).toEqual([]);
    });

    it('宿主回写当前查询：隐藏时交回收到的最新查询，重显界面与发出的查询都是它，中途不发空查询', () => {
      const host = renderInActivity(titleQuery('hello'));
      fireEvent.change(valueInput(host.container) as HTMLInputElement, { target: { value: 'world' } });
      const latest = host.queries.at(-1) as RxDBQueryOutput<object>;
      const emitted = host.queries.length;

      host.hide(latest);
      host.show(latest);

      expect(valueInput(host.container)?.value).toBe('world');
      expect(host.queries.slice(emitted).map(query => query.rules)).toEqual([titleQuery('world').rules]);
    });

    it('隐藏期间宿主替换 initialQuery：重显载入新查询，只对外发一次新查询', () => {
      const host = renderInActivity(titleQuery('hello'));
      const emitted = host.queries.length;
      const replaced = titleQuery('replaced');

      host.hide();
      host.hide(replaced);
      host.show(replaced);

      expect(valueInput(host.container)?.value).toBe('replaced');
      expect(host.queries.slice(emitted).map(query => query.rules)).toEqual([replaced.rules]);
    });

    it('StrictMode：挂载只发一次 initialQuery，用户修改在隐藏 / 显示后保留且不再对外发查询', () => {
      const host = renderInActivity(titleQuery('hello'), true);
      expect(host.queries.map(query => query.rules)).toEqual([titleQuery('hello').rules]);

      fireEvent.change(valueInput(host.container) as HTMLInputElement, { target: { value: 'world' } });
      const emitted = host.queries.length;
      host.hide();
      host.show();

      expect(valueInput(host.container)?.value).toBe('world');
      expect(host.queries.slice(emitted)).toEqual([]);
    });
  });
});
