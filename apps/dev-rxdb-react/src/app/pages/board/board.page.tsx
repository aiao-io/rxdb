import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';
import { Board, BoardLabel, Column, Task, TaskLabel } from '@aiao/rxdb-plugin-board';
import { BoardView } from '@aiao/rxdb-plugin-board-react';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSearch } from '@aiao/rxdb-plugin-search';
import { useEffect, useState } from 'react';
import { firstValueFrom } from 'rxjs';

/**
 * 看板页（US-531 阶段 A 宿主半边）：独立 RxDB 实例——
 * sqlite-wasm 主线程 `vfs: 'idb'`、独立库名、看板实体在 `board` 命名空间，
 * 进入本页才创建连接，不复用宿主的 RxDB 上下文。
 */
export default function BoardPage() {
  const [rxdb, setRxdb] = useState<RxDB | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    const db = new RxDB({
      dbName: 'aiao-board',
      entities: [Board, Column, Task, BoardLabel, TaskLabel],
      sync: { local: { adapter: 'sqlite-wasm' }, type: SyncType.None }
    });
    db.use(rxDBPluginHistory);
    db.use(rxDBPluginSearch);
    db.adapter('sqlite-wasm', () => new RxDBAdapterSqlite(db, { vfs: 'idb' }));
    void db
      .connect('sqlite-wasm')
      .then(() => {
        if (!disposed) setRxdb(db);
      })
      .catch((cause: unknown) => {
        if (!disposed) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      disposed = true;
      void db.disconnectAll().catch(() => undefined);
    };
  }, []);

  const exportBackup = async (): Promise<void> => {
    if (!rxdb) return;
    const adapter = await firstValueFrom(rxdb.localAdapter$);
    const chunks: Uint8Array[] = [];
    await adapter.backup(
      new WritableStream<Uint8Array>({
        write: chunk => void chunks.push(chunk)
      })
    );
    const blob = new Blob(chunks);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `board-backup-${rxdb.config.dbName}.rxdb`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (error) {
    return (
      <p className='board-connecting' data-testid='board-connecting'>
        看板数据库连接失败：{error}
      </p>
    );
  }
  if (!rxdb) {
    return (
      <p className='board-connecting' data-testid='board-connecting'>
        正在连接看板数据库…
      </p>
    );
  }
  return <BoardView rxdb={rxdb} onExportBackup={() => void exportBackup()} />;
}
