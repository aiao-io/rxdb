import { JsonPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DesktopDatabaseService } from '../../services/desktop-database.service';
import { DemoResult, ElectronService } from '../../services/electron.service';
import { $rxdbConnectionError, $rxdbConnectionStatus } from '../../setup_rxdb_wa-sqlite';

/** 首页：展示运行环境、版本信息、IPC 往返与本地数据库连接状态。 */
@Component({
  selector: 'app-home-page',
  templateUrl: './home.page.html',
  standalone: true,
  // ELEC-19：模板只用到一处 `| json`，整个 CommonModule 是多余的。
  imports: [JsonPipe]
})
export default class HomePage implements OnInit {
  /**
   * US-207：注入即触发连接。
   *
   * 服务本身是 `providedIn: 'root'` 的惰性单例，没人注入就永远不构造 ——
   * 与 ELEC-11 在 `provideRxDB` 上踩过的是同一个坑。
   */
  private desktopDatabase = inject(DesktopDatabaseService);
  private electronService = inject(ElectronService);

  isElectron = signal(false);
  platform = signal<string | undefined>(undefined);
  versions = signal<{
    node?: string;
    chrome?: string;
    electron?: string;
  }>({});

  ipcResult = signal<DemoResult | null>(null);
  ipcError = signal<string | null>(null);
  ipcLoading = signal(false);

  /** ELEC-11：wa-sqlite 本地适配器的连接状态，失败时在页面上给出可见反馈。 */
  rxdbStatus = $rxdbConnectionStatus;

  /** 连接失败时的错误文案；其余状态下为 `null`。 */
  rxdbErrorMessage = computed(() => {
    const error = $rxdbConnectionError();
    if (error === undefined) return null;
    return error instanceof Error ? error.message : String(error);
  });

  /** US-207：主进程持有的 SQLite 文件的连接状态。 */
  desktopStatus = this.desktopDatabase.status;

  /** 累计启动次数。重启后 +1，就说明数据确实落在了进程外的文件里。 */
  desktopLaunchCount = this.desktopDatabase.launchCount;

  /** 桌面适配器的失败原因；其余状态下为 `null`。 */
  desktopErrorMessage = this.desktopDatabase.errorMessage;

  ngOnInit(): void {
    this.isElectron.set(this.electronService.isElectron);

    if (this.electronService.isElectron) {
      this.platform.set(this.electronService.platform);
      this.versions.set(this.electronService.versions ?? {});
    }
  }

  async testIPC(): Promise<void> {
    this.ipcLoading.set(true);
    this.ipcError.set(null);
    this.ipcResult.set(null);

    try {
      const result = await this.electronService.runDemo({ data: 'test from renderer' });
      this.ipcResult.set(result);
    } catch (error) {
      this.ipcError.set(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      this.ipcLoading.set(false);
    }
  }
}
