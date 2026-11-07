import { useRxDB } from '@aiao/rxdb-angular';
import { useI18n } from '@aiao/rxdb-i18n-angular';
import { Component, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { visibleEntityEntries } from '../entities/entity-registry';
@Component({
  selector: 'app-entity-shell',
  imports: [RouterOutlet],
  template: `<div class="page-host" data-testid="entity-shell">
    @if (empty) {
      <div role="alert">{{ t('entity.none') }}</div>
    }
    <router-outlet />
  </div>`
})
export default class EntityShell {
  readonly t = useI18n().t;
  readonly entries = visibleEntityEntries(useRxDB().config.entities);
  readonly empty = this.entries.length === 0;
  constructor() {
    const router = inject(Router);
    const first = this.entries[0];
    if (first && router.url.split(/[?#]/, 1)[0] === '/entities')
      void router.navigateByUrl(`/entities/${first.namespace}/${first.name}`, { replaceUrl: true });
  }
}
