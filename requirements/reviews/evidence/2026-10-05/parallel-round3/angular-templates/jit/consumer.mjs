var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var TemplateNode_1;
import { PropertyType } from '@aiao/rxdb';
import { TreeAdjacencyListEntityBase, TreeEntity } from '@aiao/rxdb-plugin-tree';
import { useFindAncestors, useFindDescendants, useCountAncestors, useCountDescendants } from '@aiao/rxdb-plugin-tree-angular';
import { useSearch } from '@aiao/rxdb-plugin-search-angular';
import { ChangeDetectionStrategy, Component, InjectionToken, Injector, inject, input, output, runInInjectionContext, signal } from '@angular/core';
let TemplateNode = TemplateNode_1 = class TemplateNode extends TreeAdjacencyListEntityBase {
};
TemplateNode = TemplateNode_1 = __decorate([
    TreeEntity({
        name: 'R3AngularTemplateNode',
        properties: [
            { name: 'id', type: PropertyType.integer, primary: true, readonly: true },
            { name: 'label', type: PropertyType.string }
        ]
    })
], TemplateNode);
export { TemplateNode };
let TreeChild = class TreeChild {
    constructor() {
        this.rootId = input.required();
        this.picked = output();
        this.nodes = useFindDescendants(TemplateNode, () => ({ entityId: this.rootId(), level: 1 }));
        this.ancestors = useFindAncestors(TemplateNode, () => ({ entityId: this.rootId(), level: 1 }));
        this.descendantCount = useCountDescendants(TemplateNode, () => ({ entityId: this.rootId(), level: 1 }));
        this.ancestorCount = useCountAncestors(TemplateNode, () => ({ entityId: this.rootId(), level: 1 }));
    }
};
TreeChild = __decorate([
    Component({
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
], TreeChild);
export { TreeChild };
let TreeParent = class TreeParent {
    constructor() {
        this.rootId = signal(0);
        this.selected = signal(null);
    }
    select(value) { this.selected.set(value); }
};
TreeParent = __decorate([
    Component({
        standalone: true, changeDetection: ChangeDetectionStrategy.OnPush, imports: [TreeChild],
        template: '<r3-tree-child [rootId]="rootId()" (picked)="select($event)" />'
    })
], TreeParent);
export { TreeParent };
export const SEARCH_SOURCE = new InjectionToken('R3 real SearchHandle source');
let FieldSourceSearchChild = class FieldSourceSearchChild {
    constructor() {
        this.source = input.required();
        this.search = useSearch(this.source, { debounce: 0 });
    }
};
FieldSourceSearchChild = __decorate([
    Component({
        selector: 'r3-search-field-source', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
        template: '<span>{{ search.state() }}</span>'
    })
], FieldSourceSearchChild);
export { FieldSourceSearchChild };
let FieldSourceSearchParent = class FieldSourceSearchParent {
    constructor() {
        this.source = inject(SEARCH_SOURCE);
    }
};
FieldSourceSearchParent = __decorate([
    Component({
        standalone: true, imports: [FieldSourceSearchChild], changeDetection: ChangeDetectionStrategy.OnPush,
        template: '<r3-search-field-source [source]="source" />'
    })
], FieldSourceSearchParent);
export { FieldSourceSearchParent };
let FieldOptionsSearchChild = class FieldOptionsSearchChild {
    constructor() {
        this.options = input.required();
        this.search = useSearch(inject(SEARCH_SOURCE), this.options);
    }
};
FieldOptionsSearchChild = __decorate([
    Component({
        selector: 'r3-search-field-options', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
        template: '<span>{{ search.state() }}</span>'
    })
], FieldOptionsSearchChild);
export { FieldOptionsSearchChild };
let FieldOptionsSearchParent = class FieldOptionsSearchParent {
    constructor() {
        this.options = signal({ debounce: 0, initialQuery: 'seed' });
    }
};
FieldOptionsSearchParent = __decorate([
    Component({
        standalone: true, imports: [FieldOptionsSearchChild], changeDetection: ChangeDetectionStrategy.OnPush,
        template: '<r3-search-field-options [options]="options()" />'
    })
], FieldOptionsSearchParent);
export { FieldOptionsSearchParent };
let LifecycleSearchChild = class LifecycleSearchChild {
    constructor() {
        this.source = input.required();
        this.options = input.required();
        this.injector = inject(Injector);
    }
    ngOnInit() { this.search = runInInjectionContext(this.injector, () => useSearch(this.source, this.options)); }
    onInput(event) {
        const target = event.target;
        if (!(target instanceof HTMLInputElement))
            throw new Error('搜索输入必须来自 input');
        this.search.query.set(target.value);
    }
};
LifecycleSearchChild = __decorate([
    Component({
        selector: 'r3-search-lifecycle', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
        template: `
    <input [value]="search.query()" (input)="onInput($event)" />
    <span data-state>{{ search.state() }}</span>
    @if (search.error(); as error) { <p role="alert">{{ error.message }}</p> }
    @for (result of search.results(); track result.id) { <p data-result>{{ result.snippet }}</p> }
    <button type="button" (click)="search.clear()">clear</button>
  `
    })
], LifecycleSearchChild);
export { LifecycleSearchChild };
let LifecycleSearchParent = class LifecycleSearchParent {
    constructor() {
        this.source = inject(SEARCH_SOURCE);
        this.options = signal({ debounce: 0, initialQuery: 'seed' });
    }
};
LifecycleSearchParent = __decorate([
    Component({
        standalone: true, imports: [LifecycleSearchChild], changeDetection: ChangeDetectionStrategy.OnPush,
        template: '<r3-search-lifecycle [source]="source" [options]="options()" />'
    })
], LifecycleSearchParent);
export { LifecycleSearchParent };
