import { RxDB } from '@aiao/rxdb';
import { checkOPFSAvailable } from '@aiao/utils';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  LucideCircleAlert as CircleAlert,
  LucideCircleCheck as CircleCheck,
  LucideDatabase as Database,
  LucideHardDrive as HardDrive,
  LucideDynamicIcon,
  LucideMonitor as Monitor,
  LucidePlugZap as PlugZap,
  LucideRefreshCw as RefreshCw
} from '@lucide/angular';
import { RxDBConnectionState } from '../../rxdb-connection-state';
import type { AppVersions } from '../../services/tauri-contracts';
import { TauriService } from '../../services/tauri.service';
import { selectWaSqliteBackend, WaSqliteBackend } from '../../wa-sqlite-backend';

type Status = 'checking' | 'ready' | 'unavailable' | 'error';
type StorageStatus = WaSqliteBackend | 'checking';

/** `String(error)` 对普通对象只会给出 `[object Object]`，这里按可读性逐级取。 */
const toErrorMessage = (error: unknown): string => {
  if (typeof error === 'string') return error.trim() || '未知错误';
  if (error instanceof Error) return error.message.trim() || '未知错误';
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const { message } = error as { message: unknown };
    if (typeof message === 'string') return message.trim() || '未知错误';
  }
  return '未知错误';
};

@Component({
  selector: 'app-home-page',
  templateUrl: './home.page.html',
  standalone: true,
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class HomePage implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly rxdb = inject(RxDB);
  private readonly tauriService = inject(TauriService);
  private readonly connectionState = inject(RxDBConnectionState);

  protected readonly CircleAlert = CircleAlert;
  protected readonly CircleCheck = CircleCheck;
  protected readonly Database = Database;
  protected readonly HardDrive = HardDrive;
  protected readonly Monitor = Monitor;
  protected readonly PlugZap = PlugZap;
  protected readonly RefreshCw = RefreshCw;

  protected readonly isTauri = signal(this.tauriService.isTauri);
  protected readonly platform = signal('browser');
  protected readonly versions = signal<AppVersions | null>(null);
  protected readonly databaseStatus = signal<Status>('checking');
  protected readonly databaseError = signal<string | null>(null);
  protected readonly ipcStatus = signal<Status>(this.tauriService.isTauri ? 'checking' : 'unavailable');
  protected readonly ipcError = signal<string | null>(null);
  protected readonly storageBackend = signal<StorageStatus>('checking');

  ngOnInit(): void {
    // TAURI-01：initializer 阶段的连接失败先看。它现在不再中止 bootstrap，
    // 而是落进 `RxDBConnectionState` —— 这块诊断面板因此第一次真正可达。
    const bootstrapError = this.connectionState.$error();
    if (bootstrapError !== null) {
      this.databaseStatus.set('error');
      this.databaseError.set(toErrorMessage(bootstrapError));
      void this.refreshStatus();
      return;
    }

    this.rxdb.localAdapter$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => this.databaseStatus.set('ready'),
      error: (error: unknown) => {
        this.databaseStatus.set('error');
        this.databaseError.set(toErrorMessage(error));
      }
    });
    void this.refreshStatus();
  }

  protected async refreshStatus(): Promise<void> {
    await Promise.all([this.refreshRuntime(), this.refreshStorageBackend()]);
  }

  private async refreshRuntime(): Promise<void> {
    this.ipcError.set(null);
    if (!this.tauriService.isTauri) {
      this.ipcStatus.set('unavailable');
      return;
    }

    this.ipcStatus.set('checking');
    try {
      const [platform, versions, health] = await Promise.all([
        this.tauriService.getPlatform(),
        this.tauriService.getVersions(),
        this.tauriService.checkRuntime()
      ]);
      this.platform.set(platform);
      this.versions.set(versions);
      // `check_runtime` 原先被调用却从不读返回值 —— 后端报告任何非 ready 状态
      // 都会被这块面板画成"已连接"。既然要调它，就得让它的结论真的影响页面。
      if (health.status !== 'ready') {
        this.ipcStatus.set('error');
        this.ipcError.set(`Rust 后端报告状态：${health.status}`);
        return;
      }
      this.ipcStatus.set('ready');
    } catch (error) {
      this.ipcStatus.set('error');
      this.ipcError.set(toErrorMessage(error));
    }
  }

  private async refreshStorageBackend(): Promise<void> {
    this.storageBackend.set('checking');
    try {
      const opfsAvailable = await checkOPFSAvailable();
      this.storageBackend.set(selectWaSqliteBackend(opfsAvailable, typeof SharedWorker === 'function'));
    } catch {
      this.storageBackend.set('unavailable');
    }
  }
}
