/**
 * @fileoverview 手动排序的批内追加基准（US-031 阶段 A）。
 *
 * 量同一批行经 `entityManager.saveMany` 一次提交的耗时，两种写法：
 *  • `explicit` — 每行带调用方算好的排序键（三端 demo 改造前的写法）；
 *  • `append`   — 不写排序键，由引擎在事务内按组追加（`appendBatchSortOrders`）。
 *
 * 造树方式复刻 demo 的 `generateBatchMenus`：父节点随机取自根与本批已建节点，深度上限 7，
 * 固定种子保证每次运行是同一棵树。这样的树里绝大多数分组字段指向本批新建的父行，
 * 组数约为行数的四成——正是逐组读尾键与线性拆分会放大的场景。
 *
 * ## 门槛
 *
 * 10,000 行一档 `append / explicit` 的中位数比值超过 {@link MAX_RATIO} 即 `process.exit(1)`。
 * 两种写法在同一次运行、同一台机器上自比，不需要冻结跨机器的参考档。
 *
 * Run:
 *   node --experimental-strip-types benchmarks/sortable-batch-append.bench.ts
 *   # 或：
 *   pnpm nx run benchmarks:bench-sortable-batch
 *
 * @see `specs/008-us031-sortable-tree-entities/contracts/core-batch-append.md`
 * @see `specs/008-us031-sortable-tree-entities/research.md` R3 / R5
 */

import { Entity, EntityBase, OnDeleteAction, PropertyType, RelationKind, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { generateKeyBetween } from '@aiao/utils';

import { median } from './bench-stats.ts';

const LOCAL_ADAPTER = 'pglite';
const SIZES = [1_000, 10_000] as const;
const GATED_SIZE = 10_000;
const SAMPLES = 5;
const MAX_RATIO = 1.2;
const MAX_DEPTH = 7;
const SEED = 42;

// ---------------------------------------------------------------------------
// 实体：按 parentId 分组的可排序自引用节点，专用于本基准
// ---------------------------------------------------------------------------

/**
 * 与三端 demo 的可排序树实体同一种分组形态：多对一自引用外键 `parentId` 作分组字段。
 *
 * @remarks
 * 不用装饰器语法：`node --experimental-strip-types` 只剥类型、不转译装饰器，
 * `Entity(options)(Class)` 与 `@Entity(options) class {}` 在运行时等价（同 `push-receipts.bench.ts`）。
 */
class BenchNodeBase extends EntityBase {
  title!: string;
  sortOrder!: string;
  parentId?: string | null;
}
const BenchNode = Entity({
  name: 'BenchSortableNode',
  tableName: 'bench_sortable_node',
  manualOrder: { groupBy: ['parentId'] },
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'sortOrder', type: PropertyType.string }
  ],
  relations: [
    {
      name: 'parent',
      columnName: 'parentId',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'BenchSortableNode',
      mappedProperty: 'children',
      nullable: true,
      onDelete: OnDeleteAction.CASCADE
    },
    {
      name: 'children',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'BenchSortableNode',
      mappedProperty: 'parent'
    }
  ]
})(BenchNodeBase);

type Mode = 'explicit' | 'append';

interface SizeResult {
  readonly size: number;
  readonly groups: number;
  readonly explicitMs: number;
  readonly appendMs: number;
  readonly ratio: number;
}

/** 线性同余发生器：同一种子每次给出同一串数，两种写法造出同一棵树 */
const seeded = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

/**
 * 复刻 demo `generateBatchMenus` 造一棵随机树
 *
 * @returns 本批全部节点与其中不同父节点（组）的个数
 */
function buildTree(size: number, mode: Mode): { nodes: BenchNodeBase[]; groups: number } {
  const random = seeded(SEED);
  const parentIds: (string | null)[] = [null];
  const depths = new Map<string | null, number>([[null, 0]]);
  const lastKeys = new Map<string | null, string | null>();
  const nodes: BenchNodeBase[] = [];
  for (let index = 0; index < size; index++) {
    let parentId = parentIds[Math.floor(random() * parentIds.length)];
    let depth = depths.get(parentId) ?? 0;
    if (depth >= MAX_DEPTH) {
      parentId = null;
      depth = 0;
    }
    const node = new BenchNode();
    node.title = `bench-${index}`;
    if (parentId !== null) node.parentId = parentId;
    if (mode === 'explicit') {
      const key = generateKeyBetween(lastKeys.get(parentId) ?? null, null);
      lastKeys.set(parentId, key);
      node.sortOrder = key;
    }
    nodes.push(node);
    depths.set(node.id, depth + 1);
    parentIds.push(node.id);
  }
  return { nodes, groups: new Set(nodes.map(node => node.parentId ?? null)).size };
}

async function createBenchRxDB(): Promise<RxDB> {
  const rxdb = new RxDB({
    dbName: `bench-sortable-batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    context: { userId: 'bench' },
    entities: [BenchNode],
    sync: { type: SyncType.None, local: { adapter: LOCAL_ADAPTER } }
  });
  rxdb.adapter(LOCAL_ADAPTER, async db => new RxDBAdapterPGlite(db, { store: 'memory' }));
  await rxdb.connect(LOCAL_ADAPTER);
  return rxdb;
}

/** 一个样本：新库、计时窗口只包住一次 `saveMany` */
async function sample(size: number, mode: Mode): Promise<{ ms: number; groups: number }> {
  const rxdb = await createBenchRxDB();
  const { nodes, groups } = buildTree(size, mode);
  const start = performance.now();
  await rxdb.entityManager.saveMany(nodes);
  const ms = performance.now() - start;
  await rxdb.disconnectAll();
  return { ms, groups };
}

async function measure(size: number): Promise<SizeResult> {
  const explicit: number[] = [];
  const append: number[] = [];
  let groups = 0;
  for (let round = 0; round < SAMPLES; round++) {
    explicit.push((await sample(size, 'explicit')).ms);
    const appended = await sample(size, 'append');
    append.push(appended.ms);
    groups = appended.groups;
  }
  const explicitMs = median(explicit);
  const appendMs = median(append);
  return { size, groups, explicitMs, appendMs, ratio: appendMs / explicitMs };
}

const printResult = (result: SizeResult): void => {
  console.log(
    `[bench:sortable-batch] n=${result.size} groups=${result.groups} ` +
      `explicit p50=${result.explicitMs.toFixed(1)}ms append p50=${result.appendMs.toFixed(1)}ms ` +
      `ratio=${result.ratio.toFixed(2)}`
  );
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log(
  `[bench:sortable-batch] ${SAMPLES} samples per mode, seed ${SEED}, gate ratio ≤ ${MAX_RATIO} at n=${GATED_SIZE}`
);
const results: SizeResult[] = [];
for (const size of SIZES) {
  const result = await measure(size);
  printResult(result);
  results.push(result);
}

const gated = results.find(result => result.size === GATED_SIZE);
if (!gated) throw new Error(`[bench:sortable-batch] 没有 n=${GATED_SIZE} 的结果`);
if (gated.ratio > MAX_RATIO) {
  console.error(
    `[bench:sortable-batch] FAIL：n=${GATED_SIZE} 时缺键追加是显式键的 ${gated.ratio.toFixed(2)} 倍，超过 ${MAX_RATIO}`
  );
  process.exit(1);
}
console.log(`[bench:sortable-batch] PASS：n=${GATED_SIZE} ratio=${gated.ratio.toFixed(2)} ≤ ${MAX_RATIO}`);
