import { formatFileSize } from '@aiao/utils';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal, type OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  ADMIN_ACCOUNTS_PAGE_SIZE,
  type AdminAccount,
  type AdminAccountPage,
  type AdminOnlineDevice,
  type AdminServerFile,
  type AdminServerFiles
} from '../../../shared/admin-protocol';
import { AdminApi } from '../admin/admin-api';
import { AuthService } from '../auth/auth.service';

/** 管理后台的三个分区。 */
export type AdminTab = 'accounts' | 'online' | 'files';

/** 等待管理员确认的处置：有后果的操作先摆出后果再动手。 */
export type PendingAction =
  | { readonly kind: 'ban' | 'delete-account'; readonly account: AdminAccount }
  | { readonly kind: 'kick'; readonly device: AdminOnlineDevice }
  | { readonly kind: 'delete-file'; readonly file: AdminServerFile };

interface Confirmation {
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
}

const SHORT_HASH_LENGTH = 12;

const shortHash = (hash: string): string => hash.slice(0, SHORT_HASH_LENGTH);
const copyName = (file: AdminServerFile): string => file.fileName ?? shortHash(file.contentHash);
const pageCountOf = (total: number): number => Math.max(1, Math.ceil(total / ADMIN_ACCOUNTS_PAGE_SIZE));
const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const confirmationOf = (action: PendingAction): Confirmation => {
  switch (action.kind) {
    case 'ban':
      return {
        title: `封禁“${action.account.email}”？`,
        body: '封禁后该账号无法再连接设备发现或使用服务器文件，并立即断开它在线的设备；已经建立的设备直连不受影响，随时可以解封。',
        confirmLabel: '确认封禁'
      };
    case 'delete-account':
      return {
        title: `删除“${action.account.email}”？`,
        body: '将删除该账号及其设备登记，清掉它的全部持有声明，并断开在线设备；其他设备上的文件与服务器副本不受影响。此操作不可撤销。',
        confirmLabel: '确认删除'
      };
    case 'kick':
      return {
        title: `让“${action.device.deviceName}”下线？`,
        body: '断开这台设备的设备发现连接，不会封禁账号。被断开的页面需要刷新后才会重新连接。',
        confirmLabel: '确认下线'
      };
    case 'delete-file':
      return {
        title: `删除服务器副本“${copyName(action.file)}”？`,
        body: '之后没有在线持有者时，其他设备无法再从服务器下载这个文件；清单里的持有声明保持不变。',
        confirmLabel: '确认删除'
      };
  }
};

