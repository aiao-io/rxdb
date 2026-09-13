/**
 * @fileoverview QueryCache 行契约跨后端套件的实体 fixture。
 *
 * @remarks
 * 这里只放**两个后端判定相同**的形态。SQLite family 与 PGlite 的建表 DDL 在两处
 * 确有分歧（uuid 主键的数据库端默认值、`SET NULL` 外键列的 NOT NULL），那两条
 * 各自在自己包的用例里锁死，**不进**共享 fixture —— 共享的是契约语义，不是必填列规则。
 *
 * 实体名一律 `QcContract` 前缀：`@Entity` 是全局注册，与其他测试包的 fixture 重名
 * 会互相顶掉。
 */
import { Entity, EntityBase, PropertyType, RelationKind } from '@aiao/rxdb';

/**
 * 覆盖「可空列 / 字面量 default / 函数型 default」三种豁免判定的主 fixture。
 *
 * @remarks
 * - `title` 无 default 且非空 → 必填；
 * - `tag` 可空 → 两个后端建表都不发 NOT NULL，可省略；
 * - `status` 有**字面量** default → 两个后端都把它写进 DDL 的 `DEFAULT` 子句，可省略；
 * - 继承来的 `createdAt` / `updatedAt` 的 default 是**函数**（`() => new Date()`），
 *   一个字都不进 DDL —— 它是仓储层的东西，而 QueryCache 的落地是绕开仓储的裸 SQL。
 *   这正是本契约要拦的病灶，两侧都必填。
 */
@Entity({
  name: 'QcContractRecipe',
  tableName: 'qc_contract_recipes',
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'tag', type: PropertyType.string, nullable: true },
    { name: 'status', type: PropertyType.string, default: 'draft' }
  ]
})
export class QcContractRecipe extends EntityBase {
  title!: string;
  tag?: string | null;
  status!: string;
}

/** 覆盖「远端行以物理列名为键」的形态：`select('*')` 的返回就是这一种。 */
@Entity({
  name: 'QcContractMapped',
  tableName: 'qc_contract_mapped',
  properties: [{ name: 'authorName', type: PropertyType.string, columnName: 'author_name' }]
})
export class QcContractMapped extends EntityBase {
  authorName!: string;
}

/**
 * 覆盖 binary 的**反向**豁免：写了字面量 default 也仍然必填。
 *
 * @remarks
 * 两个后端的建表都对 `binary` 明确跳过 DEFAULT 子句
 * （sqlite-core 的 `create_table_column_sql`、pglite 的 `getPropertyDefaultSql`），
 * 列上只剩光秃秃的 NOT NULL。跟着 default 放行等于让「过了校验的行」在 INSERT 时被拒。
 */
@Entity({
  name: 'QcContractBlob',
  tableName: 'qc_contract_blobs',
  properties: [{ name: 'payload', type: PropertyType.binary, default: new Uint8Array([1, 2, 3]) }]
})
export class QcContractBlob extends EntityBase {
  payload!: Uint8Array;
}

/** 关系 fixture 的被引用端。 */
@Entity({
  name: 'QcContractTeam',
  tableName: 'qc_contract_teams',
  properties: [{ name: 'teamName', type: PropertyType.string }]
})
export class QcContractTeam extends EntityBase {
  teamName!: string;
}

/**
 * 覆盖多对一外键列的三种判定。
 *
 * @remarks
 * `owner` 非空且无默认值 → 两侧都必填；`backup` 可空 → 两侧都豁免。
 * 故意**不放** `SET NULL` 的那一支：sqlite-core 因 `mustBeNullable` 不发 NOT NULL 而豁免，
 * PGlite 只看 `relation.nullable` 照发 NOT NULL 而必填 —— 那是分歧，各自锁。
 */
@Entity({
  name: 'QcContractMember',
  tableName: 'qc_contract_members',
  properties: [{ name: 'nickName', type: PropertyType.string }],
  relations: [
    {
      name: 'owner',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'QcContractTeam',
      mappedProperty: 'owned',
      columnName: 'owner_id'
    },
    {
      name: 'backup',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'QcContractTeam',
      mappedProperty: 'backups',
      columnName: 'backup_id',
      nullable: true
    }
  ]
})
export class QcContractMember extends EntityBase {
  nickName!: string;
  ownerId!: string;
  backupId?: string | null;
}
