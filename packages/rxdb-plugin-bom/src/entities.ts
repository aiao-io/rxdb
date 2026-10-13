/**
 * @fileoverview BOM 领域实体（US-507 阶段 A / B）
 *
 * 一套数据结构表达 EBOM / MBOM / 销售 BOM：节点分裂为 `item`（主数据）与
 * `item_revision`（修订）；BOM 头挂在修订上；行身份分两层——`bom_line`（逻辑行，
 * `(headerId, lineNo)` 唯一）与 `bom_line_occurrence`（行发生项，区间排他、子件引用）。
 * 多重图：`(parent, child)` 不唯一，同一子件可挂多条逻辑行（US-507 AC#1）。
 *
 * 结构归属列（修订→物料、头→修订/类型/组织、行→头、发生项→行）创建后不可改，
 * 已发布修订与已发布头成员的写入协议由插件触发器兜底（见 `backend/`）。
 */

import { Entity, EntityBase, PropertyType, RelationKind } from '@aiao/rxdb';

/**
 * 物料主数据（`bom$item`）。
 */
@Entity({
  name: 'BomItem',
  namespace: 'bom',
  tableName: 'item',
  repository: 'BomRepository',
  properties: [
    { name: 'itemNo', type: PropertyType.string, unique: true },
    { name: 'description', type: PropertyType.string, nullable: true },
    // 随物料走的属性挂 item（US-507 阶段 A）：为 US-523 实例 BOM 预留，本阶段不消费
    { name: 'serialized', type: PropertyType.boolean, default: false }
  ]
})
export class BomItem extends EntityBase {
  itemNo!: string;
  description!: string | null;
  serialized!: boolean;
}

/**
 * 物料修订（`bom$item_revision`）。
 *
 * @remarks
 * 已发布修订除 `draft → released` 状态转移外不可改（含 `default_phantom`、`effective_from`，
 * US-507 AC#14），由存储层触发器兜底；`effective_from` 在发布转移上要求非空。
 */
@Entity({
  name: 'BomItemRevision',
  namespace: 'bom',
  tableName: 'item_revision',
  repository: 'BomRepository',
  properties: [
    { name: 'revisionNo', type: PropertyType.string },
    { name: 'state', type: PropertyType.enum, enum: ['draft', 'released'], default: 'draft' },
    { name: 'effectiveFrom', type: PropertyType.date, nullable: true },
    // 随修订走的属性挂 item_revision（US-507 AC#6）
    { name: 'defaultPhantom', type: PropertyType.boolean, default: false },
    // 历史装载批次的批次号（US-508 历史装载通道）；直连发布恒空
    { name: 'historyBatchNo', type: PropertyType.string, nullable: true }
  ],
  relations: [
    {
      name: 'item',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'BomItem',
      mappedProperty: 'revisions'
    }
  ],
  foreignKeys: [
    {
      name: 'revision_history_batch',
      properties: ['historyBatchNo'],
      mappedEntity: 'BomHistoryBatch',
      mappedProperties: ['batchNo']
    }
  ],
  indexes: [
    // 组合外键（发生项的 `(childItemId, childRevisionId)`）引用 `(itemId, id)` 的唯一性
    { name: 'item_id_id', properties: ['itemId', 'id'], unique: true },
    // US-508 AC#10：同一物料已发布修订的 effective_from 唯一（「最新修订」不唯一的非法态在发布时拒绝）
    {
      name: 'released_effective_from',
      properties: ['itemId', 'effectiveFrom'],
      unique: true,
      where: { combinator: 'and', rules: [{ field: 'state', operator: '=', value: 'released' }] }
    }
  ]
})
export class BomItemRevision extends EntityBase {
  revisionNo!: string;
  state!: 'draft' | 'released';
  effectiveFrom!: Date | null;
  defaultPhantom!: boolean;
  itemId!: string;
  historyBatchNo!: string | null;
}

/**
 * BOM 头（`bom$bom_header`）：挂在**修订**上，没有独立的版本轴。
 *
 * @remarks
 * 唯一键 `(parentRevisionId, bomType, orgId, alternativeNo)`；`alternative_no` 是并行的
 * 备选方案（同时有效），不是版本。`draft → released` 是原子的存储层校验点（US-507 AC#5）。
 */
@Entity({
  name: 'BomHeader',
  namespace: 'bom',
  tableName: 'bom_header',
  repository: 'BomRepository',
  properties: [
    { name: 'bomType', type: PropertyType.enum, enum: ['ebom', 'mbom', 'sales'] },
    { name: 'orgId', type: PropertyType.string },
    { name: 'alternativeNo', type: PropertyType.integer, default: 1 },
    { name: 'state', type: PropertyType.enum, enum: ['draft', 'released'], default: 'draft' },
    // 历史装载批次的批次号（US-508 历史装载通道）；直连发布恒空
    { name: 'historyBatchNo', type: PropertyType.string, nullable: true }
  ],
  relations: [
    {
      name: 'parentRevision',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'BomItemRevision',
      mappedProperty: 'headers'
    }
  ],
  foreignKeys: [
    {
      name: 'header_history_batch',
      properties: ['historyBatchNo'],
      mappedEntity: 'BomHistoryBatch',
      mappedProperties: ['batchNo']
    }
  ],
  indexes: [
    {
      name: 'parent_revision_bom_type_org_alternative',
      properties: ['parentRevisionId', 'bomType', 'orgId', 'alternativeNo'],
      unique: true
    }
  ]
})
export class BomHeader extends EntityBase {
  bomType!: 'ebom' | 'mbom' | 'sales';
  orgId!: string;
  alternativeNo!: number;
  state!: 'draft' | 'released';
  parentRevisionId!: string;
  historyBatchNo!: string | null;
}

