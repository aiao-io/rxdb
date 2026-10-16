import { getEntityMetadata, type EntityType } from '@aiao/rxdb';
import type { WorktreeTarget, WorktreeUnavailableReason, WorktreeView } from '@aiao/rxdb-plugin-working-tree';

/**
 * @fileoverview 只读检出位查看器的目录、标签、拒绝文案与会话（US-313，与框架无关，三端同名移植）。
 */

/** 查看器左栏的一个实体条目。 */
export interface ReadOnlyCatalogEntry {
  /** `${namespace}:${name}` */
  readonly key: string;
  readonly namespace: string;
  readonly name: string;
  readonly displayName: string;
  /** 主实例上这个实体不记变更日志：快照里是它此刻的内容，不随检出的分支或提交 */
  readonly unversioned: boolean;
}

const keyOf = (EntityClass: EntityType): string => {
  const { namespace, name } = getEntityMetadata(EntityClass);
  return `${namespace}:${name}`;
};

/**
 * 快照里能浏览的实体。
 *
 * @param snapshotEntities - 快照实例的 `config.entities`
 * @param mainEntities - 主实例的 `config.entities`
 * @returns 按快照实例的登记顺序
 *
 * @remarks
 * 复制进快照的实体是克隆出来的类，主实例上没有同一个对象；核心系统实体两个实例共用同一个类，不列。
 * 「不随版本」看主实例上同名实体的 `log`：快照里的克隆一律 `log: false`，拿它判会把所有实体都标上。
 */
export const readOnlyCatalog = (
  snapshotEntities: readonly EntityType[],
  mainEntities: readonly EntityType[]
): ReadOnlyCatalogEntry[] => {
  const mainByKey = new Map(mainEntities.map(EntityClass => [keyOf(EntityClass), EntityClass]));
  return snapshotEntities
    .filter(EntityClass => !mainEntities.includes(EntityClass))
    .map(EntityClass => {
      const metadata = getEntityMetadata(EntityClass);
      const key = keyOf(EntityClass);
      const original = mainByKey.get(key);
      return {
        key,
        namespace: metadata.namespace,
        name: metadata.name,
        displayName: metadata.displayName ?? metadata.name,
        unversioned: original !== undefined && getEntityMetadata(original).log === false
      };
    });
};

/**
 * 横幅里的检出目标。
 *
 * @param target - 打开时的目标
 * @returns `branch <分支名>` 或 `commit <提交号前 7 位>`
 */
export const readOnlyTargetLabel = (target: WorktreeTarget): string =>
  'branchId' in target ? `branch ${target.branchId}` : `commit ${target.commitId.slice(0, 7)}`;

/** 只读检出位打不开的成因（`WorktreeUnavailableError.reason`）→ 用户能看懂的提示。 */
export const READ_ONLY_REJECTION_TEXT: Record<WorktreeUnavailableReason, string> = {
  not_configured: 'Read-only checkouts are not configured for this database.',
  unsupported_adapter: 'This storage backend cannot hold a read-only checkout.',
  adapter_mismatch: 'The snapshot storage is misconfigured: it points at another database.',
  branch_not_found: 'This branch no longer exists.',
  branch_not_materialized: 'This branch has only metadata on this device; there is no data to open.',
  incomplete_entities: 'This snapshot is missing entities the page asked for.',
  unreachable_target: 'This commit is not reachable from the current branch.',
  incompatible_schema: 'This commit contains entities the current client cannot read.',
  restoring_working_tree: 'A restore is in progress. Finish or discard it before opening a commit.',
  locks_unavailable: 'This browser has no Web Locks, so a checkout cannot be held.',
  in_use: 'This checkout is open somewhere else.',
  not_found: 'This checkout no longer exists.',
  schema_mismatch: 'The app changed its entities since this checkout was made. Open a new one.'
};

/** 只读检出位查看器的状态：页面持有，查看器组件只做展示。 */
export interface ReadOnlyViewerState {
  readonly view: WorktreeView;
  /** 横幅里的检出目标，见 {@link readOnlyTargetLabel} */
  readonly label: string;
}

/** {@link ReadOnlyViewerSession} 构造时注入的回调：页面只负责把它们接到自己的状态与 toast 上。 */
export interface ReadOnlyViewerSessionHooks {
  /** 打开一个只读检出位：页面的 `worktrees.open` */
  readonly open: (target: WorktreeTarget) => Promise<WorktreeView>;
  /** 查看器该显示什么：打开、刷新换绑与关闭时调用，`null` 是查看器关着 */
  readonly onViewerChange: (viewer: ReadOnlyViewerState | null) => void;
  /** 刷新进行中：查看器据此把 Refresh 置灰 */
  readonly onRefreshingChange: (refreshing: boolean) => void;
  /** 打开、刷新或关闭失败 */
  readonly onError: (error: unknown) => void;
}

