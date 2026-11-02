import { BrowserWorkbench } from '@aiao/browser-workbench-angular';
import { createRxDBWorkbenchCatalog } from '@aiao/browser-workbench/rxdb-catalog';
import { RxDB } from '@aiao/rxdb';
import { Component, inject } from '@angular/core';

@Component({
  selector: 'app-browser-workbench',
  imports: [BrowserWorkbench],
  template: '<ao-browser-workbench [options]="options" />',
  host: { class: 'page-host bg-base-100', style: 'display:block;position:fixed;inset:0;z-index:50;min-height:0' }
})
export default class BrowserWorkbenchPage {
  readonly options = { catalog: createRxDBWorkbenchCatalog(inject(RxDB)) };
}
