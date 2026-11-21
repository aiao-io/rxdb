import { Service, computed, inject, signal } from '@angular/core';

import { ApprovedRelease } from '../data/approved-catalog';
import { ApplicationTransitions } from './application-transitions';
import { CatalogAppId } from './desktop-apps';
import { FileSystem } from './file-system';
import { InstalledApplications } from './installed-applications';
import { WindowManager } from './window-manager';

export type InstallationRequest =
  | {
      readonly kind: 'release';
      readonly id: CatalogAppId;
      readonly name: string;
      readonly action: 'Install' | 'Update' | 'Roll Back' | 'Uninstall';
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
      this.error.set('The requested application version is not approved or installed. Refresh the catalog.');
      return;
    }
    const action =
      version === null ? 'Uninstall'
      : !item.installed ? 'Install'
      : version === item.installed.previous ? 'Roll Back'
      : 'Update';
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
    if (this.busy()) return;
    this.pending.set(null);
    this.error.set('');
  }

  open(id: CatalogAppId): void {
    if (this.applications.state().apps.some(app => app.id === id)) this.windows.open(id);
  }

  async refresh(): Promise<void> {
    await this.perform(async () => {
      await this.applications.refresh();
      this.status.set('Approved catalog refreshed.');
    });
  }

  async confirm(): Promise<void> {
    const request = this.pending();
    if (!request) return;
    await this.perform(async () => {
      const ids = request.kind === 'reset' ? this.applications.state().apps.map(app => app.id) : [request.id];
      this.status.set('Waiting for open application windows in all desktop tabs…');
      const completed = await this.transitions.change(ids, () => this.commit(request));
      if (!completed) this.status.set('Operation cancelled. The installed version is unchanged.');
      this.pending.set(null);
    });
  }

  private async commit(request: InstallationRequest): Promise<void> {
    const project = (releases: readonly ApprovedRelease[], commit: () => Promise<void>) =>
      this.files.projectApplications(releases, commit);
    if (request.kind === 'reset') {
      await this.applications.reset(project);
      this.status.set('Optional application records reset. Your files are kept. Refresh the catalog to install again.');
      return;
    }
    await this.applications.apply(request.id, request.release?.version ?? null, project, request.previous);
    this.status.set(
      request.release ?
        `${request.name} ${request.release.version} is installed.`
      : `${request.name} was uninstalled. Your files are kept.`
    );
  }

  private async perform(action: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.status.set('Working…');
    try {
      await action();
    } catch (error) {
      this.status.set('');
      this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.busy.set(false);
    }
  }
}
