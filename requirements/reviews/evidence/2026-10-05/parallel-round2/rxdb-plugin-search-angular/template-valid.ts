import type { SearchHandle, UseSearchReturn } from '@aiao/rxdb-plugin-search-angular';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'review-typed-search',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <input [value]="search().query()" (input)="onInput($event)" />
    @if (search().error(); as error) {
      <p role="alert">{{ error.message }}</p>
    }
    @for (result of search().results(); track result.id) {
      <p>{{ result.snippet }}</p>
    }
    <button (click)="handle().setQuery('typed')" type="button">查询</button>
  `
})
export class TypedSearchHost {
  readonly search = input.required<UseSearchReturn>();
  readonly handle = input.required<SearchHandle>();

  onInput(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) throw new Error('搜索输入必须来自 input');
    this.search().query.set(target.value);
  }
}

@Component({
  standalone: true,
  imports: [TypedSearchHost],
  template: '<review-typed-search [search]="search()" [handle]="handle()" />'
})
export class TypedSearchConsumer {
  readonly search = input.required<UseSearchReturn>();
  readonly handle = input.required<SearchHandle>();
}
