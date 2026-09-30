/**
 * @fileoverview Tree 插件常量
 */

import { EntityMetadataOptions, OnDeleteAction, PropertyType, RelationKind } from '@aiao/rxdb';

/**
 * 树查询任务类型的**单一来源**。
 *
 * @remarks
 * 这四个名字要被三处消费：`*Query` 接口的 `type` 字段（类型侧）、
 * {@link TREE_QUERY_TYPES}（三个 merge 的首道过滤）、`TreeRepository._STATIC_METHODS`
 * （挂到实体上的静态方法名）。它们此前各写一份，加第五种树查询时漏掉其中一处
 * **不会报错**，只会让新任务静默落回核心默认 merge、或者压根不挂到实体上。
 *
 * 现在后两者从这里派生，接口侧用 `Extract<TreeQueryType, …>` 与它绑定，
 * 双向一致性由 `__tests__/contracts/tree-query-type-parity.spec.ts` 在编译期钉死。
 */
export const TREE_QUERY_TYPE_LIST = ['findDescendants', 'findAncestors', 'countDescendants', 'countAncestors'] as const;

/**
 * 树查询任务类型的联合，由 {@link TREE_QUERY_TYPE_LIST} 派生。
 */
export type TreeQueryType = (typeof TREE_QUERY_TYPE_LIST)[number];

/**
 * 树查询任务类型集合
 *
 * @remarks
 * 三个 merge 函数用它做首道过滤：`TreeRepository` 把自己注册到 `QueryManager` 时是
 * 按 task 类型逐个登记的，但同一个 Repository 上也跑着 `findAll` / `count` 这类通用查询，
 * 它们必须原样落回核心的默认 merge。没有这一句，树的增量逻辑会去接管非树任务。
 *
 * 元素类型声明成 `string` 而不是 {@link TreeQueryType}：调用方传进来的是
 * `QueryTask.type`（`string`），收窄成联合反而让 `has()` 在调用点编译失败。
 */
export const TREE_QUERY_TYPES: ReadonlySet<string> = new Set<string>(TREE_QUERY_TYPE_LIST);

/**
 * `TreeAdjacencyListEntityBase` 的 `@Entity` 元数据。
 *
 * @remarks
 * 邻接表模型的那一份声明：`parentId` 外键、`children` 一对多自关联、
 * `hasChildren` 计算属性，以及 `repository: 'TreeRepository'`。子类沿原型链继承整份，
 * 所以 `@Entity({ name: 'Category' })` 不必重复声明任何一项就有树能力。
 *
 * 之所以导出而不是内联进装饰器：`@TreeEntity` 装饰器要拿它去合并用户自己的选项，
 * 手写实体（不继承基类、自己实现 {@link ITreeEntity}）也要靠它对齐字段，
 * 两条路径必须用同一份声明，否则「继承来的树」和「手写的树」在 schema 上会分叉。
 *
 * 放在这个不含装饰器与 rxjs 的模块里，`/generator` 子路径才能读到它而不必导入
 * {@link TreeAdjacencyListEntityBase} —— 生成器只在构建期跑。
 *
 * @see {@link TreeAdjacencyListEntityBase}
 */
export const TREE_ADJACENCY_LIST_ENTITY_BASE_OPTIONS: EntityMetadataOptions = {
  name: 'TreeAdjacencyListEntityBase',
  abstract: true, // 标记为抽象类，不会直接创建此类的实例
  // 基类声明了 findDescendants / countAncestors 等静态方法，而这些只由 TreeRepository 注入。
  // 因此这里必须显式声明 —— 子类沿原型链继承到它，才不会「类型上有、运行时没有」。
  // 不写 repository 的子类（`@Entity({ name: 'Category' })`）正是靠这一行拿到树查询能力。
  repository: 'TreeRepository',
  computedProperties: [
    {
      name: 'hasChildren', // 是否有子节点
      displayName: '是否有子节点',
      type: PropertyType.boolean, // 布尔类型
      nullable: true,
      readonly: true
    }
  ],
  relations: [
    {
      name: 'children', // 子节点关系名称
      displayName: '子节点',
      kind: RelationKind.ONE_TO_MANY, // 一对多关系
      mappedEntity: 'TreeAdjacencyListEntityBase', // 关联到同一实体类型
      mappedProperty: 'parent' // 映射到子实体的 parent 属性
    },
    {
      name: 'parent', // 父节点关系名称
      columnName: 'parentId', // 外键列名
      displayName: '父节点',
      kind: RelationKind.MANY_TO_ONE, // 多对一关系
      mappedEntity: 'TreeAdjacencyListEntityBase', // 关联到同一实体类型
      mappedProperty: 'children', // 映射到父实体的 children 属性
      nullable: true, // 允许根节点没有父节点
      onDelete: OnDeleteAction.CASCADE // 删除父节点时级联删除子节点
    }
  ],
  features: {
    tree: {
      type: 'adjacency-list', // 指定为邻接表树形结构
      hasChildren: true // 启用 hasChildren 计算属性
    }
  }
} as const;
