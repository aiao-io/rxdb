import type { RxDBAdapterName } from './rxdb-adapter.js';
import { RxDB } from './RxDB.js';
import { RxDBError } from './RxDBError.js';

/**
 * 一个候选本地后端：注册名、逻辑库名、运行时探针与建库工厂。
 *
 * @typeParam TDatabase - {@link LocalBackendCandidate.create} 的返回类型，默认 {@link RxDB}
 *
 * @remarks
 * 四个字段**必须成套**给。适配器名与工厂分开算的话，两处判定漂移会让注册的适配器和
 * 要连的适配器对不上，而报错只会说「适配器不存在」，指不到真正的原因。
 *
 * `dbName` 在这里出现不是为了建库（那是 `create` 的事），而是为了让选择器能拒绝
 * 两个候选共用一个逻辑库名 —— 见 {@link selectLocalBackend}。
 */
export interface LocalBackendCandidate<TDatabase = RxDB> {
  /** `RxDB.connect()` 与 `sync.local.adapter` 要的适配器名。 */
  readonly adapter: RxDBAdapterName;
  /** 这个后端使用的逻辑库名；同一张表内必须唯一。 */
  readonly dbName: string;
  /**
   * 运行时探针：当前环境**能否**使用这个后端。
   *
   * @remarks
   * 必须是纯判定，不得建连接、不得写盘。探针由各运行时包提供（`isTauriRuntime()` 之类），
   * 应用把它接到这里 —— 选择器自己不碰 `globalThis`，因此单测不必伪造真实全局对象。
   */
  readonly isAvailable: () => boolean;
  /** 建库工厂；只有被选中的候选才会被调用，且由调用方调用。 */
  readonly create: () => TDatabase;
}

/**
 * 候选表本身不合法 —— 空表、`dbName` 重复或 `adapter` 重复。
 *
 * @remarks
 * 这是**编码错误**，与运行时无关：同一张表在浏览器里和在桌面窗口里同样不合法，
 * 所以校验先于任何探针调用。与 {@link RxDBLocalBackendUnavailableError} 分成两个类，
 * 是因为二者的处理方式完全不同 —— 表错误要改代码，不可用要改运行环境。
 */
export class RxDBLocalBackendTableError extends RxDBError {
  constructor(message: string) {
    super(message);
    this.name = 'RxDBLocalBackendTableError';
    Object.setPrototypeOf(this, RxDBLocalBackendTableError.prototype);
  }
}

/**
 * 候选表合法，但当前运行时**一个都用不了**。
 *
 * @remarks
 * 抛出而不是挑一个凑合，是铁律「无 fallback 兜底」的直接后果：候选各自对着不同的物理存储，
 * 挑错一个不会报错，只会让数据静默落到另一个库里。
 */
export class RxDBLocalBackendUnavailableError extends RxDBError {
  constructor(
    /** 被问过、且全部答 `false` 的候选适配器名，按表内顺序 */
    readonly adapters: readonly string[]
  ) {
    super(`No local backend is available in this runtime; probed: ${adapters.join(', ')}`);
    this.name = 'RxDBLocalBackendUnavailableError';
    Object.setPrototypeOf(this, RxDBLocalBackendUnavailableError.prototype);
  }
}

/** 表级校验：空表、`dbName` 重复、`adapter` 重复，三者都在问探针之前拦下。 */
const assertUsableTable = (candidates: readonly LocalBackendCandidate<unknown>[]): void => {
  if (candidates.length === 0) throw new RxDBLocalBackendTableError('Local backend table is empty');

  const seenDbNames = new Set<string>();
  const seenAdapters = new Set<string>();
  for (const { adapter, dbName } of candidates) {
    if (seenDbNames.has(dbName)) {
      throw new RxDBLocalBackendTableError(
        `Local backend table reuses dbName "${dbName}"; each candidate stores its data somewhere else, so one name would cover two databases`
      );
    }
    if (seenAdapters.has(adapter)) {
      throw new RxDBLocalBackendTableError(
        `Local backend table reuses adapter "${adapter}"; the selected backend would not be identifiable`
      );
    }
    seenDbNames.add(dbName);
    seenAdapters.add(adapter);
  }
};

/**
 * 按运行时从候选表里挑一个本地后端。**纯函数**：不读全局对象、不建库、不连接。
 *
 * @typeParam TDatabase - 候选 `create` 的返回类型
 * @param candidates - 应用给出的候选表，**顺序即优先级**
 * @returns 命中的那条候选原样返回（名字与工厂成对，另带 `dbName` 供展示）
 * @throws {@link RxDBLocalBackendTableError} 表为空、`dbName` 重复或 `adapter` 重复
 * @throws {@link RxDBLocalBackendUnavailableError} 表合法但没有一个候选可用
 *
 * @remarks
 * **顺序即优先级**，因为「可用」经常不止一个：Tauri 窗口里 OPFS 一样能用，
 * 桌面候选必须排在 wa-sqlite 前面才选得中。
 *
 * 本函数**不内建任何候选**。内建等于让 `@aiao/rxdb` 反向依赖全部适配器包；
 * 探针（`isTauriRuntime()` 之类）也因此随各运行时包走，由应用接进 `isAvailable`。
 *
 * 这**不是**给「无 fallback 兜底」开口子。允许的是 `connect()` **之前**按运行时能力挑后端；
 * 禁止的是连接**失败后**改道 —— 桌面传输层抛 `host_unavailable` 必须继续抛，
 * 不得 catch 后转投 OPFS。两个候选对着两个永不互通的物理存储，改道就是静默数据分叉。
 *
 * @example
 * ```typescript
 * const backends = (runtime: unknown) => [
 *   { adapter: 'sqlite-tauri', dbName: 'demo_desktop', isAvailable: () => isTauriRuntime(runtime), create: createDesktopDb },
 *   { adapter: 'wa-sqlite', dbName: 'demo_web', isAvailable: () => true, create: createWebDb }
 * ];
 *
 * const backend = selectLocalBackend(backends(globalThis));
 * const rxdb = backend.create();
 * await rxdb.connect(backend.adapter);
 * ```
 */
export const selectLocalBackend = <TDatabase>(
  candidates: readonly LocalBackendCandidate<TDatabase>[]
): LocalBackendCandidate<TDatabase> => {
  assertUsableTable(candidates);

  for (const candidate of candidates) {
    if (candidate.isAvailable()) return candidate;
  }
  throw new RxDBLocalBackendUnavailableError(candidates.map(({ adapter }) => adapter));
};