/**
 * 只读检出位查看器的会话：持有开着的视图与打开请求的代号，迟到的结果当场关掉、不落进状态。
 *
 * @remarks
 * 快照要建几秒，这期间查看器还没弹出、分支菜单仍可点；`worktrees.open()` 每次都新建一个检出位（新 id，
 * 不拒绝重复打开），开出来没人关的视图连同快照库会留到会话结束。于是：
 *
 * - 打开：被更新的一次打开取代、途中查看器被关、页面已销毁，落地的视图都当场 `close()`；查看器开着时打开
 *   另一个目标，换上新的、旧的当场关掉。
 * - 刷新：按建立时的目标重建（主库此后的写入这才看得见），成功换绑到新视图，旧视图由 `refresh()` 自己关；
 *   途中查看器被关或换了目标，新视图当场关掉、不把查看器弹回来；失败保留旧视图并报错。刷新进行中再要刷新不理会。
 * - 销毁：见 {@link ReadOnlyViewerSession.dispose}。
 *
 * 状态只经 {@link ReadOnlyViewerSessionHooks} 交给页面，三端页面只做接线。
 */
export class ReadOnlyViewerSession {
  readonly #hooks: ReadOnlyViewerSessionHooks;
  /** 打开请求的代号：打开与关闭都换一代，落地时代号对不上就是迟到的结果 */
  #request = 0;
  #viewer: ReadOnlyViewerState | null = null;
  #refreshing = false;
  #disposed = false;

  /**
   * @param hooks - 见 {@link ReadOnlyViewerSessionHooks}
   */
  constructor(hooks: ReadOnlyViewerSessionHooks) {
    this.#hooks = hooks;
  }

  /**
   * 打开目标的只读检出位，查看器换上它。
   *
   * @param target - `{ branchId }` 分支视图，`{ commitId }` 提交视图
   * @returns 落地或被认作迟到之后兑现；失败经 `onError` 报，不拒绝
   */
  async open(target: WorktreeTarget): Promise<void> {
    const request = ++this.#request;
    await this.#hooks.open(target).then(
      view => {
        if (this.#isCurrent(request)) this.#replace({ view, label: readOnlyTargetLabel(target) });
        else this.#discard(view);
      },
      (error: unknown) => {
        if (this.#isCurrent(request)) this.#hooks.onError(error);
      }
    );
  }

  /**
   * 按建立时的目标重建快照，查看器换绑到新视图。
   *
   * @returns 换绑或新视图被认作迟到之后兑现；失败经 `onError` 报，不拒绝
   */
  async refresh(): Promise<void> {
    const current = this.#viewer;
    if (current === null || this.#refreshing) return;
    this.#setRefreshing(true);
    await current.view.refresh().then(
      next => {
        // 刷新途中查看器被关掉或换了目标：新建出来的这个没人看，当场关掉，不把查看器又弹回来
        if (this.#viewer === current) this.#show({ view: next, label: current.label });
        else this.#discard(next);
      },
      (error: unknown) => {
        if (this.#viewer !== current) return;
        this.#setRefreshing(false);
        this.#hooks.onError(error);
      }
    );
  }

  /** 关掉查看器：断开只读实例，删快照库与登记；途中的打开落地时当场关掉。 */
  close(): void {
    this.#request++;
    this.#replace(null);
  }

  /**
   * 页面销毁时调用：关掉开着的视图，此后落地的打开与刷新结果也当场关掉、不回调页面。
   *
   * @remarks
   * 页面已经销毁，没有地方显示提示，这些关闭失败只打到控制台。
   */
  dispose(): void {
    this.#disposed = true;
    const viewer = this.#viewer;
    this.#viewer = null;
    if (viewer !== null) this.#discard(viewer.view);
  }

  /** 这次打开还作数：没被更新的一次打开取代，途中查看器没被关，页面也还在。 */
  #isCurrent(request: number): boolean {
    return !this.#disposed && request === this.#request;
  }

  /** 查看器换上 `viewer`，换下来的视图当场关掉（打开另一个目标、关闭查看器）。 */
  #replace(viewer: ReadOnlyViewerState | null): void {
    const previous = this.#viewer;
    this.#show(viewer);
    if (previous !== null) this.#discard(previous.view);
  }

  /** 查看器换上 `viewer`，不动换下来的视图（刷新换绑：旧视图已由 `refresh()` 自己关掉）。 */
  #show(viewer: ReadOnlyViewerState | null): void {
    this.#viewer = viewer;
    this.#setRefreshing(false);
    this.#hooks.onViewerChange(viewer);
  }

  #setRefreshing(refreshing: boolean): void {
    if (this.#refreshing === refreshing) return;
    this.#refreshing = refreshing;
    this.#hooks.onRefreshingChange(refreshing);
  }

  /** 关掉一个没人看的视图：会话归属的快照库留着只能等下一次回收。 */
  #discard(view: WorktreeView): void {
    void view.close().catch((error: unknown) => {
      if (this.#disposed) console.error('[working-tree] 关闭只读检出位失败', error);
      else this.#hooks.onError(error);
    });
  }
}
