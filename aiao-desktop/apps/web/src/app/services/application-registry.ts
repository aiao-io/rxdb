import { I18N } from '@aiao/rxdb-i18n-angular';
import { Service, computed, inject, signal } from '@angular/core';

import { ApprovedRelease, catalogManifest } from '../data/approved-catalog';
import { DESKTOP_APPS, DesktopAppRegistry, LAUNCH_ORDER, assertManifests } from './desktop-apps';

/** 预装定义与已批准安装共用一张可响应登记表，入口与宿主不能各存一份。 */
@Service({ autoProvided: false })
export class ApplicationRegistry {
  private readonly base = inject(DESKTOP_APPS);
  private readonly i18nRuntime = inject(I18N, { optional: true }) ?? undefined;
  private readonly state = signal(this.base);
  readonly apps = this.state.asReadonly();
  readonly launchOrder = computed(() => [
    ...LAUNCH_ORDER,
    ...Object.values(this.apps())
      .filter(app => app.id.startsWith('catalog:'))
      .map(app => app.id)
  ]);

  definitionsFor(releases: readonly ApprovedRelease[]): DesktopAppRegistry {
    const names = new Set(Object.values(this.base).map(app => app.name));
    if (releases.some(release => names.has(release.name)))
      throw new Error(
        this.i18nRuntime ?
          this.i18nRuntime.t('error.install.nameConflictWithPreinstalled')
        : 'Installed application names conflict with preinstalled applications.'
      );
    const installed = releases.map(release => [
      release.id,
      {
        ...catalogManifest(release),
        load: () => import('../apps/web-app/web-app').then(module => module.WebAppWindow)
      }
    ]);
    const next: DesktopAppRegistry = { ...this.base, ...Object.fromEntries(installed) };
    assertManifests(next);
    return next;
  }
  replace(releases: readonly ApprovedRelease[]): void {
    const next = this.definitionsFor(releases);
    if (JSON.stringify(next) !== JSON.stringify(this.state())) this.state.set(next);
  }
}