/** 管理后台：总览账号、在线设备与服务器副本，并做封禁、删除、踢下线这类处置；只有管理员进得来。 */
@Component({
  selector: 'app-admin-page',
  imports: [DatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="skip-link" href="#admin-content">跳到主要内容</a>
    <header class="border-base-300 bg-base-100 border-b">
      <div class="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4 lg:px-8">
        <div>
          <p class="text-primary text-xs font-semibold tracking-widest">近邻 · 仅管理员</p>
          <h1 class="text-xl font-semibold">管理后台</h1>
        </div>
        <nav aria-label="管理后台导航">
          <a class="btn btn-ghost btn-sm" routerLink="/">返回文件共享</a>
        </nav>
        <div class="ml-auto flex items-center gap-3">
          <span class="text-base-content/60 hidden max-w-60 truncate text-xs sm:block" data-testid="admin-user">{{
            auth.session()?.user?.email
          }}</span>
          <button
            class="btn btn-ghost btn-sm"
            [disabled]="loading()"
            (click)="refresh()"
            data-testid="admin-refresh"
            type="button"
          >
            刷新
          </button>
          <button class="btn btn-ghost btn-sm" [disabled]="signingOut()" (click)="signOut()" type="button">退出</button>
        </div>
      </div>
    </header>
    <main class="mx-auto max-w-7xl px-5 py-8 lg:px-8" id="admin-content">
      @if (error(); as message) {
        <div class="alert alert-error mb-5" data-testid="admin-error" role="alert">{{ message }}</div>
      }
      @if (loadError(); as message) {
        <div class="alert alert-warning mb-5 text-sm" data-testid="admin-load-error" role="alert">{{ message }}</div>
      }
      @if (notice(); as message) {
        <div class="alert alert-success mb-5" data-testid="admin-notice" role="status">{{ message }}</div>
      }
      <dl class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3" aria-label="服务概况" data-testid="admin-summary">
        <div class="card bg-base-100 p-5">
          <dt class="text-base-content/55 text-xs">账号</dt>
          <dd class="mt-2 text-2xl font-semibold">{{ accountPage()?.total ?? '—' }}</dd>
        </div>
        <div class="card bg-base-100 p-5">
          <dt class="text-base-content/55 text-xs">在线设备</dt>
          <dd class="mt-2 text-2xl font-semibold">{{ devices().length }}</dd>
        </div>
        <div class="card bg-base-100 p-5">
          <dt class="text-base-content/55 text-xs">服务器副本</dt>
          <dd class="mt-2 text-2xl font-semibold">
            {{ serverFiles()?.files?.length ?? '—' }}
            <span class="text-base-content/55 text-xs font-normal">{{ size(serverFiles()?.totalBytes ?? 0) }}</span>
          </dd>
        </div>
      </dl>
      @if (confirmation(); as prompt) {
        <section
          class="border-warning bg-warning/10 mb-6 rounded-xl border p-4"
          aria-label="确认操作"
          data-testid="admin-confirm"
        >
          <h2 class="font-medium break-all">{{ prompt.title }}</h2>
          <p class="mt-2 text-sm">{{ prompt.body }}</p>
          <div class="mt-4 flex gap-2">
            <button
              class="btn btn-error btn-sm"
              [disabled]="busy()"
              (click)="confirm()"
              data-testid="admin-confirm-submit"
              type="button"
            >
              {{ prompt.confirmLabel }}
            </button>
            <button
              class="btn btn-ghost btn-sm"
              [disabled]="busy()"
              (click)="cancel()"
              data-testid="admin-confirm-cancel"
              type="button"
            >
              取消
            </button>
          </div>
        </section>
      }
      <div class="tabs tabs-border mb-4" aria-label="管理内容" role="tablist">
        <button
          class="tab"
          id="admin-tab-accounts"
          [attr.aria-selected]="tab() === 'accounts'"
          [class.tab-active]="tab() === 'accounts'"
          (click)="selectTab('accounts')"
          aria-controls="admin-panel"
          data-testid="admin-tab-accounts"
          role="tab"
          type="button"
        >
          账号
        </button>
        <button
          class="tab"
          id="admin-tab-online"
          [attr.aria-selected]="tab() === 'online'"
          [class.tab-active]="tab() === 'online'"
          (click)="selectTab('online')"
          aria-controls="admin-panel"
          data-testid="admin-tab-online"
          role="tab"
          type="button"
        >
          在线设备
        </button>
        <button
          class="tab"
          id="admin-tab-files"
          [attr.aria-selected]="tab() === 'files'"
          [class.tab-active]="tab() === 'files'"
          (click)="selectTab('files')"
          aria-controls="admin-panel"
          data-testid="admin-tab-files"
          role="tab"
          type="button"
        >
          服务器副本
        </button>
      </div>
      <section class="card bg-base-100" id="admin-panel" [attr.aria-labelledby]="'admin-tab-' + tab()" role="tabpanel">
        <div class="overflow-x-auto p-2">
          @switch (tab()) {
            @case ('accounts') {
              <table class="table-xs md:table-sm table">
                <caption class="sr-only">
                  账号
                </caption>
                <thead>
                  <tr>
                    <th scope="col">账号</th>
                    <th class="hidden md:table-cell" scope="col">注册时间</th>
                    <th class="hidden md:table-cell" scope="col">最近登录</th>
                    <th class="text-right" scope="col">设备</th>
                    <th class="text-right" scope="col">声明</th>
                    <th scope="col"><span class="sr-only">操作</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (account of accountPage()?.accounts ?? []; track account.id) {
                    <tr [attr.data-email]="account.email" data-testid="admin-account-row">
                      <td class="break-words">
                        {{ account.email }}
                        @if (isSelf(account)) {
                          <span class="badge badge-ghost badge-sm ml-1">你</span>
                        } @else if (account.admin) {
                          <span class="badge badge-info badge-sm ml-1">管理员</span>
                        }
                        @if (account.banned) {
                          <span class="badge badge-error badge-sm ml-1" data-testid="admin-banned">已封禁</span>
                        }
                      </td>
                      <td class="hidden whitespace-nowrap md:table-cell">
                        {{ account.createdAt | date: 'yyyy-MM-dd HH:mm' }}
                      </td>
                      <td class="hidden whitespace-nowrap md:table-cell">
                        {{ account.lastSignInAt ? (account.lastSignInAt | date: 'yyyy-MM-dd HH:mm') : '从未登录' }}
                      </td>
                      <td class="text-right" data-testid="admin-device-count">{{ account.deviceCount }}</td>
                      <td class="text-right" data-testid="admin-claim-count">{{ account.claimCount }}</td>
                      <td class="text-right whitespace-nowrap">
                        @if (account.admin) {
                          <span class="text-base-content/50 hidden text-xs sm:inline">管理员账号不在此处处置</span>
                        } @else {
                          @if (account.banned) {
                            <button
                              class="btn btn-ghost btn-xs"
                              [attr.aria-label]="'解封 ' + account.email"
                              [disabled]="busy()"
                              (click)="unban(account)"
                              data-testid="admin-unban"
                              type="button"
                            >
                              解封
                            </button>
                          } @else {
                            <button
                              class="btn btn-ghost btn-xs"
                              [attr.aria-label]="'封禁 ' + account.email"
                              [disabled]="busy()"
                              (click)="ask({ kind: 'ban', account })"
                              data-testid="admin-ban"
                              type="button"
                            >
                              封禁
                            </button>
                          }
                          <button
                            class="btn btn-ghost btn-xs text-error"
                            [attr.aria-label]="'删除 ' + account.email"
                            [disabled]="busy()"
                            (click)="ask({ kind: 'delete-account', account })"
                            data-testid="admin-delete-account"
                            type="button"
                          >
                            删除
                          </button>
                        }
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td class="text-base-content/55 py-8 text-center" colspan="6">没有账号</td>
                    </tr>
                  }
                </tbody>
              </table>
              @if (pageCount() > 1) {
                <div class="flex items-center justify-center gap-3 py-3 text-sm" data-testid="admin-pagination">
                  <button
                    class="btn btn-ghost btn-sm"
                    [disabled]="loading() || currentPage() <= 1"
                    (click)="goToPage(currentPage() - 1)"
                    type="button"
                  >
                    上一页
                  </button>
                  <span>第 {{ currentPage() }} / {{ pageCount() }} 页</span>
                  <button
                    class="btn btn-ghost btn-sm"
                    [disabled]="loading() || currentPage() >= pageCount()"
                    (click)="goToPage(currentPage() + 1)"
                    type="button"
                  >
                    下一页
                  </button>
                </div>
              }
            }
            @case ('online') {
              <table class="table-xs md:table-sm table">
                <caption class="sr-only">
                  在线设备
                </caption>
                <thead>
                  <tr>
                    <th scope="col">设备</th>
                    <th scope="col">账号</th>
                    <th class="hidden sm:table-cell" scope="col">实例</th>
                    <th scope="col"><span class="sr-only">操作</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (device of devices(); track device.instanceKey) {
                    <tr
                      [attr.data-device]="device.deviceName"
                      [attr.data-email]="device.userName"
                      data-testid="admin-device-row"
                    >
                      <td class="break-words">{{ device.deviceName }}</td>
                      <td class="break-words">{{ device.userName }}</td>
                      <td class="text-base-content/55 hidden font-mono text-xs sm:table-cell">
                        {{ device.instanceKey.slice(0, 8) }}
                      </td>
                      <td class="text-right whitespace-nowrap">
                        <button
                          class="btn btn-ghost btn-xs text-error"
                          [attr.aria-label]="'让 ' + device.deviceName + ' 下线'"
                          [disabled]="busy()"
                          (click)="ask({ kind: 'kick', device })"
                          data-testid="admin-kick"
                          type="button"
                        >
                          踢下线
                        </button>
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td class="text-base-content/55 py-8 text-center" colspan="4">现在没有设备在线</td>
                    </tr>
                  }
                </tbody>
              </table>
              <p class="text-base-content/55 px-3 pb-3 text-xs">
                同一台设备开了几个页面就有几行。被踢下线的页面需要刷新后才会重新连接。
              </p>
            }
            @case ('files') {
              <table class="table-xs md:table-sm table">
                <caption class="sr-only">
                  服务器副本
                </caption>
                <thead>
                  <tr>
                    <th scope="col">文件</th>
                    <th class="hidden md:table-cell" scope="col">内容哈希</th>
                    <th class="text-right" scope="col">大小</th>
                    <th class="hidden md:table-cell" scope="col">上传时间</th>
                    <th class="text-right" scope="col">持有者</th>
                    <th scope="col"><span class="sr-only">操作</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (file of serverFiles()?.files ?? []; track file.contentHash) {
                    <tr [attr.data-hash]="file.contentHash" data-testid="admin-file-row">
                      <td class="break-words">
                        @if (file.fileName) {
                          {{ file.fileName }}
                        } @else {
                          <span class="text-base-content/55">清单里已没有这个文件</span>
                        }
                      </td>
                      <td class="text-base-content/55 hidden font-mono text-xs md:table-cell">{{ hash(file) }}</td>
                      <td class="text-right whitespace-nowrap">{{ size(file.size) }}</td>
                      <td class="hidden whitespace-nowrap md:table-cell">
                        {{ file.uploadedAt | date: 'yyyy-MM-dd HH:mm' }}
                      </td>
                      <td class="text-right">{{ file.holderCount }}</td>
                      <td class="text-right whitespace-nowrap">
                        <button
                          class="btn btn-ghost btn-xs text-error"
                          [attr.aria-label]="'删除服务器副本 ' + (file.fileName ?? hash(file))"
                          [disabled]="busy()"
                          (click)="ask({ kind: 'delete-file', file })"
                          data-testid="admin-delete-file"
                          type="button"
                        >
                          删除副本
                        </button>
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td class="text-base-content/55 py-8 text-center" colspan="6">服务器上没有文件副本</td>
                    </tr>
                  }
                </tbody>
              </table>
              @if (serverFiles()?.truncated) {
                <p class="text-base-content/55 px-3 pb-3 text-xs">
                  副本太多，只列出了前 {{ serverFiles()?.files?.length }} 个。
                </p>
              }
            }
          }
        </div>
      </section>
    </main>
  `
})
export default class AdminPage implements OnInit {
  readonly #api = inject(AdminApi);
  /** 账号表正在看的页码；刷新沿用它。 */
  #page = 1;
  readonly auth = inject(AuthService);
  readonly tab = signal<AdminTab>('accounts');
  readonly accountPage = signal<AdminAccountPage | null>(null);
  readonly devices = signal<readonly AdminOnlineDevice[]>([]);
  readonly serverFiles = signal<AdminServerFiles | null>(null);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly signingOut = signal(false);
  /** 处置或退出失败的原因。 */
  readonly error = signal<string | null>(null);
  /** 某个分区没加载出来的原因；其余分区照常显示。 */
  readonly loadError = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly pending = signal<PendingAction | null>(null);
  readonly confirmation = computed(() => {
    const action = this.pending();
    return action ? confirmationOf(action) : null;
  });
  readonly currentPage = computed(() => this.accountPage()?.page ?? 1);
  readonly pageCount = computed(() => pageCountOf(this.accountPage()?.total ?? 0));

  ngOnInit(): void {
    void this.refresh();
  }

  size(bytes: number): string {
    return formatFileSize(bytes);
  }

  hash(file: AdminServerFile): string {
    return shortHash(file.contentHash);
  }

  /** 是不是当前登录的管理员自己。 */
  isSelf(account: AdminAccount): boolean {
    return account.id === this.auth.session()?.user?.id;
  }

  selectTab(tab: AdminTab): void {
    this.tab.set(tab);
  }

  /** 重新加载三个分区；某个分区失败不影响其余分区，失败原因在 {@link AdminPage.loadError}。 */
  async refresh(): Promise<void> {
    this.loading.set(true);
    const sections = await Promise.allSettled([this.#api.accounts(this.#page), this.#api.online(), this.#api.files()]);
    const [accounts, online, files] = sections;
    if (accounts.status === 'fulfilled') this.accountPage.set(accounts.value);
    if (online.status === 'fulfilled') this.devices.set(online.value);
    if (files.status === 'fulfilled') this.serverFiles.set(files.value);
    const labels = ['账号列表', '在线设备', '服务器副本'];
    const failures = sections.flatMap((section, index) =>
      section.status === 'rejected' ? [`${labels[index]}加载失败：${messageOf(section.reason)}`] : []
    );
    this.loadError.set(failures.length > 0 ? failures.join('；') : null);
    this.loading.set(false);
    // 删光了最后一页的账号，页码会落在范围外：退回新的最后一页
    const lastPage = accounts.status === 'fulfilled' ? pageCountOf(accounts.value.total) : this.#page;
    if (this.#page > lastPage) {
      this.#page = lastPage;
      await this.refresh();
    }
  }

  async goToPage(page: number): Promise<void> {
    if (page < 1 || page > this.pageCount() || this.loading()) return;
    this.#page = page;
    await this.refresh();
  }

  /** 先摆出后果，等管理员确认。 */
  ask(action: PendingAction): void {
    this.pending.set(action);
  }

  cancel(): void {
    this.pending.set(null);
  }

  /** 执行等待确认的处置；正在执行时忽略重复点击。 */
  async confirm(): Promise<void> {
    const action = this.pending();
    if (!action || this.busy()) return;
    await this.#run(() => this.#perform(action));
  }

  /** 解封不丢任何东西，不需要确认。 */
  async unban(account: AdminAccount): Promise<void> {
    if (this.busy()) return;
    await this.#run(async () => {
      await this.#api.unban(account.id);
      return `已解封 ${account.email}`;
    });
  }

  async signOut(): Promise<void> {
    this.signingOut.set(true);
    try {
      await this.auth.signOut();
    } catch (error) {
      this.error.set(messageOf(error));
      this.signingOut.set(false);
    }
  }

  async #perform(action: PendingAction): Promise<string> {
    switch (action.kind) {
      case 'ban': {
        const { evictedDevices } = await this.#api.ban(action.account.id);
        return `已封禁 ${action.account.email}，断开了 ${evictedDevices} 个在线连接`;
      }
      case 'delete-account': {
        const { purgedClaims, evictedDevices } = await this.#api.deleteAccount(action.account.id);
        return `已删除 ${action.account.email}：清掉 ${purgedClaims} 条持有声明，断开了 ${evictedDevices} 个在线连接`;
      }
      case 'kick': {
        const { evictedDevices } = await this.#api.kick(action.device.deviceId);
        return `已让“${action.device.deviceName}”下线（${evictedDevices} 个连接）`;
      }
      case 'delete-file':
        await this.#api.deleteFile(action.file.contentHash);
        return `已删除服务器副本“${copyName(action.file)}”`;
    }
  }

  /**
   * 执行一项处置：无论成败都收起确认并重新加载，加载完才一并显示结果——封禁成功但断开设备失败时，
   * 列表要如实反映当前状态，也不会出现「已封禁」写在一行没变的记录上方；刷新期间保持忙碌，挡住重复点击。
   */
  async #run(task: () => Promise<string>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    let outcome: { readonly notice: string | null; readonly error: string | null };
    try {
      outcome = { notice: await task(), error: null };
    } catch (error) {
      outcome = { notice: null, error: messageOf(error) };
    }
    this.pending.set(null);
    await this.refresh();
    this.notice.set(outcome.notice);
    this.error.set(outcome.error);
    this.busy.set(false);
  }
}
