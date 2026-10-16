/**
 * @fileoverview 建只读快照：另开一个只读 RxDB 实例，把主库的业务表与增量搬进去（US-313）。
 *
 * @remarks
 * 快照实例在主库事务之外先连好（建表、初始行都在那一步），主库只开一笔事务：
 * 在同一个事务里算增量、按页读出业务表，读一页往快照库写一页。行与增量因此对应同一个时刻。
 *
 * 快照库的写不解密也不加密：加密列按信封原样搬，快照实例与主实例共用一个密钥环。
 */

import type {
  EntityType,
  IRxDBAdapter,
  LocalRxDBAdapter,
  MigrationType,
  SwitchVersionActions,
  TransactionExecutor,
  WorktreeSnapshotCursor,
  WorktreeSnapshotPage
} from '@aiao/rxdb';
import {
  cloneEntityClasses,
  getEntityMetadata,
  parseRxDBChangeKey,
  RxDB,
  RxDBBranch,
  RxDBChange,
  SyncType
} from '@aiao/rxdb';
import { compute_switch_branch_actions, get_branch_max_change } from '@aiao/rxdb-plugin-history';
import { firstValueFrom } from 'rxjs';
import { createCommitWriteContext } from '../commit/commit-context.js';
import { createReadOnlyCaptureHook } from './read-only-capture-hook.js';
import { commitViewActions, planCommitView } from './worktree-commit-view.js';
import { worktreeEntityOf } from './worktree-entities.js';
import { WorktreeUnavailableError } from './worktree-errors.js';
import type { WorktreeOptions } from './worktree-options.js';
import { isWorktreeCommitTarget, type WorktreeTarget } from './worktree-target.js';

/** 每页读多少行：页越大事务里攒的行越多，越小来回越多。 */
const SNAPSHOT_PAGE_SIZE = 500;

/** 快照实例连上的那一刻，主库停在哪。 */
export interface WorktreeSnapshotSource {
  /** 建快照时的 active 分支 */
  readonly sourceBranchId: string;
  /** active 分支停在哪条变更上；没有自有变更时为 `null` */
  readonly sourceChangeId: number | null;
  /** 分支视图里目标分支停在哪条变更上；没有自有变更、或提交视图时为 `null` */
  readonly targetChangeId: number | null;
}

/**
 * 主库适配器读得出快照页吗。
 *
 * @param adapter - 主库适配器
 * @throws {@link WorktreeUnavailableError} `unsupported_adapter`
 */
export const assertSnapshotSource = (adapter: LocalRxDBAdapter): void => {
  if (typeof adapter.readWorktreeSnapshotPage === 'function') return;
  throw new WorktreeUnavailableError('unsupported_adapter', `主库的适配器 ${adapter.name} 读不出快照页`);
};

/** 快照库要的原语；`setWorkingTreeCaptureHook` 是本地适配器基类的成员，装只读钩子用。 */
const SNAPSHOT_TARGET_METHODS = [
  'importWorktreeSnapshot',
  'adoptWorktreeEncryption',
  'sealWorktreeReadOnly',
  'dropStorage',
  'canDropStorage',
  'setWorkingTreeCaptureHook'
] as const;

/**
 * 快照库的适配器写得进快照、封得住、按当前配置删得掉吗；是就收窄成本地适配器。
 *
 * @remarks
 * 「删得掉」只问配置（`canDropStorage()`），在连接之前问：建得出却删不掉的快照库关闭时抛错、之后每次回收都报错，
 * 而先删一次来试会删掉还没验明身份的库。
 */
const asSnapshotTarget = (adapter: IRxDBAdapter): LocalRxDBAdapter => {
  const missing = SNAPSHOT_TARGET_METHODS.filter(method => typeof Reflect.get(adapter, method) !== 'function');
  if (missing.length > 0) {
    throw new WorktreeUnavailableError(
      'unsupported_adapter',
      `快照库的适配器 ${adapter.name} 没有 ${missing.join(' / ')}`
    );
  }
  const target = adapter as LocalRxDBAdapter;
  if (!target.canDropStorage!()) {
    throw new WorktreeUnavailableError(
      'unsupported_adapter',
      `快照库的适配器 ${adapter.name} 按当前配置删不掉自己的存储，建出来的快照库关闭时回收不了`
    );
  }
  return target;
};

