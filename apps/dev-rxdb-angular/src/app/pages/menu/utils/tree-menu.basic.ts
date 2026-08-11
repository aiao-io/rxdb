/* eslint-disable @angular-eslint/prefer-inject */
import type { HistoryScopeAPI } from '@aiao/rxdb';
import { RxDB } from '@aiao/rxdb';
import { Directive, inject, Signal } from '@angular/core';
import { TreeMenuEntityConstructor, TreeMenuInstance } from '../models/tree-node.interface';
import { MenuSearchService } from '../services/menu-search.service';
import { PathValidatorService } from './path-validator';
import { TreeMenuBase } from './tree-menu.base';
import { TreeMenuStore } from './tree-menu.store';

@Directive()
export abstract class TreeMenuBasic<C extends TreeMenuEntityConstructor> extends TreeMenuBase<C> {
  constructor(menuResource: { value: Signal<TreeMenuInstance<C>[]> }, entityClass: C, history: HistoryScopeAPI) {
    super(
      new TreeMenuStore(
        inject(RxDB),
        inject(PathValidatorService),
        inject(MenuSearchService),
        menuResource,
        entityClass,
        history
      ),
      menuResource,
      entityClass,
      history
    );
  }
}
