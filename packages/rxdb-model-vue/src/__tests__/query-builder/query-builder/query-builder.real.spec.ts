import { PropertyType } from '@aiao/rxdb';
import type { FieldMetadata } from '@aiao/rxdb-model';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import QueryBuilder from '../../../query-builder/query-builder/QueryBuilder.vue';
import type { RxDBQueryOutput } from '../../../query-builder/query-builder/query-builder-types';

/**
 * QueryBuilder —— **真实加载组件源码 + 真实 QueryBuilderService**（对齐 Angular 侧）。
 *
 * 与旧版「把逻辑内联复制一份来测」的做法不同，
 * 这里 import 真实组件、渲染、断言真实的 service ↔ ref ↔ emit 链路。
 */

const FIELDS: FieldMetadata[] = [
  { name: 'title', type: PropertyType.string, displayName: '标题' },
  { name: 'views', type: PropertyType.number, displayName: '浏览量' },
  { name: 'published', type: PropertyType.boolean, displayName: '已发布' }
];

type QueryBuilderVM = InstanceType<typeof QueryBuilder> & {
  hasRules: boolean;
  rootGroup: { id: string; combinator: 'and' | 'or'; rules: unknown[] } | undefined;
  fieldsComputed: FieldMetadata[];
  validationErrors: unknown[];
  addFirstRule(): void;
  clearAll(): void;
  onKeyDown(event: KeyboardEvent): void;
  onAddRule(event: { parentId: string; rule: Record<string, unknown> }): void;
  onAddGroup(parentId: string): void;
  onRemoveItem(id: string): void;
  onUpdateRule(event: { id: string; updates: Record<string, unknown> }): void;
  onUpdateCombinator(event: { id: string; combinator: 'and' | 'or' }): void;
};

