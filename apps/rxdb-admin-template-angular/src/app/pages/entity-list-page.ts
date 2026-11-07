import { useRxDB } from '@aiao/rxdb-angular';
import { useI18n } from '@aiao/rxdb-i18n-angular';
import { EntityListComponent } from '@aiao/rxdb-model-angular';
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { findWorkbenchEntity } from '../entities/entity-registry';
@Component({
  selector: 'app-entity-list-page',
  imports: [EntityListComponent],
  template: ` @if (found()) {
      <div class="page-host"><rxdb-entity-list [name]="name()" [namespace]="namespace()" /></div>
    } @else {
      <div class="page-host items-center justify-center gap-2 p-8" data-testid="entity-load-failed" role="alert">
        <span class="text-error font-semibold">{{ t('entity.loadFailed') }}</span>
        <span>{{ t('entity.notFound', { namespace: namespace(), name: name() }) }}</span>
      </div>
    }`
})
export default class EntityListPage {
  private readonly db = useRxDB();
  private readonly params = toSignal(inject(ActivatedRoute).paramMap, { requireSync: true });
  readonly namespace = computed(() => this.params().get('namespace') ?? '');
  readonly name = computed(() => this.params().get('name') ?? '');
  readonly found = computed(() => findWorkbenchEntity(this.db.config.entities, this.namespace(), this.name()));
  readonly t = useI18n().t;
}
