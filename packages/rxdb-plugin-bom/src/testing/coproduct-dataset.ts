import { BomItem } from '../entities.js';
import type { BomLocalAdapter } from '../resolve/bom-adapter.js';
import { normalizeExtValue } from '../resolve/ext-attr.js';
import { loadHistory } from '../resolve/history-api.js';
import { deterministicId } from './scooter-dataset.js';
import { goldenItemId } from './scooter-golden.js';

/** 可按需追加的固定联产场景，不改变SC-100默认种子与原验收行数。 */
export const COPRODUCT_DATASET = {
  batchNo: 'bom-coproduct-demo',
  timestamp: '2026-01-01T00:00:00.000Z',
  orgId: 'org-x',
  primaryKey: 'JOINT-MAIN',
  coproductKey: 'JOINT-CO',
  rawKey: 'JOINT-RAW',
  consumerKey: 'JOINT-CONSUMER',
  ids: {
    primaryItemId: goldenItemId('JOINT-MAIN'),
    primaryRevisionId: deterministicId('coproduct:revision:JOINT-MAIN:A'),
    producerHeaderId: deterministicId('coproduct:header:JOINT-MAIN'),
    coproductItemId: goldenItemId('JOINT-CO'),
    coproductRevisionId: deterministicId('coproduct:revision:JOINT-CO:A'),
    consumerItemId: goldenItemId('JOINT-CONSUMER'),
    consumerRevisionId: deterministicId('coproduct:revision:JOINT-CONSUMER:A'),
    consumerHeaderId: deterministicId('coproduct:header:JOINT-CONSUMER')
  }
} as const;

/** 手写联合成本与下游消费golden，不由被测kernel反算。 */
export const COPRODUCT_GOLDEN = {
  netCost: '220',
  primaryBatchCost: '132',
  primaryUnitCost: '1.32',
  coproductQty: '50',
  coproductBatchCost: '88',
  coproductUnitCost: '1.76',
  consumerBatchCost: '17.6'
} as const;

/**
 * 显式装载固定联产与下游数据，仅由调用方按需执行。
 *
 * @param adapter - 已连接并安装BOM插件的本地适配器
 * @param options - 显式提供全部演示物料的扩展属性，仍按目标库字典验证
 * @returns 可显式选择成本来源的确定性标识符
 */
export const loadCoproductDataset = async (
  adapter: BomLocalAdapter,
  options: { itemExt?: Readonly<Record<string, unknown>> } = {}
): Promise<typeof COPRODUCT_DATASET.ids> => {
  const manager = adapter.rxdb?.entityManager;
  if (manager === undefined) throw new Error('联产演示种子需要显式实体构造门面');
  const { ids } = COPRODUCT_DATASET;
  const ext = options.itemExt === undefined ? null : normalizeExtValue(options.itemExt);
  const timestamp = (): Date => new Date(COPRODUCT_DATASET.timestamp);
  const keys = [
    COPRODUCT_DATASET.primaryKey,
    COPRODUCT_DATASET.rawKey,
    COPRODUCT_DATASET.coproductKey,
    COPRODUCT_DATASET.consumerKey
  ];
  const revisionIds = [
    ids.primaryRevisionId,
    deterministicId('coproduct:revision:JOINT-RAW:A'),
    ids.coproductRevisionId,
    ids.consumerRevisionId
  ];
  for (const key of keys) {
    const item = manager.instantiate(BomItem, {
      id: goldenItemId(key),
      itemNo: key,
      stockUom: 'kg',
      uomDecimals: 9,
      unitPrice: key === COPRODUCT_DATASET.rawKey ? '2' : null,
      priceUom: 'kg',
      priceCurrency: 'CNY',
      ext,
      createdAt: timestamp(),
      updatedAt: timestamp()
    });
    await item.save();
  }
  const line = (key: string, lineNo: number, childKey: string, revisionId: string, qty: string, produce = false) => ({
    id: deterministicId(`coproduct:line:${key}:${lineNo}`),
    lineNo,
    createdAt: timestamp(),
    updatedAt: timestamp(),
    occurrences: [
      {
        id: deterministicId(`coproduct:occurrence:${key}:${lineNo}`),
        childItemId: goldenItemId(childKey),
        childRevisionId: revisionId,
        qty,
        uom: 'kg',
        effectiveFrom: timestamp(),
        createdAt: timestamp(),
        updatedAt: timestamp(),
        flowDirection: produce ? ('produce' as const) : ('consume' as const),
        jointCostShare: produce ? '0.4' : null
      }
    ]
  });
  await loadHistory(adapter, {
    id: deterministicId('coproduct:batch'),
    batchNo: COPRODUCT_DATASET.batchNo,
    createdAt: timestamp(),
    updatedAt: timestamp(),
    revisions: keys.map((key, index) => ({
      id: revisionIds[index],
      itemId: goldenItemId(key),
      revisionNo: 'A',
      effectiveFrom: timestamp(),
      createdAt: timestamp(),
      updatedAt: timestamp()
    })),
    headers: [
      {
        id: ids.producerHeaderId,
        revisionIndex: 0,
        bomType: 'ebom',
        orgId: COPRODUCT_DATASET.orgId,
        baseUom: 'kg',
        baseQty: '100',
        costLotQty: '100',
        jointCostShare: '0.6',
        createdAt: timestamp(),
        updatedAt: timestamp(),
        lines: [
          line('producer', 10, COPRODUCT_DATASET.rawKey, revisionIds[1], '110'),
          line('producer', 20, COPRODUCT_DATASET.coproductKey, ids.coproductRevisionId, '50', true)
        ]
      },
      {
        id: ids.consumerHeaderId,
        revisionIndex: 3,
        bomType: 'ebom',
        orgId: COPRODUCT_DATASET.orgId,
        baseUom: 'kg',
        baseQty: '1',
        costLotQty: '1',
        createdAt: timestamp(),
        updatedAt: timestamp(),
        lines: [line('consumer', 10, COPRODUCT_DATASET.coproductKey, ids.coproductRevisionId, '10')]
      }
    ]
  });
  return ids;
};
