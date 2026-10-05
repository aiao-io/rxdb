import { Component, input } from '@angular/core';
import type { UseSearchReturn } from '@aiao/rxdb-plugin-search-angular';
@Component({
  standalone: true,
  template: `<input (input)="search().query.set($event)" /><button (click)="search().query.set(42)">bad</button>`
})
export class InvalidSearchEvent { readonly search = input.required<UseSearchReturn>(); }
