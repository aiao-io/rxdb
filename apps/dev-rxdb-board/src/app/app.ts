import { RxDB } from '@aiao/rxdb';
import { ACTIVE_DB_KEY, Board, PENDING_SWITCH_KEY, RESTORING_MARKER_KEY } from '@aiao/rxdb-plugin-board';
import { BoardViewComponent } from '@aiao/rxdb-plugin-board-angular';
import { Component, OnInit, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { connectBoardRxdb, createBoardRxdb, nextBoardDbName, restoreBoardArchive, seedBoardDemo } from './board-rxdb';

/**
 * 看板 demo 壳（US-540 / US-537）：
 *
 * - 启动选择：无活动位置记录时先显示「新建空看板 / 装载演示数据 / 从备份恢复」，
 *   选择前不连接数据库、不建表、不装载种子；
 * - 已有看板：直接打开活动库；工具菜单提供导出备份、恢复与重置为演示数据；
 * - 恢复编排：恢复到新库名 → 整页重载 → 连接新库读回成功才写活动位置，
 *   失败或取消保留原库（restoreStateMachine 的状态转换在核心包，本壳只做宿主接线）。
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [BoardViewComponent],
  template: `
    @switch (phase()) {
      @case ('startup') {
        <div class="startup" data-testid="startup-page">
          <h1>任务看板</h1>
          <p class="startup-hint">选择如何开始；选择前不会连接或创建任何数据。</p>
          <div class="startup-actions">
            <button (click)="startEmpty()" data-testid="start-empty">新建空看板</button>
            <button (click)="startSeed()" data-testid="start-seed">装载演示数据</button>
            <label class="file-picker">
              从备份恢复
              <input (change)="onRestoreFile($event)" accept=".rxdb" data-testid="restore-file" hidden type="file" />
            </label>
          </div>
          @if (error(); as message) {
            <p class="app-error" data-testid="app-error" role="alert">{{ message }}</p>
          }
        </div>
      }
      @case ('restoring') {
        <div class="startup" data-testid="restoring-page">
          <p>恢复中：全部写入口已暂停。</p>
        </div>
      }
      @default {
        @if (error(); as message) {
          <p class="app-error" data-testid="app-error" role="alert">{{ message }}</p>
        }
        @if (rxdb(); as db) {
          <board-view [exportBackup]="onExportBackup" [rxdb]="db" />
          <footer class="board-tools" data-testid="board-tools">
            <button (click)="onResetDemo()" data-testid="reset-demo">重置为演示数据</button>
            <label class="file-picker">
              从备份恢复…
              <input
                (change)="onRestoreFile($event)"
                accept=".rxdb"
                data-testid="restore-file-menu"
                hidden
                type="file"
              />
            </label>
          </footer>
        } @else {
          <p class="app-connecting" data-testid="app-connecting">正在连接看板数据库…</p>
        }
      }
    }
  `,
  styles: [
    `
      .startup {
        max-width: 32rem;
        margin: 4rem auto;
        padding: 2rem;
      }
      .startup-actions {
        display: flex;
        gap: 0.75rem;
        flex-wrap: wrap;
      }
      .file-picker {
        cursor: pointer;
      }
      .app-error {
        color: #dc2626;
      }
      .board-tools {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        display: flex;
        gap: 0.75rem;
        padding: 0.5rem 1rem;
        background: #f8fafc;
        border-top: 1px solid #e2e8f0;
      }
      .app-connecting {
        padding: 2rem;
        color: #666;
      }
    `
  ]
})
export class App implements OnInit {
  protected readonly phase = signal<'startup' | 'restoring' | 'board'>('startup');
  protected readonly rxdb = signal<RxDB | null>(null);
  protected readonly error = signal<string | null>(null);

  private readonly storage = typeof localStorage !== 'undefined' ? localStorage : null;
  private activeDbName: string | null = null;

  ngOnInit(): void {
    // 启动：读回 pending switch / 活动位置（读回成功才写活动位置）
    const pending = this.readStorage(PENDING_SWITCH_KEY);
    if (pending !== null) {
      this.completePendingSwitch(pending);
      return;
    }
    const active = this.readStorage(ACTIVE_DB_KEY);
    if (active !== null && this.readStorage(RESTORING_MARKER_KEY) === null) {
      this.openBoard(active);
      return;
    }
    this.phase.set('startup');
  }

  // ---------- 启动选择 ----------

  protected startEmpty(): void {
    const dbName = nextBoardDbName(null);
    void this.openAndWriteActive(dbName);
  }

  protected startSeed(): void {
    const dbName = nextBoardDbName(null);
    void this.openAndWriteActive(dbName, true);
  }

  protected onRestoreFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    void this.restoreFromFile(file);
  }

  // ---------- 已有看板 ----------

  protected readonly onExportBackup = async (): Promise<void> => {
    const db = this.rxdb();
    if (!db) return;
    const adapter = (await firstValueFrom(db.localAdapter$)) as unknown as {
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
    anchor.download = `board-backup-${db.config.dbName}.rxdb`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  protected onResetDemo(): void {
    // 两阶段切换：先确认，再在新库名上建库并装载种子，读回成功后整页重载切换
    if (!window.confirm('重置为演示数据：将在新库上装载演示数据，成功后打开演示看板。继续？')) return;
    const dbName = nextBoardDbName(this.activeDbName);
    void this.openAndWriteActive(dbName, true);
  }

  // ---------- 恢复编排 ----------

  private async restoreFromFile(file: File): Promise<void> {
    // 已有看板先确认（恢复成功后将打开备份中的看板）
    if (this.activeDbName !== null && !window.confirm('恢复成功后将打开备份中的看板，当前看板原样保留。继续？')) return;

    const target = nextBoardDbName(this.activeDbName);
    this.phase.set('restoring');
    try {
      this.writeStorage(RESTORING_MARKER_KEY, '1');
      const db = createBoardRxdb(target);
      await restoreBoardArchive(db, file);
      // 恢复完成 → 写待切换记录并整页重载
      this.writeStorage(PENDING_SWITCH_KEY, target);
      this.clearStorage(RESTORING_MARKER_KEY);
      window.location.reload();
    } catch (cause) {
      this.clearStorage(RESTORING_MARKER_KEY);
      this.phase.set(this.activeDbName !== null ? 'board' : 'startup');
      this.error.set(cause instanceof Error ? cause.message : String(cause));
    }
  }

  /** 重载后：连接新库并读回，成功才写成活动位置；失败清理并回到旧库。 */
  private async completePendingSwitch(target: string): Promise<void> {
    const db = createBoardRxdb(target);
    try {
      await connectBoardRxdb(db);
      const boards = await firstValueFrom(
        db.entityManager.getRepository(Board).find({ where: { combinator: 'and', rules: [] } })
      );
      if (boards.length === 0) throw new Error('读回失败：恢复库中没有看板数据');
      this.writeStorage(ACTIVE_DB_KEY, target);
      this.clearStorage(PENDING_SWITCH_KEY);
      this.activeDbName = target;
      this.rxdb.set(db);
      this.phase.set('board');
    } catch (cause) {
      // 读回失败：不把半恢复库当活动位置，回旧库或启动选择
      this.clearStorage(PENDING_SWITCH_KEY);
      this.error.set(`恢复读回失败：${cause instanceof Error ? cause.message : String(cause)}`);
      const active = this.readStorage(ACTIVE_DB_KEY);
      if (active !== null) this.openBoard(active);
      else this.phase.set('startup');
    }
  }

  private async openAndWriteActive(dbName: string, seed = false): Promise<void> {
    this.phase.set('restoring');
    const db = createBoardRxdb(dbName);
    try {
      await connectBoardRxdb(db);
      if (seed) await seedBoardDemo(db);
      this.writeStorage(ACTIVE_DB_KEY, dbName);
      this.activeDbName = dbName;
      this.rxdb.set(db);
      this.phase.set('board');
    } catch (cause) {
      this.error.set(cause instanceof Error ? cause.message : String(cause));
      this.phase.set('startup');
    }
  }

  private openBoard(dbName: string): void {
    const db = createBoardRxdb(dbName);
    void connectBoardRxdb(db)
      .then(() => {
        this.activeDbName = dbName;
        this.rxdb.set(db);
        this.phase.set('board');
      })
      .catch((cause: unknown) => {
        this.error.set(cause instanceof Error ? cause.message : String(cause));
        this.phase.set('startup');
      });
  }

  private readStorage(key: string): string | null {
    return this.storage?.getItem(key) ?? null;
  }
  private writeStorage(key: string, value: string): void {
    this.storage?.setItem(key, value);
  }
  private clearStorage(key: string): void {
    this.storage?.removeItem(key);
  }
}
