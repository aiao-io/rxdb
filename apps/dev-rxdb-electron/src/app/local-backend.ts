import { RxDBError, type RxDB, type RxDBAdapterName } from '@aiao/rxdb';

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
 *
 * 与 `apps/dev-rxdb-tauri/src/app/local-backend.ts` **逐字相同**（除本段与下方 `@example`
 * 里的运行时名字）。刻意各留一份而不是抽到 `@modules/angular`：这段代码的定位是
 * 「装了包的用户照抄的样板」，抄一个文件比抄一个内部模块的依赖关系直接得多。
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
   * 必须是纯判定，不得建连接、不得写盘。探针由各运行时包提供（`isDesktopHostRuntime()` 之类），
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
 * 这是**编码错误**，与运行时无关：同一张表在浏览器里和在 Electron 窗口里同样不合法，
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
 * **顺序即优先级**，因为「可用」经常不止一个：Electron 窗口里 OPFS 一样能用，
 * 桌面候选必须排在 wa-sqlite 前面才选得中。
 *
 * **这段判定刻意留在应用里，没有进 `@aiao/rxdb`。** 它只有二十来行，且全部输入
 * （候选表、探针）本来就来自应用；上移到框架层换不到任何复用，只会多一个必须
 * 长期兼容的公开 API。装了包的用户照抄这个文件比调一个框架 API 更直接。
 *
 * 这**不是**给「无 fallback 兜底」开口子。允许的是 `connect()` **之前**按运行时能力挑后端；
 * 禁止的是连接**失败后**改道 —— 桌面传输层抛 `host_unavailable` 必须继续抛，
 * 不得 catch 后转投 OPFS。两个候选对着两个永不互通的物理存储，改道就是静默数据分叉。
 *
 * @example
 * ```typescript
 * const backends = (runtime: unknown) => [
 *   { adapter: 'sqlite-electron', dbName: 'desktop_demo', isAvailable: () => isDesktopHostRuntime(runtime), create: createDesktopDb },
 *   { adapter: 'wa-sqlite', dbName: 'test_6', isAvailable: () => true, create: createWebDb }
 * ];
 *
 * const backend = selectLocalBackend(backends(globalThis));
 * const rxdb = await backend.create();
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
