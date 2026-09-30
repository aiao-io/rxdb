/**
 * QueryRule —— **真实组件源码**（Angular `query-rule.real.spec.ts` 的 React 移植）。
 *
 * 覆盖 exists/notExists 子条件、null/notNull 无值操作符、字段变更的默认操作符推导、
 * 错误去重与 tooltip、主题插槽（默认主题 + 自定义主题两条路径，React 侧经
 * QueryBuilderThemeProvider 注入自定义主题组件）。
 */
import type { FieldMetadata, QueryBuilderRuleGroup, ValidationError } from '@aiao/rxdb-model';
import { fireEvent, render } from '@testing-library/react';
import type { ComponentType } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { FieldSelectorProps } from '../../../query-builder/field-selector/field-selector';
import { QueryRule, type UIRuleWithWhere } from '../../../query-builder/query-rule/query-rule';
import { DEFAULT_QUERY_BUILDER_THEME } from '../../../query-builder/theme/default-query-builder-theme';
import { QueryBuilderThemeProvider, type QueryBuilderTheme } from '../../../query-builder/theme/query-builder-theme';

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

function rule(over: Partial<UIRuleWithWhere> = {}): UIRuleWithWhere {
  return { id: 'r1', field: 'title', operator: '=', value: '', ...over };
}