describe('QueryBuilder（真实组件）', () => {
  function render(
    inputs: Partial<{ fields: FieldMetadata[]; initialQuery: RxDBQueryOutput<Record<string, unknown>> }> = {}
  ) {
    const wrapper = mount(QueryBuilder, {
      props: {
        fields: inputs.fields ?? FIELDS,
        ...(inputs.initialQuery ? { initialQuery: inputs.initialQuery } : {})
      }
    });
    return { wrapper, vm: wrapper.vm as unknown as QueryBuilderVM };
  }

  let host: ReturnType<typeof render>;

  beforeEach(() => {
    host = render();
  });

  it('无规则时渲染空态与「添加第一个条件」按钮', () => {
    expect(host.vm.hasRules).toBeFalsy();
    const text = host.wrapper.element.textContent as string;
    expect(text).toContain('还没有任何查询条件');
    expect(text).toContain('添加第一个条件');
  });

  it('fields 优先于 schema', () => {
    const wrapper = mount(QueryBuilder, {
      props: {
        fields: FIELDS,
        schema: { entityName: 'x', fields: [{ name: 'other', type: 'string', displayName: '其他' }] }
      }
    });

    expect((wrapper.vm as unknown as QueryBuilderVM).fieldsComputed.map(f => f.name)).toEqual([
      'title',
      'views',
      'published'
    ]);
  });

  it('未传 fields 时回退到 schema.fields', () => {
    const wrapper = mount(QueryBuilder, {
      props: {
        schema: { entityName: 'x', fields: [{ name: 'fromSchema', type: 'string', displayName: '来自Schema' }] }
      }
    });

    expect((wrapper.vm as unknown as QueryBuilderVM).fieldsComputed.map(f => f.name)).toEqual(['fromSchema']);
  });

  it('addFirstRule 用首个字段建规则，hasRules 转真并渲染规则区', async () => {
    host.vm.addFirstRule();
    await host.wrapper.vm.$nextTick();

    expect(host.vm.hasRules).toBe(true);
    expect(host.vm.rootGroup?.rules.length).toBe(1);
    expect(host.wrapper.element.textContent).not.toContain('还没有任何查询条件');
  });

  it('规则变化时 emit RxDB 查询结构', async () => {
    host.vm.addFirstRule();
    await host.wrapper.vm.$nextTick();

    // emit 由 watch 驱动，必须先 nextTick 才能拿到最新一次
    const last = host.wrapper.emitted('queryChange')?.at(-1)?.[0] as RxDBQueryOutput<Record<string, unknown>>;
    expect(last?.combinator).toBe('and');
    expect(last?.rules.length).toBe(1);
    expect(last?.rules[0]).toMatchObject({ field: 'title', operator: '=' });
  });

  it('boolean 字段的首规则默认值为 false，关系字段用 exists 操作符', async () => {
    const boolFirst = render({ fields: [FIELDS[2], FIELDS[0]] });
    boolFirst.vm.addFirstRule();
    await boolFirst.wrapper.vm.$nextTick();
    const boolQuery = boolFirst.wrapper.emitted('queryChange')?.at(-1)?.[0] as RxDBQueryOutput<Record<string, unknown>>;
    expect(boolQuery?.rules[0]).toMatchObject({ field: 'published', value: false });

    const relationFirst = render({
      fields: [{ name: 'author', type: 'string', isRelation: true } as FieldMetadata]
    });
    relationFirst.vm.addFirstRule();
    await relationFirst.wrapper.vm.$nextTick();
    const relQuery = relationFirst.wrapper.emitted('queryChange')?.at(-1)?.[0] as RxDBQueryOutput<
      Record<string, unknown>
    >;
    expect(relQuery?.rules[0]).toMatchObject({ operator: 'exists' });
  });

  it('fields 为空时 addFirstRule 是 no-op', () => {
    const empty = render({ fields: [] });
    empty.vm.addFirstRule();

    expect(empty.vm.hasRules).toBeFalsy();
  });

  it('clearAll 清空全部规则', async () => {
    host.vm.addFirstRule();
    host.vm.onAddRule({
      parentId: host.vm.rootGroup!.id,
      rule: { field: 'views', operator: '=', value: 1 }
    });
    expect(host.vm.rootGroup?.rules.length).toBe(2);

    host.vm.clearAll();
    await host.wrapper.vm.$nextTick();
    expect(host.vm.hasRules).toBeFalsy();
  });

  it('Escape 键在有规则时清空，无规则时不拦截', () => {
    host.vm.addFirstRule();
    const withRules = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    host.vm.onKeyDown(withRules);
    expect(withRules.defaultPrevented).toBe(true);
    expect(host.vm.hasRules).toBeFalsy();

    const withoutRules = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    host.vm.onKeyDown(withoutRules);
    expect(withoutRules.defaultPrevented).toBe(false);
  });

  it('onAddGroup 建子组，onRemoveItem 删掉它', () => {
    host.vm.addFirstRule();
    const rootId = host.vm.rootGroup!.id;
    host.vm.onAddGroup(rootId);
    expect(host.vm.rootGroup?.rules.length).toBe(2);

    const added = host.vm.rootGroup!.rules.at(-1) as { id: string };
    host.vm.onRemoveItem(added.id);
    expect(host.vm.rootGroup?.rules.length).toBe(1);
  });

  it('onUpdateRule 改字段与操作符后反映到 emit 的查询里', async () => {
    host.vm.addFirstRule();
    const ruleId = (host.vm.rootGroup!.rules[0] as { id: string }).id;

    host.vm.onUpdateRule({ id: ruleId, updates: { field: 'views', operator: '>', value: 10 } });
    await host.wrapper.vm.$nextTick();

    const last = host.wrapper.emitted('queryChange')?.at(-1)?.[0] as RxDBQueryOutput<Record<string, unknown>>;
    expect(last?.rules[0]).toMatchObject({ field: 'views', operator: '>', value: 10 });
  });

  it('onUpdateCombinator 把根组切换为 or', async () => {
    host.vm.addFirstRule();
    host.vm.onUpdateCombinator({ id: host.vm.rootGroup!.id, combinator: 'or' });
    await host.wrapper.vm.$nextTick();

    expect(host.vm.rootGroup?.combinator).toBe('or');
    const last = host.wrapper.emitted('queryChange')?.at(-1)?.[0] as RxDBQueryOutput<Record<string, unknown>>;
    expect(last?.combinator).toBe('or');
  });

  it('initialQuery 载入既有条件', () => {
    const { vm } = render({
      initialQuery: {
        combinator: 'and',
        rules: [{ field: 'title', operator: '=', value: 'hello' }]
      } as RxDBQueryOutput<Record<string, unknown>>
    });

    expect(vm.hasRules).toBe(true);
    expect(vm.rootGroup?.rules.length).toBe(1);
  });

  it('销毁组件销毁服务后不再抛错', () => {
    host.vm.addFirstRule();
    expect(() => host.wrapper.unmount()).not.toThrow();
  });
});
