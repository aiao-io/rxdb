import { RxDB } from '@aiao/rxdb';
import { ACTIVE_DB_KEY, Board, PENDING_SWITCH_KEY, RESTORING_MARKER_KEY } from '@aiao/rxdb-plugin-board';
import { BoardViewComponent } from '@aiao/rxdb-plugin-board-angular';
import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  assertBoardRestoreTargetExists,
  cleanupBoardRestoreTarget,
  connectBoardRxdb,
  createBoardRxdb,
  deleteBoardDbStorage,
  nextBoardDbName,
  RESTORE_TARGET_KEY,
  restoreBoardArchive,
  seedBoardDemo,
  withBoardRestoreLock
} from './board-rxdb';

const failureMessage = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));

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
      @case ('loading') {
        <div class="startup" data-testid="loading-page">
          <p>正在准备看板数据…</p>
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
export class App implements OnInit, OnDestroy {
  private readonly storage = typeof localStorage !== 'undefined' ? localStorage : null;
  private activeDbName: string | null = null;

  protected readonly phase = signal<'startup' | 'loading' | 'restoring' | 'board'>('startup');
  protected readonly rxdb = signal<RxDB | null>(null);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    window.addEventListener('storage', this.onActiveDbChanged);
    this.phase.set(this.readStorage(RESTORING_MARKER_KEY) === null ? 'loading' : 'restoring');
    void withBoardRestoreLock(() => this.initializeBoard()).catch((cause: unknown) => this.showFailure(cause));
  }

  ngOnDestroy(): void {
    window.removeEventListener('storage', this.onActiveDbChanged);
  }

  // ---------- 启动选择 ----------

  protected async startEmpty(): Promise<void> {
    await this.prepareBoard(false);
  }

  protected async startSeed(): Promise<void> {
    await this.prepareBoard(true);
  }

  protected onRestoreFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';
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

  protected async onResetDemo(): Promise<void> {
    // 两阶段切换：先确认，再在新库名上建库并装载种子，读回成功后整页重载切换
    if (!window.confirm('重置为演示数据：将在新库上装载演示数据，成功后打开演示看板。继续？')) return;
    await this.prepareBoard(true);
  }

  private readonly onActiveDbChanged = (event: StorageEvent): void => {
    if (event.storageArea !== this.storage || event.key !== ACTIVE_DB_KEY) return;
    if (event.newValue === null || event.newValue === this.activeDbName) return;
    this.phase.set('loading');
    window.location.reload();
  };

  // ---------- 恢复编排 ----------

  private async restoreFromFile(file: File): Promise<void> {
    // 已有看板先确认（恢复成功后将打开备份中的看板）
    if (this.activeDbName !== null && !window.confirm('恢复成功后将打开备份中的看板，当前看板原样保留。继续？')) return;

    try {
      await withBoardRestoreLock(() => this.restoreAndSwitch(file), false);
    } catch (cause) {
      this.showFailure(cause);
    }
  }

  private async initializeBoard(): Promise<void> {
    const pending = this.readStorage(PENDING_SWITCH_KEY);
    if (pending !== null) return this.completePendingSwitch(pending);
    const cleanupFailure = await this.cleanupInterruptedRestore();
    if (cleanupFailure !== null) this.error.set(cleanupFailure);
    const active = this.readStorage(ACTIVE_DB_KEY);
    if (active !== null) return this.openBoard(active);
    this.phase.set('startup');
  }

  private async cleanupInterruptedRestore(): Promise<string | null> {
    const target = this.readStorage(RESTORE_TARGET_KEY);
    const active = this.readStorage(ACTIVE_DB_KEY);
    try {
      if (target !== null && target !== active) await cleanupBoardRestoreTarget(target, active);
      this.clearStorage(RESTORE_TARGET_KEY);
      return null;
    } catch (cause) {
      return `恢复目标清理失败：${failureMessage(cause)}，可重新打开页面重试清理`;
    } finally {
      this.clearStorage(RESTORING_MARKER_KEY);
    }
  }

  private async restoreAndSwitch(file: File): Promise<void> {
    const cleanupFailure = await this.cleanupInterruptedRestore();
    if (cleanupFailure !== null) throw new Error(cleanupFailure);
    const target = await nextBoardDbName(this.activeDbName);
    this.phase.set('restoring');
    this.writeStorage(RESTORE_TARGET_KEY, target);
    this.writeStorage(RESTORING_MARKER_KEY, '1');
    try {
      await restoreBoardArchive(createBoardRxdb(target), file);
      this.writeStorage(PENDING_SWITCH_KEY, target);
      window.location.reload();
    } catch (cause) {
      const cleanupFailure = await this.cleanupInterruptedRestore();
      if (cleanupFailure !== null) throw new Error(`${failureMessage(cause)}；${cleanupFailure}`, { cause });
      throw cause;
    }
  }

  private async prepareBoard(seed: boolean): Promise<void> {
    this.phase.set('loading');
    try {
      await withBoardRestoreLock(async () => {
        const dbName = await nextBoardDbName(this.activeDbName);
        await this.openAndWriteActive(dbName, seed);
      }, false);
    } catch (cause) {
      this.showFailure(cause);
    }
  }

  /** 重载后：连接新库并读回，成功才写成活动位置；失败清理并回到旧库。 */
  private async completePendingSwitch(target: string): Promise<void> {
    // 读回窗口内不允许再走启动入口（否则两流程并发写活动位置、另一库成孤儿）
    this.phase.set('restoring');
    const db = createBoardRxdb(target);
    try {
      await assertBoardRestoreTargetExists(target);
      await connectBoardRxdb(db);
      await firstValueFrom(db.entityManager.getRepository(Board).find({ where: { combinator: 'and', rules: [] } }));
      this.writeStorage(ACTIVE_DB_KEY, target);
      this.clearStorage(PENDING_SWITCH_KEY);
      this.clearStorage(RESTORE_TARGET_KEY);
      this.clearStorage(RESTORING_MARKER_KEY);
      this.activeDbName = target;
      this.rxdb.set(db);
      this.phase.set('board');
    } catch (cause) {
      let disconnectFailure: string | null = null;
      try {
        await db.disconnectAll();
      } catch (disconnectCause) {
        disconnectFailure = `恢复目标断开失败：${failureMessage(disconnectCause)}`;
      }
      const cleanupFailure = await this.cleanupInterruptedRestore();
      if (cleanupFailure === null) this.clearStorage(PENDING_SWITCH_KEY);
      this.error.set(
        [`恢复读回失败：${failureMessage(cause)}`, disconnectFailure, cleanupFailure].filter(Boolean).join('；')
      );
      const active = this.readStorage(ACTIVE_DB_KEY);
      if (active !== null) await this.openBoard(active);
      else this.phase.set('startup');
    }
  }

  private async openAndWriteActive(dbName: string, seed = false): Promise<void> {
    this.phase.set('loading');
    const db = createBoardRxdb(dbName);
    try {
      await connectBoardRxdb(db);
      if (seed) await seedBoardDemo(db);
      this.writeStorage(ACTIVE_DB_KEY, dbName);
    } catch (cause) {
      const disconnectFailure = await this.disconnectFailure(db);
      let cleanupFailure: string | null = null;
      try {
        await deleteBoardDbStorage(dbName);
      } catch (cleanupCause) {
        cleanupFailure = `新看板清理失败：${failureMessage(cleanupCause)}`;
      }
      this.showFailure([failureMessage(cause), disconnectFailure, cleanupFailure].filter(Boolean).join('；'));
      return;
    }
    this.error.set(null);
    await this.activateBoard(dbName, db);
  }

  private async openBoard(dbName: string): Promise<void> {
    this.phase.set('loading');
    const db = createBoardRxdb(dbName);
    try {
      await connectBoardRxdb(db);
    } catch (cause) {
      const disconnectFailure = await this.disconnectFailure(db);
      this.showFailure([failureMessage(cause), disconnectFailure].filter(Boolean).join('；'));
      return;
    }
    await this.activateBoard(dbName, db);
  }

  private async activateBoard(dbName: string, db: RxDB): Promise<void> {
    const previous = this.rxdb();
    this.activeDbName = dbName;
    this.rxdb.set(db);
    this.phase.set('board');
    if (previous === null) return;
    const disconnectFailure = await this.disconnectFailure(previous);
    if (disconnectFailure !== null) this.error.set(disconnectFailure);
  }

  private async disconnectFailure(db: RxDB): Promise<string | null> {
    try {
      await db.disconnectAll();
      return null;
    } catch (cause) {
      return `看板连接释放失败：${failureMessage(cause)}`;
    }
  }

  private showFailure(cause: unknown): void {
    this.error.set(failureMessage(cause));
    this.phase.set(this.rxdb() !== null ? 'board' : 'startup');
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
