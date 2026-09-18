import type { FieldMetadata, QueryBuilderRuleGroup, UIRule, ValidationError } from '@aiao/rxdb-model';
import { ChangeDetectionStrategy, Component, input, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { beforeEach, describe, expect, it } from 'vitest';
import { OperatorSelectorComponent } from '../../../query-builder/operator-selector/operator-selector.component';
import { QueryRuleComponent } from '../../../query-builder/query-rule/query-rule.component';
import { QUERY_BUILDER_THEME } from '../../../query-builder/theme/query-builder-theme.token';
import { ValueInputComponent } from '../../../query-builder/value-input/value-input.component';

/**
 * QueryRuleComponent —— **真实加载组件源码**。
 *
 * 覆盖此前仅被 query-builder 间接触达的分支（30.9%）：exists/notExists 子条件、
 * null/notNull 无值操作符、字段变更的默认操作符推导、错误去重与 tooltip、
 * 以及 NgComponentOutlet 主题插槽（默认主题 + 自定义主题桩两条路径）。
 */

const FIELDS = [
  { name: 'title', type: 'string', displayName: '标题' },
  { name: 'views', type: 'number', displayName: '浏览量' },
  { name: 'published', type: 'boolean', displayName: '已发布' },
  { name: 'status', type: 'string', displayName: '状态', enum: ['draft', 'done'] },
  {
    name: 'author',
    type: 'string',
    displayName: '作者',
    isRelation: true,
    relationFields: [
      { name: 'name', type: 'string', displayName: '姓名' },
      { name: 'email', type: 'string', displayName: '邮箱' }
    ]
  },
  { name: 'tags', type: 'keyValue', displayName: '标签' }
] as FieldMetadata[];

type RuleWithWhere = UIRule & { where?: QueryBuilderRuleGroup<Record<string, unknown>> };

function rule(over: Partial<RuleWithWhere> = {}): RuleWithWhere {
  return { id: 'r1', field: 'title', operator: '=', value: '', ...over };
}

describe('QueryRuleComponent（真实组件）', () => {
  function render(inputs: Partial<{ rule: RuleWithWhere; fields: FieldMetadata[]; errors: ValidationError[] }> = {}) {
    const fixture = TestBed.createComponent(QueryRuleComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('rule', inputs.rule ?? rule());
    fixture.componentRef.setInput('fields', inputs.fields ?? FIELDS);
    if (inputs.errors) fixture.componentRef.setInput('errors', inputs.errors);

    const updates: unknown[] = [];
    const removed: unknown[] = [];
    component.update.subscribe(u => updates.push(u));
    component.remove.subscribe(() => removed.push(null));
    fixture.detectChanges();
    return { fixture, component, updates, removed };
  }

  let host: ReturnType<typeof render>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    host = render();
  });

  describe('渲染', () => {
    it('渲染字段选择器、操作符选择器与值输入（默认主题真实组件）', () => {
      const el = host.fixture.nativeElement as HTMLElement;

      // 字段选择器显示当前字段 displayName
      expect(el.textContent).toContain('标题');
      // 操作符选择器（popover 按钮显示当前操作符 label，值来自真实注册表）
      const opOptions = host.component.operatorSelectorInputs();
      expect(opOptions.selectedOperator).toBe('=');
      // 值输入渲染（string + '='）
      expect(el.querySelector('rxdb-value-input')).toBeTruthy();
    });

    it('fieldAsString 与 rule 字段一致', () => {
      expect(host.component.fieldAsString()).toBe('title');
    });

    it('fieldSelectorInputs / operatorSelectorInputs / valueInputInputs 接线完整', () => {
      const { component } = host;

      expect(component.fieldSelectorInputs()).toMatchObject({ fields: FIELDS, selectedField: 'title' });
      expect(typeof component.fieldSelectorInputs().fieldChangeFn).toBe('function');

      const op = component.operatorSelectorInputs();
      expect(op.fieldMetadata).toEqual(FIELDS[0]);
      expect(op.fieldType).toBe('string');
      expect(typeof op.operatorChangeFn).toBe('function');

      const value = component.valueInputInputs();
      expect(value).toMatchObject({ fieldType: 'string', operator: '=', value: '' });
      expect(typeof value.valueChangeFn).toBe('function');
      expect(typeof value.whereChangeFn).toBe('function');
    });
  });

  describe('exists / notExists 子条件', () => {
    it('exists 显示「+ 子条件」按钮且不渲染值输入', () => {
      const withExists = render({ rule: rule({ operator: 'exists', value: null }) });
      const el = withExists.fixture.nativeElement as HTMLElement;

      expect(el.textContent).toContain('+ 子条件');
      expect(el.querySelector('rxdb-value-input')).toBeNull();
      expect(withExists.component.isExistsOperator()).toBe(true);
      expect(withExists.component.isNoValueOperator()).toBe(false);
    });

    it('notExists 同样显示「+ 子条件」', () => {
      const withNotExists = render({ rule: rule({ operator: 'notExists', value: null }) });
      const el = withNotExists.fixture.nativeElement as HTMLElement;

      expect(el.textContent).toContain('+ 子条件');
      expect(withNotExists.component.isExistsOperator()).toBe(true);
    });

    it('where 已有规则时自动展开：按钮隐藏、值输入渲染', () => {
      const where: QueryBuilderRuleGroup<Record<string, unknown>> = {
        id: 'g1',
        combinator: 'and',
        rules: [{ id: 'x1', field: 'name', operator: '=', value: 'a' }]
      };
      const expanded = render({ rule: rule({ operator: 'exists', where }) });
      const el = expanded.fixture.nativeElement as HTMLElement;

      expect(expanded.component.subqueryVisible()).toBe(true);
      expect(el.textContent).not.toContain('+ 子条件');
      expect(el.querySelector('rxdb-value-input')).toBeTruthy();
    });

    it('where 存在但规则为空时仍显示按钮', () => {
      const withEmptyWhere = render({
        rule: rule({ operator: 'exists', where: { id: 'g1', combinator: 'and', rules: [] } })
      });

      expect(withEmptyWhere.component.subqueryVisible()).toBe(false);
      expect((withEmptyWhere.fixture.nativeElement as HTMLElement).textContent).toContain('+ 子条件');
    });
  });

  describe('null / notNull 无值操作符', () => {
    it('null 隐藏值输入与子条件按钮', () => {
      const withNull = render({ rule: rule({ operator: 'null', value: null }) });
      const el = withNull.fixture.nativeElement as HTMLElement;

      expect(withNull.component.isNoValueOperator()).toBe(true);
      expect(withNull.component.isExistsOperator()).toBe(false);
      expect(el.querySelector('rxdb-value-input')).toBeNull();
      expect(el.textContent).not.toContain('+ 子条件');
    });

    it('notNull 同样隐藏值输入', () => {
      const withNotNull = render({ rule: rule({ operator: 'notNull', value: null }) });

      expect(withNotNull.component.isNoValueOperator()).toBe(true);
      expect((withNotNull.fixture.nativeElement as HTMLElement).querySelector('rxdb-value-input')).toBeNull();
    });
  });

  describe('update / remove 输出', () => {
    it('onValueChange 携带规则 id 与 value 更新', () => {
      host.component.onValueChange('hello');

      expect(host.updates).toEqual([{ id: 'r1', updates: { value: 'hello' } }]);
    });

    it('onWhereChange 携带规则 id 与 where 更新', () => {
      const where: QueryBuilderRuleGroup<Record<string, unknown>> = {
        id: 'g1',
        combinator: 'and',
        rules: []
      };
      host.component.onWhereChange(where);

      expect(host.updates).toEqual([{ id: 'r1', updates: { where } }]);
    });

    it('onRemove 触发 remove 输出', () => {
      host.component.onRemove();

      expect(host.removed).toHaveLength(1);
    });

    it('模板删除按钮点击触发 remove 输出', () => {
      const el = host.fixture.nativeElement as HTMLElement;
      const removeBtn = [...el.querySelectorAll('button')].find(b => b.title === '删除条件');

      removeBtn?.click();
      expect(host.removed).toHaveLength(1);
    });
  });

  describe('onFieldChange 默认操作符推导', () => {
    it('普通字段切到 =，值置空', () => {
      host.component.onFieldChange('views');

      expect(host.updates).toEqual([
        { id: 'r1', updates: { field: 'views', operator: '=', value: '', where: undefined } }
      ]);
    });

    it('boolean 字段默认值为 false', () => {
      host.component.onFieldChange('published');

      expect(host.updates[0]).toEqual({
        id: 'r1',
        updates: { field: 'published', operator: '=', value: false, where: undefined }
      });
    });

    it('关系字段默认 exists 操作符', () => {
      host.component.onFieldChange('author');

      expect(host.updates[0]).toMatchObject({ updates: { field: 'author', operator: 'exists' } });
    });

    it('keyValue 字段默认 null 操作符', () => {
      host.component.onFieldChange('tags');

      expect(host.updates[0]).toMatchObject({ updates: { field: 'tags', operator: 'null' } });
    });

    it('字段不存在时回退 = / 空值', () => {
      host.component.onFieldChange('ghost');

      expect(host.updates[0]).toMatchObject({ updates: { field: 'ghost', operator: '=', value: '' } });
    });
  });

  describe('onOperatorChange', () => {
    it('切到 exists 清空 value、保留 where；切回普通操作符清掉 where', () => {
      const where: QueryBuilderRuleGroup<Record<string, unknown>> = {
        id: 'g1',
        combinator: 'and',
        rules: [{ id: 'x1', field: 'name', operator: '=', value: '' }]
      };
      const withWhere = render({ rule: rule({ operator: '=', where }) });
      withWhere.component.onOperatorChange('exists');

      expect(withWhere.updates).toEqual([{ id: 'r1', updates: { operator: 'exists', value: null } }]);

      // 已存在的 where 未在 updates 中重置（仍归该规则所有）；
      // 面板展开态由 showSubquery 收起，等父组件按 update 回写 where 后生效
      const back = render({ rule: rule({ operator: 'exists', where }) });
      back.component.onOperatorChange('=');

      expect(back.updates).toEqual([{ id: 'r1', updates: { operator: '=', where: undefined } }]);
      expect(back.component['showSubquery']()).toBe(false);
    });

    it('切到 null / notNull 清空 value 与 where', () => {
      host.component.onOperatorChange('null');
      expect(host.updates).toEqual([{ id: 'r1', updates: { operator: 'null', value: null, where: undefined } }]);

      const again = render();
      again.component.onOperatorChange('notNull');
      expect(again.updates).toEqual([{ id: 'r1', updates: { operator: 'notNull', value: null, where: undefined } }]);
    });
  });

  describe('错误提示', () => {
    it('ruleErrors 只保留本字段错误并按消息去重', () => {
      const errors: ValidationError[] = [
        { field: 'title', rule: 'required', message: '不能为空' },
        { field: 'title', rule: 'format', message: '不能为空' },
        { field: 'title', rule: 'other', message: '格式错误' },
        { field: 'views', rule: 'required', message: '浏览量不能为空' }
      ];
      const withErrors = render({ errors });

      expect(withErrors.component.ruleErrors()).toEqual([
        { field: 'title', rule: 'required', message: '不能为空' },
        { field: 'title', rule: 'other', message: '格式错误' }
      ]);
      expect(withErrors.component.errorTooltip()).toBe('不能为空 | 格式错误');
    });

    it('无错误时 tooltip 为空字符串，errors 默认空数组可用', () => {
      expect(host.component.ruleErrors()).toEqual([]);
      expect(host.component.errorTooltip()).toBe('');
    });

    it('errorTooltip 流入 valueInputInputs 的 errorMessage', () => {
      const withErrors = render({
        errors: [{ field: 'title', rule: 'required', message: '不能为空' }]
      });

      expect(withErrors.component.valueInputInputs().errorMessage).toBe('不能为空');
    });
  });

  describe('currentField 推导', () => {
    it('按名字定位字段，取类型 / 枚举 / 关系字段', () => {
      expect(host.component.currentField()?.name).toBe('title');
      expect(host.component.currentFieldType()).toBe('string');
      expect(host.component.currentEnumOptions()).toEqual([]);
      expect(host.component.currentRelationFields()).toEqual([]);
    });

    it('未知字段回退 string 类型与空枚举', () => {
      const unknown = render({ rule: rule({ field: 'ghost' }) });

      expect(unknown.component.currentField()).toBeUndefined();
      expect(unknown.component.currentFieldType()).toBe('string');
      expect(unknown.component.currentEnumOptions()).toEqual([]);
      expect(unknown.component.currentRelationFields()).toEqual([]);
    });

    it('枚举字段暴露枚举选项，关系字段暴露关系目标字段', () => {
      const enumHost = render({ rule: rule({ field: 'status' }) });
      expect(enumHost.component.currentFieldType()).toBe('string');
      expect(enumHost.component.currentEnumOptions()).toEqual(['draft', 'done']);

      const relationHost = render({ rule: rule({ field: 'author' }) });
      expect(relationHost.component.currentRelationFields().map(f => f.name)).toEqual(['name', 'email']);
      expect(relationHost.component.operatorSelectorInputs().fieldMetadata?.isRelation).toBe(true);
    });
  });

  describe('onAddSubcondition', () => {
    it('有关系字段时展开面板并创建首字段子规则', () => {
      const relationHost = render({ rule: rule({ field: 'author', operator: 'exists' }) });

      relationHost.component.onAddSubcondition();

      expect(relationHost.component.subqueryVisible()).toBe(true);
      expect(relationHost.updates).toEqual([
        {
          id: 'r1',
          updates: {
            where: {
              id: '',
              combinator: 'and',
              rules: [{ id: '', field: 'name', operator: '=', value: '' }]
            }
          }
        }
      ]);
    });

    it('关系字段为布尔时子规则默认值 false', () => {
      const boolRelation = render({
        rule: rule({ field: 'author', operator: 'exists' }),
        fields: [
          {
            name: 'author',
            type: 'string',
            isRelation: true,
            relationFields: [{ name: 'verified', type: 'boolean', displayName: '已验证' }]
          }
        ] as FieldMetadata[]
      });

      boolRelation.component.onAddSubcondition();

      const where = (boolRelation.updates[0] as { updates: { where: QueryBuilderRuleGroup<Record<string, unknown>> } })
        .updates.where;
      expect(where.rules[0]).toMatchObject({ field: 'verified', value: false });
    });

    it('关系字段自身是关系时子规则用 exists', () => {
      const nestedRelation = render({
        rule: rule({ field: 'author', operator: 'exists' }),
        fields: [
          {
            name: 'author',
            type: 'string',
            isRelation: true,
            relationFields: [{ name: 'org', type: 'string', displayName: '组织', isRelation: true }]
          }
        ] as FieldMetadata[]
      });

      nestedRelation.component.onAddSubcondition();

      const where = (
        nestedRelation.updates[0] as { updates: { where: QueryBuilderRuleGroup<Record<string, unknown>> } }
      ).updates.where;
      expect(where.rules[0]).toMatchObject({ field: 'org', operator: 'exists' });
    });

    it('无关系字段时只展开面板，不 emit', () => {
      const noRelation = render({ rule: rule({ field: 'views', operator: 'exists' }) });

      noRelation.component.onAddSubcondition();

      expect(noRelation.component.subqueryVisible()).toBe(true);
      expect(noRelation.updates).toEqual([]);
    });

    it('where 清空后 effect 自动收起面板', () => {
      const where: QueryBuilderRuleGroup<Record<string, unknown>> = {
        id: 'g1',
        combinator: 'and',
        rules: [{ id: 'x1', field: 'name', operator: '=', value: '' }]
      };
      const expanded = render({ rule: rule({ field: 'author', operator: 'exists', where }) });
      expect(expanded.component.subqueryVisible()).toBe(true);

      expanded.fixture.componentRef.setInput('rule', rule({ field: 'author', operator: 'exists' }));
      expanded.fixture.detectChanges();

      expect(expanded.component.subqueryVisible()).toBe(false);
    });
  });

  describe('主题插槽（NgComponentOutlet）', () => {
    /** 自定义主题的字段选择器桩：验证 outlet 输入接线与回调路径。 */
    @Component({
      selector: 'test-field-selector',
      standalone: true,
      template: `
        <button class="pick" (click)="fieldChangeFn()?.('views')" type="button">pick</button>
        <span class="selected">{{ selectedField() }}</span>
      `,
      changeDetection: ChangeDetectionStrategy.OnPush
    })
    class StubFieldSelector {
      readonly fields = input.required<FieldMetadata[]>();
      readonly selectedField = input<string>('');
      readonly fieldChangeFn = input<((field: string) => void) | undefined>(undefined);
    }

    /** 通过宿主组件局部 provide 自定义主题（TestBed 已实例化，不能再 configure）。 */
    @Component({
      selector: 'custom-theme-host',
      standalone: true,
      imports: [QueryRuleComponent],
      providers: [
        {
          provide: QUERY_BUILDER_THEME,
          useValue: {
            fieldSelector: StubFieldSelector,
            operatorSelector: OperatorSelectorComponent,
            valueInput: ValueInputComponent
          }
        }
      ],
      template: `<rxdb-query-rule [fields]="fields" [rule]="ruleInput" />`
    })
    class CustomThemeHost {
      readonly fields: FieldMetadata[] = FIELDS;
      readonly ruleInput: RuleWithWhere = rule();
    }

    it('自定义主题的 fieldSelector 收到 fields / selectedField，回调触发 update', () => {
      const fixture = TestBed.createComponent(CustomThemeHost);
      fixture.detectChanges();

      const ruleComponent = fixture.debugElement.query(By.directive(QueryRuleComponent)).componentInstance;
      const updates: unknown[] = [];
      ruleComponent.update.subscribe((u: unknown) => updates.push(u));

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('test-field-selector')).toBeTruthy();
      expect(el.querySelector('.selected')?.textContent?.trim()).toBe('title');

      el.querySelector('.pick')?.dispatchEvent(new MouseEvent('click'));
      expect(updates).toEqual([{ id: 'r1', updates: { field: 'views', operator: '=', value: '', where: undefined } }]);
    });
  });
});