/**
 * 只在快照库上登记的标记迁移。
 *
 * @remarks
 * 新库上配置的迁移只写成水位、`up()` 不跑；已有的库上没登记过的迁移会跑 `up()`。
 * 快照实例真连到了主库（或任何一个已有的库）上，这里就在连接时抛错，整笔迁移事务回滚，那个库一行都不变。
 */
const snapshotMarkerMigration = (dbName: string): MigrationType => ({
  name: `worktree-snapshot:${dbName}`,
  up: async () => {
    throw new WorktreeUnavailableError(
      'adapter_mismatch',
      `快照实例 ${dbName} 连到了一个已有的库上：worktrees.adapter 要按 db.config.dbName 给每个检出位单独的存储`
    );
  },
  down: async () => undefined
});

/**
 * 造快照实例：克隆的实体类、全部本地、只读。
 *
 * @param mainAdapter - 主库适配器；快照库必须是同一种后端，并沿用它的密钥环
 * @param dbName - 快照库的逻辑库名
 * @param declared - 要克隆的实体类（主实例上的）
 * @param options - 插件的 `worktrees` 选项
 * @returns 未连接的快照实例
 */
export const createSnapshotDatabase = (
  mainAdapter: LocalRxDBAdapter,
  dbName: string,
  declared: readonly EntityType[],
  options: WorktreeOptions
): RxDB => {
  const entities = cloneEntityClasses([...declared], { log: false });
  const sync = { local: { adapter: mainAdapter.name }, type: SyncType.None } as const;
  const snapshot = new RxDB({
    dbName,
    entities,
    multiInstance: false,
    readOnly: true,
    sync,
    syncOverrides: entities.map(entity => ({ entity, sync })),
    migrations: [snapshotMarkerMigration(dbName)]
  });
  snapshot.adapter(mainAdapter.name, async db => {
    const adapter = await options.adapter(db);
    if (adapter.name !== mainAdapter.name) {
      throw new WorktreeUnavailableError(
        'adapter_mismatch',
        `快照库的适配器是 ${adapter.name}，主库是 ${mainAdapter.name}：存储形态的行只能在同一种后端之间搬`
      );
    }
    asSnapshotTarget(adapter).adoptWorktreeEncryption!(mainAdapter);
    return adapter;
  });
  for (const plugin of options.plugins ?? []) snapshot.use(plugin);
  return snapshot;
};

/**
 * 连上快照实例，交回它的本地适配器。
 *
 * @param snapshot - {@link createSnapshotDatabase} 造的实例
 * @returns 快照库适配器
 */
export const connectSnapshotDatabase = async (snapshot: RxDB): Promise<LocalRxDBAdapter> => {
  await snapshot.connect(snapshot.config.sync.local!.adapter);
  return firstValueFrom(snapshot.localAdapter$);
};

/**
 * 在主库的一个事务里算增量、按页读出业务表，写进快照库。
 *
 * @param executor - 主库事务的执行器
 * @param mainAdapter - 主库适配器
 * @param snapshot - 已连接的快照实例
 * @param copied - 要复制的表（主实例上的实体类）
 * @param target - 检出位的 HEAD
 * @returns 主库此刻停在哪
 * @throws {@link WorktreeUnavailableError} 主库没有 active 分支；提交视图在这个事务里不可达或不兼容了
 */
