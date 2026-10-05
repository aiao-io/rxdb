import { ENTITY_STATIC_TYPES, PropertyType } from '@aiao/rxdb';
import { TreeAdjacencyListEntityBase, TreeEntity, type FindTreeOptions } from '@aiao/rxdb-plugin-tree';
import { useFindAncestors, useFindDescendants, useCountAncestors, useCountDescendants } from '@aiao/rxdb-plugin-tree-angular';
import { useSearch, type SearchSourceLike, type SearchOptions, type UseSearchReturn } from '@aiao/rxdb-plugin-search-angular';
import { ChangeDetectionStrategy, Component, InjectionToken, Injector, inject, input, output, runInInjectionContext, signal, type OnInit } from '@angular/core';

@TreeEntity({
  name: 'R3AngularTemplateNode',
  properties: [
    { name: 'id', type: PropertyType.integer, primary: true, readonly: true },
    { name: 'label', type: PropertyType.string }
  ]
})
export class TemplateNode extends TreeAdjacencyListEntityBase<number> {
  declare static [ENTITY_STATIC_TYPES]: {
    idType: number;
    findDescendantsOptions: FindTreeOptions<typeof TemplateNode>;
    countDescendantsOptions: FindTreeOptions<typeof TemplateNode>;
    findAncestorsOptions: FindTreeOptions<typeof TemplateNode>;
    countAncestorsOptions: FindTreeOptions<typeof TemplateNode>;
  };
  declare label: string;
}

@Component({
  selector: 'r3-tree-child', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" (click)="picked.emit(rootId())">select</button>
    <span data-root>{{ rootId() }}</span>
    @if (nodes.error(); as error) { <p role="alert">{{ error.message }}</p> }
    @else if (nodes.isLoading()) { <p data-loading>loading</p> }
    @else if (nodes.isEmpty()) { <p data-empty>empty</p> }
    @for (node of nodes.value(); track node.id) { <p data-node>{{ node.label }}</p> }
    <span data-ancestors>{{ ancestors.value().length }}</span>
    <span data-descendant-count>{{ descendantCount.value() }}</span>
    <span data-ancestor-count>{{ ancestorCount.value() }}</span>
  `
})
export class TreeChild {
  readonly rootId = input.required<number>();
  readonly picked = output<number>();
  readonly nodes = useFindDescendants(TemplateNode, () => ({ entityId: this.rootId(), level: 1 }));
  readonly ancestors = useFindAncestors(TemplateNode, () => ({ entityId: this.rootId(), level: 1 }));
  readonly descendantCount = useCountDescendants(TemplateNode, () => ({ entityId: this.rootId(), level: 1 }));
  readonly ancestorCount = useCountAncestors(TemplateNode, () => ({ entityId: this.rootId(), level: 1 }));
}

@Component({
  standalone: true, changeDetection: ChangeDetectionStrategy.OnPush, imports: [TreeChild],
  template: '<r3-tree-child [rootId]="rootId()" (picked)="select($event)" />'
})
export class TreeParent {
  readonly rootId = signal(0);
  readonly selected = signal<number | null>(null);
  select(value: number): void { this.selected.set(value); }
}

export const SEARCH_SOURCE = new InjectionToken<SearchSourceLike>('R3 real SearchHandle source');

@Component({
  selector: 'r3-search-field-source', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<span>{{ search.state() }}</span>'
})
export class FieldSourceSearchChild {
  readonly source = input.required<SearchSourceLike>();
  readonly search = useSearch(this.source, { debounce: 0 });
}

@Component({
  standalone: true, imports: [FieldSourceSearchChild], changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<r3-search-field-source [source]="source" />'
})
export class FieldSourceSearchParent {
  readonly source = inject(SEARCH_SOURCE);
}

@Component({
  selector: 'r3-search-field-options', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<span>{{ search.state() }}</span>'
})
export class FieldOptionsSearchChild {
  readonly options = input.required<SearchOptions>();
  readonly search = useSearch(inject(SEARCH_SOURCE), this.options);
}

@Component({
  standalone: true, imports: [FieldOptionsSearchChild], changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<r3-search-field-options [options]="options()" />'
})
export class FieldOptionsSearchParent {
  readonly options = signal<SearchOptions>({ debounce: 0, initialQuery: 'seed' });
}

@Component({
  selector: 'r3-search-lifecycle', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <input [value]="search.query()" (input)="onInput($event)" />
    <span data-state>{{ search.state() }}</span>
    @if (search.error(); as error) { <p role="alert">{{ error.message }}</p> }
    @for (result of search.results(); track result.id) { <p data-result>{{ result.snippet }}</p> }
    <button type="button" (click)="search.clear()">clear</button>
  `
})
export class LifecycleSearchChild implements OnInit {
  readonly source = input.required<SearchSourceLike>();
  readonly options = input.required<SearchOptions>();
  readonly injector = inject(Injector);
  search!: UseSearchReturn;
  ngOnInit(): void { this.search = runInInjectionContext(this.injector, () => useSearch(this.source, this.options)); }
  onInput(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) throw new Error('搜索输入必须来自 input');
    this.search.query.set(target.value);
  }
}

@Component({
  standalone: true, imports: [LifecycleSearchChild], changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<r3-search-lifecycle [source]="source" [options]="options()" />'
})
export class LifecycleSearchParent {
  readonly source = inject(SEARCH_SOURCE);
  readonly options = signal<SearchOptions>({ debounce: 0, initialQuery: 'seed' });
}
