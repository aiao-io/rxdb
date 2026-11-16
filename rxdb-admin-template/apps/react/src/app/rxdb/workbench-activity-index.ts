import { RxDBChange, getEntityMetadata, type IRxDBPlugin, type RxDB } from '@aiao/rxdb';

/** 连接后安装应用查询所需的覆盖索引，旧库与旧归档首次连接时自动补齐。 */
export function workbenchActivityIndex(db: RxDB) {
  return {
    name: 'workbench-activity-index',
    lifecycle: 'scoped',
    inject: ['adapter:local'],
    async install(): Promise<void> {
      const adapter = db.localAdapterSync;
      const { sqliteGetTableNameByMetadata } = await import('@aiao/rxdb-adapter-sqlite-wasm');
      const table = sqliteGetTableNameByMetadata(getEntityMetadata(RxDBChange), db.worktreeTableSet).replaceAll(
        '"',
        '""'
      );
      await adapter.bootstrapTransaction(
        tx =>
          tx.query(`CREATE INDEX IF NOT EXISTS "${table}_workbench_activity"
        ON "${table}" (branchId, namespace, id DESC, transactionId, createdAt, entity)`),
        false
      );
    }
  } satisfies IRxDBPlugin;
}
