import type { EntityType, RxDB, UUID } from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';
import {
  BomConfigChar,
  BomConfigCharValue,
  BomConfigCondition,
  BomEcn,
  BomHeader,
  BomItem,
  BomItemRevision,
  BomLine,
  BomLineOccurrence,
  BomRouting,
  BomRoutingOperation
} from '../entities.js';
import type { HistoryHeaderInput, HistoryOccurrenceInput } from '../resolve/history-loader.js';
import type { ResolutionContext } from '../resolve/resolution.js';
import type { BomViewInput } from '../view-types.js';
import { deterministicId } from './scooter-dataset.js';

/** 三端与双后端共用的固定日期；每次消费都创建独立的 Date。 */
export const BOM_VIEW_FIXTURE_DATES = {
  baseline: '2026-01-01T00:00:00.000Z',
  evaluation: '2099-01-01T00:00:00.000Z',
  future: '2099-01-02T00:00:00.000Z'
} as const;

const ROOT_KEYS = [
  'main',
  'alternative',
  'manual',
  'unit',
  'lot',
  'config',
  'formula',
  'draft',
  'performance'
] as const;
const ITEM_KEYS = [
  ...ROOT_KEYS,
  'assembly',
  'phantom',
  'resistor',
  'wire',
  'extra',
  'future',
  'replacement',
  'red',
  'blue'
] as const;
const OCCURRENCE_KEYS = [
  'repeat1',
  'repeat2',
  'repeat3',
  'shared1',
  'shared2',
  'phantom',
  'future',
  'assemblyWire',
  'phantomResistor',
  'alternative1',
  'alternative2',
  'manualPrimary',
  'manualSubstitute',
  'unitOld',
  'unitNew',
  'lot1',
  'lot2',
  'red',
  'blue',
  'formula',
  'draft',
  'draftCreated',
  'draftCycle',
  'pending',
  'quantityReplacement'
] as const;

/** 可以独立浏览的测试目标。 */
export type BomViewFixtureRoot = (typeof ROOT_KEYS)[number];
/** 测试物料的稳定业务键。 */
export type BomViewFixtureItem = (typeof ITEM_KEYS)[number];
/** 测试发生项的稳定业务键。 */
export type BomViewFixtureOccurrence = (typeof OCCURRENCE_KEYS)[number];

type InputOverrides = Partial<Omit<BomViewInput, 'context'>> & { context?: Partial<ResolutionContext> };

/** 每份装载独立持有的标识符，跨数据库同名而不共享实体实例。 */
export interface BomViewFixtureIds {
  items: Record<BomViewFixtureItem, UUID>;
  revisions: Record<BomViewFixtureItem, UUID>;
  headers: Record<BomViewFixtureRoot | 'assembly' | 'phantom', UUID>;
  occurrences: Record<BomViewFixtureOccurrence, UUID>;
  pendingEcn: UUID;
  quantityEcn: UUID;
  manualGroup: UUID;
  routing: UUID;
  draftRouting: UUID;
}

/** 真实领域写入动作，供单元测试和三个浏览器示例共同消费。 */
export interface BomViewFixtureActions {
  /** 在草稿头预留逻辑行中创建真实新发生项。 */
  createDraftOccurrence(options?: { child?: BomViewFixtureItem; qty?: string }): Promise<UUID>;
  /** 尝试创建草稿自环，原样抛出存储层的领域错误。 */
  createCycleOccurrence(): Promise<UUID>;
  /** 发布预先创建的 draft ECN，使旧结果从未引用的新行可见。 */
  publishPendingEcn(): Promise<void>;
  /** 以 ECN 替换第一条重复边，其他发生项路径保持不变。 */
  publishQuantityEcn(qty?: string, source?: 'repeat1' | 'shared1'): Promise<void>;
  /** 显式发布已编辑草稿，使其进入正常结构解析。 */
  publishDraft(): Promise<void>;
  /** 发布共享装配的下一修订，可同时改变其 phantom 默认值。 */
  publishAssemblyRevision(options?: { phantom?: boolean; qty?: string }): Promise<UUID>;
  /** 修改物料级单位换算，不触碰任何发生项。 */
  setConversion(rate: string): Promise<void>;
  /** 修改物料显示信息，不触碰结构或数量。 */
  setDescription(item: BomViewFixtureItem, description: string): Promise<void>;
}

