import type { EntityMetadata, OrderBy, RuleGroup } from '@aiao/rxdb';

import {
  validateQueryAgainstEncryptedColumns,
  type EncryptedEntityResolver,
  type EncryptedFieldPathNormalizer
} from './metadata-validation.js';

/**
 * 把 RxDB 查询参数映射到通用加密查询校验器。
 *
 * `resolveEntity` 用于关系路径，`normalizeField` 用于 adapter 自己引入的字段别名。
 * 无法解析的带点路径会 fail-closed；普通未加密字段不受影响。
 *
 * @throws {@link EncryptedQueryError} 查询命中加密列或跨层路径无法可靠解析
 */
export const validateEncryptedQuery = (
  metadata: EntityMetadata,
  args: {
    where?: RuleGroup;
    orderBy?: ReadonlyArray<OrderBy>;
    groupBy?: ReadonlyArray<string>;
    projection?: ReadonlyArray<string>;
  },
  resolveEntity?: EncryptedEntityResolver,
  normalizeField?: EncryptedFieldPathNormalizer
): void => {
  validateQueryAgainstEncryptedColumns({
    entity: metadata,
    where: args.where,
    order: args.orderBy?.map(order => ({ name: order.field, direction: order.sort })),
    group: args.groupBy,
    projection: args.projection,
    resolveEntity,
    normalizeField
  });
};
