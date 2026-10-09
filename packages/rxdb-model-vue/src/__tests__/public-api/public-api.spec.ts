import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_QUERY_BUILDER_THEME,
  ENTITY_TABLE_CONFIG,
  EntityDetail,
  EntityDialog,
  EntityForm,
  EntityList,
  EntityTable,
  FieldSelector,
  OperatorSelector,
  PopoverSelect,
  QUERY_BUILDER_THEME,
  QueryBuilder,
  QueryDragDropHandler,
  QueryGroup,
  QueryRule,
  QueryTable,
  SubqueryBuilder,
  TreeItemDirective,
  TreeSelect,
  ValueInput,
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
import type EntityTableComponent from '../../entity-table/EntityTable.vue';
import type QueryTableComponent from '../../entity-table/QueryTable.vue';

/**
 * rxdb-model-vue 公开 API 面对称守卫（对齐 Angular / React 侧同名 spec）。
 *
 * 三框架对称铁律的可执行形式：包根 `src/index.ts` 的运行时导出
 * （组件 / 指令 / 注入键 / 工具函数）与共享类型必须三端齐备。
 * 类型导出是编译期契约，这里用类型位置引用锚定（tsc 校验）。
 */
describe('rxdb-model-vue 公开 API 面对称', () => {
  it('五类实体组件全部导出', () => {
    expect(EntityDetail).toBeDefined();
    expect(EntityDialog).toBeDefined();
    expect(EntityForm).toBeDefined();
    expect(EntityList).toBeDefined();
    expect(EntityTable).toBeDefined();
    expect(QueryTable).toBeDefined();
  });

  it('查询构建器主组件与子组件全部导出', () => {
    expect(QueryBuilder).toBeDefined();
    expect(FieldSelector).toBeDefined();
    expect(OperatorSelector).toBeDefined();
    expect(PopoverSelect).toBeDefined();
    expect(QueryGroup).toBeDefined();
    expect(QueryRule).toBeDefined();
    expect(SubqueryBuilder).toBeDefined();
    expect(TreeSelect).toBeDefined();
    expect(ValueInput).toBeDefined();
  });

  it('主题注入三件套导出', () => {
    expect(DEFAULT_QUERY_BUILDER_THEME).toBeDefined();
    expect(QUERY_BUILDER_THEME).toBeDefined();
    expect(provideQueryBuilderTheme).toBeTypeOf('function');
  });

  it('表格配置注入键导出', () => {
    expect(ENTITY_TABLE_CONFIG).toBeDefined();
  });

  it('类名工具 cn 透传核心包', () => {
    expect(cn('a', 'b')).toBe('a b');
    expect(cn('a', undefined, 'b')).toBe('a b');
  });

  it('TreeItemDirective 支持 Highlightable 协议', () => {
    const item = new TreeItemDirective();
    expect(item.isActive).toBe(false);
    item.setActiveStyles();
    expect(item.isActive).toBe(true);
    item.setInactiveStyles();
    expect(item.isActive).toBe(false);
  });

  it('拖拽编排 API 与放置模式计算导出', () => {
    const handler = new QueryDragDropHandler(vi.fn());
    handler.start('a');
    expect(handler.state.value.draggedItemId).toBe('a');
    handler.over('b', 'into', true, 1);
    expect(handler.state.value.targetItemId).toBe('b');
    expect(handler.state.value.dropMode).toBe('into');
    handler.leave();
    expect(handler.state.value.targetItemId).toBeNull();

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

    // 编译期守卫：组件公开实例（defineExpose 解包后的形状）满足导出的命令面，
    // defineExpose 增删成员时此处会红
    const exposedTable: EntityTableHandle = null as unknown as InstanceType<typeof EntityTableComponent>;
    const exposedQueryTable: QueryTableHandle = null as unknown as InstanceType<typeof QueryTableComponent>;

    expect([entityInstance, entityTableHandle, queryTableHandle, dialogData, theme]).toHaveLength(5);
    expect(filterQuery.rules).toEqual([]);
    expect([group, dropMode, dragState, rule, output]).toBeDefined();
    expect([exposedTable, exposedQueryTable]).toHaveLength(2);
  });
});