/** 确定性三端 fixture；输入、实体与交互动作均显式绑定传入数据库。 */
export interface BomViewFixture {
  ids: BomViewFixtureIds;
  input: BomViewInput;
  inputFor(root?: BomViewFixtureRoot, overrides?: InputOverrides): BomViewInput;
  actions: BomViewFixtureActions;
}

const id = (key: string): UUID => deterministicId(`bom-view:${key}`);
const at = (key: keyof typeof BOM_VIEW_FIXTURE_DATES): Date => new Date(BOM_VIEW_FIXTURE_DATES[key]);
const keyedIds = <K extends string>(keys: readonly K[], prefix: string): Record<K, UUID> =>
  Object.fromEntries(keys.map(key => [key, id(`${prefix}:${key}`)])) as Record<K, UUID>;

const createIds = (): BomViewFixtureIds => ({
  items: keyedIds(ITEM_KEYS, 'item'),
  revisions: keyedIds(ITEM_KEYS, 'revision'),
  headers: keyedIds([...ROOT_KEYS, 'assembly', 'phantom'] as const, 'header'),
  occurrences: keyedIds(OCCURRENCE_KEYS, 'occurrence'),
  pendingEcn: id('ecn:pending'),
  quantityEcn: id('ecn:quantity'),
  manualGroup: id('group:manual'),
  routing: id('routing:main'),
  draftRouting: id('routing:draft')
});

const entity = <T extends EntityType>(
  db: RxDB,
  Entity: T,
  key: string,
  data: Partial<InstanceType<T>>
): InstanceType<T> =>
  db.entityManager.instantiate(Entity, {
    id: id(key),
    createdAt: at('baseline'),
    updatedAt: at('baseline'),
    ...data
  } as Partial<InstanceType<T>>);

const occurrenceInput = (
  ids: BomViewFixtureIds,
  key: BomViewFixtureOccurrence,
  child: BomViewFixtureItem,
  qty: string,
  overrides: Partial<HistoryOccurrenceInput> = {}
): HistoryOccurrenceInput => ({
  id: ids.occurrences[key],
  createdAt: at('baseline'),
  updatedAt: at('baseline'),
  childItemId: ids.items[child],
  qty,
  effectiveFrom: at('baseline'),
  ...overrides
});

const lineInput = (key: string, lineNo: number, occurrences: HistoryOccurrenceInput[]) => ({
  id: id(`line:${key}`),
  createdAt: at('baseline'),
  updatedAt: at('baseline'),
  lineNo,
  occurrences
});

const headerInput = (
  ids: BomViewFixtureIds,
  root: BomViewFixtureRoot | 'assembly' | 'phantom',
  lines: HistoryHeaderInput['lines'],
  overrides: Partial<HistoryHeaderInput> = {}
): HistoryHeaderInput => ({
  id: ids.headers[root],
  createdAt: at('baseline'),
  updatedAt: at('baseline'),
  revisionIndex: ITEM_KEYS.indexOf(root),
  bomType: 'ebom',
  orgId: 'bom-view-org',
  costLotQty: '1',
  lines,
  ...overrides
});

