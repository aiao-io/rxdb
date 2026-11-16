import type { EntityType } from '@aiao/rxdb';
import { AdminLayoutComponent, AdminPageDirective } from '@aiao/rxdb-admin-angular';
import { useCount, useRxDB, type RxDBResource } from '@aiao/rxdb-angular';
import { useI18n } from '@aiao/rxdb-i18n-angular';
import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  Injector,
  input,
  runInInjectionContext,
  type OnInit
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
  RouterOutlet
} from '@angular/router';
import { LucideDatabase as Database, LucideDynamicIcon } from '@lucide/angular';
import { filter, map } from 'rxjs';
import { findWorkbenchEntity, visibleEntityEntries, type WorkbenchEntityEntry } from './entities/entity-registry';
import { createRecordSearchSource } from './shell/record-search';
import { buildWorkbenchMenu, entryOfMenuId } from './shell/workbench-menu';
import { bindWorkbenchNavigator, workbenchShell } from './shell/workbench-shell';

@Component({
  selector: 'app-count-value',
  host: { style: 'display: contents' },
  template: `<span class="badge badge-ghost badge-xs">{{ count?.value() ?? 0 }}</span>`
})
export class CountValue implements OnInit {
  private readonly db = useRxDB();
  private readonly injector = inject(Injector);
  readonly entry = input.required<WorkbenchEntityEntry>();
  count: RxDBResource<number> | undefined;
  ngOnInit(): void {
    const entity = findWorkbenchEntity(
      this.db.config.entities,
      this.entry().namespace,
      this.entry().name
    ) as EntityType;
    this.count = runInInjectionContext(this.injector, () =>
      useCount(entity, { where: { combinator: 'and', rules: [] } })
    );
  }
}

@Component({
  selector: 'app-entity-count',
  imports: [CountValue],
  host: { style: 'display: contents' },
  template: `@if (connected()) {
    <app-count-value [entry]="entry()" />
  }`
})
export class EntityCount {
  readonly entry = input.required<WorkbenchEntityEntry>();
  readonly connected = toSignal(useRxDB().adapterConnected$('sqlite-wasm'), { initialValue: false });
}

@Component({
  selector: 'app-root',
  imports: [AdminLayoutComponent, AdminPageDirective, RouterOutlet, LucideDynamicIcon, EntityCount],
  template: ` <rxdb-admin-layout [menu]="menu()" [menuExtra]="menuExtra" [navigating]="navigating()" [url]="url()">
    <svg [lucideIcon]="Database" [size]="16" aria-hidden="true" brandIcon></svg>
    <ng-template #menuExtra let-node>
      @if (entryOfMenuId(entries, node.id); as entry) {
        <app-entity-count [entry]="entry" />
      }
    </ng-template>
    <router-outlet *rxdbAdminPage />
  </rxdb-admin-layout>`
})
export class App {
  private readonly db = useRxDB();
  private readonly router = inject(Router);
  private readonly i18n = useI18n();
  readonly Database = Database;
  readonly entries = visibleEntityEntries(this.db.config.entities);
  readonly entryOfMenuId = entryOfMenuId;
  readonly menu = computed(() => buildWorkbenchMenu(this.db.config.entities, this.i18n.t));
  readonly url = toSignal(
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      map(event => event.urlAfterRedirects)
    ),
    { initialValue: this.router.url }
  );
  readonly navigating = toSignal(
    this.router.events.pipe(
      filter(
        event =>
          event instanceof NavigationStart ||
          event instanceof NavigationEnd ||
          event instanceof NavigationCancel ||
          event instanceof NavigationError
      ),
      map(event => event instanceof NavigationStart)
    ),
    { initialValue: false }
  );
  constructor() {
    bindWorkbenchNavigator(url => void this.router.navigateByUrl(url));
    const stop = effect(onCleanup => {
      this.i18n.locale();
      onCleanup(
        workbenchShell.palette.registerSource(
          createRecordSearchSource(this.db, url => void this.router.navigateByUrl(url), this.i18n.t)
        )
      );
    });
    inject(DestroyRef).onDestroy(() => stop.destroy());
  }
}