describe('QueryRule（真实组件）', () => {
  function renderRule(
    props: Partial<{ rule: UIRuleWithWhere; fields: FieldMetadata[]; errors: ValidationError[] }> = {}
  ) {
    const updates: unknown[] = [];
    const removed: unknown[] = [];
    const utils = render(
      <QueryRule
        rule={props.rule ?? rule()}
        fields={props.fields ?? FIELDS}
        errors={props.errors}
        onUpdate={update => updates.push(update)}
        onRemove={() => removed.push(null)}
      />
    );
    return { ...utils, updates, removed };
  }

  let host: ReturnType<typeof renderRule>;

  beforeEach(() => {
    host = renderRule();
  });

  describe('渲染', () => {
    it('渲染字段选择器、操作符选择器与值输入（默认主题真实组件）', () => {
      // 字段选择器显示当前字段 displayName
      expect(host.container.textContent).toContain('标题');
      // 值输入渲染（string + '='）
      expect(host.container.querySelector('input[placeholder="输入值"]')).toBeTruthy();
    });

    it('exists 显示「+ 子条件」按钮且不渲染值输入', () => {
      const withExists = renderRule({ rule: rule({ operator: 'exists', value: null }) });

      expect(withExists.container.textContent).toContain('+ 子条件');
      expect(withExists.container.querySelector('input[placeholder="输入值"]')).toBeNull();
    });

    it('notExists 同样显示「+ 子条件」', () => {
      const withNotExists = renderRule({ rule: rule({ operator: 'notExists', value: null }) });

      expect(withNotExists.container.textContent).toContain('+ 子条件');
    });

    it('where 已有规则时自动展开：按钮隐藏、值输入渲染', () => {
      const where: QueryBuilderRuleGroup<Record<string, unknown>> = {
        id: 'g1',
        combinator: 'and',
        rules: [{ id: 'x1', field: 'name', operator: '=', value: 'a' }]
      };
      // 关系字段（type 'relation'）exists 时值输入形态为子查询构建器
      const relationFields = [
        {
          name: 'author',
          type: 'relation',
          displayName: '作者',
          isRelation: true,
          relationFields: [{ name: 'name', type: 'string', displayName: '姓名' }]
        }
      ] as FieldMetadata[];
      const expanded = renderRule({
        rule: rule({ field: 'author', operator: 'exists', where }),
        fields: relationFields
      });

      expect(expanded.container.textContent).not.toContain('+ 子条件');
      expect(expanded.container.querySelector('.subquery-builder')).toBeTruthy();
    });

    it('where 存在但规则为空时仍显示按钮', () => {
      const withEmptyWhere = renderRule({
        rule: rule({ operator: 'exists', where: { id: 'g1', combinator: 'and', rules: [] } })
      });

      expect(withEmptyWhere.container.textContent).toContain('+ 子条件');
      expect(withEmptyWhere.container.querySelector('.subquery-builder')).toBeNull();
    });
  });

  describe('null / notNull 无值操作符', () => {
    it('null 隐藏值输入与子条件按钮', () => {
      // null/notNull 是无值操作符：模板不渲染值输入（Angular 侧同语义）
      const withNull = renderRule({ rule: rule({ operator: 'null', value: null }) });

      expect(withNull.container.querySelector('input[placeholder="输入值"]')).toBeNull();
      expect(withNull.container.textContent).not.toContain('+ 子条件');
    });

    it('notNull 同样隐藏值输入', () => {
      const withNotNull = renderRule({ rule: rule({ operator: 'notNull', value: null }) });

      expect(withNotNull.container.querySelector('input[placeholder="输入值"]')).toBeNull();
    });
  });

  describe('update / remove 输出', () => {
    it('值输入变更携带规则 id 与 value 更新', () => {
      fireEvent.change(host.container.querySelector('input[placeholder="输入值"]')!, {
        target: { value: 'hello' }
      });

      expect(host.updates).toEqual([{ id: 'r1', updates: { value: 'hello' } }]);
    });

    it('onRemove 触发 remove 回调（模板删除按钮点击）', () => {
      const removeBtn = [...host.container.querySelectorAll('button')].find(b => b.title === '删除条件');

      fireEvent.click(removeBtn!);
      expect(host.removed).toHaveLength(1);
    });
  });

  describe('onFieldChange 默认操作符推导', () => {
    /** 经字段选择器（TreeSelect）选字段：打开弹层 → 点击目标叶子。 */
    function pickField(target: ReturnType<typeof renderRule>, displayName: string): void {
      const popover = target.container.querySelector('[popover]') as HTMLElement;
      popover.hidePopover = vi.fn();
      popover.dispatchEvent(Object.assign(new Event('beforetoggle'), { newState: 'open' }));
      popover.dispatchEvent(Object.assign(new Event('toggle'), { newState: 'open' }));
      const item = [...target.container.querySelectorAll('[role="treeitem"]')].find(i =>
        i.textContent?.includes(displayName)
      )!;
      fireEvent.click(item);
    }

    it('普通字段切到 =，值置空', () => {
      pickField(host, '浏览量');

      expect(host.updates).toEqual([
        { id: 'r1', updates: { field: 'views', operator: '=', value: '', where: undefined } }
      ]);
    });

    it('boolean 字段默认值为 false', () => {
      pickField(host, '已发布');

      expect(host.updates[0]).toEqual({
        id: 'r1',
        updates: { field: 'published', operator: '=', value: false, where: undefined }
      });
    });

    it('关系字段默认 exists 操作符', () => {
      pickField(host, '作者');

      expect(host.updates[0]).toMatchObject({ updates: { field: 'author', operator: 'exists' } });
    });

    it('keyValue 字段默认 null 操作符', () => {
      pickField(host, '标签');

      expect(host.updates[0]).toMatchObject({ updates: { field: 'tags', operator: 'null' } });
    });
  });

  describe('onOperatorChange', () => {
    /** 经操作符选择器（PopoverSelect）选操作符。 */
    function pickOperator(target: ReturnType<typeof renderRule>, label: string): void {
      const popover = target.container.querySelector('[popover]') as HTMLElement;
      popover.hidePopover = vi.fn();
      const option = [...target.container.querySelectorAll('li[role="none"] button[role="option"]')].find(
        b => b.textContent?.trim() === label
      );
      if (!option) return; // 该操作符对当前字段类型不可用
      fireEvent.click(option);
    }

    it('切到 exists 清空 value；切回普通操作符清掉 where', () => {
      // 关系字段类型为 'relation' 时操作符选择器才含「存在」（注册表 applicableTypes 契约）
      const where: QueryBuilderRuleGroup<Record<string, unknown>> = {
        id: 'g1',
        combinator: 'and',
        rules: [{ id: 'x1', field: 'name', operator: '=', value: '' }]
      };
      const relationFields = [
        { name: 'author', type: 'relation', displayName: '作者', isRelation: true }
      ] as FieldMetadata[];
      const withWhere = renderRule({ rule: rule({ field: 'author', operator: '=', where }), fields: relationFields });
      pickOperator(withWhere, '存在');

      expect(withWhere.updates).toEqual([{ id: 'r1', updates: { operator: 'exists', value: null } }]);
    });

    it('切到 null / notNull 清空 value 与 where', () => {
      // 空值操作符仅在 nullable 字段经 getForField 动态加入
      const nullableFields = [
        { name: 'status', type: 'string', displayName: '状态', nullable: true }
      ] as FieldMetadata[];
      const again = renderRule({ rule: rule({ field: 'status' }), fields: nullableFields });
      pickOperator(again, '为空');
      expect(again.updates[0]).toMatchObject({ updates: { operator: 'null', value: null, where: undefined } });

      const notNull = renderRule({ rule: rule({ field: 'status' }), fields: nullableFields });
      pickOperator(notNull, '不为空');
      expect(notNull.updates[0]).toMatchObject({ updates: { operator: 'notNull', value: null, where: undefined } });
    });
  });

  describe('错误提示', () => {
    it('ruleErrors 只保留本字段错误并按消息去重（errorTooltip 流入值输入）', () => {
      const errors: ValidationError[] = [
        { field: 'title', rule: 'required', message: '不能为空' },
        { field: 'title', rule: 'format', message: '不能为空' },
        { field: 'title', rule: 'other', message: '格式错误' },
        { field: 'views', rule: 'required', message: '浏览量不能为空' }
      ];
      const withErrors = renderRule({ errors });

      // errorTooltip 经 data-tip 挂在值输入上
      const valueWrap = withErrors.container.querySelector('[data-tip]') as HTMLElement;
      expect(valueWrap?.getAttribute('data-tip')).toBe('不能为空 | 格式错误');
    });

    it('无错误时 tooltip 为空字符串（data-tip 属性不渲染）', () => {
      expect(host.container.querySelector('[data-tip]')).toBeNull();
    });
  });

  describe('currentField 推导', () => {
    it('枚举字段暴露枚举选项（渲染 popover 选择），关系字段暴露关系目标字段', () => {
      const enumHost = renderRule({ rule: rule({ field: 'status' }) });
      expect(enumHost.container.textContent).toContain('draft');
      expect(enumHost.container.textContent).toContain('done');

      const relationHost = renderRule({ rule: rule({ field: 'author', operator: 'exists' }) });
      // 关系字段的字段选择器触发按钮显示 displayName
      expect(relationHost.container.textContent).toContain('作者');
    });

    it('未知字段回退 string 类型与空枚举', () => {
      const unknown = renderRule({ rule: rule({ field: 'ghost' }) });

      expect(unknown.container.querySelector('input[placeholder="输入值"]')).toBeTruthy();
    });
  });

  describe('onAddSubcondition', () => {
    it('有关系字段时展开面板并创建首字段子规则', () => {
      const relationHost = renderRule({ rule: rule({ field: 'author', operator: 'exists' }) });

      fireEvent.click(
        [...relationHost.container.querySelectorAll('button')].find(b => b.textContent?.includes('+ 子条件'))!
      );

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
      const boolRelation = renderRule({
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

      fireEvent.click(
        [...boolRelation.container.querySelectorAll('button')].find(b => b.textContent?.includes('+ 子条件'))!
      );

      const where = (boolRelation.updates[0] as { updates: { where: QueryBuilderRuleGroup<Record<string, unknown>> } })
        .updates.where;
      expect(where.rules[0]).toMatchObject({ field: 'verified', value: false });
    });

    it('无关系字段时只展开面板，不 emit', () => {
      const noRelation = renderRule({ rule: rule({ field: 'views', operator: 'exists' }) });

      fireEvent.click(
        [...noRelation.container.querySelectorAll('button')].find(b => b.textContent?.includes('+ 子条件'))!
      );

      expect(noRelation.updates).toEqual([]);
    });
  });

  describe('主题插槽（React Context）', () => {
    /** 自定义主题的字段选择器桩：验证 props 接线与回调路径。 */
    const StubFieldSelector: ComponentType<FieldSelectorProps> = ({ selectedField, onFieldChange }) => {
      return (
        <span>
          <button className='pick' type='button' onClick={() => onFieldChange?.('views')}>
            pick
          </button>
          <span className='selected'>{selectedField}</span>
        </span>
      );
    };

    it('自定义主题的 fieldSelector 收到 fields / selectedField，回调触发 update', () => {
      const customTheme: QueryBuilderTheme = {
        ...DEFAULT_QUERY_BUILDER_THEME,
        fieldSelector: StubFieldSelector
      };
      const updates: unknown[] = [];
      const utils = render(
        <QueryBuilderThemeProvider theme={customTheme}>
          <QueryRule rule={rule()} fields={FIELDS} onUpdate={update => updates.push(update)} />
        </QueryBuilderThemeProvider>
      );

      expect(utils.container.querySelector('.pick')).toBeTruthy();
      expect(utils.container.querySelector('.selected')?.textContent?.trim()).toBe('title');

      fireEvent.click(utils.container.querySelector('.pick')!);
      expect(updates).toEqual([{ id: 'r1', updates: { field: 'views', operator: '=', value: '', where: undefined } }]);
    });
  });
});
