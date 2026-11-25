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

import { v5 as uuidV5 } from 'uuid';
import { RxDBError } from '../RxDBError.js';
import type { RxDBEntityId, UUID } from './entity.interface.js';
import {
  EntityMetadataOptions,
  EntityRelationManyToManyMetadata,
  OnDeleteAction,
  RelationKind
} from './metadata-options.interface.js';
import { EntityMetadata } from './metadata.interface.js';

/**
 * 关联行 id 的 uuid v5 命名空间（US-228）
 *
 * @remarks
 * 协议常量，永不改变：改了它，已经落库、已经推上远端的关联行就和新算出来的 id 对不上，
 * 同一对数据会出现两行（远端有成对唯一约束时推送报 23505）。
 */
export const JUNCTION_ID_NAMESPACE = '9fb02b21-84d4-40f2-8847-bb5c3878b0e0';

/** 中间表实体的命名空间与名字（`EntityMetadata` 的子集，普通字符串也可以） */
export interface JunctionName {
  readonly namespace: string;
  readonly name: string;
}

/** 中间表的一端：外键属性名与这一端实体的主键 */
export interface JunctionEndpointKey {
  /** 中间表上指向这一端的外键属性名，如 `categoriesId` */
  readonly foreignKey: string;
  /** 这一端实体的主键 */
  readonly id: RxDBEntityId;
  /** 这一端的主键是不是 uuid：是的话统一转小写再参与派生 */
  readonly uuid: boolean;
}

/**
 * 多对多关联行的确定性 id（US-228）
 *
 * @param junction - 中间表实体的命名空间与名字
 * @param endpoints - 两端的外键与主键，顺序无关
 * @returns uuid v5：名字是 `rxdb-junction:v1:<namespace>.<中间表名>|<外键>=<主键>|<外键>=<主键>`，外键按属性名排序
 * @throws {RxDBError} 任一端没有主键，或两端的外键同名
 *
 * @remarks
 * 同一对数据不管从哪一端关联、在哪个客户端关联、取消之后重新关联，都得到同一个 id：
 * 两个客户端并发关联同一对只落成远端的一行，推送不会撞成对唯一约束。
 * uuid 主键转小写：PGlite 按 `uuid` 存、SQLite 按区分大小写的 TEXT 存，大小写不同的同一个 uuid 不能算成两对。
 * 服务端自己写关联行时用同一个公式（Postgres：`extensions.uuid_generate_v5(命名空间, 名字)`），见 Supabase 适配器文档。
 *
 * @example
 * ```ts
 * junctionEntityId({ namespace: 'shop', name: 'Category_OrderItem' }, [
 *   { foreignKey: 'categoriesId', id: category.id, uuid: true },
 *   { foreignKey: 'orderItemsId', id: orderItem.id, uuid: true }
 * ]);
 * ```
 */
export function junctionEntityId(
  junction: JunctionName,
  endpoints: readonly [JunctionEndpointKey, JunctionEndpointKey]
): UUID {
  const [first, second] = [...endpoints].sort((a, b) => (a.foreignKey < b.foreignKey ? -1 : 1));
  if (first.foreignKey === second.foreignKey) {
    throw new RxDBError(
      `中间表 ${junction.namespace}.${junction.name} 的两端外键同名（${first.foreignKey}），派生不出关联行 id`
    );
  }
  const parts = [first, second].map(endpoint => `${endpoint.foreignKey}=${endpointIdText(junction, endpoint)}`);
  return uuidV5(
    `rxdb-junction:v1:${junction.namespace}.${junction.name}|${parts.join('|')}`,
    JUNCTION_ID_NAMESPACE
  ) as UUID;
}

/** 一端主键参与派生的文本：uuid 转小写，数字与 bigint 取十进制文本 */
function endpointIdText(junction: JunctionName, endpoint: JunctionEndpointKey): string {
  const { id } = endpoint as { id: RxDBEntityId | null | undefined };
  if (id === null || id === undefined || id === '') {
    throw new RxDBError(
      `中间表 ${junction.namespace}.${junction.name} 的 ${endpoint.foreignKey} 一端没有主键：先给两端实体定好 id 再关联`
    );
  }
  const text = String(id);
  return endpoint.uuid ? text.toLowerCase() : text;
}

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
    // 两端都不写变更日志时中间表也不写：只记中间表的变更，撤销与同步都只能还原一半关系。
    // 只读检出位的快照实例（实体全是 log: false 的克隆）靠这一条才不建变更日志触发器（US-313）
    ...(metadataA.log === false && metadataB.log === false ? { log: false } : {}),
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
