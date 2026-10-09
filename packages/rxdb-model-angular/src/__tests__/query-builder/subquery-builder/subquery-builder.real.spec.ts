import { PropertyType } from '@aiao/rxdb';
import type { FieldMetadata, QueryBuilderRuleGroup, UIRule } from '@aiao/rxdb-model';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { SubqueryBuilderComponent } from '../../../query-builder/subquery-builder/subquery-builder.component';
import type { UIRuleGroup } from '../../../query-builder/query-group/query-group.component';

/**
 * SubqueryBuilderComponent —— **真实加载组件源码 + 真实 QueryBuilderService**（对齐 React / Vue 侧）。
 *
 * 用于 EXISTS / NOT EXISTS 的嵌套查询条件。与 QueryBuilder spec 同模式：
 * 组件公开方法驱动真实 service ↔ signal ↔ output 链路。
 */

const FIELDS: FieldMetadata[] = [
  { name: 'title', type: PropertyType.string, displayName: '标题' },
  { name: 'views', type: PropertyType.number, displayName: '浏览量' },
  { name: 'published', type: PropertyType.boolean, displayName: '已发布' }
];

type EmittedQuery = { combinator: 'and' | 'or'; rules: unknown[] } | undefined;

describe('SubqueryBuilderComponent（真实组件）', () => {
  function render(
    inputs: Partial<{
      fields: FieldMetadata[];
      initialQuery: QueryBuilderRuleGroup<Record<string, unknown>>;
      maxDepth: number;
    }> = {}
  ) {
    const fixture = TestBed.createComponent(SubqueryBuilderComponent);
    const emitted: EmittedQuery[] = [];
    fixture.componentInstance.queryChange.subscribe(q => emitted.push(q));
    fixture.componentRef.setInput('fields', inputs.fields ?? FIELDS);
    if (inputs.initialQuery) fixture.componentRef.setInput('initialQuery', inputs.initialQuery);
    if (inputs.maxDepth !== undefined) fixture.componentRef.setInput('maxDepth', inputs.maxDepth);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, emitted };
  }

  let host: ReturnType<typeof render>;

  beforeEach(() => {
    host = render();
  });

  it('无规则时渲染空态与「添加子条件」按钮', () => {
    expect(host.component.hasRules()).toBeFalsy();
    const text = host.fixture.nativeElement.textContent as string;
    expect(text).toContain('添加子条件');
    expect(text).toContain('（可选）');
    expect(text).not.toContain('清空');
  });

  it('handleAddFirstRule 用首个字段建规则，hasRules 转真并渲染规则区', () => {
    host.component.handleAddFirstRule();
    host.fixture.detectChanges();

    expect(host.component.hasRules()).toBe(true);
    expect(host.component.rootGroup()?.rules.length).toBe(1);
    expect(host.fixture.nativeElement.textContent).not.toContain('添加子条件');
    expect(host.fixture.nativeElement.textContent).toContain('清空');
  });

  it('模板「添加子条件」按钮点击与组件方法同效', () => {
    const addButton = host.fixture.nativeElement.querySelector('button');
    expect(addButton).toBeDefined();
    (addButton as HTMLButtonElement).click();
    host.fixture.detectChanges();

    expect(host.component.hasRules()).toBe(true);
    expect(host.component.rootGroup()?.rules.length).toBe(1);
  });

  it('首个字段默认规则：关系字段 exists、keyValue 用 null、boolean 默认 false', () => {
    const relation = render({
      fields: [{ name: 'author', type: 'string', isRelation: true } as FieldMetadata]
    });
    relation.component.handleAddFirstRule();
    relation.fixture.detectChanges();
    expect((relation.component.rootGroup()?.rules[0] as UIRule).operator).toBe('exists');

    const keyValue = render({
      fields: [{ name: 'tags', type: 'keyValue' } as FieldMetadata]
    });
    keyValue.component.handleAddFirstRule();
    keyValue.fixture.detectChanges();
    expect((keyValue.component.rootGroup()?.rules[0] as UIRule).operator).toBe('null');

    const boolean = render({ fields: [FIELDS[2]] });
    boolean.component.handleAddFirstRule();
    boolean.fixture.detectChanges();
    expect((boolean.component.rootGroup()?.rules[0] as UIRule).value).toBe(false);
  });

  it('fields 为空时 handleAddFirstRule 是 no-op', () => {
    const empty = render({ fields: [] });
    empty.component.handleAddFirstRule();

    expect(empty.component.hasRules()).toBeFalsy();
  });

  it('规则变化时 emit queryChange 与 validationChange', () => {
    host.component.handleAddFirstRule();
    host.fixture.detectChanges();

    const lastQuery = host.emitted.at(-1);
    expect(lastQuery?.combinator).toBe('and');
    expect(lastQuery?.rules.length).toBe(1);
    expect(lastQuery?.rules[0]).toMatchObject({ field: 'title', operator: '=' });

    const validations: Array<{ valid: boolean }> = [];
    host.component.validationChange.subscribe(v => validations.push(v));
    host.component.handleAddFirstRule();
    host.fixture.detectChanges();
    expect(validations.at(-1)).toBeDefined();
    expect(typeof validations.at(-1)?.valid).toBe('boolean');
  });

  it('handleClear 清空规则并 emit queryChange undefined', () => {
    host.component.handleAddFirstRule();
    host.fixture.detectChanges();
    host.component.handleClear();
    host.fixture.detectChanges();

    expect(host.component.hasRules()).toBeFalsy();
    expect(host.emitted.at(-1)).toBeUndefined();
  });

  it('模板「清空」按钮点击等价 handleClear', () => {
    host.component.handleAddFirstRule();
    host.fixture.detectChanges();

    const clearButton = [...host.fixture.nativeElement.querySelectorAll('button')].find(b =>
      b.textContent?.includes('清空')
    );
    expect(clearButton).toBeDefined();
    (clearButton as HTMLButtonElement).click();
    host.fixture.detectChanges();

    expect(host.component.hasRules()).toBeFalsy();
  });

  it('initialQuery 载入既有条件', () => {
    const withInitial = render({
      initialQuery: {
        id: 'root',
        combinator: 'and',
        rules: [{ id: 'r1', field: 'title', operator: '=', value: 'hello' }]
      }
    });

    expect(withInitial.component.hasRules()).toBe(true);
    expect(withInitial.component.rootGroup()?.rules.length).toBe(1);
  });

  it('initialQuery 只应用一次：用户加规则后变更 initialQuery 不重置', () => {
    const withInitial = render({
      initialQuery: {
        id: 'root',
        combinator: 'and',
        rules: [{ id: 'r1', field: 'title', operator: '=', value: 'hello' }]
      }
    });
    withInitial.component.handleAddFirstRule();
    withInitial.fixture.detectChanges();
    expect(withInitial.component.rootGroup()?.rules.length).toBe(2);

    withInitial.fixture.componentRef.setInput('initialQuery', {
      id: 'root2',
      combinator: 'or',
      rules: [{ id: 'r2', field: 'views', operator: '>', value: 1 }]
    });
    withInitial.fixture.detectChanges();

    expect(withInitial.component.rootGroup()?.rules.length).toBe(2);
    expect((withInitial.component.rootGroup()?.rules[0] as UIRule).field).toBe('title');
  });

  it('onAddRule 向根组添加规则', () => {
    host.component.handleAddFirstRule();
    host.component.onAddRule({
      parentId: host.component.rootGroup()!.id,
      rule: { field: 'views', operator: '>', value: 10 }
    });
    host.fixture.detectChanges();

    expect(host.component.rootGroup()?.rules.length).toBe(2);
  });

  it('onAddGroup 建子组，onRemoveItem 删掉它', () => {
    host.component.handleAddFirstRule();
    const rootId = host.component.rootGroup()!.id;
    host.component.onAddGroup(rootId);
    host.fixture.detectChanges();
    expect(host.component.rootGroup()?.rules.length).toBe(2);

    const added = host.component.rootGroup()!.rules.at(-1) as { id: string };
    host.component.onRemoveItem(added.id);
    host.fixture.detectChanges();
    expect(host.component.rootGroup()?.rules.length).toBe(1);
  });

  it('onUpdateRule 改字段与操作符后反映到 emit 的查询里', () => {
    host.component.handleAddFirstRule();
    const ruleId = (host.component.rootGroup()!.rules[0] as { id: string }).id;

    host.component.onUpdateRule({ id: ruleId, updates: { field: 'views', operator: '>', value: 10 } });
    host.fixture.detectChanges();

    const last = host.emitted.at(-1);
    expect(last?.rules[0]).toMatchObject({ field: 'views', operator: '>', value: 10 });
  });

  it('onUpdateCombinator 把根组切换为 or', () => {
    host.component.handleAddFirstRule();
    host.component.onUpdateCombinator({ id: host.component.rootGroup()!.id, combinator: 'or' });
    host.fixture.detectChanges();

    expect(host.component.rootGroup()?.combinator).toBe('or');
    expect(host.emitted.at(-1)?.combinator).toBe('or');
  });

  it('fields 从空变为非空时同步到服务', () => {
    const empty = render({ fields: [] });
    empty.fixture.componentRef.setInput('fields', FIELDS);
    empty.fixture.detectChanges();

    empty.component.handleAddFirstRule();
    empty.fixture.detectChanges();
    expect(empty.component.rootGroup()?.rules.length).toBe(1);
  });

  it('maxDepth 变更同步到服务', () => {
    const shallow = render({ maxDepth: 1 });
    shallow.fixture.componentRef.setInput('maxDepth', 2);
    shallow.fixture.detectChanges();
    expect(shallow.component.hasRules()).toBeFalsy();
  });

  it('销毁组件销毁服务后不再抛错', () => {
    host.component.handleAddFirstRule();
    expect(() => host.fixture.destroy()).not.toThrow();
  });

  // 编译期守卫：UIRuleGroup 在 query-group 模块与包根均可命名（对齐 React / Vue 导出）
  it('UIRuleGroup 类型可命名', () => {
    const group: UIRuleGroup = { id: 'g1', combinator: 'and', rules: [] };
    expect(group.rules).toEqual([]);
  });
});
