import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginTree } from '@aiao/rxdb-plugin-tree';
import { ChatMessage, ChatSession, DesignEntity, DesignIndex, DesignProperty, DesignRelation, ModelDesign } from './model-designer/models/index.js';

/** 创建并连接设计器的持久化本地数据库。 */
export async function createDesignerDatabase(): Promise<RxDB> {
  const database = new RxDB({
    dbName: 'aiao-model-design',
    context: { userId: 'local-designer' },
    entities: [ModelDesign, DesignEntity, DesignProperty, DesignRelation, DesignIndex, ChatSession, ChatMessage],
    sync: { type: SyncType.None, local: { adapter: 'sqlite-wasm' } }
  });
  database.use(rxDBPluginHistory).use(rxDBPluginTree).adapter('sqlite-wasm', db =>
    new RxDBAdapterSqlite(db, { vfs: 'idb', wasmUrl: '/sqlite-wasm/wa-sqlite-async.wasm' })
  );
  database.init();
  await database.connect('sqlite-wasm');
  return database;
}
