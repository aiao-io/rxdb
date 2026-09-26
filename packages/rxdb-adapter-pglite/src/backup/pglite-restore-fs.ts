import { IdbFs, MemoryFS, type PGlite } from '@electric-sql/pglite';
import type { EmscriptenFS } from './pglite-data-dir.js';

/** 在 PGlite 启动 PostgreSQL 之前往数据目录里写文件的回调。 */
export type PGliteRestoreFeed = (FS: EmscriptenFS) => Promise<void>;

/** Emscripten 的 IDBFS 模块在 `FS.filesystems` 下的形状（只取关闭连接要用的那一项）。 */
interface IdbFsModule {
  dbs: Record<string, IDBDatabase | undefined>;
}

type RestoreModuleFS = EmscriptenFS & { filesystems: { IDBFS: IdbFsModule } };

const moduleFS = (pg: PGlite | undefined): RestoreModuleFS => (pg as PGlite).Module.FS;

/**
 * 关掉 IdbFs 真正持有的 IndexedDB 连接。
 *
 * @remarks
 * PGlite 0.5.8 的 `IdbFs.closeFs` 按 `dbs[dataDir]` 找连接，而 Emscripten 登记用的键是挂载点
 * `/pglite/<dataDir>`，于是那条连接从来没被关上。连接不关，紧接着的 `deleteDatabase` 会一直
 * 卡在 `blocked`——恢复失败后的清理因此只能在这里补。
 *
 * 没有 Emscripten 模块时没有连接可关：连接由挂载后的 `FS.syncfs` 打开，模块还没建好（初始化中途
 * 失败）或已被 `close()` 拆掉（`closeFs` 已经关过）都属于这种情况。此处若照常取 `Module.FS`，
 * 抛出的 TypeError 会顶掉调用方正在上抛的真实失败原因。
 */
const closeIdbConnection = (pg: PGlite | undefined, dataDir: string): void => {
  const FS = (pg as { Module?: { FS?: RestoreModuleFS } } | undefined)?.Module?.FS;
  if (!FS) return;
  const dbs = FS.filesystems.IDBFS.dbs;
  const key = pgliteIdbDatabaseName(dataDir);
  dbs[key]?.close();
  delete dbs[key];
};

/**
 * IdbFs 数据目录对应的 IndexedDB 库名。
 *
 * @param dataDir - `idb://` 之后的部分
 * @returns IndexedDB 库名
 */
export const pgliteIdbDatabaseName = (dataDir: string): string => `/pglite/${dataDir}`;

/**
 * 内存档位的恢复文件系统：挂载完成后先把归档写进去，再交给 PostgreSQL 启动。
 */
export class RestoreMemoryFs extends MemoryFS {
  constructor(private readonly feed: PGliteRestoreFeed) {
    super();
  }

  override async initialSyncFs(): Promise<void> {
    await super.initialSyncFs();
    await this.feed(moduleFS(this.pg));
  }
}

/**
 * IndexedDB 档位的恢复文件系统。
 *
 * @remarks
 * 目标库为空，`super.initialSyncFs()` 只是建立连接。之后 PGlite 每条查询结束都会调 `syncToFs`，
 * 在 {@link RestoreIdbFs.commit} 之前这些调用一律不落盘——归档内容与验证查询都只停在内存里，
 * 验证不通过就什么都没写进 IndexedDB。提交后由 `closeFs` 在 PostgreSQL 正常关闭之后做唯一一次
 * **被等待**的完整落盘：PGlite 在 `relaxedDurability` 下的 `syncToFs` 不等待写完，不能用来当提交点。
 */
export class RestoreIdbFs extends IdbFs {
  readonly #dataDir: string;
  #committed = false;

  constructor(
    dataDir: string,
    private readonly feed: PGliteRestoreFeed
  ) {
    super(dataDir);
    this.#dataDir = dataDir;
  }

  override async initialSyncFs(): Promise<void> {
    await super.initialSyncFs();
    try {
      await this.feed(moduleFS(this.pg));
    } catch (error) {
      closeIdbConnection(this.pg, this.#dataDir);
      throw error;
    }
  }

  /** 验证通过后调用：之后的 `pg.close()` 会把数据目录完整写入 IndexedDB。 */
  commit(): void {
    this.#committed = true;
  }

  override async syncToFs(relaxedDurability?: boolean): Promise<void> {
    if (this.#committed) await super.syncToFs(relaxedDurability);
  }

  /**
   * 失败路径专用：PostgreSQL 起不来时 `pg.close()` 不一定走到 `closeFs`，连接要单独放掉。
   */
  releaseConnection(): void {
    closeIdbConnection(this.pg, this.#dataDir);
  }

  override async closeFs(): Promise<void> {
    try {
      if (this.#committed) await super.syncToFs(false);
    } finally {
      closeIdbConnection(this.pg, this.#dataDir);
      await super.closeFs();
    }
  }
}