describe('QueryRuleComponent（分支收尾）', () => {
  function render(over: Partial<RuleWithWhere> = {}, fields: FieldMetadata[] = FIELDS) {
    const fixture = TestBed.createComponent(QueryRuleComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('rule', rule(over));
    fixture.componentRef.setInput('fields', fields);
    const updates: unknown[] = [];
    component.update.subscribe(u => updates.push(u));
    fixture.detectChanges();
    return { fixture, component, updates };
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  it('onAddSubcondition：首个子字段为 keyValue 时默认 null 操作符', () => {
    const host = render({ field: 'author', operator: 'exists' }, [
      {
        name: 'author',
        type: 'string',
        isRelation: true,
        relationFields: [{ name: 'tags', type: 'keyValue', displayName: '标签' }]
      }
    ] as FieldMetadata[]);

    host.component.onAddSubcondition();

    const where = (host.updates[0] as { updates: { where: QueryBuilderRuleGroup<Record<string, unknown>> } }).updates
      .where;
    expect(where.rules[0]).toMatchObject({ field: 'tags', operator: 'null' });
  });

  it('NgComponentOutlet 注入的 valueChangeFn / whereChangeFn 回调直达 update', () => {
    const host = render();
    const valueInputs = host.component.valueInputInputs();

    valueInputs.valueChangeFn?.('via-callback');
    expect(host.updates).toEqual([{ id: 'r1', updates: { value: 'via-callback' } }]);

    const where: QueryBuilderRuleGroup<Record<string, unknown>> = { id: 'g2', combinator: 'and', rules: [] };
    valueInputs.whereChangeFn?.(where);
    expect(host.updates.at(-1)).toEqual({ id: 'r1', updates: { where } });
  });
});
