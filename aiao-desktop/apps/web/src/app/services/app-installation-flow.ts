import { I18N } from '@aiao/rxdb-i18n-angular';
import { Service, computed, inject, signal } from '@angular/core';

import { ApprovedRelease } from '../data/approved-catalog';
import { ApplicationTransitions } from './application-transitions';
import { CatalogAppId } from './desktop-apps';
import { FileSystem } from './file-system';
import { InstalledApplications } from './installed-applications';
import { WindowManager } from './window-manager';

/** 批准目录校验抛出的英文错误消息 → 目录 key（显示边界统一翻译，未知消息原样透传）。 */
const CATALOG_ERROR_KEYS: Readonly<Record<string, string>> = {
  'Invalid catalog or installation record.': 'error.catalog.invalidRecord',
  'Invalid release identity or description.': 'error.catalog.invalidRelease',
  'Invalid application name.': 'error.catalog.invalidName',
  'Invalid release capabilities.': 'error.catalog.invalidCapabilities',
  'An immutable versioned release URL is required.': 'error.catalog.releaseUrlRequired',
  'The approved catalog is limited to 1 MiB.': 'error.catalog.tooLarge',
  'The application catalog does not match operator approval.': 'error.catalog.hashMismatch',
  'Unsupported application catalog format.': 'error.catalog.unsupportedFormat',
  'Invalid application installation state.': 'error.catalog.invalidState',
  'Invalid application installation record.': 'error.catalog.invalidInstallationRecord',
  'Duplicate application installation records.': 'error.catalog.duplicateRecords',
  'The requested release is not approved.': 'error.catalog.releaseNotApproved',
  'The initiating desktop tab was closed.': 'error.transition.tabClosed',
  'The application window was closed.': 'error.transition.windowClosed',
  'Another application change is already in progress. Try again when it finishes.': 'error.transition.inProgress',
  'Return to the other desktop tabs and close this application, then try again.': 'error.transition.returnToTabs'
};

/** 确认面板里展示的动作文案 key（Install/Update/Roll Back/Uninstall）。 */
export type InstallationActionKey =
  | 'apps.appstore.installAction'
  | 'apps.appstore.updateAction'
  | 'apps.appstore.rollBackAction'
  | 'apps.appstore.uninstallAction';

export type InstallationRequest =
  | {
      readonly kind: 'release';
      readonly id: CatalogAppId;
      readonly name: string;
      readonly action: InstallationActionKey;
      readonly previous: string | null;
      readonly release: ApprovedRelease | null;
    }
  | { readonly kind: 'reset' };

const compareVersion = (left: string, right: string): number => {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
};

/** 商店操作先展示权限和版本，再协商关闭与提交；错误保留确认内容供重试。 */
@Service({ autoProvided: false })
export class AppInstallationFlow {
  private readonly transitions = inject(ApplicationTransitions);
  private readonly applications = inject(InstalledApplications);
  private readonly files = inject(FileSystem);
  private readonly windows = inject(WindowManager);
  private readonly i18n = inject(I18N);
  /** 安装/卸载进行中用户点了取消：在下个检查点停下，不写盘（提交一旦开始就原子完成）。 */
  private abortRequested = false;
  readonly busy = signal(false);
  readonly error = signal('');
  readonly status = signal('');
  readonly pending = signal<InstallationRequest | null>(null);
  readonly items = computed(() => {
    const releases = this.applications.catalog().releases;
    const latest = new Map<CatalogAppId, ApprovedRelease>();
    for (const release of releases) {
      const current = latest.get(release.id);
      if (!current || compareVersion(release.version, current.version) > 0) latest.set(release.id, release);
    }
    return [...latest.values()]
      .map(release => {
        const installed = this.applications.state().apps.find(app => app.id === release.id);
        return {
          id: release.id,
          latest: release,
          installed: installed ?? null,
          canUpdate: !!installed && compareVersion(release.version, installed.version) > 0,
          rollback: releases.find(item => item.id === release.id && item.version === installed?.previous) ?? null,
          origin: new URL(release.url).origin
        };
      })
      .sort((left, right) => left.latest.name.localeCompare(right.latest.name));
  });

