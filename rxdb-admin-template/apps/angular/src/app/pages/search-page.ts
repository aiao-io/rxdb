import { injectAdminStore } from '@aiao/rxdb-admin-angular';
import { useRxDB } from '@aiao/rxdb-angular';
import { useI18n } from '@aiao/rxdb-i18n-angular';
import { useSearch } from '@aiao/rxdb-plugin-search-angular';
import { Component, computed, signal } from '@angular/core';
import { entityDisplayName, fieldDisplayName } from '../entities/entity-labels';
import { visibleEntityEntries } from '../entities/entity-registry';
import { SEARCH_PAGE_SIZE_KEY, workbenchShell } from '../shell/workbench-shell';

@Component({
  selector: 'app-search-results',
  template: ` <div class="page-host gap-3 overflow-auto p-6" data-testid="search-page">
    <h2 class="text-base font-semibold">{{ t('search.title') }}</h2>
    <input
      class="input w-full max-w-md"
      [attr.aria-label]="t('search.title')"
      [placeholder]="t('search.placeholder')"
      [value]="search.query()"
      (input)="queryInput($event)"
      data-testid="search-input"
    />
    <div class="flex flex-col gap-2" data-testid="search-results">
      @if (search.state() === 'loading') {
        <span class="text-base-content/60 text-sm">{{ t('search.loading') }}</span>
      }
      @if (search.state() === 'error') {
        <span class="text-error text-sm" role="alert">{{
          t('search.failed', { message: search.error()?.message ?? '' })
        }}</span>
      }
      @if (search.state() === 'empty' && search.query().trim() !== '') {
        <span class="text-base-content/60 text-sm">{{ t('search.empty') }}</span>
      }
      @for (result of search.results(); track result.collection + ':' + result.id) {
        <div class="bg-base-200 rounded-box flex flex-col gap-1 p-3" data-testid="search-result">
          <span class="text-sm font-medium">{{ resultLabel(result.entity, result.matchedField) }}</span>
          <span class="text-base-content/70 text-sm">{{ result.snippet }}</span>
        </div>
      }
    </div>
    @if (search.hasMore()) {
      <button
        class="btn btn-outline w-fit"
        [disabled]="search.state() !== 'success'"
        (click)="search.loadMore()"
        type="button"
      >
        {{ t(search.state() === 'loading' ? 'search.loadingMore' : 'search.loadMore') }}
      </button>
    }
  </div>`
})
export class SearchResults {
  private readonly db = useRxDB();
  private readonly preferences = injectAdminStore(workbenchShell.preferences);
  private readonly entries = visibleEntityEntries(this.db.config.entities);
  readonly t = useI18n().t;
  readonly options = computed(() => ({
    debounce: 300,
    pageSize: this.preferences().extension[SEARCH_PAGE_SIZE_KEY] as number,
    snippetLength: 64
  }));
  readonly search = useSearch(this.db, this.options);
  queryInput(event: Event): void {
    this.search.query.set((event.target as HTMLInputElement).value);
  }
  resultLabel(entity: string, field: string): string {
    const entry = this.entries.find(candidate => candidate.name === entity);
    return entry ?
        `${entityDisplayName(entry, this.t)} · ${fieldDisplayName(entry, field, this.t)}`
      : `${entity} · ${field}`;
  }
}
@Component({
  selector: 'app-search-page',
  imports: [SearchResults],
  template: ` @if (error(); as failure) {
      <div class="page-host items-center justify-center gap-2 p-8" data-testid="search-load-failed" role="alert">
        <span class="text-error font-semibold">{{ t('app.loadFailed') }}</span
        ><span>{{ failure }}</span>
      </div>
    } @else if (ready()) {
      <app-search-results />
    } @else {
      <div
        class="page-host items-center justify-center"
        [attr.aria-label]="t('app.loading')"
        data-testid="loading-fallback"
        role="status"
      >
        <span class="loading loading-spinner loading-lg"></span>
      </div>
    }`
})
export default class SearchPage {
  readonly t = useI18n().t;
  readonly ready = signal(false);
  readonly error = signal('');
  constructor() {
    const db = useRxDB();
    void db.connect('sqlite-wasm').then(
      () => this.ready.set(true),
      error => this.error.set(error instanceof Error ? error.message : this.t('app.searchLoadFailed'))
    );
  }
}