const buildHeaders = (ids: BomViewFixtureIds): HistoryHeaderInput[] => {
  const row = (
    key: BomViewFixtureOccurrence,
    child: BomViewFixtureItem,
    qty: string,
    overrides?: Partial<HistoryOccurrenceInput>
  ) => occurrenceInput(ids, key, child, qty, overrides);
  const main = [
    row('repeat1', 'resistor', '1', { operationSeq: 10 }),
    row('repeat2', 'resistor', '2'),
    row('repeat3', 'resistor', '3'),
    row('shared1', 'assembly', '1'),
    row('shared2', 'assembly', '2'),
    row('phantom', 'phantom', '1'),
    row('future', 'future', '7', { effectiveFrom: at('future') })
  ];
  return [
    headerInput(
      ids,
      'main',
      main.map((row, index) => lineInput(`main:${index}`, (index + 1) * 10, [row])),
      {
        routing: {
          id: ids.routing,
          workCenterId: id('work-center'),
          workCenterCode: 'BOM-VIEW-WC',
          operations: [10, 20].map(seq => ({ id: id(`operation:${seq}`), seq })),
          allocations: []
        }
      }
    ),
    headerInput(ids, 'assembly', [lineInput('assembly', 10, [row('assemblyWire', 'wire', '2')])]),
    headerInput(ids, 'phantom', [lineInput('phantom', 10, [row('phantomResistor', 'resistor', '4')])]),
    headerInput(ids, 'alternative', [lineInput('alternative:1', 10, [row('alternative1', 'red', '1')])]),
    headerInput(ids, 'alternative', [lineInput('alternative:2', 10, [row('alternative2', 'blue', '2')])], {
      id: id('header:alternative:2'),
      alternativeNo: 2
    }),
    headerInput(
      ids,
      'manual',
      [
        lineInput('manual:primary', 10, [row('manualPrimary', 'resistor', '4')]),
        lineInput('manual:substitute', 20, [row('manualSubstitute', 'replacement', '0')])
      ],
      {
        substituteGroups: [
          {
            id: ids.manualGroup,
            code: 'BOM-VIEW-MANUAL',
            strategy: 'manual',
            allowMix: false,
            members: [
              { occurrenceIndex: 0, role: 'primary' },
              { occurrenceIndex: 1, role: 'substitute', equivQty: '1' }
            ]
          }
        ]
      }
    ),
    headerInput(ids, 'unit', [
      lineInput('unit', 10, [
        row('unitOld', 'red', '11', { unitTo: 136 }),
        row('unitNew', 'blue', '13', { unitFrom: 137 })
      ])
    ]),
    headerInput(ids, 'lot', [
      lineInput('lot', 10, [
        row('lot1', 'red', '17', { lotCodes: '["B1"]' }),
        row('lot2', 'blue', '19', { lotCodes: '["B2"]' })
      ])
    ]),
    headerInput(ids, 'config', [
      lineInput('config:red', 10, [row('red', 'red', '23', { selectionConditionId: id('condition:red') })]),
      lineInput('config:blue', 20, [row('blue', 'blue', '29', { selectionConditionId: id('condition:blue') })])
    ]),
    headerInput(
      ids,
      'performance',
      Array.from({ length: 99 }, (_, index) =>
        lineInput(`performance:${index}`, index + 1, [
          {
            id: id(`occurrence:performance:${index}`),
            childItemId: ids.items.resistor,
            qty: '1',
            effectiveFrom: at('baseline'),
            createdAt: at('baseline'),
            updatedAt: at('baseline')
          }
        ])
      )
    ),
    headerInput(ids, 'formula', [
      lineInput('formula', 10, [
        row('formula', 'resistor', '1', { qty: null, qtyFormula: 'factor * 2', formulaGrammarVersion: '1' })
      ])
    ]),
    headerInput(
      ids,
      'main',
      [
        lineInput('main:other-org', 10, [
          {
            ...row('red', 'red', '31'),
            id: id('occurrence:other-org')
          }
        ])
      ],
      { id: id('header:other-org'), orgId: 'bom-view-other-org' }
    ),
    headerInput(
      ids,
      'main',
      [
        lineInput('main:sales', 10, [
          {
            ...row('blue', 'blue', '37'),
            id: id('occurrence:sales')
          }
        ])
      ],
      { id: id('header:sales'), bomType: 'sales' }
    )
  ];
};