  request(id: CatalogAppId, version: string | null): void {
    if (this.busy()) return;
    const item = this.items().find(item => item.id === id);
    const release = this.applications
      .catalog()
      .releases.find(release => release.id === id && release.version === version);
    this.error.set('');
    if (!item || (version !== null && !release) || (version === null && !item.installed)) {
      this.error.set(this.i18n.t('error.install.versionNotApproved'));
      return;
    }
    const action: InstallationActionKey =
      version === null ? 'apps.appstore.uninstallAction'
      : !item.installed ? 'apps.appstore.installAction'
      : version === item.installed.previous ? 'apps.appstore.rollBackAction'
      : 'apps.appstore.updateAction';
    this.pending.set({
      kind: 'release',
      id,
      name: item.latest.name,
      action,
      previous: item.installed?.version ?? null,
      release: release ?? null
    });
  }

  requestReset(): void {
    if (this.busy()) return;
    this.error.set('');
    this.pending.set({ kind: 'reset' });
  }

  cancel(): void {
    /* 进行中：请求中止，在下个检查点停下（macOS App Store 的 Cancel）；请求保留在确认面板供重试。 */
    if (this.busy()) {
      this.abortRequested = true;
      this.status.set(this.i18n.t('apps.appstore.cancelling'));
      return;
    }
    this.pending.set(null);
    this.error.set('');
  }

  open(id: CatalogAppId): void {
    if (this.applications.state().apps.some(app => app.id === id)) this.windows.open(id);
  }

  async refresh(): Promise<void> {
    await this.perform(async () => {
      await this.applications.refresh();
      this.status.set(this.i18n.t('apps.appstore.catalogRefreshed'));
    });
  }

  async confirm(): Promise<void> {
    const request = this.pending();
    if (!request) return;
    await this.perform(async () => {
      if (this.abortRequested) {
        this.status.set(this.i18n.t('apps.appstore.operationCancelled'));
        this.pending.set(null);
        return;
      }
      const ids = request.kind === 'reset' ? this.applications.state().apps.map(app => app.id) : [request.id];
      this.status.set(this.i18n.t('apps.appstore.waitingForWindows'));
      let cancelled = false;
      const completed = await this.transitions.change(ids, async () => {
        /* 关窗协商期间用户取消：提交前停下，不写盘；提交本身是原子的，一旦开始就完成。 */
        if (this.abortRequested) {
          cancelled = true;
          return;
        }
        await this.commit(request);
      });
      if (cancelled || !completed) this.status.set(this.i18n.t('apps.appstore.operationCancelled'));
      /* 取消与失败都关闭确认面板：重试从商店重新请求（与取消关窗协商的既有语义一致）。 */
      this.pending.set(null);
    });
  }

  private async commit(request: InstallationRequest): Promise<void> {
    const project = (releases: readonly ApprovedRelease[], commit: () => Promise<void>) =>
      this.files.projectApplications(releases, commit);
    if (request.kind === 'reset') {
      await this.applications.reset(project);
      this.status.set(this.i18n.t('apps.appstore.resetComplete'));
      return;
    }
    await this.applications.apply(request.id, request.release?.version ?? null, project, request.previous);
    this.status.set(
      request.release ?
        this.i18n.t('apps.appstore.installedToast', { name: request.name, version: request.release.version })
      : this.i18n.t('apps.appstore.uninstalledToast', { name: request.name })
    );
  }

  private async perform(action: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.abortRequested = false;
    this.status.set(this.i18n.t('apps.appstore.working'));
    try {
      await action();
    } catch (error) {
      this.status.set('');
      const message = error instanceof Error ? error.message : String(error);
      this.error.set(CATALOG_ERROR_KEYS[message] ? this.i18n.t(CATALOG_ERROR_KEYS[message]) : message);
    } finally {
      this.busy.set(false);
    }
  }
}
