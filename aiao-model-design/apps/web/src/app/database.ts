import { RxDB, SyncType } from '@aiao/rxdb';
import { rxDBPluginTree } from '@aiao/rxdb-plugin-tree';
import {
  AgentBranch,
  AgentConversation,
  ChatMessage,
  ChatSession,
  DesignEntity,
  DesignIndex,
  DesignProperty,
  DesignRelation,
  ModelDesign
} from './model-designer/models/index.js';

/** 创建并连接设计器的持久化本地数据库。 */
export async function createDesignerDatabase(): Promise<RxDB> {
  const [{ RxDBAdapterSqlite }, { rxDBPluginHistory }] = await Promise.all([
    import('@aiao/rxdb-adapter-sqlite-wasm'),
    import('@aiao/rxdb-plugin-history')
  ]);
  const database = new RxDB({
    dbName: 'aiao-model-design',
    context: { userId: 'local-designer' },
    entities: [
      ModelDesign,
      DesignEntity,
      DesignProperty,
      DesignRelation,
      DesignIndex,
      ChatSession,
      ChatMessage,
      AgentConversation,
      AgentBranch
    ],
    sync: { type: SyncType.None, local: { adapter: 'sqlite-wasm' } }
  });
  database
    .use(rxDBPluginHistory)
    .use(rxDBPluginTree)
    .adapter(
      'sqlite-wasm',
      db => new RxDBAdapterSqlite(db, { vfs: 'idb', wasmUrl: '/sqlite-wasm/wa-sqlite-async.wasm' })
    );
  database.init();
  await database.connect('sqlite-wasm');
  return database;
}
