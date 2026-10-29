import { PropertyType } from '@aiao/rxdb';
import type { FieldMetadata, SchemaInfo, ValidationResult } from '@aiao/rxdb-model';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  QueryBuilderComponent,
  type RxDBQueryOutput
} from '../../../query-builder/query-builder/query-builder.component';

/**
 * QueryBuilderComponent —— **真实加载组件源码 + 真实 QueryBuilderService**。
 *
 * 与同目录的 `query-builder.component.spec.ts` 的区别：那个文件把逻辑内联复制了一份来测
 * （「测试写了，但测的不是被测代码」），这里 import 真实组件、
 * 用 TestBed 渲染、断言真实的 service ↔ signal ↔ output 链路。
 */

const FIELDS: FieldMetadata[] = [
  { name: 'title', type: PropertyType.string, displayName: '标题' },
  { name: 'views', type: PropertyType.number, displayName: '浏览量' },
  { name: 'published', type: PropertyType.boolean, displayName: '已发布' }
];

describe('QueryBuilderComponent（真实组件）', () => {
  function render(inputs: Partial<{ fields: FieldMetadata[]; initialQuery: RxDBQueryOutput<object> }> = {}) {
    const fixture = TestBed.createComponent<QueryBuilderComponent<object>>(QueryBuilderComponent);
    const emitted: Array<RxDBQueryOutput<object>> = [];
    fixture.componentInstance.queryChange.subscribe(q => emitted.push(q));
    fixture.componentRef.setInput('fields', inputs.fields ?? FIELDS);
    if (inputs.initialQuery) fixture.componentRef.setInput('initialQuery', inputs.initialQuery);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, emitted };
  }

  let host: ReturnType<typeof render>;

  beforeEach(() => {
    host = render();
  });

  it('无规则时渲染空态与「添加第一个条件」按钮', () => {
    expect(host.component.hasRules()).toBeFalsy();
    const text = host.fixture.nativeElement.textContent as string;
    expect(text).toContain('还没有任何查询条件');
    expect(text).toContain('添加第一个条件');
  });

  it('fields 优先于 schema', () => {
    const fixture = TestBed.createComponent<QueryBuilderComponent<object>>(QueryBuilderComponent);
    fixture.componentRef.setInput('fields', FIELDS);
    fixture.componentRef.setInput('schema', { fields: [{ name: 'other', type: 'string' }] });
    fixture.detectChanges();

    expect(fixture.componentInstance.fieldsComputed().map(f => f.name)).toEqual(['title', 'views', 'published']);
  });

  it('未传 fields 时回退到 schema.fields', () => {
    const fixture = TestBed.createComponent<QueryBuilderComponent<object>>(QueryBuilderComponent);
    fixture.componentRef.setInput('schema', { fields: [{ name: 'fromSchema', type: 'string' }] });
    fixture.detectChanges();

    expect(fixture.componentInstance.fieldsComputed().map(f => f.name)).toEqual(['fromSchema']);
  });

  it('addFirstRule 用首个字段建规则，hasRules 转真并渲染规则区', () => {
    host.component.addFirstRule();
    host.fixture.detectChanges();

    expect(host.component.hasRules()).toBe(true);
    expect(host.component.rootGroup()?.rules.length).toBe(1);
    expect(host.fixture.nativeElement.textContent).not.toContain('还没有任何查询条件');
  });

  it('规则变化时 emit RxDB 查询结构', () => {
    host.component.addFirstRule();
    host.fixture.detectChanges();

    // emit 由 effect 驱动，必须先 detectChanges 才能拿到最新一次
    const last = host.emitted.at(-1);
    expect(last?.combinator).toBe('and');
    expect(last?.rules.length).toBe(1);
    expect(last?.rules[0]).toMatchObject({ field: 'title', operator: '=' });
  });

  it('boolean 字段的首规则默认值为 false，关系字段用 exists 操作符', () => {
    const boolFirst = render({ fields: [FIELDS[2], FIELDS[0]] });
    boolFirst.component.addFirstRule();
    boolFirst.fixture.detectChanges();
    expect(boolFirst.emitted.at(-1)?.rules[0]).toMatchObject({ field: 'published', value: false });

    const relationFirst = render({
      fields: [{ name: 'author', type: 'string', isRelation: true } as FieldMetadata]
    });
    relationFirst.component.addFirstRule();
    relationFirst.fixture.detectChanges();
    expect(relationFirst.emitted.at(-1)?.rules[0]).toMatchObject({ operator: 'exists' });
  });

  it('fields 为空时 addFirstRule 是 no-op', () => {
    const empty = render({ fields: [] });
    empty.component.addFirstRule();

    expect(empty.component.hasRules()).toBeFalsy();
  });

  it('clearAll 清空全部规则', () => {
    host.component.addFirstRule();
    host.component.onAddRule({
      parentId: host.component.rootGroup()!.id,
      rule: { field: 'views', operator: '=', value: 1 }
    });
    expect(host.component.rootGroup()?.rules.length).toBe(2);

    host.component.clearAll();
    host.fixture.detectChanges();
    expect(host.component.hasRules()).toBeFalsy();
  });

  it('Escape 键在有规则时清空，无规则时不拦截', () => {
    host.component.addFirstRule();
    const withRules = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    host.component.onKeyDown(withRules);
    expect(withRules.defaultPrevented).toBe(true);
    expect(host.component.hasRules()).toBeFalsy();

    const withoutRules = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    host.component.onKeyDown(withoutRules);
    expect(withoutRules.defaultPrevented).toBe(false);
  });

  it('onAddGroup 建子组，onRemoveItem 删掉它', () => {
    host.component.addFirstRule();
    const rootId = host.component.rootGroup()!.id;
    host.component.onAddGroup(rootId);
    expect(host.component.rootGroup()?.rules.length).toBe(2);

    const added = host.component.rootGroup()!.rules.at(-1) as { id: string };
    host.component.onRemoveItem(added.id);
    expect(host.component.rootGroup()?.rules.length).toBe(1);
  });

  it('onUpdateRule 改字段与操作符后反映到 emit 的查询里', () => {
    host.component.addFirstRule();
    const ruleId = (host.component.rootGroup()!.rules[0] as { id: string }).id;

    host.component.onUpdateRule({ id: ruleId, updates: { field: 'views', operator: '>', value: 10 } });
    host.fixture.detectChanges();

    expect(host.emitted.at(-1)?.rules[0]).toMatchObject({ field: 'views', operator: '>', value: 10 });
  });

  it('onUpdateCombinator 把根组切换为 or', () => {
    host.component.addFirstRule();
    host.component.onUpdateCombinator({ id: host.component.rootGroup()!.id, combinator: 'or' });
    host.fixture.detectChanges();

    expect(host.component.rootGroup()?.combinator).toBe('or');
    expect(host.emitted.at(-1)?.combinator).toBe('or');
  });

  it('initialQuery 载入既有条件', () => {
    const { component } = render({
      initialQuery: {
        combinator: 'and',
        rules: [{ field: 'title', operator: '=', value: 'hello' }]
      } as RxDBQueryOutput<object>
    });

    expect(component.hasRules()).toBe(true);
    expect(component.rootGroup()?.rules.length).toBe(1);
  });

  it('ngOnDestroy 销毁服务后不再抛错', () => {
    host.component.addFirstRule();
    expect(() => host.fixture.destroy()).not.toThrow();
  });

  describe('字段集合变化（含清空）同步给服务', () => {
    const TITLE_OK = {
      combinator: 'and',
      rules: [{ field: 'title', operator: '=', value: 'ok' }]
    } as RxDBQueryOutput<object>;
    const SCHEMA: SchemaInfo = { entityName: 'Post', fields: [FIELDS[0]] };

    function renderWith(inputs: { fields?: FieldMetadata[]; schema?: SchemaInfo }) {
      const fixture = TestBed.createComponent<QueryBuilderComponent<object>>(QueryBuilderComponent);
      const queries: Array<RxDBQueryOutput<object>> = [];
      const validations: ValidationResult[] = [];
      fixture.componentInstance.queryChange.subscribe(query => queries.push(query));
      fixture.componentInstance.validationChange.subscribe(result => validations.push(result));
      if (inputs.fields) fixture.componentRef.setInput('fields', inputs.fields);
      if (inputs.schema) fixture.componentRef.setInput('schema', inputs.schema);
      fixture.componentRef.setInput('initialQuery', TITLE_OK);
      fixture.detectChanges();
      const update = (name: 'fields' | 'schema', value: unknown): void => {
        fixture.componentRef.setInput(name, value);
        fixture.detectChanges();
      };
      return { fixture, component: fixture.componentInstance, queries, validations, update };
    }

    /** 最近一次 validationChange 是否报了 title 的 fieldExists。 */
    const titleMissing = (validations: ValidationResult[]): boolean =>
      validations.at(-1)?.valid === false &&
      !!validations.at(-1)?.errors?.some(error => error.field === 'title' && error.rule === 'fieldExists');

    it('fields 由非空切空：既有规则立即失效且后续改规则仍按空字段集校验，恢复后转回合法；全程不多发查询', () => {
      const host = renderWith({ fields: [FIELDS[0]] });
      expect(host.validations.at(-1)?.valid).toBe(true);
      const queryCount = host.queries.length;

      host.update('fields', []);

      expect(host.component.fieldsComputed()).toEqual([]);
      expect(titleMissing(host.validations)).toBe(true);
      expect(host.queries).toHaveLength(queryCount);

      const ruleId = (host.component.rootGroup()!.rules[0] as { id: string }).id;
      host.component.onUpdateRule({ id: ruleId, updates: { value: 'changed' } });
      host.fixture.detectChanges();
      expect(titleMissing(host.validations)).toBe(true);
      const afterEdit = host.queries.length;

      host.update('fields', [FIELDS[0]]);

      expect(host.validations.at(-1)?.valid).toBe(true);
      expect(host.queries).toHaveLength(afterEdit);
    });

    it('schema 由有值切 undefined（未传 fields）：同样立即失效，恢复后转回合法', () => {
      const host = renderWith({ schema: SCHEMA });
      expect(host.validations.at(-1)?.valid).toBe(true);
      const queryCount = host.queries.length;

      host.update('schema', undefined);

      expect(titleMissing(host.validations)).toBe(true);

      host.update('schema', SCHEMA);

      expect(host.validations.at(-1)?.valid).toBe(true);
      expect(host.queries).toHaveLength(queryCount);
    });
  });
});
