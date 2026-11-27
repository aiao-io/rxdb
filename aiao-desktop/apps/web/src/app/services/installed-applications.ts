import { I18N } from '@aiao/rxdb-i18n-angular';
import { Service, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';

import {
  ApprovedCatalog,
  ApprovedRelease,
  Installations,
  approveCatalog,
  changeInstallation,
  parseInstallations,
  resolveInstallations
} from '../data/approved-catalog';
import { APPROVED_CATALOG_CONFIG } from '../data/approved-catalog-config';
import { DesktopData, keyIs } from '../data/desktop-data';
import { Preferences } from '../data/preferences';
import { SystemPreference } from '../data/system-preference.entity';
import { ApplicationRegistry } from './application-registry';
import { CatalogAppId } from './desktop-apps';

export const CATALOG_CACHE_KEY = 'apps:approved-catalog';
export const INSTALLATIONS_KEY = 'apps:installed';
const INSTALL_LOCK = 'aiao-desktop-app-install';

export type ProjectInstallations = (releases: readonly ApprovedRelease[], commit: () => Promise<void>) => Promise<void>;

async function catalogBytes(
  response: Response,
  t: (key: string, english: string, params?: Record<string, unknown>) => string
): Promise<Uint8Array<ArrayBuffer>> {
  if (!response.ok || response.redirected || !response.body)
    throw new Error(
      t('error.install.catalogLoadFailed', `Could not load the approved catalog (${response.status}).`, {
        status: response.status
      })
    );
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    let next = await reader.read();
    while (!next.done) {
      size += next.value.byteLength;
      if (size > 1024 * 1024)
        throw new Error(t('error.install.catalogTooLarge', 'The approved catalog is limited to 1 MiB.'));
      chunks.push(next.value);
      next = await reader.read();
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

interface InstallationSnapshot {
  readonly state: Installations;
  readonly catalog: ApprovedCatalog;
}

const emptySnapshot = (): InstallationSnapshot => ({
  state: { version: 1, apps: [] },
  catalog: { releases: [], problems: [] }
});

@Service({ autoProvided: false })
export class InstalledApplications {
  private readonly preferences = inject(Preferences);
  private readonly data = inject(DesktopData);
  private readonly registry = inject(ApplicationRegistry);
  private readonly config = inject(APPROVED_CATALOG_CONFIG);
  private readonly i18nRuntime = inject(I18N, { optional: true }) ?? undefined;
  /** 用户可见错误消息的翻译：未注入 i18n 运行时（单测）时回退英文原文。 */
  private readonly catalogValue = signal<ApprovedCatalog>({ releases: [], problems: [] });
  private readonly stateValue = signal<Installations>({ version: 1, apps: [] });
  private readonly failureValue = signal('');
  private revision = 0;
  readonly catalog = this.catalogValue.asReadonly();
  readonly state = this.stateValue.asReadonly();
  readonly failure = this.failureValue.asReadonly();
  readonly ready: Promise<readonly ApprovedRelease[]>;

  constructor() {
    this.ready = this.reload();
    this.preferences.external$
      .pipe(
        filter(keys => keys.includes(CATALOG_CACHE_KEY) || keys.includes(INSTALLATIONS_KEY)),
        takeUntilDestroyed()
      )
      .subscribe(() => void this.reload());
  }

  async refresh(): Promise<void> {
    await this.ready;
    const url = new URL(this.config.file, document.baseURI);
    if (url.origin !== new URL(document.baseURI).origin)
      throw new Error(
        this.t('error.install.catalogOriginMismatch', 'The approved catalog must use the desktop origin.')
      );
    const response = await fetch(url, {
      mode: 'same-origin',
      credentials: 'same-origin',
      redirect: 'error',
      cache: 'no-cache',
      signal: AbortSignal.timeout(15000)
    });
    const bytes = await catalogBytes(response, this.t);
    const catalog = await approveCatalog(bytes, this.config.sha256);
    await this.data.tabs.exclusive(async () => {
      const rows = await this.records();
      const state = parseInstallations(rows.get(INSTALLATIONS_KEY));
      const releases = resolveInstallations(state, catalog.releases);
      this.registry.definitionsFor(releases);
      await this.preferences.set(CATALOG_CACHE_KEY, {
        digest: this.config.sha256,
        contents: new TextDecoder().decode(bytes)
      });
      this.publish({ state, catalog });
    }, INSTALL_LOCK);
  }

  async apply(
    id: CatalogAppId,
    version: string | null,
    project: ProjectInstallations,
    expected?: string | null
  ): Promise<void> {
    await this.ready;
    await this.data.tabs.exclusive(async () => {
      const snapshot = await this.snapshot();
      const current = snapshot.state.apps.find(app => app.id === id)?.version ?? null;
      if (expected !== undefined && expected !== current)
        throw new Error(
          this.t(
            'error.install.changedInAnotherTab',
            'This application changed in another tab. Review the current version and confirm again.'
          )
        );
      const state = changeInstallation(snapshot.state, snapshot.catalog.releases, id, version);
      const releases = resolveInstallations(state, snapshot.catalog.releases);
      this.registry.definitionsFor(releases);
      await project(releases, () => this.preferences.set(INSTALLATIONS_KEY, state));
      this.publish({ state, catalog: snapshot.catalog });
    }, INSTALL_LOCK);
  }

  /** 仅由用户确认的重置入口调用；清除可选安装记录，投影层保留用户文件。 */
  async reset(project: ProjectInstallations): Promise<void> {
    await this.ready;
    await this.data.tabs.exclusive(async () => {
      const snapshot = emptySnapshot();
      await project([], async () => {
        await this.preferences.set(INSTALLATIONS_KEY, snapshot.state);
        await this.preferences.set(CATALOG_CACHE_KEY, null);
      });
      this.publish(snapshot);
    }, INSTALL_LOCK);
  }

  /** 文件操作持有磁盘锁后重读同一 SQL 快照；安装提交也在该锁内，不能拿旧偏好缓存重写应用包。 */
  async reload(): Promise<readonly ApprovedRelease[]> {
    const revision = ++this.revision;
    try {
      await this.preferences.ready;
      const snapshot = await this.snapshot();
      const releases = resolveInstallations(snapshot.state, snapshot.catalog.releases);
      if (revision === this.revision) this.publish(snapshot);
      return releases;
    } catch (error) {
      if (revision !== this.revision) return [];
      this.registry.replace([]);
      this.catalogValue.set({ releases: [], problems: [] });
      this.stateValue.set({ version: 1, apps: [] });
      this.failureValue.set(error instanceof Error ? error.message : String(error));
      return [];
    }
  }

  private publish(snapshot: InstallationSnapshot): void {
    this.revision++;
    this.registry.replace(resolveInstallations(snapshot.state, snapshot.catalog.releases));
    this.catalogValue.set(snapshot.catalog);
    this.stateValue.set(snapshot.state);
    this.failureValue.set('');
  }

  private async records(): Promise<ReadonlyMap<string, unknown>> {
    const repository = await this.data.repository(SystemPreference);
    const rows = await repository.find({
      where: { combinator: 'or', rules: [...keyIs(INSTALLATIONS_KEY).rules, ...keyIs(CATALOG_CACHE_KEY).rules] }
    });
    return new Map(rows.map(row => [row.key, row.value]));
  }

  private async snapshot(): Promise<InstallationSnapshot> {
    const rows = await this.records();
    const state = parseInstallations(rows.get(INSTALLATIONS_KEY));
    const saved = rows.get(CATALOG_CACHE_KEY);
    const catalog =
      saved === undefined || saved === null ? { releases: [], problems: [] } : await this.cachedCatalog(saved);
    this.registry.definitionsFor(resolveInstallations(state, catalog.releases));
    return { state, catalog };
  }

  private async cachedCatalog(raw: unknown): Promise<ApprovedCatalog> {
    const saved = raw as { digest?: unknown; contents?: unknown } | null;
    if (
      !saved ||
      typeof saved.digest !== 'string' ||
      typeof saved.contents !== 'string' ||
      saved.contents.length > 1024 * 1024 ||
      !this.config.trustedDigests.includes(saved.digest)
    )
      throw new Error(
        this.t(
          'error.install.catalogNotApproved',
          'The saved application catalog is not approved by this desktop build.'
        )
      );
    return approveCatalog(new TextEncoder().encode(saved.contents), saved.digest);
  }

  /** 面向用户的文案：注入 i18n 时按当前语言显示，否则回退英文原文。bind 成字段，作为回调传出时 `this` 不丢。 */
  private readonly t = ((key: string, english: string, params?: Record<string, unknown>): string =>
    this.i18nRuntime?.t(key, params) ?? english).bind(this);
}
