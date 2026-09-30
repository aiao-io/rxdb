import { PropertyType } from '@aiao/rxdb';
import type { FieldMetadata, QueryBuilderRuleGroup, UIRule } from '@aiao/rxdb-model';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import type { UIRuleGroup } from '../../../query-builder/query-group/query-drag-drop';
import SubqueryBuilder from '../../../query-builder/subquery-builder/SubqueryBuilder.vue';

/**
 * SubqueryBuilder —— **真实加载组件源码 + 真实 QueryBuilderService**（对齐 Angular 侧）。
 *
 * 用于 EXISTS / NOT EXISTS 的嵌套查询条件。与 QueryBuilder spec 同模式：
 * 经 `defineExpose` 的 vm 方法驱动真实 service ↔ ref ↔ emit 链路。
 */

const FIELDS: FieldMetadata[] = [
  { name: 'title', type: PropertyType.string, displayName: '标题' },
  { name: 'views', type: PropertyType.number, displayName: '浏览量' },
  { name: 'published', type: PropertyType.boolean, displayName: '已发布' }
];

interface SubqueryBuilderVM {
  rootGroup: UIRuleGroup | undefined;
  hasRules: boolean;
  handleAddFirstRule(): void;
  handleClear(): void;
  onAddRule(event: { parentId: string; rule: Record<string, unknown> }): void;
  onAddGroup(parentId: string): void;
  onRemoveItem(id: string): void;
  onUpdateRule(event: { id: string; updates: Record<string, unknown> }): void;
  onUpdateCombinator(event: { id: string; combinator: 'and' | 'or' }): void;
}

type EmittedQuery = { combinator: 'and' | 'or'; rules: unknown[] } | undefined;