export const importSnapshot = async (
  executor: TransactionExecutor,
  mainAdapter: LocalRxDBAdapter,
  snapshot: RxDB,
  copied: readonly EntityType[],
  target: WorktreeTarget
): Promise<WorktreeSnapshotSource> => {
  const changeRepository = executor.getRepository(RxDBChange);
  const [active] = await executor.getRepository(RxDBBranch).find({
    where: { combinator: 'and', rules: [{ field: 'activated', operator: '=', value: true }] },
    limit: 1
  });
  if (!active) throw new WorktreeUnavailableError('branch_not_found', '主库没有 active 分支');
  const actions = await deltaOf(executor, mainAdapter, active.id, target);
  const snapshotAdapter = await firstValueFrom(snapshot.localAdapter$);
  await snapshotAdapter.importWorktreeSnapshot!({
    tables: copied.map(EntityClass => ({
      EntityType: worktreeEntityOf(snapshot, EntityClass),
      pages: readPages(mainAdapter, executor, EntityClass)
    })),
    actions: onlyCopied(actions, copied)
  });
  return {
    sourceBranchId: active.id,
    sourceChangeId: (await get_branch_max_change(changeRepository, active.id))?.id ?? null,
    targetChangeId:
      isWorktreeCommitTarget(target) ? null : (
        ((await get_branch_max_change(changeRepository, target.branchId))?.id ?? null)
      )
  };
};

/**
 * 叠在当前分支快照上的增量。
 *
 * @remarks
 * 分支视图与切分支同一口径（active tip → 目标 tip）；提交视图从当前数据往回推（见 `worktree-commit-view.ts`），
 * 可达路径在这个事务里重新算：登记之后 HEAD 可能又前进了。
 */
const deltaOf = async (
  executor: TransactionExecutor,
  mainAdapter: LocalRxDBAdapter,
  activeBranchId: string,
  target: WorktreeTarget
): Promise<SwitchVersionActions> => {
  if (isWorktreeCommitTarget(target)) {
    const { codec } = createCommitWriteContext(mainAdapter);
    return commitViewActions(executor, codec, await planCommitView(executor, codec, target.commitId));
  }
  if (target.branchId === activeBranchId) return emptyActions();
  return compute_switch_branch_actions(
    { branchRepository: executor.getRepository(RxDBBranch), changeRepository: executor.getRepository(RxDBChange) },
    target.branchId
  );
};

/**
 * 建完之后把快照库封成只读：引擎封印，再装只读捕获钩子。
 *
 * @param adapter - 快照库适配器
 */
export const sealSnapshot = async (adapter: LocalRxDBAdapter): Promise<void> => {
  await adapter.sealWorktreeReadOnly!();
  adapter.setWorkingTreeCaptureHook(createReadOnlyCaptureHook());
};

async function* readPages(
  adapter: LocalRxDBAdapter,
  executor: TransactionExecutor,
  EntityClass: EntityType
): AsyncIterable<WorktreeSnapshotPage> {
  let after: WorktreeSnapshotCursor | null = null;
  do {
    const page = await adapter.readWorktreeSnapshotPage!(executor, EntityClass, after, SNAPSHOT_PAGE_SIZE);
    yield page;
    after = page.next;
  } while (after !== null);
}

const emptyActions = (): SwitchVersionActions => ({ deletes: new Map(), updates: new Map(), inserts: new Map() });

/** 只留快照里有的实体：增量里别的表（系统表、查询缓存）在快照库里没有。 */
const onlyCopied = (actions: SwitchVersionActions, copied: readonly EntityType[]): SwitchVersionActions => {
  const identities = new Set(
    copied.map(EntityClass => {
      const { namespace, name } = getEntityMetadata(EntityClass);
      return `${namespace}:${name}`;
    })
  );
  const keep = (entries: SwitchVersionActions['inserts']): SwitchVersionActions['inserts'] =>
    new Map(
      [...entries].filter(([key]) => {
        const [namespace, name] = parseRxDBChangeKey(key);
        return identities.has(`${namespace}:${name}`);
      })
    );
  return { deletes: keep(actions.deletes), updates: keep(actions.updates), inserts: keep(actions.inserts) };
};
