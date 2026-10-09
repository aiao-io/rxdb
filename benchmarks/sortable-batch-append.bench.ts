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
 * 另量 SC-004 的第二条判据：在已有 {@link SINGLE_TREE_SIZE} 行的树里新建单个节点（不写排序键）的 `save()`。
 *
 * ## 门槛
 *
 * 两条，任一不满足即 `process.exit(1)`（两条都先打印完再退出）：
 *  • 10,000 行一档 `append / explicit` 的中位数比值超过 {@link MAX_RATIO}。两种写法在同一次运行、
 *    同一台机器上自比，不需要冻结跨机器的参考档。每档先跑 {@link WARMUP} 轮不计入的预热，
 *    计入的各轮交替两种写法的先后，避免「explicit 恒在前」把 JIT / 缓存的预热红利全给 append；
 *  • 单节点新建的中位数超过 {@link MAX_SINGLE_MS}（constitution 默认预算）。
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
const WARMUP = 1;
const MAX_RATIO = 1.2;
const SINGLE_TREE_SIZE = 1_000;
const SINGLE_SAMPLES = 20;
const MAX_SINGLE_MS = 100;
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
  for (let round = 0; round < WARMUP + SAMPLES; round++) {
    const order: Mode[] = round % 2 === 0 ? ['explicit', 'append'] : ['append', 'explicit'];
    for (const mode of order) {
      const result = await sample(size, mode);
      if (round < WARMUP) continue;
      (mode === 'explicit' ? explicit : append).push(result.ms);
      groups = result.groups;
    }
  }
  const explicitMs = median(explicit);
  const appendMs = median(append);
  return { size, groups, explicitMs, appendMs, ratio: appendMs / explicitMs };
}

/**
 * 单节点新建：先以缺键追加建好一棵 {@link SINGLE_TREE_SIZE} 行的树，再逐个新建子节点（父节点随机取自树里的行），
 * 计时窗口只包住一次 `save()`
 *
 * @returns 各样本耗时的中位数（ms），首个样本作预热不计入
 */
async function measureSingleCreate(): Promise<number> {
  const rxdb = await createBenchRxDB();
  const { nodes } = buildTree(SINGLE_TREE_SIZE, 'append');
  await rxdb.entityManager.saveMany(nodes);
  const random = seeded(SEED + 1);
  const samples: number[] = [];
  for (let index = 0; index <= SINGLE_SAMPLES; index++) {
    const node = new BenchNode();
    node.title = `single-${index}`;
    node.parentId = nodes[Math.floor(random() * nodes.length)].id;
    const start = performance.now();
    await node.save();
    if (index > 0) samples.push(performance.now() - start);
  }
  await rxdb.disconnectAll();
  return median(samples);
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
  `[bench:sortable-batch] ${WARMUP} warmup + ${SAMPLES} samples per mode, seed ${SEED}, ` +
    `gate ratio ≤ ${MAX_RATIO} at n=${GATED_SIZE}, single create p50 ≤ ${MAX_SINGLE_MS}ms`
);
const results: SizeResult[] = [];
for (const size of SIZES) {
  const result = await measure(size);
  printResult(result);
  results.push(result);
}

const singleMs = await measureSingleCreate();
console.log(`[bench:sortable-batch] single create in ${SINGLE_TREE_SIZE}-row tree p50=${singleMs.toFixed(1)}ms`);

const gated = results.find(result => result.size === GATED_SIZE);
if (!gated) throw new Error(`[bench:sortable-batch] 没有 n=${GATED_SIZE} 的结果`);
const failures: string[] = [];
if (gated.ratio > MAX_RATIO) {
  failures.push(`n=${GATED_SIZE} 时缺键追加是显式键的 ${gated.ratio.toFixed(2)} 倍，超过 ${MAX_RATIO}`);
}
if (singleMs > MAX_SINGLE_MS) {
  failures.push(`单节点新建 p50=${singleMs.toFixed(1)}ms，超过 ${MAX_SINGLE_MS}ms`);
}
for (const failure of failures) console.error(`[bench:sortable-batch] FAIL：${failure}`);
if (failures.length > 0) process.exit(1);
console.log(
  `[bench:sortable-batch] PASS：n=${GATED_SIZE} ratio=${gated.ratio.toFixed(2)} ≤ ${MAX_RATIO}，` +
    `single create p50=${singleMs.toFixed(1)}ms ≤ ${MAX_SINGLE_MS}ms`
);