describe('SubqueryBuilder（真实组件）', () => {
  function render(
    inputs: Partial<{
      fields: FieldMetadata[];
      initialQuery: QueryBuilderRuleGroup<Record<string, unknown>>;
      maxDepth: number;
    }> = {}
  ) {
    const wrapper = mount(SubqueryBuilder, {
      props: {
        fields: inputs.fields ?? FIELDS,
        ...(inputs.initialQuery ? { initialQuery: inputs.initialQuery } : {}),
        ...(inputs.maxDepth !== undefined ? { maxDepth: inputs.maxDepth } : {})
      }
    });
    return { wrapper, vm: wrapper.vm as unknown as SubqueryBuilderVM };
  }

  let host: ReturnType<typeof render>;

  beforeEach(() => {
    host = render();
  });

  it('无规则时渲染空态与「添加子条件」按钮', () => {
    expect(host.vm.hasRules).toBeFalsy();
    const text = host.wrapper.element.textContent as string;
    expect(text).toContain('添加子条件');
    expect(text).toContain('（可选）');
    expect(text).not.toContain('清空');
  });

  it('handleAddFirstRule 用首个字段建规则，hasRules 转真并渲染规则区', async () => {
    host.vm.handleAddFirstRule();
    await host.wrapper.vm.$nextTick();

    expect(host.vm.hasRules).toBe(true);
    expect(host.vm.rootGroup?.rules.length).toBe(1);
    expect(host.wrapper.element.textContent).not.toContain('添加子条件');
    expect(host.wrapper.element.textContent).toContain('清空');
  });

  it('模板「添加子条件」按钮点击与 vm 方法同效', async () => {
    const addButton = [...host.wrapper.element.querySelectorAll('button')].find(b =>
      b.textContent?.includes('添加子条件')
    );
    expect(addButton).toBeDefined();
    (addButton as HTMLButtonElement).click();
    await host.wrapper.vm.$nextTick();

    expect(host.vm.hasRules).toBe(true);
    expect(host.vm.rootGroup?.rules.length).toBe(1);
  });

  it('首个字段默认规则：关系字段 exists、keyValue 用 null、boolean 默认 false', async () => {
    const relation = render({
      fields: [{ name: 'author', type: 'string', isRelation: true } as FieldMetadata]
    });
    relation.vm.handleAddFirstRule();
    await relation.wrapper.vm.$nextTick();
    expect((relation.vm.rootGroup?.rules[0] as UIRule).operator).toBe('exists');

    const keyValue = render({
      fields: [{ name: 'tags', type: 'keyValue' } as FieldMetadata]
    });
    keyValue.vm.handleAddFirstRule();
    await keyValue.wrapper.vm.$nextTick();
    expect((keyValue.vm.rootGroup?.rules[0] as UIRule).operator).toBe('null');

    const boolean = render({ fields: [FIELDS[2]] });
    boolean.vm.handleAddFirstRule();
    await boolean.wrapper.vm.$nextTick();
    expect((boolean.vm.rootGroup?.rules[0] as UIRule).value).toBe(false);
  });

  it('fields 为空时 handleAddFirstRule 是 no-op', () => {
    const empty = render({ fields: [] });
    empty.vm.handleAddFirstRule();

    expect(empty.vm.hasRules).toBeFalsy();
  });

  it('规则变化时 emit queryChange 与 validationChange', async () => {
    host.vm.handleAddFirstRule();
    await host.wrapper.vm.$nextTick();

    const lastQuery = host.wrapper.emitted('queryChange')?.at(-1)?.[0] as EmittedQuery;
    expect(lastQuery?.combinator).toBe('and');
    expect(lastQuery?.rules.length).toBe(1);
    expect(lastQuery?.rules[0]).toMatchObject({ field: 'title', operator: '=' });

    const lastValidation = host.wrapper.emitted('validationChange')?.at(-1)?.[0] as {
      valid: boolean;
    };
    expect(lastValidation).toBeDefined();
    expect(typeof lastValidation.valid).toBe('boolean');
  });

  it('handleClear 清空规则并 emit queryChange undefined', async () => {
    host.vm.handleAddFirstRule();
    await host.wrapper.vm.$nextTick();
    host.vm.handleClear();
    await host.wrapper.vm.$nextTick();

    expect(host.vm.hasRules).toBeFalsy();
    const last = host.wrapper.emitted('queryChange')?.at(-1)?.[0] as EmittedQuery;
    expect(last).toBeUndefined();
  });

  it('模板「清空」按钮点击等价 handleClear', async () => {
    host.vm.handleAddFirstRule();
    await host.wrapper.vm.$nextTick();

    const clearButton = [...host.wrapper.element.querySelectorAll('button')].find(b => b.textContent?.includes('清空'));
    expect(clearButton).toBeDefined();
    (clearButton as HTMLButtonElement).click();
    await host.wrapper.vm.$nextTick();

    expect(host.vm.hasRules).toBeFalsy();
  });

  it('initialQuery 载入既有条件', () => {
    const { vm } = render({
      initialQuery: {
        id: 'root',
        combinator: 'and',
        rules: [{ id: 'r1', field: 'title', operator: '=', value: 'hello' }]
      }
    });

    expect(vm.hasRules).toBe(true);
    expect(vm.rootGroup?.rules.length).toBe(1);
  });

  it('initialQuery 只应用一次：用户加规则后变更 initialQuery 不重置', async () => {
    const withInitial = render({
      initialQuery: {
        id: 'root',
        combinator: 'and',
        rules: [{ id: 'r1', field: 'title', operator: '=', value: 'hello' }]
      }
    });
    withInitial.vm.handleAddFirstRule();
    await withInitial.wrapper.vm.$nextTick();
    expect(withInitial.vm.rootGroup?.rules.length).toBe(2);

    await withInitial.wrapper.setProps({
      initialQuery: {
        id: 'root2',
        combinator: 'or',
        rules: [{ id: 'r2', field: 'views', operator: '>', value: 1 }]
      }
    });
    await withInitial.wrapper.vm.$nextTick();

    expect(withInitial.vm.rootGroup?.rules.length).toBe(2);
    expect((withInitial.vm.rootGroup?.rules[0] as UIRule).field).toBe('title');
  });

  it('onAddRule 向根组添加规则', async () => {
    host.vm.handleAddFirstRule();
    host.vm.onAddRule({
      parentId: host.vm.rootGroup!.id,
      rule: { field: 'views', operator: '>', value: 10 }
    });
    await host.wrapper.vm.$nextTick();

    expect(host.vm.rootGroup?.rules.length).toBe(2);
  });

  it('onAddGroup 建子组，onRemoveItem 删掉它', async () => {
    host.vm.handleAddFirstRule();
    const rootId = host.vm.rootGroup!.id;
    host.vm.onAddGroup(rootId);
    await host.wrapper.vm.$nextTick();
    expect(host.vm.rootGroup?.rules.length).toBe(2);

    const added = host.vm.rootGroup!.rules.at(-1) as { id: string };
    host.vm.onRemoveItem(added.id);
    await host.wrapper.vm.$nextTick();
    expect(host.vm.rootGroup?.rules.length).toBe(1);
  });

  it('onUpdateRule 改字段与操作符后反映到 emit 的查询里', async () => {
    host.vm.handleAddFirstRule();
    const ruleId = (host.vm.rootGroup!.rules[0] as { id: string }).id;

    host.vm.onUpdateRule({ id: ruleId, updates: { field: 'views', operator: '>', value: 10 } });
    await host.wrapper.vm.$nextTick();

    const last = host.wrapper.emitted('queryChange')?.at(-1)?.[0] as EmittedQuery;
    expect(last?.rules[0]).toMatchObject({ field: 'views', operator: '>', value: 10 });
  });

  it('onUpdateCombinator 把根组切换为 or', async () => {
    host.vm.handleAddFirstRule();
    host.vm.onUpdateCombinator({ id: host.vm.rootGroup!.id, combinator: 'or' });
    await host.wrapper.vm.$nextTick();

    expect(host.vm.rootGroup?.combinator).toBe('or');
    const last = host.wrapper.emitted('queryChange')?.at(-1)?.[0] as EmittedQuery;
    expect(last?.combinator).toBe('or');
  });

  it('fields 从空变为非空时同步到服务', async () => {
    const empty = render({ fields: [] });
    await empty.wrapper.setProps({ fields: FIELDS });
    await empty.wrapper.vm.$nextTick();

    empty.vm.handleAddFirstRule();
    await empty.wrapper.vm.$nextTick();
    expect(empty.vm.rootGroup?.rules.length).toBe(1);
  });

  it('maxDepth 变更同步到服务', async () => {
    const shallow = render({ maxDepth: 1 });
    await shallow.wrapper.setProps({ maxDepth: 2 });
    await shallow.wrapper.vm.$nextTick();
    expect(shallow.vm.hasRules).toBeFalsy();
  });

  it('销毁组件销毁服务后不再抛错', () => {
    host.vm.handleAddFirstRule();
    expect(() => host.wrapper.unmount()).not.toThrow();
  });
});
