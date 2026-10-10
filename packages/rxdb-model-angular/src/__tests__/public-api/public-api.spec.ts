import type {
  EntityTableHandle as CoreEntityTableHandle,
  QueryTableHandle as CoreQueryTableHandle
} from '@aiao/rxdb-model';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  DEFAULT_QUERY_BUILDER_THEME,
  ENTITY_TABLE_CONFIG,
  EntityDetailComponent,
  EntityDialogComponent,
  EntityFormComponent,
  EntityListComponent,
  EntityTableComponent,
  FieldSelectorComponent,
  OperatorSelectorComponent,
  PopoverSelectComponent,
  QUERY_BUILDER_THEME,
  QueryBuilderComponent,
  QueryDragDropHandler,
  QueryGroupComponent,
  QueryRuleComponent,
  QueryTableComponent,
  SubqueryBuilderComponent,
  TreeItemDirective,
  TreeSelectComponent,
  ValueInputComponent,
  calculateDropMode,
  cn,
  provideQueryBuilderTheme,
  type EntityDetailDialogData,
  type EntityInstance,
  type EntityTableHandle,
  type FilterQuery,
  type QueryBuilderTheme,
  type QueryDragDropState,
  type QueryDropMode,
  type QueryTableHandle,
  type RxDBQueryOutput,
  type UIRuleGroup,
  type UIRuleWithWhere
} from '../../index';

/**
 * rxdb-model-angular 公开 API 面对称守卫（对齐 React / Vue 侧同名 spec）。
 *
 * 三框架对称铁律的可执行形式：包根 `src/index.ts` 的运行时导出
 * （组件 / 指令 / 注入令牌 / 工具函数）与共享类型必须三端齐备。
 * 类型导出是编译期契约，这里用类型位置引用锚定（tsc 校验）。
 */
describe('rxdb-model-angular 公开 API 面对称', () => {
  it('五类实体组件全部导出', () => {
    expect(EntityDetailComponent).toBeTypeOf('function');
    expect(EntityDialogComponent).toBeTypeOf('function');
    expect(EntityFormComponent).toBeTypeOf('function');
    expect(EntityListComponent).toBeTypeOf('function');
    expect(EntityTableComponent).toBeTypeOf('function');
    expect(QueryTableComponent).toBeTypeOf('function');
  });

  it('查询构建器主组件与子组件全部导出', () => {
    expect(QueryBuilderComponent).toBeTypeOf('function');
    expect(FieldSelectorComponent).toBeTypeOf('function');
    expect(OperatorSelectorComponent).toBeTypeOf('function');
    expect(PopoverSelectComponent).toBeTypeOf('function');
    expect(QueryGroupComponent).toBeTypeOf('function');
    expect(QueryRuleComponent).toBeTypeOf('function');
    expect(SubqueryBuilderComponent).toBeTypeOf('function');
    expect(TreeSelectComponent).toBeTypeOf('function');
    expect(ValueInputComponent).toBeTypeOf('function');
  });

  it('主题注入三件套导出', () => {
    expect(DEFAULT_QUERY_BUILDER_THEME).toBeDefined();
    expect(QUERY_BUILDER_THEME).toBeDefined();
    expect(provideQueryBuilderTheme).toBeTypeOf('function');
  });

  it('表格配置注入令牌导出', () => {
    expect(ENTITY_TABLE_CONFIG).toBeDefined();
  });

  it('类名工具 cn 透传核心包', () => {
    expect(cn('a', 'b')).toBe('a b');
    expect(cn('a', undefined, 'b')).toBe('a b');
  });

  it('TreeItemDirective 支持 Highlightable 协议', () => {
    const item = new TreeItemDirective();
    expect(item.isActive()).toBe(false);
    item.setActiveStyles();
    expect(item.isActive()).toBe(true);
    item.setInactiveStyles();
    expect(item.isActive()).toBe(false);
  });

  it('拖拽编排 API 与放置模式计算导出', () => {
    const handler = new QueryDragDropHandler(vi.fn());
    handler.start('a');
    expect(handler.state().draggedItemId).toBe('a');
    handler.over('b', 'into', true, 1);
    expect(handler.state().targetItemId).toBe('b');
    expect(handler.state().dropMode).toBe('into');
    handler.leave();
    expect(handler.state().targetItemId).toBeNull();

    const rect = { top: 0, height: 100 } as DOMRect;
    expect(calculateDropMode(10, rect, true)).toBe('before');
    expect(calculateDropMode(90, rect, true)).toBe('after');
    expect(calculateDropMode(50, rect, true)).toBe('into');
    expect(calculateDropMode(10, rect, false)).toBe('before');
    expect(calculateDropMode(90, rect, false)).toBe('after');
  });

  it('共享类型可从包根命名（编译期守卫）', () => {
    const entityInstance: EntityInstance = null as unknown as EntityInstance;
    const filterQuery: FilterQuery = { combinator: 'and', rules: [] };
    const entityTableHandle: EntityTableHandle = null as unknown as EntityTableHandle;
    const queryTableHandle: QueryTableHandle = null as unknown as QueryTableHandle;
    const group: UIRuleGroup = { id: 'g1', combinator: 'and', rules: [] };
    const dropMode: QueryDropMode = 'into';
    const dragState: QueryDragDropState = {
      draggedItemId: null,
      targetItemId: null,
      dropMode: null,
      isValidTarget: false
    };
    const rule: UIRuleWithWhere = { id: 'r1', field: 'title', operator: '=', value: 'x' };
    const output: RxDBQueryOutput<{ title: string }> = { combinator: 'and', rules: [] };
    const dialogData: EntityDetailDialogData = null as unknown as EntityDetailDialogData;
    const theme: QueryBuilderTheme = null as unknown as QueryBuilderTheme;

    expect([entityInstance, entityTableHandle, queryTableHandle, dialogData, theme]).toHaveLength(5);
    expect(filterQuery.rules).toEqual([]);
    expect([group, dropMode, dragState, rule, output]).toBeDefined();
  });

  it('表格命令面与核心包是同一份契约（三端对称，编译期守卫）', () => {
    expectTypeOf<EntityTableHandle>().toEqualTypeOf<CoreEntityTableHandle>();
    expectTypeOf<QueryTableHandle>().toEqualTypeOf<CoreQueryTableHandle>();
  });
});
