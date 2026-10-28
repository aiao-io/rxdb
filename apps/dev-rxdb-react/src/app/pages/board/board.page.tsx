import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';
import { Board, BoardLabel, Column, Task, TaskLabel } from '@aiao/rxdb-plugin-board';
import { BoardView } from '@aiao/rxdb-plugin-board-react';
import '@aiao/rxdb-plugin-board-react/board-view.css';
import { seedReleaseBoardDataset } from '@aiao/rxdb-plugin-board/testing';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSearch } from '@aiao/rxdb-plugin-search';
import { getE2eDbName } from '@aiao/rxdb-test';
import { useEffect, useState } from 'react';
import { firstValueFrom } from 'rxjs';
import './board-page.css';

/**
 * 看板页（US-539 阶段 A 宿主半边）：独立 RxDB 实例——
 * sqlite-wasm 主线程 `vfs: 'idb'`、独立库名、看板实体在 `board` 命名空间，
 * 进入本页才创建连接，不复用宿主的 RxDB 上下文。
 */
export default function BoardPage() {
  const [rxdb, setRxdb] = useState<RxDB | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seedError, setSeedError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    const db = new RxDB({
      dbName: getE2eDbName('aiao-board'),
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
    const adapter = (await firstValueFrom(rxdb.localAdapter$)) as unknown as {
      backup(sink: WritableStream<Uint8Array>): Promise<unknown>;
    };
    const chunks: Uint8Array[] = [];
    await adapter.backup(
      new WritableStream<Uint8Array>({
        write: chunk => void chunks.push(chunk)
      })
    );
    const blob = new Blob(chunks as BlobPart[]);
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
  /** 装载演示数据：只装进空库（种子固定 ID，不向已有库追加）。 */
  const seedDemo = async (): Promise<void> => {
    if (!rxdb) return;
    try {
      const boards = await firstValueFrom(
        rxdb.entityManager.getRepository(Board).count({ where: { combinator: 'and', rules: [] } })
      );
      if (boards > 0) {
        setSeedError('演示数据只能装进空库');
        return;
      }
      await seedReleaseBoardDataset(rxdb);
      setSeedError(null);
    } catch (cause) {
      setSeedError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <>
      <BoardView rxdb={rxdb} onExportBackup={exportBackup} />
      <footer className='board-tools' data-testid='board-tools'>
        <button type='button' data-testid='seed-demo' onClick={() => void seedDemo()}>
          装载演示数据
        </button>
      </footer>
      {seedError ?
        <p className='board-notice' role='alert' data-testid='board-notice-host'>
          {seedError}
        </p>
      : null}
    </>
  );
}