const loadConfig = async (db: RxDB): Promise<void> => {
  await entity(db, BomConfigChar, 'char:color', { orgId: 'bom-view-org', code: 'COLOR' }).save();
  for (const color of ['red', 'blue']) {
    await entity(db, BomConfigCharValue, `char-value:${color}`, { charId: id('char:color'), value: color }).save();
    await entity(db, BomConfigCondition, `condition:${color}`, {
      orgId: 'bom-view-org',
      expression: `COLOR = ${color}`,
      grammarVersion: '1'
    }).save();
  }
};

const loadDraft = async (db: RxDB, ids: BomViewFixtureIds): Promise<void> => {
  await entity(db, BomRouting, 'routing:draft', {
    parentRevisionId: ids.revisions.draft,
    bomType: 'ebom',
    orgId: 'bom-view-org',
    validFrom: at('baseline')
  }).save();
  for (const seq of [10, 20]) {
    await entity(db, BomRoutingOperation, `operation:draft:${seq}`, {
      routingId: ids.draftRouting,
      workCenterId: id('work-center'),
      operationSeq: seq
    }).save();
  }
  await entity(db, BomHeader, 'header:draft', {
    parentRevisionId: ids.revisions.draft,
    bomType: 'ebom',
    orgId: 'bom-view-org',
    routingId: ids.draftRouting
  }).save();
  await entity(db, BomLine, 'line:draft', { headerId: ids.headers.draft, lineNo: 10 }).save();
  await entity(db, BomLineOccurrence, 'occurrence:draft', {
    lineId: id('line:draft'),
    childItemId: ids.items.resistor,
    qty: '2',
    effectiveFrom: at('baseline')
  }).save();
  await entity(db, BomLine, 'line:draft:new', { headerId: ids.headers.draft, lineNo: 20 }).save();
  await entity(db, BomLine, 'line:draft:cycle', { headerId: ids.headers.draft, lineNo: 30 }).save();
};

const loadPendingEcn = async (db: RxDB, ids: BomViewFixtureIds): Promise<BomEcn> => {
  const ecn = entity(db, BomEcn, 'ecn:pending', { ecnNo: 'BOM-VIEW-PENDING', effectiveDate: at('evaluation') });
  await ecn.save();
  await entity(db, BomLine, 'line:pending', {
    headerId: ids.headers.main,
    lineNo: 80,
    ecnInId: ecn.id
  }).save();
  await entity(db, BomLineOccurrence, 'occurrence:pending', {
    lineId: id('line:pending'),
    childItemId: ids.items.extra,
    qty: '5',
    effectiveFrom: at('evaluation'),
    ecnInId: ecn.id
  }).save();
  return ecn;
};

