import { RxDB, SWITCH_BRANCH_COMMIT } from '@aiao/rxdb';
import { JsonPipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { dispatchEveryRxDBEvent } from '../../devtools-event-probe';
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

  /** 应用自己的 RxDB 实例；事件探针必须发在它上面，发在别处面板一条都收不到。 */
  private rxdb = inject(RxDB);

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

  /**
   * 逐类派发全部 RxDB 事件后，已派发的类型数（未点过为 `null`）。
   *
   * @remarks
   * US-904 阶段 D AC#46：DevTools 面板要能显示**全部** `RXDB_EVENT_TYPES`，
   * 而本 demo 没有远端，`SYNC_*` / `CONFLICT_*` / `REPOSITORY_SYNC_*` 这些永远不会自然发生。
   * 这个按钮是唯一能把事件全集送上真实链路的入口，见 {@link dispatchEveryRxDBEvent}。
   */
  readonly dispatchedEventTypes = signal<number | null>(null);

  /**
   * 应用侧读到的当前分支 id（未读到为 `null`）。
   *
   * @remarks
   * US-904 阶段 D AC#46 的「branch 与应用一致」需要一个**独立于面板**的观测点：
   * 面板自己显示的选中项证明不了应用真的切过去了。这个读数直接来自
   * `versionManager.getCurrentBranch()`，与面板走的是两条路。
   */
  readonly currentBranch = signal<string | null>(null);

  ngOnInit(): void {
    this.isElectron.set(this.electronService.isElectron);

    if (this.electronService.isElectron) {
      this.platform.set(this.electronService.platform);
      this.versions.set(this.electronService.versions ?? {});
    }

    void this.refreshCurrentBranch();
    // 分支可能被**应用之外**的东西切走（DevTools 面板就是一个），所以读数跟着事件走
    // 而不是只在进页面时读一次——否则页面会一直显示一个已经不成立的分支名。
    this.rxdb.addEventListener(SWITCH_BRANCH_COMMIT, () => void this.refreshCurrentBranch());
  }

  /** 在应用自己的 RxDB 实例上逐类派发一遍全部事件。 */
  dispatchAllEvents(): void {
    this.dispatchedEventTypes.set(dispatchEveryRxDBEvent(this.rxdb).length);
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

  /** 从 `versionManager` 读一次当前分支，写进 {@link currentBranch}。 */
  private async refreshCurrentBranch(): Promise<void> {
    const branch = await this.rxdb.versionManager.getCurrentBranch();
    this.currentBranch.set(branch?.id ?? null);
  }
}
