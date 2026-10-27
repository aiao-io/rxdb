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
        <main class="shell-startup" data-testid="startup-page">
          <div class="shell-card">
            <p class="shell-eyebrow">RxDB 本地优先演示</p>
            <h1>任务看板</h1>
            <p class="shell-hint">选择如何开始；选择前不会连接或创建任何数据。</p>
            <div class="shell-options">
              <button class="shell-option" (click)="startEmpty()" data-testid="start-empty">
                <strong>新建空看板</strong>
                <span>从零开始建板、建列、建任务</span>
              </button>
              <button class="shell-option" (click)="startSeed()" data-testid="start-seed">
                <strong>装载演示数据</strong>
                <span>两块看板、20 个任务，体验拖拽、筛选、键盘与撤销</span>
              </button>
              <button class="shell-option" (click)="startupFile.click()" data-testid="start-restore">
                <strong>从备份恢复</strong>
                <span>选择 .rxdb 备份文件，恢复到新库后打开</span>
              </button>
              <input
                #startupFile
                (change)="onRestoreFile($event)"
                accept=".rxdb"
                aria-label="选择备份文件"
                data-testid="restore-file"
                hidden
                type="file"
              />
            </div>
            @if (error(); as message) {
              <p class="shell-error" data-testid="app-error" role="alert">{{ message }}</p>
            }
          </div>
        </main>
      }
      @case ('loading') {
        <p class="shell-status" data-testid="loading-page" role="status">正在准备看板数据…</p>
      }
      @case ('restoring') {
        <p class="shell-status" data-testid="restoring-page" role="status">恢复中：全部写入口已暂停。</p>
      }
      @default {
        <div class="shell">
          <header class="shell-bar" data-testid="board-tools">
            <span class="shell-brand">RxDB 任务看板</span>
            <span class="shell-spacer"></span>
            <button class="shell-btn" (click)="onResetDemo()" data-testid="reset-demo">重置为演示数据</button>
            <button class="shell-btn" (click)="menuFile.click()" data-testid="restore-open">从备份恢复…</button>
            <input
              #menuFile
              (change)="onRestoreFile($event)"
              accept=".rxdb"
              aria-label="选择备份文件"
              data-testid="restore-file-menu"
              hidden
              type="file"
            />
          </header>
          @if (error(); as message) {
            <p class="shell-error" data-testid="app-error" role="alert">{{ message }}</p>
          }
          @if (rxdb(); as db) {
            <board-view [exportBackup]="onExportBackup" [rxdb]="db" />
          } @else {
            <p class="shell-status" data-testid="app-connecting" role="status">正在连接看板数据库…</p>
          }
        </div>
      }
    }
    @if (pendingConfirm(); as confirm) {
      <div class="rxb shell-overlay">
        <div class="rxb-dialog-backdrop" (keydown.escape)="settleConfirm(false)">
          <div
            class="rxb-dialog"
            aria-labelledby="shell-confirm-title"
            aria-modal="true"
            data-testid="host-confirm"
            role="alertdialog"
          >
            <div class="rxb-dialog-header">
              <h2 class="rxb-dialog-title" id="shell-confirm-title">{{ confirm.title }}</h2>
            </div>
            <div class="rxb-dialog-body">
              <p>{{ confirm.message }}</p>
            </div>
            <div class="rxb-dialog-footer">
              <button class="rxb-btn" (click)="settleConfirm(false)" data-testid="host-confirm-no">取消</button>
              <button class="rxb-btn rxb-btn-primary" (click)="settleConfirm(true)" data-testid="host-confirm-yes">
                {{ confirm.confirmLabel }}
              </button>
            </div>
          </div>
        </div>
      </div>
    }
  `
})
export class App implements OnInit, OnDestroy {
  private readonly storage = typeof localStorage !== 'undefined' ? localStorage : null;
  private activeDbName: string | null = null;

  protected readonly phase = signal<'startup' | 'loading' | 'restoring' | 'board'>('startup');
  protected readonly rxdb = signal<RxDB | null>(null);
  protected readonly error = signal<string | null>(null);
  /** 应用内确认对话框（替代 window.confirm，样式复用看板的 .rxb-dialog）。 */
  protected readonly pendingConfirm = signal<{
    readonly title: string;
    readonly message: string;
    readonly confirmLabel: string;
    readonly settle: (confirmed: boolean) => void;
  } | null>(null);

  protected settleConfirm(confirmed: boolean): void {
    const pending = this.pendingConfirm();
    this.pendingConfirm.set(null);
    pending?.settle(confirmed);
  }

  private ask(title: string, message: string, confirmLabel: string): Promise<boolean> {
    this.pendingConfirm()?.settle(false);
    return new Promise(settle => {
      this.pendingConfirm.set({ title, message, confirmLabel, settle });
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-testid="host-confirm-no"]')?.focus());
    });
  }

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
    const confirmed = await this.ask(
      '重置为演示数据',
      '将在新库上装载演示数据，成功后打开演示看板；当前看板留在原库。',
      '重置'
    );
    if (!confirmed) return;
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
    if (
      this.activeDbName !== null &&
      !(await this.ask('从备份恢复', '恢复成功后将打开备份中的看板，当前看板原样保留。', '恢复'))
    ) {
      return;
    }

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