const createActions = (db: RxDB, ids: BomViewFixtureIds, pending: BomEcn): BomViewFixtureActions => ({
  async createDraftOccurrence(options = {}) {
    const occurrence = entity(db, BomLineOccurrence, 'occurrence:draftCreated', {
      lineId: id('line:draft:new'),
      childItemId: ids.items[options.child ?? 'resistor'],
      qty: options.qty ?? '3',
      effectiveFrom: at('baseline')
    });
    await occurrence.save();
    return occurrence.id;
  },
  async createCycleOccurrence() {
    const occurrence = entity(db, BomLineOccurrence, 'occurrence:draftCycle', {
      lineId: id('line:draft:cycle'),
      childItemId: ids.items.draft,
      qty: '1',
      effectiveFrom: at('baseline')
    });
    await occurrence.save();
    return occurrence.id;
  },
  async publishPendingEcn() {
    pending.state = 'released';
    await pending.save();
  },
  async publishDraft() {
    const header = await firstValueFrom(db.entityManager.getRepository(BomHeader).get(ids.headers.draft));
    header.state = 'released';
    await header.save();
  },
  async publishQuantityEcn(qty = '9', source = 'repeat1') {
    const ecn = entity(db, BomEcn, 'ecn:quantity', { ecnNo: 'BOM-VIEW-QUANTITY', effectiveDate: at('evaluation') });
    await ecn.save();
    const previous = await firstValueFrom(
      db.entityManager.getRepository(BomLineOccurrence).get(ids.occurrences[source])
    );
    previous.ecnOutId = ecn.id;
    previous.effectiveTo = at('evaluation');
    await previous.save();
    await entity(db, BomLineOccurrence, 'occurrence:quantityReplacement', {
      lineId: previous.lineId,
      childItemId: previous.childItemId,
      qty,
      operationSeq: previous.operationSeq,
      effectiveFrom: at('evaluation'),
      ecnInId: ecn.id
    }).save();
    ecn.state = 'released';
    await ecn.save();
  },
  async publishAssemblyRevision(options = {}) {
    const revision = entity(db, BomItemRevision, 'revision:assembly:B', {
      itemId: ids.items.assembly,
      revisionNo: 'B',
      effectiveFrom: at('evaluation'),
      defaultPhantom: options.phantom ?? false
    });
    await revision.save();
    const header = entity(db, BomHeader, 'header:assembly:B', {
      parentRevisionId: revision.id,
      bomType: 'ebom',
      orgId: 'bom-view-org',
      costLotQty: '1'
    });
    await header.save();
    await entity(db, BomLine, 'line:assembly:B', { headerId: header.id, lineNo: 10 }).save();
    await entity(db, BomLineOccurrence, 'occurrence:assembly:B', {
      lineId: id('line:assembly:B'),
      childItemId: ids.items.wire,
      qty: options.qty ?? '6',
      effectiveFrom: at('baseline')
    }).save();
    header.state = 'released';
    await header.save();
    revision.state = 'released';
    await revision.save();
    return revision.id;
  },
  async setConversion(rate) {
    const item = await firstValueFrom(db.entityManager.getRepository(BomItem).get(ids.items.wire));
    item.uomConversion = rate;
    await item.save();
  },
  async setDescription(key, description) {
    const item = await firstValueFrom(db.entityManager.getRepository(BomItem).get(ids.items[key]));
    item.description = description;
    await item.save();
  }
});

/**
 * 装载三框架共用的完整视图数据与真实写入动作。
 *
 * @param db - 已安装 BOM 插件并连接本地适配器的独立数据库
 * @returns 多重边、共享路径、草稿、候选与依赖变更所需输入和标识符
 */
export const loadBomViewFixture = async (db: RxDB): Promise<BomViewFixture> => {
  const ids = createIds();
  for (const key of ITEM_KEYS) {
    await entity(db, BomItem, `item:${key}`, {
      itemNo: `BOM-VIEW-${key.toUpperCase()}`,
      description: key,
      stockUom: key === 'wire' ? 'm' : 'pcs',
      uomDecimals: key === 'wire' ? 2 : 0,
      uomConversion: key === 'wire' ? '2' : null,
      unitPrice: ROOT_KEYS.includes(key as BomViewFixtureRoot) || key === 'assembly' || key === 'phantom' ? null : '1',
      priceUom: key === 'wire' ? 'm' : 'pcs',
      priceCurrency: 'CNY'
    }).save();
  }
  await loadConfig(db);
  await db.bom.loadHistory({
    batchNo: 'bom-view-fixture',
    id: id('batch'),
    createdAt: at('baseline'),
    updatedAt: at('baseline'),
    revisions: ITEM_KEYS.map(key => ({
      id: ids.revisions[key],
      itemId: ids.items[key],
      revisionNo: 'A',
      effectiveFrom: at('baseline'),
      defaultPhantom: key === 'phantom',
      createdAt: at('baseline'),
      updatedAt: at('baseline')
    })),
    headers: buildHeaders(ids)
  });
  await loadDraft(db, ids);
  const pending = await loadPendingEcn(db, ids);
  const inputFor = (root: BomViewFixtureRoot = 'main', overrides: InputOverrides = {}): BomViewInput => ({
    target: { parentItemId: ids.items[root] },
    plannedQty: { value: '1', uom: 'pcs' },
    params: { factor: '2' },
    ...overrides,
    context: { bomType: 'ebom', orgId: 'bom-view-org', asOfDate: at('evaluation'), ...overrides.context }
  });
  return { ids, input: inputFor(), inputFor, actions: createActions(db, ids, pending) };
};
