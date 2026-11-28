import { cloneEntityClasses, RxDB, SyncType, type RxDBIdentity } from '@aiao/rxdb';
import type { SqliteOptions } from '@aiao/rxdb-adapter-sqlite-wasm';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { teamDatabaseName, type TeamScope } from '@rxdb-admin-template/collaboration';
import { appConfig } from '../app-config';
import { ENTITIES } from '../entities/asset-entities';

/**
 * 团队库工厂（ADMIN-US-221）：按「用户 × 团队 × 应用」创建一个尚未初始化的团队库，交给协作包打开。
 *
 * @remarks
 * 团队库与匿名工作台（`setup_rxdb.ts`）分库，约定见协作包的 `TeamDatabaseFactory`：
 * - 库名以本应用的库名为前缀，作用域里的用户、团队、应用三项经协作包散列进库名，所以不同作用域、不同应用互不串库；
 *   库名已按作用域区分，不再叠加端到端测试的库名后缀；
 * - 库按协作包交给它的身份绑定（ADMIN-US-222）：库记下它属于谁，换了账号就打不开别人的团队库；
 * - `context.userId` 是作用域里的真实用户：团队任务里记录的创建者与提交作者都是他，不是匿名本机身份；
 * - 实体是业务实体的克隆：同一个实体类不能注册到两个 RxDB 实例，匿名工作台已注册了原类，所以每次调用都克隆一份新的；
 * - 本地适配器与匿名工作台相同（sqlite-wasm，主线程 + IndexedDB），库级同步关闭：团队库的数据只经协作命令交换；
 * - 只装 history 插件（切分支与从提交建分支依赖它）。working-tree 由协作包在连接前装上；搜索与活动索引是匿名工作台
 *   自己的功能，团队库不装。
 *
 * 这里既不调用 `init()` 也不调用 `connect()`：带系统贡献的插件必须在 `init()` 之前登记，协作包要先装上 working-tree。
 *
 * @param scope - 用户 × 团队 × 应用。
 * @param identity - 本机库的身份：后端标识取自全局会话，主体是 `scope.userId`。
 * @returns 尚未初始化的团队库。
 */
export function createTeamDatabase(scope: TeamScope, identity: RxDBIdentity): RxDB {
  const database = new RxDB({
    dbName: teamDatabaseName(appConfig.dbName, scope),
    identity,
    context: { userId: scope.userId },
    entities: cloneEntityClasses([...ENTITIES]),
    sync: {
      local: {
        adapter: 'sqlite-wasm'
      },
      type: SyncType.None
    }
  });
  return database.use(rxDBPluginHistory).adapter('sqlite-wasm', async db => {
    const { RxDBAdapterSqlite } = await import('@aiao/rxdb-adapter-sqlite-wasm');
    const options: SqliteOptions = {
      // 与匿名工作台的适配器选项完全相同（见 setup_rxdb.ts）：主线程 + IndexedDB
      vfs: 'idb',
      wasmUrl: new URL('sqlite-wasm/wa-sqlite-async.wasm', document.baseURI).href
    };
    return new RxDBAdapterSqlite(db, options);
  });
}
