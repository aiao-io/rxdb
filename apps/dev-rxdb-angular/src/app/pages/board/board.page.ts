import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';
import { Board, BoardLabel, Column, Task, TaskLabel } from '@aiao/rxdb-plugin-board';
import { BoardViewComponent } from '@aiao/rxdb-plugin-board-angular';
import { seedReleaseBoardDataset } from '@aiao/rxdb-plugin-board/testing';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSearch } from '@aiao/rxdb-plugin-search';
import { APP_BASE_HREF } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { getSqliteWasmUrl } from '../../rxdb/demo-rxdb-config';

/**
 * 看板页（US-539 阶段 A 宿主半边）：独立 RxDB 实例——
 * sqlite-wasm 主线程 `vfs: 'idb'`、独立库名、看板实体在 `board` 命名空间，
 * 进入本页才创建连接（满足启动选择前不连接），不复用宿主的 `provideRxDB`。
 * 宿主的 OPFS 专用 Worker / IDB SharedWorker 主实例与看板不相交
 * （备份返回 `unsupported_combination`，US-537 首轮支持组合是主线程 idb）。
 */
@Component({
  standalone: true,
  imports: [BoardViewComponent],
  template: `
    @if (rxdb(); as db) {
      <board-view [exportBackup]="onExportBackup" [rxdb]="db" />
      <footer class="board-tools" data-testid="board-tools">
        <button (click)="onSeedDemo()" data-testid="seed-demo">装载演示数据</button>
      </footer>
      @if (pageError(); as message) {
        <p class="board-notice" data-testid="board-notice-host" role="alert">{{ message }}</p>
      }
    } @else {
      <p class="board-connecting" data-testid="board-connecting">正在连接看板数据库…</p>
    }
  `,
  styles: [
    `
      .board-connecting {
        padding: 2rem;
        color: var(--text-secondary, #666);
      }
      .board-tools {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        padding: 0.5rem 1rem;
        background: #f8fafc;
        border-top: 1px solid #e2e8f0;
      }
      .board-notice {
        color: #b91c1c;
        padding: 0.25rem 1rem;
      }
    `
  ]
})
export default class BoardPage implements OnInit {
  private readonly baseHref = inject(APP_BASE_HREF);

  protected readonly rxdb = signal<RxDB | null>(null);
  protected readonly pageError = signal<string | null>(null);

  ngOnInit(): void {
    const dbName = 'aiao-board';
    const db = new RxDB({
      dbName,
      entities: [Board, Column, Task, BoardLabel, TaskLabel],
      sync: { local: { adapter: 'sqlite-wasm' }, type: SyncType.None }
    });
    // 搜索插件自阶段 A 起安装并维护索引（schema 一次到位，US-538 的入口到阶段 B 才出现）
    db.use(rxDBPluginHistory);
    db.use(rxDBPluginSearch);
    db.adapter(
      'sqlite-wasm',
      () => new RxDBAdapterSqlite(db, { vfs: 'idb', wasmUrl: getSqliteWasmUrl(this.baseHref, 'idb') })
    );
    void db
      .connect('sqlite-wasm')
      .then(() => this.rxdb.set(db))
      .catch(error => console.error('[board] 连接失败', error));
  }

  /** 备份导出（US-537）：首轮输出端是内存 Blob，完整归档生成后才触发下载。 */
  protected readonly onExportBackup = async (): Promise<void> => {
    const db = this.rxdb();
    if (!db) return;
    const adapter = (await firstValueFrom(db.localAdapter$)) as unknown as {
      backup(sink: WritableStream<Uint8Array>): Promise<unknown>;
    };
    const chunks: Uint8Array[] = [];
    const sink = new WritableStream<Uint8Array>({
      write: chunk => void chunks.push(chunk)
    });
    await adapter.backup(sink);
    const blob = new Blob(chunks as BlobPart[]);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `board-backup-${db.config.dbName}.rxdb`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  /** 装载演示数据：只装进空库（种子固定 ID，不向已有库追加）。 */
  protected readonly onSeedDemo = async (): Promise<void> => {
    const db = this.rxdb();
    if (!db) return;
    try {
      const boards = await firstValueFrom(
        db.entityManager.getRepository(Board).count({ where: { combinator: 'and', rules: [] } })
      );
      if (boards > 0) {
        this.pageError.set('演示数据只能装进空库');
        return;
      }
      await seedReleaseBoardDataset(db);
      this.pageError.set(null);
    } catch (cause) {
      this.pageError.set(cause instanceof Error ? cause.message : String(cause));
    }
  };
}
