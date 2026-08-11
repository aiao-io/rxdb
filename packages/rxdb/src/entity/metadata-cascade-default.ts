import { ICascadeOptions, OnDeleteAction, OnUpdateAction, RelationKind } from './metadata-options.interface.js';

/**
 * 应用默认级联选项
 * 如果用户没有显式指定级联选项，则使用默认值
 *
 * @param options - 用户配置的级联选项
 * @param relationKind - 关系类型
 * @param nullable - 外键是否可为空
 */
export default (
  options: ICascadeOptions,
  relationKind: RelationKind,
  nullable: boolean = false
): Required<ICascadeOptions> => {
  const defaults = get_default_cascade_options(relationKind, nullable);
  return {
    onDelete: options.onDelete ?? defaults.onDelete,
    onUpdate: options.onUpdate ?? defaults.onUpdate
  };
};

/**
 * 获取关系类型的默认级联选项
 * 根据关系类型自动推断合理的默认级联行为
 *
 * ## 默认规则
 *
 * ### 一对一（ONE_TO_ONE）
 * - onDelete: CASCADE - 删除父实体时级联删除子实体（强关联）
 * - onUpdate: RESTRICT - 不允许更新主键
 * - 示例：用户-个人资料
 *
 * ### 一对多（ONE_TO_MANY）
 * - onDelete: CASCADE - 删除父实体时级联删除所有子实体（父子关系）
 * - onUpdate: RESTRICT - 不允许更新主键
 * - 示例：订单-订单项、文章-评论
 *
 * ### 多对一（MANY_TO_ONE）
 * - onDelete: RESTRICT - 阻止删除（保护父实体，避免孤儿数据）
 * - onUpdate: RESTRICT - 不允许更新主键
 * - 示例：订单项-订单、评论-文章
 *
 * ### 多对多（MANY_TO_MANY）
 * - onDelete: RESTRICT - 阻止删除（需要手动处理中间表）
 * - onUpdate: RESTRICT - 不允许更新主键
 * - 示例：学生-课程
 *
 * @param relationKind - 关系类型
 * @param nullable - 外键是否可为空（影响多对一的默认行为）
 * @returns 默认的级联选项
 *
 * @example
 * ```typescript
 * // 一对多关系：删除订单时级联删除订单项
 * const defaults = get_default_cascade_options(RelationKind.ONE_TO_MANY);
 * // { onDelete: OnDeleteAction.CASCADE, onUpdate: OnUpdateAction.RESTRICT }
 *
 * // 多对一关系（可空）：删除分类时将产品的分类 ID 设为 NULL
 * const defaults = get_default_cascade_options(RelationKind.MANY_TO_ONE, true);
 * // { onDelete: OnDeleteAction.SET_NULL, onUpdate: OnUpdateAction.RESTRICT }
 * ```
 */
export const get_default_cascade_options = (
  relationKind: RelationKind,
  nullable: boolean = false
): Required<ICascadeOptions> => {
  // 所有关系类型默认不允许更新主键（推荐做法）
  const onUpdate = OnUpdateAction.RESTRICT;

  switch (relationKind) {
    case RelationKind.ONE_TO_ONE:
      // 一对一：强关联，删除父实体时级联删除子实体
      // 例如：用户-个人资料，删除用户时应该删除资料
      return {
        onDelete: OnDeleteAction.CASCADE,
        onUpdate
      };

    case RelationKind.ONE_TO_MANY:
      // 一对多：父子关系，删除父实体时级联删除所有子实体
      // 例如：订单-订单项，删除订单时应该删除所有订单项
      return {
        onDelete: OnDeleteAction.CASCADE,
        onUpdate
      };

    case RelationKind.MANY_TO_ONE:
      // 多对一：子实体引用父实体
      if (nullable) {
        // 如果外键可为空，删除父实体时将子实体的外键设为NULL
        // 例如：产品-分类，删除分类时产品保留但分类ID设为NULL
        return {
          onDelete: OnDeleteAction.SET_NULL,
          onUpdate
        };
      } else {
        // 如果外键不可为空，阻止删除父实体（保护数据完整性）
        // 例如：订单项-订单，如果订单有订单项则不允许删除订单
        return {
          onDelete: OnDeleteAction.RESTRICT,
          onUpdate
        };
      }

    case RelationKind.MANY_TO_MANY:
      // 多对多：通过中间表关联，默认阻止删除（需要手动处理中间表）
      // 例如：学生-课程，删除学生前需要先处理选课记录
      return {
        onDelete: OnDeleteAction.RESTRICT,
        onUpdate
      };

    default:
      // 未知类型，使用最保守的策略
      return {
        onDelete: OnDeleteAction.RESTRICT,
        onUpdate
      };
  }
};
