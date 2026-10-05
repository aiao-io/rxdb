import type { SearchHandle, UseSearchReturn } from '@aiao/rxdb-plugin-search-angular';
import { Component, input } from '@angular/core';

@Component({
  selector: 'review-invalid-search',
  standalone: true,
  template: `
    <button (click)="handle().setQuery(42)" type="button">错误查询词</button>
    <button (click)="search().query.set($event)" type="button">错误事件</button>
  `
})
export class InvalidSearchHost {
  readonly search = input.required<UseSearchReturn>();
  readonly handle = input.required<SearchHandle>();
}

@Component({
  standalone: true,
  imports: [InvalidSearchHost],
  template: '<review-invalid-search [search]="42" [handle]="42" />'
})
export class InvalidSearchConsumer {}
