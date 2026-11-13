/** 关系类型常量 */
export const RELATION_KINDS = {
  ONE_TO_ONE: 'ONE_TO_ONE',
  ONE_TO_MANY: 'ONE_TO_MANY',
  MANY_TO_ONE: 'MANY_TO_ONE',
  MANY_TO_MANY: 'MANY_TO_MANY'
} as const;

/** 关系类型联合类型 */
export type RelationKind = (typeof RELATION_KINDS)[keyof typeof RELATION_KINDS];

/**
 * 逆关系映射
 * 用于查找某个关系类型的反向关系类型
 */
export const INVERSE_RELATION_KIND: Record<RelationKind, RelationKind> = {
  [RELATION_KINDS.ONE_TO_ONE]: RELATION_KINDS.ONE_TO_ONE,
  [RELATION_KINDS.ONE_TO_MANY]: RELATION_KINDS.MANY_TO_ONE,
  [RELATION_KINDS.MANY_TO_ONE]: RELATION_KINDS.ONE_TO_MANY,
  [RELATION_KINDS.MANY_TO_MANY]: RELATION_KINDS.MANY_TO_MANY
};

/** 关系类型的 UI 显示标签 */
export const RELATION_LABELS: Record<RelationKind, string> = {
  ONE_TO_ONE: '1:1',
  ONE_TO_MANY: '1:N',
  MANY_TO_ONE: 'N:1',
  MANY_TO_MANY: 'N:N'
};

/** 关系类型选项数组（用于下拉选择） */
export const RELATION_KIND_OPTIONS: readonly RelationKind[] = Object.values(RELATION_KINDS);
