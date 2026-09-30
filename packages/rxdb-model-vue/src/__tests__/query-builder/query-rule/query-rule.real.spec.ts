import type { FieldMetadata, QueryBuilderRuleGroup, UIRule, ValidationError } from '@aiao/rxdb-model';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import { defineComponent, h, provide, type PropType } from 'vue';
import OperatorSelector from '../../../query-builder/operator-selector/OperatorSelector.vue';
import QueryRule from '../../../query-builder/query-rule/QueryRule.vue';
import { QUERY_BUILDER_THEME } from '../../../query-builder/theme/query-builder-theme';
import ValueInput from '../../../query-builder/value-input/ValueInput.vue';

/**
 * QueryRule —— **真实加载组件源码**（对齐 Angular 侧）。
 *
 * 覆盖 exists/notExists 子条件、null/notNull 无值操作符、字段变更的默认操作符
 * 推导、错误去重与 tooltip、以及主题插槽（默认主题 + 自定义主题桩两条路径）。
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

type QueryRuleVM = InstanceType<typeof QueryRule> & {
  fieldAsString: string;
  ruleErrors: ValidationError[];
  errorTooltip: string;
  isExistsOperator: boolean;
  isNoValueOperator: boolean;
  subqueryVisible: boolean;
  currentField: FieldMetadata | undefined;
  currentFieldType: string;
  currentEnumOptions: unknown[];
  currentRelationFields: FieldMetadata[];
  ruleWhere: QueryBuilderRuleGroup<Record<string, unknown>> | undefined;
  fieldSelectorInputs: Record<string, unknown>;
  operatorSelectorInputs: Record<string, unknown>;
  valueInputInputs: Record<string, unknown>;
  onFieldChange(fieldName: string): void;
  onAddSubcondition(): void;
  onOperatorChange(operator: string): void;
  onValueChange(value: unknown): void;
  onWhereChange(where: QueryBuilderRuleGroup<Record<string, unknown>> | undefined): void;
  onRemove(): void;
  showSubquery: boolean;
};

describe('QueryRule（真实组件）', () => {
  function render(inputs: Partial<{ rule: RuleWithWhere; fields: FieldMetadata[]; errors: ValidationError[] }> = {}) {
    const wrapper = mount(QueryRule, {
      props: {
        rule: inputs.rule ?? rule(),
        fields: inputs.fields ?? FIELDS,
        ...(inputs.errors ? { errors: inputs.errors } : {})
      }
    });
    const vm = wrapper.vm as unknown as QueryRuleVM;
    return { wrapper, vm };
  }

  let host: ReturnType<typeof render>;

  beforeEach(() => {
    host = render();
  });

  describe('渲染', () => {
    it('渲染字段选择器、操作符选择器与值输入（默认主题真实组件）', () => {
      const el = host.wrapper.element as HTMLElement;

      // 字段选择器显示当前字段 displayName
      expect(el.textContent).toContain('标题');
      // 操作符选择器（popover 按钮显示当前操作符 label，值来自真实注册表）
      const opOptions = host.vm.operatorSelectorInputs;
      expect(opOptions.selectedOperator).toBe('=');
      // 值输入渲染（string + '='）
      expect(el.querySelector('.rxdb-value-input, input[placeholder="输入值"]')).toBeTruthy();
    });

    it('fieldAsString 与 rule 字段一致', () => {
      expect(host.vm.fieldAsString).toBe('title');
    });

    it('fieldSelectorInputs / operatorSelectorInputs / valueInputInputs 接线完整', () => {
      const { vm } = host;

      expect(vm.fieldSelectorInputs).toMatchObject({ fields: FIELDS, selectedField: 'title' });
      expect(typeof vm.fieldSelectorInputs.fieldChangeFn).toBe('function');

      const op = vm.operatorSelectorInputs;
      expect(op.fieldMetadata).toEqual(FIELDS[0]);
      expect(op.fieldType).toBe('string');
      expect(typeof op.operatorChangeFn).toBe('function');

      const value = vm.valueInputInputs;
      expect(value).toMatchObject({ fieldType: 'string', operator: '=', value: '' });
      expect(typeof value.valueChangeFn).toBe('function');
      expect(typeof value.whereChangeFn).toBe('function');
    });
  });

  describe('exists / notExists 子条件', () => {
    it('exists 显示「+ 子条件」按钮且不渲染值输入', () => {
      const withExists = render({ rule: rule({ operator: 'exists', value: null }) });
      const el = withExists.wrapper.element as HTMLElement;

      expect(el.textContent).toContain('+ 子条件');
      expect(withExists.vm.isExistsOperator).toBe(true);
      expect(withExists.vm.isNoValueOperator).toBe(false);
    });

    it('notExists 同样显示「+ 子条件」', () => {
      const withNotExists = render({ rule: rule({ operator: 'notExists', value: null }) });
      const el = withNotExists.wrapper.element as HTMLElement;

      expect(el.textContent).toContain('+ 子条件');
      expect(withNotExists.vm.isExistsOperator).toBe(true);
    });

    it('where 已有规则时自动展开：按钮隐藏、值输入渲染', () => {
      const where: QueryBuilderRuleGroup<Record<string, unknown>> = {
        id: 'g1',
        combinator: 'and',
        rules: [{ id: 'x1', field: 'name', operator: '=', value: 'a' }]
      };
      const expanded = render({ rule: rule({ operator: 'exists', where }) });
      const el = expanded.wrapper.element as HTMLElement;

      expect(expanded.vm.subqueryVisible).toBe(true);
      expect(el.textContent).not.toContain('+ 子条件');
      // 值输入组件渲染（title 无关系字段 → 无子条件提示；组件本身必须存在）
      expect(expanded.wrapper.findComponent(ValueInput).exists()).toBe(true);
    });

    it('where 存在但规则为空时仍显示按钮', () => {
      const withEmptyWhere = render({
        rule: rule({ operator: 'exists', where: { id: 'g1', combinator: 'and', rules: [] } })
      });

      expect(withEmptyWhere.vm.subqueryVisible).toBe(false);
      expect((withEmptyWhere.wrapper.element as HTMLElement).textContent).toContain('+ 子条件');
    });
  });

  describe('null / notNull 无值操作符', () => {
    it('null 隐藏值输入与子条件按钮', () => {
      const withNull = render({ rule: rule({ operator: 'null', value: null }) });
      const el = withNull.wrapper.element as HTMLElement;

      expect(withNull.vm.isNoValueOperator).toBe(true);
      expect(withNull.vm.isExistsOperator).toBe(false);
      expect(el.querySelector('.subquery-container')).toBeNull();
      expect(el.textContent).not.toContain('+ 子条件');
    });

    it('notNull 同样隐藏值输入', () => {
      const withNotNull = render({ rule: rule({ operator: 'notNull', value: null }) });

      expect(withNotNull.vm.isNoValueOperator).toBe(true);
      expect((withNotNull.wrapper.element as HTMLElement).querySelector('.subquery-container')).toBeNull();
    });
  });

  describe('update / remove 输出', () => {
    it('onValueChange 携带规则 id 与 value 更新', () => {
      host.vm.onValueChange('hello');

      expect(host.wrapper.emitted('update')).toEqual([[{ id: 'r1', updates: { value: 'hello' } }]]);
    });

    it('onWhereChange 携带规则 id 与 where 更新', () => {
      const where: QueryBuilderRuleGroup<Record<string, unknown>> = {
        id: 'g1',
        combinator: 'and',
        rules: []
      };
      host.vm.onWhereChange(where);

      expect(host.wrapper.emitted('update')).toEqual([[{ id: 'r1', updates: { where } }]]);
    });

    it('onRemove 触发 remove 输出', () => {
      host.vm.onRemove();

      expect(host.wrapper.emitted('remove')).toHaveLength(1);
    });

    it('模板删除按钮点击触发 remove 输出', () => {
      const el = host.wrapper.element as HTMLElement;
      const removeBtn = [...el.querySelectorAll('button')].find(b => b.title === '删除条件');

      removeBtn?.click();
      expect(host.wrapper.emitted('remove')).toHaveLength(1);
    });
  });

  describe('onFieldChange 默认操作符推导', () => {
    it('普通字段切到 =，值置空', () => {
      host.vm.onFieldChange('views');

      expect(host.wrapper.emitted('update')).toEqual([
        [{ id: 'r1', updates: { field: 'views', operator: '=', value: '', where: undefined } }]
      ]);
    });

    it('boolean 字段默认值为 false', () => {
      host.vm.onFieldChange('published');

      expect(host.wrapper.emitted('update')?.[0][0]).toEqual({
        id: 'r1',
        updates: { field: 'published', operator: '=', value: false, where: undefined }
      });
    });

    it('关系字段默认 exists 操作符', () => {
      host.vm.onFieldChange('author');

      expect(host.wrapper.emitted('update')?.[0][0]).toMatchObject({
        updates: { field: 'author', operator: 'exists' }
      });
    });

    it('keyValue 字段默认 null 操作符', () => {
      host.vm.onFieldChange('tags');

      expect(host.wrapper.emitted('update')?.[0][0]).toMatchObject({
        updates: { field: 'tags', operator: 'null' }
      });
    });

    it('字段不存在时回退 = / 空值', () => {
      host.vm.onFieldChange('ghost');

      expect(host.wrapper.emitted('update')?.[0][0]).toMatchObject({
        updates: { field: 'ghost', operator: '=', value: '' }
      });
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
      withWhere.vm.onOperatorChange('exists');

      expect(withWhere.wrapper.emitted('update')).toEqual([
        [{ id: 'r1', updates: { operator: 'exists', value: null } }]
      ]);

      // 已存在的 where 未在 updates 中重置（仍归该规则所有）；
      // 面板展开态由 showSubquery 收起，等父组件按 update 回写 where 后生效
      const back = render({ rule: rule({ operator: 'exists', where }) });
      back.vm.onOperatorChange('=');

      expect(back.wrapper.emitted('update')).toEqual([[{ id: 'r1', updates: { operator: '=', where: undefined } }]]);
      expect(back.vm.showSubquery).toBe(false);
    });

    it('切到 null / notNull 清空 value 与 where', () => {
      host.vm.onOperatorChange('null');
      expect(host.wrapper.emitted('update')).toEqual([
        [{ id: 'r1', updates: { operator: 'null', value: null, where: undefined } }]
      ]);

      const again = render();
      again.vm.onOperatorChange('notNull');
      expect(again.wrapper.emitted('update')).toEqual([
        [{ id: 'r1', updates: { operator: 'notNull', value: null, where: undefined } }]
      ]);
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

      expect(withErrors.vm.ruleErrors).toEqual([
        { field: 'title', rule: 'required', message: '不能为空' },
        { field: 'title', rule: 'other', message: '格式错误' }
      ]);
      expect(withErrors.vm.errorTooltip).toBe('不能为空 | 格式错误');
    });

    it('无错误时 tooltip 为空字符串，errors 默认空数组可用', () => {
      expect(host.vm.ruleErrors).toEqual([]);
      expect(host.vm.errorTooltip).toBe('');
    });

    it('errorTooltip 流入 valueInputInputs 的 errorMessage', () => {
      const withErrors = render({
        errors: [{ field: 'title', rule: 'required', message: '不能为空' }]
      });

      expect(withErrors.vm.valueInputInputs.errorMessage).toBe('不能为空');
    });
  });

  describe('currentField 推导', () => {
    it('按名字定位字段，取类型 / 枚举 / 关系字段', () => {
      expect(host.vm.currentField?.name).toBe('title');
      expect(host.vm.currentFieldType).toBe('string');
      expect(host.vm.currentEnumOptions).toEqual([]);
      expect(host.vm.currentRelationFields).toEqual([]);
    });

    it('未知字段回退 string 类型与空枚举', () => {
      const unknown = render({ rule: rule({ field: 'ghost' }) });

      expect(unknown.vm.currentField).toBeUndefined();
      expect(unknown.vm.currentFieldType).toBe('string');
      expect(unknown.vm.currentEnumOptions).toEqual([]);
      expect(unknown.vm.currentRelationFields).toEqual([]);
    });

    it('枚举字段暴露枚举选项，关系字段暴露关系目标字段', () => {
      const enumHost = render({ rule: rule({ field: 'status' }) });
      expect(enumHost.vm.currentFieldType).toBe('string');
      expect(enumHost.vm.currentEnumOptions).toEqual(['draft', 'done']);

      const relationHost = render({ rule: rule({ field: 'author' }) });
      expect(relationHost.vm.currentRelationFields.map(f => f.name)).toEqual(['name', 'email']);
      expect(relationHost.vm.operatorSelectorInputs.fieldMetadata?.isRelation).toBe(true);
    });
  });

  describe('onAddSubcondition', () => {
    it('有关系字段时展开面板并创建首字段子规则', () => {
      const relationHost = render({ rule: rule({ field: 'author', operator: 'exists' }) });

      relationHost.vm.onAddSubcondition();

      expect(relationHost.vm.subqueryVisible).toBe(true);
      expect(relationHost.wrapper.emitted('update')).toEqual([
        [
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
        ]
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

      boolRelation.vm.onAddSubcondition();

      const where = (
        boolRelation.wrapper.emitted('update')?.[0][0] as {
          updates: { where: QueryBuilderRuleGroup<Record<string, unknown>> };
        }
      ).updates.where;
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

      nestedRelation.vm.onAddSubcondition();

      const where = (
        nestedRelation.wrapper.emitted('update')?.[0][0] as {
          updates: { where: QueryBuilderRuleGroup<Record<string, unknown>> };
        }
      ).updates.where;
      expect(where.rules[0]).toMatchObject({ field: 'org', operator: 'exists' });
    });

    it('无关系字段时只展开面板，不 emit', () => {
      const noRelation = render({ rule: rule({ field: 'views', operator: 'exists' }) });

      noRelation.vm.onAddSubcondition();

      expect(noRelation.vm.subqueryVisible).toBe(true);
      expect(noRelation.wrapper.emitted('update')).toBeUndefined();
    });

    it('where 清空后 watch 自动收起面板', async () => {
      const where: QueryBuilderRuleGroup<Record<string, unknown>> = {
        id: 'g1',
        combinator: 'and',
        rules: [{ id: 'x1', field: 'name', operator: '=', value: '' }]
      };
      const expanded = render({ rule: rule({ field: 'author', operator: 'exists', where }) });
      expect(expanded.vm.subqueryVisible).toBe(true);

      await expanded.wrapper.setProps({ rule: rule({ field: 'author', operator: 'exists' }) });

      expect(expanded.vm.subqueryVisible).toBe(false);
    });
  });

  describe('主题插槽（动态组件）', () => {
    /** 自定义主题的字段选择器桩：验证动态组件输入接线与回调路径。 */
    const StubFieldSelector = defineComponent({
      props: {
        fields: { type: Array as PropType<FieldMetadata[]>, required: true },
        selectedField: { type: String, required: true },
        fieldChangeFn: {
          type: Function as PropType<((field: string) => void) | undefined>,
          required: false,
          default: undefined
        }
      },
      template: `
        <button class="pick" type="button" @click="fieldChangeFn?.('views')">pick</button>
        <span class="selected">{{ selectedField }}</span>
      `
    });

    /** 通过宿主组件局部 provide 自定义主题。 */
    const CustomThemeHost = defineComponent({
      props: {
        fields: { type: Array as PropType<FieldMetadata[]>, required: true },
        ruleInput: { type: Object as PropType<RuleWithWhere>, required: true }
      },
      setup(props) {
        provide(QUERY_BUILDER_THEME, {
          fieldSelector: StubFieldSelector,
          operatorSelector: OperatorSelector,
          valueInput: ValueInput
        });
        return () => h(QueryRule, { fields: props.fields, rule: props.ruleInput });
      }
    });

    it('自定义主题的 fieldSelector 收到 fields / selectedField，回调触发 update', async () => {
      const wrapper = mount(CustomThemeHost, {
        props: { fields: FIELDS, ruleInput: rule() }
      });

      const ruleWrapper = wrapper.findComponent(QueryRule);
      const el = wrapper.element as HTMLElement;
      expect(el.querySelector('.selected')?.textContent?.trim()).toBe('title');

      el.querySelector('.pick')?.dispatchEvent(new MouseEvent('click'));
      await ruleWrapper.vm.$nextTick();
      expect(ruleWrapper.emitted('update')).toEqual([
        [{ id: 'r1', updates: { field: 'views', operator: '=', value: '', where: undefined } }]
      ]);
    });
  });
});

