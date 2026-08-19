import { JsonPipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { DemoResult, ElectronService } from '../../services/electron.service';
import { LocalDatabaseService } from '../../services/local-database.service';

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
   * US-207 E8：本地数据库的状态源。
   *
   * 连接由 `app.config.ts` 的 app initializer 拉起，**不靠这里注入触发** ——
   * 页面只负责显示。惰性单例等着被注入才构造，是 ELEC-11 踩过的那个坑。
   */
  private localDatabase = inject(LocalDatabaseService);
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

  /**
   * US-207 E9：本次运行选中的后端名（`sqlite-electron` / `wa-sqlite`）。
   *
   * 与实际 `connect()` 用的是同一个值，不是模板里另写一遍的字面量 ——
   * 「卡片写着 A、数据落在 B」这种自相矛盾的显示因此不可能出现。
   */
  backend = this.localDatabase.backend;

  /** 选中后端的逻辑库名；两个后端不同名，据此能看出数据落在哪一份存储里。 */
  dbName = this.localDatabase.dbName;

  /** ELEC-11：本地适配器的连接状态，失败时在页面上给出可见反馈。 */
  rxdbStatus = this.localDatabase.status;

  /** 累计启动次数。重启后 +1，就说明数据确实落在了进程外的文件里。 */
  rxdbLaunchCount = this.localDatabase.launchCount;

  /** 连接失败时的错误文案；其余状态下为 `null`。 */
  rxdbErrorMessage = this.localDatabase.errorMessage;

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
