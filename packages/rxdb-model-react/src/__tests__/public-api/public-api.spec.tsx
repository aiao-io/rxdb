import { describe, expect, it, vi } from 'vitest';
import * as entityTableModule from '../../entity-table/index.js';
import * as api from '../../index';

/**
 * rxdb-model-react 公开 API 面对称守卫（对齐 Angular / Vue 侧同名 spec）。
 *
 * 三框架对称铁律的可执行形式：包根 `src/index.ts` 的运行时导出
 * （组件 / 指令 / 注入键 / 工具函数）与共享类型必须三端齐备。
 * 类型导出是编译期契约，这里用类型位置引用锚定（tsc 校验）。
 */
describe('rxdb-model-react 公开 API 面对称', () => {
  it('五类实体组件全部导出', () => {
    expect(api.EntityDetail).toBeDefined();
    expect(api.EntityDialog).toBeDefined();
    expect(api.EntityForm).toBeDefined();
    expect(api.EntityList).toBeDefined();
    expect(api.EntityTable).toBeDefined();
    expect(api.QueryTable).toBeDefined();
  });

  it('查询构建器主组件与子组件全部导出', () => {
    expect(api.QueryBuilder).toBeDefined();
    expect(api.FieldSelector).toBeDefined();
    expect(api.OperatorSelector).toBeDefined();
    expect(api.PopoverSelect).toBeDefined();
    expect(api.QueryGroup).toBeDefined();
    expect(api.QueryRule).toBeDefined();
    expect(api.SubqueryBuilder).toBeDefined();
    expect(api.TreeSelect).toBeDefined();
    expect(api.ValueInput).toBeDefined();
  });

  it('主题注入件导出（Context + Provider 组件式）', () => {
    expect(api.DEFAULT_QUERY_BUILDER_THEME).toBeDefined();
    expect(api.QUERY_BUILDER_THEME).toBeDefined();
    expect(api.QueryBuilderThemeProvider).toBeTypeOf('function');
  });

  it('表格配置与配置提供者导出', () => {
    expect(api.ENTITY_TABLE_CONFIG).toBeDefined();
    expect(api.EntityTableConfigProvider).toBeTypeOf('function');
  });

  it('类名工具 cn 透传核心包', () => {
    expect(api.cn('a', 'b')).toBe('a b');
    expect(api.cn('a', undefined, 'b')).toBe('a b');
  });

  it('TreeItemDirective 支持 Highlightable 协议', () => {
    const item = new api.TreeItemDirective();
    expect(item.isActive).toBe(false);
    item.setActiveStyles();
    expect(item.isActive).toBe(true);
    item.setInactiveStyles();
    expect(item.isActive).toBe(false);
  });

  it('拖拽编排 API 与放置模式计算导出', () => {
    const handler = new api.QueryDragDropHandler(vi.fn());
    handler.start('a');
    expect(handler.getState().draggedItemId).toBe('a');
    handler.over('b', 'into', true, 1);
    expect(handler.getState().targetItemId).toBe('b');
    expect(handler.getState().dropMode).toBe('into');
    handler.leave();
    expect(handler.getState().targetItemId).toBeNull();

    const rect = { top: 0, height: 100 } as DOMRect;
    expect(api.calculateDropMode(10, rect, true)).toBe('before');
    expect(api.calculateDropMode(90, rect, true)).toBe('after');
    expect(api.calculateDropMode(50, rect, true)).toBe('into');
    expect(api.calculateDropMode(10, rect, false)).toBe('before');
    expect(api.calculateDropMode(90, rect, false)).toBe('after');
  });

  it('entity-table 子模块透传核心包（对齐 Angular / Vue 侧同名 index）', () => {
    expect(entityTableModule.cn).toBeTypeOf('function');
    expect(entityTableModule.cn('x', 'y')).toBe('x y');
  });

  it('共享类型可从包根命名（编译期守卫）', () => {
    const entityInstance: api.EntityInstance = null as unknown as api.EntityInstance;
    const filterQuery: api.FilterQuery = { combinator: 'and', rules: [] };
    const entityTableHandle: api.EntityTableHandle = null as unknown as api.EntityTableHandle;
    const queryTableHandle: api.QueryTableHandle = null as unknown as api.QueryTableHandle;
    const group: api.UIRuleGroup = { id: 'g1', combinator: 'and', rules: [] };
    const dropMode: api.QueryDropMode = 'into';
    const dragState: api.QueryDragDropState = {
      draggedItemId: null,
      targetItemId: null,
      dropMode: null,
      isValidTarget: false
    };
    const rule: api.UIRuleWithWhere = { id: 'r1', field: 'title', operator: '=', value: 'x' };
    const output: api.RxDBQueryOutput<{ title: string }> = { combinator: 'and', rules: [] };
    const dialogData: api.EntityDetailDialogData = null as unknown as api.EntityDetailDialogData;
    const theme: api.QueryBuilderTheme = null as unknown as api.QueryBuilderTheme;

    expect([entityInstance, entityTableHandle, queryTableHandle, dialogData, theme]).toHaveLength(5);
    expect(filterQuery.rules).toEqual([]);
    expect([group, dropMode, dragState, rule, output]).toBeDefined();
  });
});