describe('QueryRule（分支收尾）', () => {
  function render(over: Partial<RuleWithWhere> = {}, fields: FieldMetadata[] = FIELDS) {
    const wrapper = mount(QueryRule, {
      props: { rule: rule(over), fields }
    });
    return { wrapper, vm: wrapper.vm as unknown as QueryRuleVM };
  }

  it('onAddSubcondition：首个子字段为 keyValue 时默认 null 操作符', () => {
    const host = render({ field: 'author', operator: 'exists' }, [
      {
        name: 'author',
        type: 'string',
        isRelation: true,
        relationFields: [{ name: 'tags', type: 'keyValue', displayName: '标签' }]
      }
    ] as FieldMetadata[]);

    host.vm.onAddSubcondition();

    const where = (
      host.wrapper.emitted('update')?.[0][0] as { updates: { where: QueryBuilderRuleGroup<Record<string, unknown>> } }
    ).updates.where;
    expect(where.rules[0]).toMatchObject({ field: 'tags', operator: 'null' });
  });

  it('动态组件注入的 valueChangeFn / whereChangeFn 回调直达 update', () => {
    const host = render();
    const valueInputs = host.vm.valueInputInputs;

    (valueInputs.valueChangeFn as (v: unknown) => void)?.('via-callback');
    expect(host.wrapper.emitted('update')).toEqual([[{ id: 'r1', updates: { value: 'via-callback' } }]]);

    const where: QueryBuilderRuleGroup<Record<string, unknown>> = { id: 'g2', combinator: 'and', rules: [] };
    (valueInputs.whereChangeFn as (w: unknown) => void)?.(where);
    expect(host.wrapper.emitted('update')?.at(-1)).toEqual([{ id: 'r1', updates: { where } }]);
  });
});