/**
 * 历史装载批次（`bom$bom_history_batch`，US-508 历史装载通道）。
 *
 * @remarks
 * `loadHistory` 一次事务：建开启态批次 → 写 draft 修订/头（盖批次号）→ 发布转移
 * （触发器只对开启态批次跳过追溯检查）→ 关闭批次。批次号由调用方给定（确定性，AC#18）；
 * 批次表只追加：拒绝删除，UPDATE 只允许 `open → closed` 转移（AC#14）。
 */
@Entity({
  name: 'BomHistoryBatch',
  namespace: 'bom',
  tableName: 'bom_history_batch',
  repository: 'BomRepository',
  properties: [
    // 主键仍是 EntityBase 的 uuid id；批次号由调用方给定、经唯一索引约束确定性（AC#18）
    { name: 'batchNo', type: PropertyType.string, unique: true },
    { name: 'state', type: PropertyType.enum, enum: ['open', 'closed'], default: 'open' }
  ]
})
export class BomHistoryBatch extends EntityBase {
  batchNo!: string;
  state!: 'open' | 'closed';
}

/**
 * 逻辑行（`bom$bom_line`）：「这条设计行是谁」。
 *
 * @remarks
 * 身份 `(headerId, lineNo)` 唯一；`(parent, child)` **不**唯一（多重图，US-507 AC#1）。
 * `ecnInId` 首轮恒空（US-515 落地后启用）。
 */
@Entity({
  name: 'BomLine',
  namespace: 'bom',
  tableName: 'bom_line',
  repository: 'BomRepository',
  properties: [
    { name: 'lineNo', type: PropertyType.integer },
    { name: 'ecnInId', type: PropertyType.string, nullable: true }
  ],
  relations: [
    {
      name: 'header',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'BomHeader',
      mappedProperty: 'lines'
    }
  ],
  indexes: [{ name: 'header_line_no', properties: ['headerId', 'lineNo'], unique: true }]
})
export class BomLine extends EntityBase {
  lineNo!: number;
  ecnInId!: string | null;
  headerId!: string;
}

/**
 * 行发生项（`bom$bom_line_occurrence`）：「这条行在 `[effectiveFrom, effectiveTo)` 取哪组值」。
 *
 * @remarks
 * 同一逻辑行的发生项区间不得重叠（无论子件是否相同，US-507 AC#8/#9），由区间排他约束兜底；
 * `childRevisionId IS NULL` = imprecise（跟随评估日已发布的最新修订）、非 NULL = precise（锁版），
 * 且必须属于本发生项的 `childItemId`（组合外键，US-507 AC#11）。
 * `qty` 按十进制值合同以规范十进制串存取，全程不经 JS `number`（US-511 AC#22/#23）。
 */
@Entity({
  name: 'BomLineOccurrence',
  namespace: 'bom',
  tableName: 'bom_line_occurrence',
  repository: 'BomRepository',
  properties: [
    { name: 'childRevisionId', type: PropertyType.uuid, nullable: true },
    { name: 'qty', type: PropertyType.string },
    { name: 'effectiveFrom', type: PropertyType.date },
    { name: 'effectiveTo', type: PropertyType.date, nullable: true },
    { name: 'ecnInId', type: PropertyType.string, nullable: true },
    { name: 'ecnOutId', type: PropertyType.string, nullable: true }
  ],
  relations: [
    {
      name: 'line',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'BomLine',
      mappedProperty: 'occurrences'
    },
    {
      name: 'childItem',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'BomItem',
      mappedProperty: 'occurrences'
    }
  ],
  foreignKeys: [
    // 修订必须属于子件（US-507 AC#11）：MATCH SIMPLE 让 imprecise（childRevisionId NULL）放行
    {
      name: 'child_revision_belongs_to_item',
      properties: ['childItemId', 'childRevisionId'],
      mappedEntity: 'BomItemRevision',
      mappedProperties: ['itemId', 'id'],
      onDelete: 'CASCADE'
    }
  ],
  exclusions: [
    {
      name: 'occurrence_no_overlap',
      equal: ['lineId'],
      ranges: [{ from: 'effectiveFrom', to: 'effectiveTo', bounds: '[)' }]
    }
  ]
})
export class BomLineOccurrence extends EntityBase {
  childRevisionId!: string | null;
  qty!: string;
  effectiveFrom!: Date;
  effectiveTo!: Date | null;
  ecnInId!: string | null;
  ecnOutId!: string | null;
  lineId!: string;
  childItemId!: string;
}

/** BOM 实体全集（触发器安装按此清单在 schema 里找实体）。 */
export const BOM_ENTITIES = [BomItem, BomItemRevision, BomHeader, BomHistoryBatch, BomLine, BomLineOccurrence] as const;
