/**
 * @fileoverview BOM 插件：仓储门面 + 存储层触发器的下发
 *
 * 触发器下发照 `@aiao/rxdb-plugin-search` 的先例：`inject: ['adapter:local']` 保证
 * `install()` 被调用时本地适配器引导链（迁移、建表、索引收敛）已跑完；DDL 经
 * `bootstrapTransaction` 执行（此刻 `RxDB.connect()` 还卡在等插件安装，裸查询会等自己）。
 * 后端按适配器名分叉：SQLite 家族与 PGlite 各一份 DDL，其余显式声明不支持（US-030 AC#6）。
 * DDL 幂等（`IF NOT EXISTS` / `CREATE OR REPLACE`），重连不产生第二份对象。
 */

import type { EntityType, IRxDBPlugin, Plugin, RxDB } from '@aiao/rxdb';
import { getEntityMetadata, RxDBPluginBase } from '@aiao/rxdb';
import type { LifecycleScope } from '@aiao/utils';
import { buildPgBomTriggerDdl, buildSqliteBomTriggerDdl } from './backend/bom-trigger-ddl.js';
import { BOM_ENTITIES } from './entities.js';
import { BomRepository } from './repository.js';
import { BomBackendCapabilityError } from './types.js';

/** SQLite 家族适配器名（与各适配器包的 `ADAPTER_NAME` 一致）。 */
const SQLITE_ADAPTER_NAMES: ReadonlySet<string> = new Set([
  'wa-sqlite',
  'sqlite',
  'sqlite-wasm',
  'sqliteai',
  'sqlite-tauri',
  'sqlite-electron'
]);

type BomTriggerDdlBuilder = (metadata: ReturnType<typeof getEntityMetadata>) => string[];

/** 按适配器名解析后端 DDL 构造器；不认识的后端显式拒绝，不静默降级。 */
const resolveBomBackend = (adapterName: string | undefined): BomTriggerDdlBuilder => {
  if (adapterName === 'pglite') return buildPgBomTriggerDdl;
  if (adapterName && SQLITE_ADAPTER_NAMES.has(adapterName)) return buildSqliteBomTriggerDdl;
  throw new BomBackendCapabilityError(adapterName ?? '(no local adapter)');
};

export class RxDBPluginBom extends RxDBPluginBase implements IRxDBPlugin {
  readonly lifecycle = 'scoped' as const;
  readonly inject = ['adapter:local'] as const;
  name: Uncapitalize<string> = 'bom';

  constructor(rxdb: RxDB) {
    super(rxdb);
    // 仓储注册必须在 use() 期完成：实体校验（EntityManager.init）先于适配器连接跑，
    // 而 `inject: ['adapter:local']` 把 install() 推迟到连接之后，晚于那个时点
    this.rxdb.repository('BomRepository', { class: BomRepository });
  }

  install(scope: LifecycleScope): Promise<void> {
    // 安装失败必须显式失败 connect：吞掉会让「触发器没装上」伪装成正常启动
    return this.#installTriggers(scope);
  }

  /** 对 schema 里存在的每个 BOM 实体下发存储层触发器（幂等）。 */
  async #installTriggers(scope: LifecycleScope): Promise<void> {
    const adapterName = this.rxdb.config.sync?.local?.adapter;
    const buildDdl = resolveBomBackend(adapterName);
    const adapter = this.rxdb.localAdapterSync;
    if (!adapter) {
      throw new BomBackendCapabilityError(adapterName ?? '(no local adapter)');
    }
    const presentEntities = BOM_ENTITIES.filter(EntityType =>
      (this.rxdb.config.entities as readonly EntityType[]).includes(EntityType)
    );
    for (const EntityType of presentEntities) {
      if (scope.state !== 'active') return;
      const statements = buildDdl(getEntityMetadata(EntityType));
      if (statements.length === 0) continue;
      await adapter.bootstrapTransaction(async executor => {
        for (const statement of statements) {
          try {
            await executor.query(statement);
          } catch (error) {
            throw new Error(`BOM 触发器 DDL 安装失败：${statement}`, { cause: error });
          }
        }
      }, false);
    }
  }
}

declare module '@aiao/rxdb' {
  interface RxDB {
    bom: RxDBPluginBom;
  }
  interface RxDBRepositories {
    BomRepository: typeof BomRepository;
  }
}

export const rxDBPluginBom: Plugin = (db: RxDB) => new RxDBPluginBom(db);
