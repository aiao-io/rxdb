/**
 * @fileoverview 多对多关系中间表实体的自动生成器
 *
 * RxDB 不强制中间表必须是"实体" —— 多对多也可以拆成两次 `MANY_TO_ONE`。
 * 但当业务想直接在中间表上挂字段（如 `joinedAt` / `role`）时，必须有一张
 * 真实存在的实体表。这个生成器把 `User × Role` 这样的关系声明翻译成
 * `Role_User` 实体的元数据，注册到 SchemaManager 后跟普通实体一样落库。
 *
 * 命名规则（**已经接入 schema 校验**）：
 *
 * - `namespace` = 两个源命名空间去重后按字母序 `_` 连接；
 * - `name` = 两个实体名按字母序 `_` 连接（**不去重**，自关联 `User_User` 不会被合并成 `User`）。
 *
 * 不按"实体名排序"是因为 `SchemaManager` 在加载时按字典序排，
 * 同样一对关系无论谁先声明都会得到**同一个**中间表名。
 */

import {
  EntityMetadataOptions,
  EntityRelationManyToManyMetadata,
  OnDeleteAction,
  RelationKind
} from './metadata-options.interface.js';
import { EntityMetadata } from './metadata.interface.js';

/**
 * 多对多关系描述接口
 * 包含实体元数据和关系元数据
 */
export interface ManyToManyRelation {
  /**
   * 实体元数据
   */
  metadata: EntityMetadata;

  /**
   * 多对多关系元数据
   */
  relation: EntityRelationManyToManyMetadata;
}

/**
 * 根据多对多关系生成中间表实体元数据
 *
 * 中间表实体用于连接两个实体之间的多对多关系，它包含两个外键，分别指向关系的两端
 * 中间表的命名规则是将两个实体名称按字母顺序排序后用下划线连接
 * 命名空间同样按字母顺序排序后用下划线连接
 *
 * @param options - 包含两个多对多关系的数组，每个关系包含实体元数据和关系元数据
 * @returns 生成的中间表实体元数据选项
 *
 * @example
 * 如果有 User 和 Role 两个实体，生成的中间表名称为 Role_User
 * 如果两个实体分别在 auth 和 system 命名空间，生成的命名空间为 auth_system
 */
export default (options: [ManyToManyRelation, ManyToManyRelation]): EntityMetadataOptions => {
  // 解构两个关系的元数据和关系定义
  const [{ metadata: metadataA, relation: relationA }, { metadata: metadataB, relation: relationB }] = options;

  // 生成中间表的命名空间：将两个实体的命名空间按字母顺序排序后用下划线连接
  const namespace =
    Array.from(new Set([metadataA.namespace, metadataB.namespace]))
      .sort()
      .join('_') || undefined;

  // 生成中间表的名称：将两个实体的名称按字母顺序排序后用下划线连接
  // 不去重，以便自关联（如 User-User friends）生成 User_User 而非 User
  const name = [metadataA.name, metadataB.name].sort().join('_');

  // 创建中间表实体的元数据选项
  const metadata: EntityMetadataOptions = {
    name: name as Capitalize<string>,
    namespace: namespace as Lowercase<string>,
    relations: [
      {
        /**
         * 这里的 name 就是 relationA, 而不是 relationB
         * 因为在建关系的时候，relationA 指向的是 metadataB 而 relationB 指向的是 metadataA
         * 所以保存到一张表的时候 ，relationA 保存的是指向 metadataB 的关系
         *
         * ⚠️ 中间表的外键必须使用 CASCADE
         * 当删除主实体时，中间表的关联记录也应该被删除，这是多对多关系的标准行为
         * 不能使用 RESTRICT，否则会阻止删除有关联的实体
         */
        name: relationA.name,
        kind: RelationKind.MANY_TO_ONE,
        mappedNamespace: metadataB.namespace,
        mappedEntity: metadataB.name,
        mappedProperty: relationB.name,
        onDelete: OnDeleteAction.CASCADE
      },
      {
        /**
         * 同上，name 就是 relationB
         * 同样需要 CASCADE 删除
         */
        name: relationB.name,
        kind: RelationKind.MANY_TO_ONE,
        mappedNamespace: metadataA.namespace,
        mappedEntity: metadataA.name,
        mappedProperty: relationA.name,
        onDelete: OnDeleteAction.CASCADE
      }
    ]
  };
  return metadata;
};
