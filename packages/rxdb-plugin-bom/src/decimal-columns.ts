/**
 * @fileoverview BOM 十进制列登记（US-511 十进制值合同的唯一真相源）
 *
 * 一张表登记全部按十进制值合同存取的列：列名、存储层域（同名列在不同实体上同域）、所在实体，
 * 以及存储层由谁判定格式。三处消费方都从本表派生，不再各自手写清单：
 * - 入口规范化与判域（write-rules 的 `DECIMAL_FIELD_DOMAINS`）；
 * - 存储层格式触发器（backend 按实体取列，可空性取自实体元数据）与正数域触发器（按域取列）；
 * - 导入契约的十进制字段（import-contract 的 `DECIMAL_FIELDS`，按导入记录层的实体取列）。
 */

import type { EntityType } from '@aiao/rxdb';
import {
  BomActivityRate,
  BomHeader,
  BomItem,
  BomLineOccurrence,
  BomLineOperationSplit,
  BomRoutingOperation,
  BomWorkCenter
} from './entities.js';

/**
 * 一列十进制值的域：规范串即可、阶梯边界、[0,1] 九位小数、随损耗记法的良率制 [0,1)，或正数
 * （比例与分母上 0 没有合法含义；规范串里零只有 `0` 一种写法，「> 0」即逐字节谓词 `s <> '0'`）。
 */
export type DecimalDomain =
  | { kind: 'canonical' }
  | { kind: 'lotsize' }
  | { kind: 'fraction'; label: string }
  | { kind: 'scrap'; convention: string }
  | { kind: 'positive'; label: string };

/** 一个十进制列名的登记项。 */
export interface DecimalColumn {
  /** 列名（同名列在各实体上同域）。 */
  readonly field: string;
  /** 存储层域（入口与存储层同口径判定）。 */
  readonly domain: DecimalDomain;
  /** 承载该列的实体。 */
  readonly entities: readonly EntityType[];
  /**
   * 存储层格式由谁判定：`canonical` 走规范串格式触发器；`share` 由联产守卫的份额谓词判定
   * （规范串 ∩ [0,1] ∩ 小数至多 9 位，见 coproduct-trigger-ddl）。
   */
  readonly storage: 'canonical' | 'share';
}

const CANONICAL: DecimalDomain = { kind: 'canonical' };

/**
 * 全部十进制列（登记序即入口判域序与各实体格式触发器的安装序；同一实体上的列按此序先违约者先报）。
 */
export const DECIMAL_COLUMNS: readonly DecimalColumn[] = [
  {
    field: 'jointCostShare',
    domain: { kind: 'fraction', label: '联产成本份额' },
    entities: [BomHeader, BomLineOccurrence],
    storage: 'share'
  },
  { field: 'qty', domain: CANONICAL, entities: [BomLineOccurrence], storage: 'canonical' },
  // 头基准量是按批缩放的分母（q × P' ÷ base_qty）
  { field: 'baseQty', domain: { kind: 'positive', label: '头基准量' }, entities: [BomHeader], storage: 'canonical' },
  {
    field: 'assemblyScrap',
    domain: { kind: 'scrap', convention: 'assemblyScrapConvention' },
    entities: [BomHeader],
    storage: 'canonical'
  },
  {
    field: 'componentScrap',
    domain: { kind: 'scrap', convention: 'componentScrapConvention' },
    entities: [BomLineOccurrence],
    storage: 'canonical'
  },
  { field: 'componentScrapFixed', domain: CANONICAL, entities: [BomLineOccurrence], storage: 'canonical' },
  { field: 'lotsizeFrom', domain: { kind: 'lotsize' }, entities: [BomLineOccurrence], storage: 'canonical' },
  { field: 'lotsizeTo', domain: { kind: 'lotsize' }, entities: [BomLineOccurrence], storage: 'canonical' },
  // 换算率是比例（1 目标单位含多少库存单位），行级与物料级同域
  {
    field: 'uomConversion',
    domain: { kind: 'positive', label: '换算率' },
    entities: [BomLineOccurrence, BomItem],
    storage: 'canonical'
  },
  // 标准成本批量是 unit_cost 的分母（batch_cost ÷ cost_lot_qty）
  {
    field: 'costLotQty',
    domain: { kind: 'positive', label: '标准成本批量' },
    entities: [BomHeader],
    storage: 'canonical'
  },
  { field: 'unitPrice', domain: CANONICAL, entities: [BomItem], storage: 'canonical' },
  { field: 'creditPrice', domain: CANONICAL, entities: [BomItem], storage: 'canonical' },
  {
    field: 'ratio',
    domain: { kind: 'fraction', label: '分摊比例' },
    entities: [BomLineOperationSplit],
    storage: 'canonical'
  },
  {
    field: 'usageProbability',
    domain: { kind: 'fraction', label: '替代概率' },
    entities: [BomLineOccurrence],
    storage: 'canonical'
  },
  { field: 'equivQty', domain: CANONICAL, entities: [BomLineOccurrence], storage: 'canonical' },
  { field: 'setupTime', domain: CANONICAL, entities: [BomRoutingOperation], storage: 'canonical' },
  { field: 'runTime', domain: CANONICAL, entities: [BomRoutingOperation], storage: 'canonical' },
  { field: 'fixedTime', domain: CANONICAL, entities: [BomRoutingOperation], storage: 'canonical' },
  {
    field: 'operationScrap',
    domain: { kind: 'scrap', convention: 'scrapConvention' },
    entities: [BomRoutingOperation],
    storage: 'canonical'
  },
  { field: 'overheadRate', domain: CANONICAL, entities: [BomWorkCenter], storage: 'canonical' },
  { field: 'rate', domain: CANONICAL, entities: [BomActivityRate], storage: 'canonical' }
];
