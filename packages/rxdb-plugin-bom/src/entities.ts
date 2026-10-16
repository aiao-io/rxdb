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
    { name: 'serialized', type: PropertyType.boolean, default: false },
    // 数量语义（US-511 阶段 A）：库存单位与需求行取整小数位（默认件；缺换算率时按 AC#10 拒绝）
    { name: 'stockUom', type: PropertyType.string, default: 'pcs' },
    { name: 'uomDecimals', type: PropertyType.integer, default: 0 },
    // 物料级换算率：1 目标单位含多少库存单位（行级 uom_conversion 覆盖它）
    { name: 'uomConversion', type: PropertyType.string, nullable: true },
    // 外购叶子价格（US-514）：有价即外购；价格带 price_uom（与库存单位不同按物料级换算，缺换算拒绝）
    { name: 'unitPrice', type: PropertyType.string, nullable: true },
    { name: 'priceUom', type: PropertyType.string, nullable: true },
    { name: 'priceCurrency', type: PropertyType.string, nullable: true },
    // 副产品抵减价（US-514 AC#5/#17）：by_product 产出量 × credit_price
    { name: 'creditPrice', type: PropertyType.string, nullable: true },
    // 扩展属性（US-519）：JSON 文本，写入期按 attr_def 校验
    { name: 'ext', type: PropertyType.string, nullable: true }
  ]
})
export class BomItem extends EntityBase {
  itemNo!: string;
  ext!: string | null;
  description!: string | null;
  serialized!: boolean;
  stockUom!: string;
  uomDecimals!: number;
  uomConversion!: string | null;
  unitPrice!: string | null;
  priceUom!: string | null;
  priceCurrency!: string | null;
  creditPrice!: string | null;
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
    { name: 'historyBatchNo', type: PropertyType.string, nullable: true },
    // 工艺路线（US-524 阶段 A）：可空；挂了必须可解析（发布转移校验）
    { name: 'routingId', type: PropertyType.uuid, nullable: true },
    // 数量语义（US-511 阶段 A/B1）：头基准单位与基准量、装配损耗（加成制 ×(1+s) / 良率制 ÷(1−s)）
    { name: 'baseUom', type: PropertyType.string, default: 'pcs' },
    { name: 'baseQty', type: PropertyType.string, default: '1' },
    { name: 'assemblyScrap', type: PropertyType.string, default: '0' },
    { name: 'assemblyScrapConvention', type: PropertyType.enum, enum: ['additive', 'yield'], default: 'additive' },
    // 标准成本批量（US-514）：以头的 base_uom 计；卷算必填，缺失即拒绝
    { name: 'costLotQty', type: PropertyType.string, nullable: true },
    // 扩展属性（US-519）：JSON 文本，写入期按 attr_def 校验
    { name: 'ext', type: PropertyType.string, nullable: true }
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
    },
    {
      name: 'header_routing',
      properties: ['routingId'],
      mappedEntity: 'BomRouting',
      mappedProperties: ['id']
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
  ext!: string | null;
  orgId!: string;
  alternativeNo!: number;
  state!: 'draft' | 'released';
  parentRevisionId!: string;
  historyBatchNo!: string | null;
  routingId!: string | null;
  baseUom!: string;
  baseQty!: string;
  assemblyScrap!: string;
  assemblyScrapConvention!: 'additive' | 'yield';
  costLotQty!: string | null;
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
 * 变更单（`bom$ecn`，US-515）：行发生项区间的唯一真相源。
 *
 * @remarks
 * 存储态只有 `draft` / `released` / `cancelled`；`effective` 是派生态（`released` 且
 * `effective_date` ≤ UTC 当日），不存派生态就没有「到点推进状态」的定时任务问题。
 * `effectiveDate` 创建即必填（存储层触发器兜底）、`draft` 期可改；发生项的
 * `effective_from` / `effective_to` 一律由它派生，手填即拒绝（AC#5）。
 * `released` 后只允许「改期（未生效，不越过同一逻辑行后继 ECN）」与「取消（未生效）」
 * 两种转移，其余拒绝——全部由存储层触发器执行级联与投影校验（US-515 状态机）。
 */
@Entity({
  name: 'BomEcn',
  namespace: 'bom',
  tableName: 'ecn',
  repository: 'BomRepository',
  properties: [
    { name: 'ecnNo', type: PropertyType.string, unique: true },
    { name: 'state', type: PropertyType.enum, enum: ['draft', 'released', 'cancelled'], default: 'draft' },
    { name: 'effectiveDate', type: PropertyType.date },
    { name: 'reason', type: PropertyType.string, nullable: true },
    // 历史装载批次的批次号（US-525 阶段 C 种子 ECN 走 loadHistory 通道）；直连发布恒空
    { name: 'historyBatchNo', type: PropertyType.string, nullable: true }
  ],
  foreignKeys: [
    {
      name: 'ecn_history_batch',
      properties: ['historyBatchNo'],
      mappedEntity: 'BomHistoryBatch',
      mappedProperties: ['batchNo']
    }
  ]
})
export class BomEcn extends EntityBase {
  ecnNo!: string;
  state!: 'draft' | 'released' | 'cancelled';
  effectiveDate!: Date;
  reason!: string | null;
  historyBatchNo!: string | null;
}

/**
 * 逻辑行（`bom$bom_line`）：「这条设计行是谁」。
 *
 * @remarks
 * 身份 `(headerId, lineNo)` 唯一；`(parent, child)` **不**唯一（多重图，US-507 AC#1）。
 * `ecnInId` 挂 draft ECN（US-515 写入协议）：ECN 新建的逻辑行在发布前对解析不可见。
 */
@Entity({
  name: 'BomLine',
  namespace: 'bom',
  tableName: 'bom_line',
  repository: 'BomRepository',
  properties: [
    { name: 'lineNo', type: PropertyType.integer },
    { name: 'ecnInId', type: PropertyType.uuid, nullable: true }
  ],
  relations: [
    {
      name: 'header',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'BomHeader',
      mappedProperty: 'lines'
    }
  ],
  foreignKeys: [
    {
      name: 'line_ecn_in',
      properties: ['ecnInId'],
      mappedEntity: 'BomEcn',
      mappedProperties: ['id']
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
    // US-511 阶段 A：qty 与 qty_formula 恰好一项（单行 CHECK），公式行的 qty 为空
    { name: 'qty', type: PropertyType.string, nullable: true },
    { name: 'effectiveFrom', type: PropertyType.date },
    { name: 'effectiveTo', type: PropertyType.date, nullable: true },
    { name: 'ecnInId', type: PropertyType.uuid, nullable: true },
    { name: 'ecnOutId', type: PropertyType.uuid, nullable: true },
    // 数量语义（US-511 阶段 A/B1/C）
    { name: 'uom', type: PropertyType.string, default: 'pcs' },
    { name: 'qtyFormula', type: PropertyType.string, nullable: true },
    { name: 'formulaGrammarVersion', type: PropertyType.string, nullable: true },
    { name: 'isFixedQty', type: PropertyType.boolean, default: false },
    { name: 'tierGroupNo', type: PropertyType.string, nullable: true },
    { name: 'lotsizeFrom', type: PropertyType.string, nullable: true },
    { name: 'lotsizeTo', type: PropertyType.string, nullable: true },
    { name: 'componentScrap', type: PropertyType.string, default: '0' },
    { name: 'componentScrapConvention', type: PropertyType.enum, enum: ['additive', 'yield'], default: 'additive' },
    { name: 'componentScrapFixed', type: PropertyType.string, default: '0' },
    { name: 'uomConversion', type: PropertyType.string, nullable: true },
    { name: 'phantomOverride', type: PropertyType.boolean, nullable: true },
    // 位号管理（US-507 阶段 C）：发布转移要求位号数 = 名义 qty
    { name: 'designatorManaged', type: PropertyType.boolean, default: false },
    // 物料流方向（US-513 阶段 A）：只有 consume 进判环与需求展开
    {
      name: 'flowDirection',
      type: PropertyType.enum,
      enum: ['consume', 'by_product', 'scrap_out'],
      default: 'consume'
    },
    // 替代组成员（US-512）：primary 是原始需求对象，替代只从 primary 指向各 substitute
    { name: 'substituteRole', type: PropertyType.enum, enum: ['primary', 'substitute'], nullable: true },
    { name: 'substitutePriority', type: PropertyType.integer, nullable: true },
    { name: 'usageProbability', type: PropertyType.string, nullable: true },
    { name: 'equivQty', type: PropertyType.string, nullable: true },
    // 投料工序（US-520）：行归属工序；分摊经 bom_line_operation_split 子表
    { name: 'operationSeq', type: PropertyType.integer, nullable: true },
    { name: 'supplyToVendor', type: PropertyType.boolean, default: false },
    // 序列 / 批次有效性（US-518）：三维有效域 = 日期 × 序列 × 批次
    { name: 'unitFrom', type: PropertyType.integer, nullable: true },
    { name: 'unitTo', type: PropertyType.integer, nullable: true },
    { name: 'lotCodes', type: PropertyType.string, nullable: true },
    // 配置选择条件（US-517）：行挂选择条件，NULL = 恒真
    { name: 'selectionConditionId', type: PropertyType.uuid, nullable: true },
    // 扩展属性（US-519）：JSON 文本，写入期按 attr_def 校验
    { name: 'ext', type: PropertyType.string, nullable: true }
  ],
  checks: [
    {
      name: 'unit_interval_order',
      rule: { combinator: 'and', rules: [{ field: 'unitFrom', operator: '<=', ref: 'unitTo' }] }
    },
    // US-511 AC#7：qty 与 qty_formula 恰好一项非空
    {
      name: 'qty_xor_formula',
      rule: {
        combinator: 'or',
        rules: [
          {
            combinator: 'and',
            rules: [
              { field: 'qty', operator: 'notNull' },
              { field: 'qtyFormula', operator: 'null' }
            ]
          },
          {
            combinator: 'and',
            rules: [
              { field: 'qty', operator: 'null' },
              { field: 'qtyFormula', operator: 'notNull' }
            ]
          }
        ]
      }
    },
    // US-511 AC#21：阶梯三字段同空，或 tier_group_no 与 lotsize_from 同非空
    {
      name: 'tier_columns_shape',
      rule: {
        combinator: 'or',
        rules: [
          {
            combinator: 'and',
            rules: [
              { field: 'tierGroupNo', operator: 'null' },
              { field: 'lotsizeFrom', operator: 'null' },
              { field: 'lotsizeTo', operator: 'null' }
            ]
          },
          {
            combinator: 'and',
            rules: [
              { field: 'tierGroupNo', operator: 'notNull' },
              { field: 'lotsizeFrom', operator: 'notNull' }
            ]
          }
        ]
      }
    }
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
    },
    {
      name: 'substituteGroup',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'BomSubstituteGroup',
      mappedProperty: 'members',
      nullable: true
    }
  ],
  foreignKeys: [
    {
      name: 'occurrence_selection_condition',
      properties: ['selectionConditionId'],
      mappedEntity: 'BomConfigCondition',
      mappedProperties: ['id']
    },
    // 修订必须属于子件（US-507 AC#11）：MATCH SIMPLE 让 imprecise（childRevisionId NULL）放行
    {
      name: 'child_revision_belongs_to_item',
      properties: ['childItemId', 'childRevisionId'],
      mappedEntity: 'BomItemRevision',
      mappedProperties: ['itemId', 'id'],
      onDelete: 'CASCADE'
    },
    // ECN 引入 / 截止（US-515）：ECN 行不删除（cancelled 保留），默认 RESTRICT 即够
    {
      name: 'occurrence_ecn_in',
      properties: ['ecnInId'],
      mappedEntity: 'BomEcn',
      mappedProperties: ['id']
    },
    {
      name: 'occurrence_ecn_out',
      properties: ['ecnOutId'],
      mappedEntity: 'BomEcn',
      mappedProperties: ['id']
    }
  ]
})
export class BomLineOccurrence extends EntityBase {
  childRevisionId!: string | null;
  qty!: string | null;
  effectiveFrom!: Date;
  effectiveTo!: Date | null;
  ecnInId!: string | null;
  ecnOutId!: string | null;
  lineId!: string;
  childItemId!: string;
  uom!: string;
  qtyFormula!: string | null;
  formulaGrammarVersion!: string | null;
  isFixedQty!: boolean;
  tierGroupNo!: string | null;
  lotsizeFrom!: string | null;
  lotsizeTo!: string | null;
  componentScrap!: string;
  componentScrapConvention!: 'additive' | 'yield';
  componentScrapFixed!: string;
  uomConversion!: string | null;
  phantomOverride!: boolean | null;
  designatorManaged!: boolean;
  flowDirection!: 'consume' | 'by_product' | 'scrap_out';
  substituteGroupId!: string | null;
  substituteRole!: 'primary' | 'substitute' | null;
  substitutePriority!: number | null;
  usageProbability!: string | null;
  equivQty!: string | null;
  operationSeq!: number | null;
  /** 委外供料标记，随导入导出契约保留。 */
  supplyToVendor!: boolean;
  unitFrom!: number | null;
  unitTo!: number | null;
  lotCodes!: string | null;
  selectionConditionId!: string | null;
  ext!: string | null;
}

/**
 * 替代组（`bom$bom_substitute_group`，US-512 非 ECN 场景）。
 *
 * @remarks
 * 一等实体：`(headerId, code)` 唯一；`strategy`（priority / proportional / manual）与
 * `allowMix` 是组的属性；组成员是同一头下的行发生项（成员列见 `BomLineOccurrence`）。
 * 单行 CHECK：按比例分摊本身就是混用（`proportional × !allow_mix` 保存即拒，AC#10）；
 * 聚合约束（恰好一个 primary、priority 不并列、合计恒 1）在发布转移按生效域切片校验。
 */
@Entity({
  name: 'BomSubstituteGroup',
  namespace: 'bom',
  tableName: 'bom_substitute_group',
  repository: 'BomRepository',
  properties: [
    { name: 'code', type: PropertyType.string },
    { name: 'strategy', type: PropertyType.enum, enum: ['priority', 'proportional', 'manual'] },
    { name: 'allowMix', type: PropertyType.boolean, default: true },
    // 挂 draft ECN（US-515 写入协议）：已发布头的替代组只能由 ECN 新建，发布前对解析不可见
    { name: 'ecnInId', type: PropertyType.uuid, nullable: true }
  ],
  relations: [
    {
      name: 'header',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'BomHeader',
      mappedProperty: 'substituteGroups',
      onDelete: 'CASCADE'
    }
  ],
  foreignKeys: [
    {
      name: 'substitute_group_ecn_in',
      properties: ['ecnInId'],
      mappedEntity: 'BomEcn',
      mappedProperties: ['id']
    }
  ],
  indexes: [{ name: 'header_code', properties: ['headerId', 'code'], unique: true }],
  checks: [
    {
      name: 'proportional_allows_mix',
      rule: {
        combinator: 'or',
        rules: [
          { field: 'strategy', operator: '!=', value: 'proportional' },
          { field: 'allowMix', operator: '=', value: true }
        ]
      }
    }
  ]
})
export class BomSubstituteGroup extends EntityBase {
  code!: string;
  strategy!: 'priority' | 'proportional' | 'manual';
  allowMix!: boolean;
  ecnInId!: string | null;
  headerId!: string;
}

/**
 * 位号（`bom$bom_line_designator`，US-507 阶段 C）：「这个位号装在哪条行发生项上」。
 *
 * @remarks
 * 行发生项的 1:N 子表，引用发生项 ID（描述「那一段时间的那组值」）；`(occurrenceId, designator)`
 * 唯一；随发生项删除级联。位号字符串按业务语义（如 `R1`、`C3`）不做内容校验。
 * `occurrenceId` 创建后不可改（结构归属列）；已发布头的位号增删改全部拒绝（写入协议）。
 */
@Entity({
  name: 'BomLineDesignator',
  namespace: 'bom',
  tableName: 'bom_line_designator',
  repository: 'BomRepository',
  properties: [{ name: 'designator', type: PropertyType.string }],
  relations: [
    {
      name: 'occurrence',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'BomLineOccurrence',
      mappedProperty: 'designators',
      onDelete: 'CASCADE'
    }
  ],
  indexes: [{ name: 'occurrence_designator', properties: ['occurrenceId', 'designator'], unique: true }]
})
export class BomLineDesignator extends EntityBase {
  designator!: string;
  occurrenceId!: string;
}

/**
 * 工作中心（`bom$work_center`，US-524）：编码 + 组织，`(code, orgId)` 唯一；
 * 阶段 B 补成本属性——`overheadRate`（制费，US-514 的 `overhead(n, L)` 输入：按换算到
 * `rate_uom` 的工时计；「按工时计制费」是故事未细说下的最小模型，golden 据此手写）。
 */
@Entity({
  name: 'BomWorkCenter',
  namespace: 'bom',
  tableName: 'work_center',
  repository: 'BomRepository',
  properties: [
    { name: 'code', type: PropertyType.string },
    { name: 'orgId', type: PropertyType.string },
    { name: 'overheadRate', type: PropertyType.string, nullable: true },
    { name: 'overheadCurrency', type: PropertyType.string, nullable: true }
  ],
  indexes: [{ name: 'code_org', properties: ['code', 'orgId'], unique: true }]
})
export class BomWorkCenter extends EntityBase {
  code!: string;
  orgId!: string;
  overheadRate!: string | null;
  overheadCurrency!: string | null;
}

/**
 * 工艺路线（`bom$routing`，US-524 阶段 A）：唯一键与 BOM 头逐列对齐
 * `(parentRevisionId, bomType, orgId, alternativeNo)`；`validFrom` / `disabledAt` 路线级生效。
 */
@Entity({
  name: 'BomRouting',
  namespace: 'bom',
  tableName: 'routing',
  repository: 'BomRepository',
  properties: [
    { name: 'bomType', type: PropertyType.enum, enum: ['ebom', 'mbom', 'sales'] },
    { name: 'orgId', type: PropertyType.string },
    { name: 'alternativeNo', type: PropertyType.integer, default: 1 },
    { name: 'validFrom', type: PropertyType.date },
    { name: 'disabledAt', type: PropertyType.date, nullable: true }
  ],
  relations: [
    {
      name: 'parentRevision',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'BomItemRevision',
      mappedProperty: 'routings'
    }
  ],
  indexes: [
    {
      name: 'revision_type_org_alternative',
      properties: ['parentRevisionId', 'bomType', 'orgId', 'alternativeNo'],
      unique: true
    }
  ]
})
export class BomRouting extends EntityBase {
  bomType!: 'ebom' | 'mbom' | 'sales';
  orgId!: string;
  alternativeNo!: number;
  validFrom!: Date;
  disabledAt!: Date | null;
  parentRevisionId!: string;
}

/**
 * 工序（`bom$routing_operation`，US-524 阶段 A/D）：`(routingId, operationSeq)` 唯一；
 * 引用完整性指向工作中心；工序损耗与每道工序各自的 `scrap_convention`（D，与 US-511 同一记法）。
 */
@Entity({
  name: 'BomRoutingOperation',
  namespace: 'bom',
  tableName: 'routing_operation',
  repository: 'BomRepository',
  properties: [
    { name: 'operationSeq', type: PropertyType.integer },
    { name: 'description', type: PropertyType.string, nullable: true },
    { name: 'operationScrap', type: PropertyType.string, default: '0' },
    { name: 'scrapConvention', type: PropertyType.enum, enum: ['additive', 'yield'], default: 'additive' },
    // 工时模型（US-524 阶段 C）：规范十进制串，默认 0；time_uom 默认小时
    { name: 'setupTime', type: PropertyType.string, default: '0' },
    { name: 'runTime', type: PropertyType.string, default: '0' },
    { name: 'fixedTime', type: PropertyType.string, default: '0' },
    { name: 'timeUom', type: PropertyType.string, default: 'h' }
  ],
  relations: [
    {
      name: 'routing',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'BomRouting',
      mappedProperty: 'operations',
      onDelete: 'CASCADE'
    },
    {
      name: 'workCenter',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'BomWorkCenter',
      mappedProperty: 'operations'
    }
  ],
  indexes: [{ name: 'routing_operation_seq', properties: ['routingId', 'operationSeq'], unique: true }]
})
export class BomRoutingOperation extends EntityBase {
  operationSeq!: number;
  description!: string | null;
  operationScrap!: string;
  scrapConvention!: 'additive' | 'yield';
  // 工时模型（US-524 阶段 C）：setup 每批一次、run 每件乘加工量、fixed 固定一批一次；
  // 三者同一 time_uom 计，求和后换算一次到费率 rate_uom（US-514 AC#18/#19）
  setupTime!: string;
  runTime!: string;
  fixedTime!: string;
  timeUom!: string;
  routingId!: string;
  workCenterId!: string;
}

/**
 * 投料分摊（`bom$bom_line_operation_split`，US-520）：一个发生项按比例分摊到多道工序；
 * 分摊对象是工序损耗前的量（G'），各份额之和 = 1（发布转移校验）。
 */
@Entity({
  name: 'BomLineOperationSplit',
  namespace: 'bom',
  tableName: 'bom_line_operation_split',
  repository: 'BomRepository',
  properties: [
    { name: 'operationSeq', type: PropertyType.integer },
    // 分摊比例 [0,1]、小数至多 9 位（与 usage_probability 同域）
    { name: 'ratio', type: PropertyType.string }
  ],
  relations: [
    {
      name: 'occurrence',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'BomLineOccurrence',
      mappedProperty: 'operationSplits',
      onDelete: 'CASCADE'
    }
  ],
  indexes: [{ name: 'occurrence_operation_seq', properties: ['occurrenceId', 'operationSeq'], unique: true }]
})
export class BomLineOperationSplit extends EntityBase {
  operationSeq!: number;
  ratio!: string;
  occurrenceId!: string;
}

/** BOM 实体全集（触发器安装按此清单在 schema 里找实体）。 */

/**
 * 作业类型（`bom$activity_type`，US-524 阶段 B）：工作中心内的作业种类，
 * `(workCenterId, code)` 唯一；费率按 `(work_center, activity_type, valid_from)` 取值。
 */
@Entity({
  name: 'BomActivityType',
  namespace: 'bom',
  tableName: 'activity_type',
  repository: 'BomRepository',
  properties: [{ name: 'code', type: PropertyType.string }],
  relations: [
    {
      name: 'workCenter',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'BomWorkCenter',
      mappedProperty: 'activityTypes'
    }
  ],
  indexes: [{ name: 'work_center_code', properties: ['workCenterId', 'code'], unique: true }]
})
export class BomActivityType extends EntityBase {
  code!: string;
  workCenterId!: string;
}

/**
 * 作业费率（`bom$activity_rate`，US-524 阶段 B）：按 `(work_center, activity_type, valid_from)`
 * 取值，带币种与计费单位 `rate_uom`；同一作业类型的生效段以 valid_from 区分，
 * 同 key 同日起始的两段即重叠（区间语义 [validFrom, 下一段 validFrom)，无显式 to 列）。
 */
@Entity({
  name: 'BomActivityRate',
  namespace: 'bom',
  tableName: 'activity_rate',
  repository: 'BomRepository',
  properties: [
    { name: 'validFrom', type: PropertyType.date },
    { name: 'rate', type: PropertyType.string },
    { name: 'currency', type: PropertyType.string },
    { name: 'rateUom', type: PropertyType.string }
  ],
  relations: [
    {
      name: 'workCenter',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'BomWorkCenter',
      mappedProperty: 'activityRates'
    },
    {
      name: 'activityType',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'BomActivityType',
      mappedProperty: 'activityRates'
    }
  ],
  indexes: [
    { name: 'activity_rate_segment', properties: ['workCenterId', 'activityTypeId', 'validFrom'], unique: true }
  ]
})
export class BomActivityRate extends EntityBase {
  validFrom!: Date;
  rate!: string;
  currency!: string;
  rateUom!: string;
  workCenterId!: string;
  activityTypeId!: string;
}

/**
 * EBOM↔MBOM 变换范围（`bom$bom_map_scope`，US-516）：一对根级头
 * `(ebom_root_header_id, mbom_root_header_id)`，两侧 org 相同、父件同一物料（修订可不同）；
 * 每条映射属于一个变换范围。
 */
@Entity({
  name: 'BomMapScope',
  namespace: 'bom',
  tableName: 'bom_map_scope',
  repository: 'BomRepository',
  properties: [{ name: 'orgId', type: PropertyType.string }],
  relations: [
    {
      name: 'ebomRootHeader',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'BomHeader',
      mappedProperty: 'ebomMapScopes'
    },
    {
      name: 'mbomRootHeader',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'BomHeader',
      mappedProperty: 'mbomMapScopes'
    }
  ],
  indexes: [{ name: 'scope_roots', properties: ['ebomRootHeaderId', 'mbomRootHeaderId'], unique: true }]
})
export class BomMapScope extends EntityBase {
  orgId!: string;
  ebomRootHeaderId!: string;
  mbomRootHeaderId!: string;
}

/**
 * EBOM↔MBOM 行映射（`bom$bom_map`，US-516）：逻辑行 ↔ 逻辑行多对多，六态 `relation`；
 * `added` 只能 source 为 NULL、`removed` 只能 target 为 NULL、其余四态两侧必填、不允许双 NULL
 * （单行 CHECK 兜底）；路径级映射带 `sourceLinePath`（自 EBOM 根起的逻辑行 ID 序列，只作用于
 * 那一条路径）；跟进基线存 `targetOccurrenceId` 与「到源行为止的解析步骤集合」JSON。
 */
@Entity({
  name: 'BomMap',
  namespace: 'bom',
  tableName: 'bom_map',
  repository: 'BomRepository',
  properties: [
    {
      name: 'relation',
      type: PropertyType.enum,
      enum: ['one_to_one', 'split', 'merge', 'added', 'removed', 'resequenced']
    },
    { name: 'sourceLinePath', type: PropertyType.string, nullable: true },
    { name: 'targetOccurrenceId', type: PropertyType.string, nullable: true },
    { name: 'baselineSteps', type: PropertyType.string, nullable: true }
  ],
  relations: [
    {
      name: 'scope',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'BomMapScope',
      mappedProperty: 'mappings'
    },
    {
      name: 'sourceLine',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'BomLine',
      mappedProperty: 'ebomMappings',
      nullable: true
    },
    {
      name: 'targetLine',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'BomLine',
      mappedProperty: 'mbomMappings',
      nullable: true
    }
  ]
})
export class BomMap extends EntityBase {
  relation!: 'one_to_one' | 'split' | 'merge' | 'added' | 'removed' | 'resequenced';
  sourceLinePath!: string | null;
  targetOccurrenceId!: string | null;
  baselineSteps!: string | null;
  scopeId!: string;
  sourceLineId!: string | null;
  targetLineId!: string | null;
}

/**
 * 配置特征（`bom$config_char`，US-517）：`(orgId, code)` 唯一；`required` 特征未赋值时
 * 配置不完整（AC#3）。
 */
@Entity({
  name: 'BomConfigChar',
  namespace: 'bom',
  tableName: 'config_char',
  repository: 'BomRepository',
  properties: [
    { name: 'orgId', type: PropertyType.string },
    { name: 'code', type: PropertyType.string },
    { name: 'required', type: PropertyType.boolean, default: false }
  ],
  indexes: [{ name: 'config_char_org_code', properties: ['orgId', 'code'], unique: true }]
})
export class BomConfigChar extends EntityBase {
  orgId!: string;
  code!: string;
  required!: boolean;
}

/**
 * 配置选项值（`bom$config_char_value`，US-517）：`(charId, value)` 唯一。
 */
@Entity({
  name: 'BomConfigCharValue',
  namespace: 'bom',
  tableName: 'config_char_value',
  repository: 'BomRepository',
  properties: [
    { name: 'charId', type: PropertyType.uuid },
    { name: 'value', type: PropertyType.string }
  ],
  foreignKeys: [
    {
      name: 'config_value_belongs_to_char',
      properties: ['charId'],
      mappedEntity: 'BomConfigChar',
      mappedProperties: ['id']
    }
  ],
  indexes: [{ name: 'config_char_value_char_value', properties: ['charId', 'value'], unique: true }]
})
export class BomConfigCharValue extends EntityBase {
  charId!: string;
  value!: string;
}

/**
 * 选择条件（`bom$config_condition`，US-517）：最小语法表达式文本 + 语法版本。
 * 保存期解析校验（未知特征/值/语法错误点名）；持久化版本号（升级不改旧条件含义）。
 */
@Entity({
  name: 'BomConfigCondition',
  namespace: 'bom',
  tableName: 'config_condition',
  repository: 'BomRepository',
  properties: [
    { name: 'orgId', type: PropertyType.string },
    { name: 'expression', type: PropertyType.string },
    { name: 'grammarVersion', type: PropertyType.string }
  ],
  indexes: [{ name: 'config_condition_org_id', properties: ['orgId', 'id'], unique: true }]
})
export class BomConfigCondition extends EntityBase {
  orgId!: string;
  expression!: string;
  grammarVersion!: string;
}

/**
 * 依赖约束（`bom$config_constraint`，US-517）：`exclude` 互斥 / `require` 蕴含；
 * 两侧各是一条选择条件；`(orgId, code)` 唯一；求值冲突点名约束与两侧条件（AC#2）。
 */
@Entity({
  name: 'BomConfigConstraint',
  namespace: 'bom',
  tableName: 'config_constraint',
  repository: 'BomRepository',
  properties: [
    { name: 'orgId', type: PropertyType.string },
    { name: 'code', type: PropertyType.string },
    { name: 'kind', type: PropertyType.string },
    { name: 'leftConditionId', type: PropertyType.uuid },
    { name: 'rightConditionId', type: PropertyType.uuid }
  ],
  foreignKeys: [
    {
      name: 'config_constraint_left_condition',
      properties: ['orgId', 'leftConditionId'],
      mappedEntity: 'BomConfigCondition',
      mappedProperties: ['orgId', 'id']
    },
    {
      name: 'config_constraint_right_condition',
      properties: ['orgId', 'rightConditionId'],
      mappedEntity: 'BomConfigCondition',
      mappedProperties: ['orgId', 'id']
    }
  ],
  indexes: [{ name: 'config_constraint_org_code', properties: ['orgId', 'code'], unique: true }]
})
export class BomConfigConstraint extends EntityBase {
  orgId!: string;
  code!: string;
  kind!: 'exclude' | 'require';
  leftConditionId!: string;
  rightConditionId!: string;
}

/**
 * 扩展属性声明（`bom$attr_def`，US-519）：`(code, appliesTo)` 唯一（同一 code 可跨作用域，
 * AC#6）；写入期按声明校验（枚举/必填/作用域）；过滤查询按 `data_type` 比较。
 */
@Entity({
  name: 'BomAttrDef',
  namespace: 'bom',
  tableName: 'attr_def',
  repository: 'BomRepository',
  properties: [
    { name: 'code', type: PropertyType.string },
    { name: 'dataType', type: PropertyType.string },
    { name: 'required', type: PropertyType.boolean, default: false },
    { name: 'enumValues', type: PropertyType.string, nullable: true },
    { name: 'appliesTo', type: PropertyType.string },
    { name: 'unit', type: PropertyType.string, nullable: true }
  ],
  indexes: [{ name: 'attr_def_code_applies_to', properties: ['code', 'appliesTo'], unique: true }]
})
export class BomAttrDef extends EntityBase {
  code!: string;
  dataType!: 'string' | 'number' | 'boolean' | 'date';
  required!: boolean;
  enumValues!: string | null;
  appliesTo!: 'item' | 'bom_header' | 'bom_line_occurrence';
  unit!: string | null;
}

/** BOM 实体全集（触发器安装按此清单在 schema 里找实体）。 */
export const BOM_ENTITIES = [
  BomItem,
  BomAttrDef,
  BomConfigChar,
  BomConfigCharValue,
  BomConfigCondition,
  BomConfigConstraint,
  BomItemRevision,
  BomHeader,
  BomHistoryBatch,
  BomEcn,
  BomLine,
  BomLineOccurrence,
  BomLineDesignator,
  BomSubstituteGroup,
  BomWorkCenter,
  BomActivityType,
  BomActivityRate,
  BomRouting,
  BomRoutingOperation,
  BomLineOperationSplit,
  BomMapScope,
  BomMap
] as const;
