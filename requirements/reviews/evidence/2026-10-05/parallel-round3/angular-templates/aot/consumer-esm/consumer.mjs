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
import * as i0 from "@angular/core";
const _forTrack0 = ($index, $item) => $item.id;
function TreeChild_Conditional_4_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "p", 2);
    i0.ɵɵtext(1);
    i0.ɵɵdomElementEnd();
} if (rf & 2) {
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate(ctx.message);
} }
function TreeChild_Conditional_5_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "p", 3);
    i0.ɵɵtext(1, "loading");
    i0.ɵɵdomElementEnd();
} }
function TreeChild_Conditional_6_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "p", 4);
    i0.ɵɵtext(1, "empty");
    i0.ɵɵdomElementEnd();
} }
function TreeChild_For_8_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "p", 5);
    i0.ɵɵtext(1);
    i0.ɵɵdomElementEnd();
} if (rf & 2) {
    const node_r1 = ctx.$implicit;
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate(node_r1.label);
} }
function LifecycleSearchChild_Conditional_3_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "p", 2);
    i0.ɵɵtext(1);
    i0.ɵɵdomElementEnd();
} if (rf & 2) {
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate(ctx.message);
} }
function LifecycleSearchChild_For_5_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "p", 3);
    i0.ɵɵtext(1);
    i0.ɵɵdomElementEnd();
} if (rf & 2) {
    const result_r1 = ctx.$implicit;
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate(result_r1.snippet);
} }
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
export class TreeChild {
    constructor() {
        this.rootId = input.required(/* @ts-ignore */
        ...(ngDevMode ? [{ debugName: "rootId" }] : /* istanbul ignore next */ []));
        this.picked = output();
        this.nodes = useFindDescendants(TemplateNode, () => ({ entityId: this.rootId(), level: 1 }));
        this.ancestors = useFindAncestors(TemplateNode, () => ({ entityId: this.rootId(), level: 1 }));
        this.descendantCount = useCountDescendants(TemplateNode, () => ({ entityId: this.rootId(), level: 1 }));
        this.ancestorCount = useCountAncestors(TemplateNode, () => ({ entityId: this.rootId(), level: 1 }));
    }
    static { this.ɵfac = function TreeChild_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || TreeChild)(); }; }
    static { this.ɵcmp = /*@__PURE__*/ i0.ɵɵdefineComponent({ type: TreeChild, selectors: [["r3-tree-child"]], inputs: { rootId: [1, "rootId"] }, outputs: { picked: "picked" }, decls: 15, vars: 5, consts: [["type", "button", 3, "click"], ["data-root", ""], ["role", "alert"], ["data-loading", ""], ["data-empty", ""], ["data-node", ""], ["data-ancestors", ""], ["data-descendant-count", ""], ["data-ancestor-count", ""]], template: function TreeChild_Template(rf, ctx) { if (rf & 1) {
            i0.ɵɵdomElementStart(0, "button", 0);
            i0.ɵɵdomListener("click", function TreeChild_Template_button_click_0_listener() { return ctx.picked.emit(ctx.rootId()); });
            i0.ɵɵtext(1, "select");
            i0.ɵɵdomElementEnd();
            i0.ɵɵdomElementStart(2, "span", 1);
            i0.ɵɵtext(3);
            i0.ɵɵdomElementEnd();
            i0.ɵɵconditionalCreate(4, TreeChild_Conditional_4_Template, 2, 1, "p", 2)(5, TreeChild_Conditional_5_Template, 2, 0, "p", 3)(6, TreeChild_Conditional_6_Template, 2, 0, "p", 4);
            i0.ɵɵrepeaterCreate(7, TreeChild_For_8_Template, 2, 1, "p", 5, _forTrack0);
            i0.ɵɵdomElementStart(9, "span", 6);
            i0.ɵɵtext(10);
            i0.ɵɵdomElementEnd();
            i0.ɵɵdomElementStart(11, "span", 7);
            i0.ɵɵtext(12);
            i0.ɵɵdomElementEnd();
            i0.ɵɵdomElementStart(13, "span", 8);
            i0.ɵɵtext(14);
            i0.ɵɵdomElementEnd();
        } if (rf & 2) {
            let tmp_1_0;
            i0.ɵɵadvance(3);
            i0.ɵɵtextInterpolate(ctx.rootId());
            i0.ɵɵadvance();
            i0.ɵɵconditional((tmp_1_0 = ctx.nodes.error()) ? 4 : ctx.nodes.isLoading() ? 5 : ctx.nodes.isEmpty() ? 6 : -1, tmp_1_0);
            i0.ɵɵadvance(3);
            i0.ɵɵrepeater(ctx.nodes.value());
            i0.ɵɵadvance(3);
            i0.ɵɵtextInterpolate(ctx.ancestors.value().length);
            i0.ɵɵadvance(2);
            i0.ɵɵtextInterpolate(ctx.descendantCount.value());
            i0.ɵɵadvance(2);
            i0.ɵɵtextInterpolate(ctx.ancestorCount.value());
        } }, encapsulation: 2 }); }
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(TreeChild, [{
        type: Component,
        args: [{
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
            }]
    }], null, { rootId: [{ type: i0.Input, args: [{ isSignal: true, alias: "rootId", required: true }] }], picked: [{ type: i0.Output, args: ["picked"] }] }); })();
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassDebugInfo(TreeChild, { className: "TreeChild", filePath: "consumer.mts", lineNumber: 39 }); })();
export class TreeParent {
    constructor() {
        this.rootId = signal(0, /* @ts-ignore */
        ...(ngDevMode ? [{ debugName: "rootId" }] : /* istanbul ignore next */ []));
        this.selected = signal(null, /* @ts-ignore */
        ...(ngDevMode ? [{ debugName: "selected" }] : /* istanbul ignore next */ []));
    }
    select(value) { this.selected.set(value); }
    static { this.ɵfac = function TreeParent_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || TreeParent)(); }; }
    static { this.ɵcmp = /*@__PURE__*/ i0.ɵɵdefineComponent({ type: TreeParent, selectors: [["ng-component"]], decls: 1, vars: 1, consts: [[3, "picked", "rootId"]], template: function TreeParent_Template(rf, ctx) { if (rf & 1) {
            i0.ɵɵelementStart(0, "r3-tree-child", 0);
            i0.ɵɵlistener("picked", function TreeParent_Template_r3_tree_child_picked_0_listener($event) { return ctx.select($event); });
            i0.ɵɵelementEnd();
        } if (rf & 2) {
            i0.ɵɵproperty("rootId", ctx.rootId());
        } }, dependencies: [TreeChild], encapsulation: 2 }); }
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(TreeParent, [{
        type: Component,
        args: [{
                standalone: true, changeDetection: ChangeDetectionStrategy.OnPush, imports: [TreeChild],
                template: '<r3-tree-child [rootId]="rootId()" (picked)="select($event)" />'
            }]
    }], null, null); })();
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassDebugInfo(TreeParent, { className: "TreeParent", filePath: "consumer.mts", lineNumber: 52 }); })();
export const SEARCH_SOURCE = new InjectionToken('R3 real SearchHandle source');
export class FieldSourceSearchChild {
    constructor() {
        this.source = input.required(/* @ts-ignore */
        ...(ngDevMode ? [{ debugName: "source" }] : /* istanbul ignore next */ []));
        this.search = useSearch(this.source, { debounce: 0 });
    }
    static { this.ɵfac = function FieldSourceSearchChild_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || FieldSourceSearchChild)(); }; }
    static { this.ɵcmp = /*@__PURE__*/ i0.ɵɵdefineComponent({ type: FieldSourceSearchChild, selectors: [["r3-search-field-source"]], inputs: { source: [1, "source"] }, decls: 2, vars: 1, template: function FieldSourceSearchChild_Template(rf, ctx) { if (rf & 1) {
            i0.ɵɵdomElementStart(0, "span");
            i0.ɵɵtext(1);
            i0.ɵɵdomElementEnd();
        } if (rf & 2) {
            i0.ɵɵadvance();
            i0.ɵɵtextInterpolate(ctx.search.state());
        } }, encapsulation: 2 }); }
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(FieldSourceSearchChild, [{
        type: Component,
        args: [{
                selector: 'r3-search-field-source', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
                template: '<span>{{ search.state() }}</span>'
            }]
    }], null, { source: [{ type: i0.Input, args: [{ isSignal: true, alias: "source", required: true }] }] }); })();
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassDebugInfo(FieldSourceSearchChild, { className: "FieldSourceSearchChild", filePath: "consumer.mts", lineNumber: 64 }); })();
export class FieldSourceSearchParent {
    constructor() {
        this.source = inject(SEARCH_SOURCE);
    }
    static { this.ɵfac = function FieldSourceSearchParent_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || FieldSourceSearchParent)(); }; }
    static { this.ɵcmp = /*@__PURE__*/ i0.ɵɵdefineComponent({ type: FieldSourceSearchParent, selectors: [["ng-component"]], decls: 1, vars: 1, consts: [[3, "source"]], template: function FieldSourceSearchParent_Template(rf, ctx) { if (rf & 1) {
            i0.ɵɵelement(0, "r3-search-field-source", 0);
        } if (rf & 2) {
            i0.ɵɵproperty("source", ctx.source);
        } }, dependencies: [FieldSourceSearchChild], encapsulation: 2 }); }
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(FieldSourceSearchParent, [{
        type: Component,
        args: [{
                standalone: true, imports: [FieldSourceSearchChild], changeDetection: ChangeDetectionStrategy.OnPush,
                template: '<r3-search-field-source [source]="source" />'
            }]
    }], null, null); })();
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassDebugInfo(FieldSourceSearchParent, { className: "FieldSourceSearchParent", filePath: "consumer.mts", lineNumber: 73 }); })();
export class FieldOptionsSearchChild {
    constructor() {
        this.options = input.required(/* @ts-ignore */
        ...(ngDevMode ? [{ debugName: "options" }] : /* istanbul ignore next */ []));
        this.search = useSearch(inject(SEARCH_SOURCE), this.options);
    }
    static { this.ɵfac = function FieldOptionsSearchChild_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || FieldOptionsSearchChild)(); }; }
    static { this.ɵcmp = /*@__PURE__*/ i0.ɵɵdefineComponent({ type: FieldOptionsSearchChild, selectors: [["r3-search-field-options"]], inputs: { options: [1, "options"] }, decls: 2, vars: 1, template: function FieldOptionsSearchChild_Template(rf, ctx) { if (rf & 1) {
            i0.ɵɵdomElementStart(0, "span");
            i0.ɵɵtext(1);
            i0.ɵɵdomElementEnd();
        } if (rf & 2) {
            i0.ɵɵadvance();
            i0.ɵɵtextInterpolate(ctx.search.state());
        } }, encapsulation: 2 }); }
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(FieldOptionsSearchChild, [{
        type: Component,
        args: [{
                selector: 'r3-search-field-options', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
                template: '<span>{{ search.state() }}</span>'
            }]
    }], null, { options: [{ type: i0.Input, args: [{ isSignal: true, alias: "options", required: true }] }] }); })();
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassDebugInfo(FieldOptionsSearchChild, { className: "FieldOptionsSearchChild", filePath: "consumer.mts", lineNumber: 81 }); })();
export class FieldOptionsSearchParent {
    constructor() {
        this.options = signal({ debounce: 0, initialQuery: 'seed' }, /* @ts-ignore */
        ...(ngDevMode ? [{ debugName: "options" }] : /* istanbul ignore next */ []));
    }
    static { this.ɵfac = function FieldOptionsSearchParent_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || FieldOptionsSearchParent)(); }; }
    static { this.ɵcmp = /*@__PURE__*/ i0.ɵɵdefineComponent({ type: FieldOptionsSearchParent, selectors: [["ng-component"]], decls: 1, vars: 1, consts: [[3, "options"]], template: function FieldOptionsSearchParent_Template(rf, ctx) { if (rf & 1) {
            i0.ɵɵelement(0, "r3-search-field-options", 0);
        } if (rf & 2) {
            i0.ɵɵproperty("options", ctx.options());
        } }, dependencies: [FieldOptionsSearchChild], encapsulation: 2 }); }
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(FieldOptionsSearchParent, [{
        type: Component,
        args: [{
                standalone: true, imports: [FieldOptionsSearchChild], changeDetection: ChangeDetectionStrategy.OnPush,
                template: '<r3-search-field-options [options]="options()" />'
            }]
    }], null, null); })();
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassDebugInfo(FieldOptionsSearchParent, { className: "FieldOptionsSearchParent", filePath: "consumer.mts", lineNumber: 90 }); })();
export class LifecycleSearchChild {
    constructor() {
        this.source = input.required(/* @ts-ignore */
        ...(ngDevMode ? [{ debugName: "source" }] : /* istanbul ignore next */ []));
        this.options = input.required(/* @ts-ignore */
        ...(ngDevMode ? [{ debugName: "options" }] : /* istanbul ignore next */ []));
        this.injector = inject(Injector);
    }
    ngOnInit() { this.search = runInInjectionContext(this.injector, () => useSearch(this.source, this.options)); }
    onInput(event) {
        const target = event.target;
        if (!(target instanceof HTMLInputElement))
            throw new Error('搜索输入必须来自 input');
        this.search.query.set(target.value);
    }
    static { this.ɵfac = function LifecycleSearchChild_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || LifecycleSearchChild)(); }; }
    static { this.ɵcmp = /*@__PURE__*/ i0.ɵɵdefineComponent({ type: LifecycleSearchChild, selectors: [["r3-search-lifecycle"]], inputs: { source: [1, "source"], options: [1, "options"] }, decls: 8, vars: 3, consts: [[3, "input", "value"], ["data-state", ""], ["role", "alert"], ["data-result", ""], ["type", "button", 3, "click"]], template: function LifecycleSearchChild_Template(rf, ctx) { if (rf & 1) {
            i0.ɵɵdomElementStart(0, "input", 0);
            i0.ɵɵdomListener("input", function LifecycleSearchChild_Template_input_input_0_listener($event) { return ctx.onInput($event); });
            i0.ɵɵdomElementEnd();
            i0.ɵɵdomElementStart(1, "span", 1);
            i0.ɵɵtext(2);
            i0.ɵɵdomElementEnd();
            i0.ɵɵconditionalCreate(3, LifecycleSearchChild_Conditional_3_Template, 2, 1, "p", 2);
            i0.ɵɵrepeaterCreate(4, LifecycleSearchChild_For_5_Template, 2, 1, "p", 3, _forTrack0);
            i0.ɵɵdomElementStart(6, "button", 4);
            i0.ɵɵdomListener("click", function LifecycleSearchChild_Template_button_click_6_listener() { return ctx.search.clear(); });
            i0.ɵɵtext(7, "clear");
            i0.ɵɵdomElementEnd();
        } if (rf & 2) {
            let tmp_2_0;
            i0.ɵɵdomProperty("value", ctx.search.query());
            i0.ɵɵadvance(2);
            i0.ɵɵtextInterpolate(ctx.search.state());
            i0.ɵɵadvance();
            i0.ɵɵconditional((tmp_2_0 = ctx.search.error()) ? 3 : -1, tmp_2_0);
            i0.ɵɵadvance();
            i0.ɵɵrepeater(ctx.search.results());
        } }, encapsulation: 2 }); }
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(LifecycleSearchChild, [{
        type: Component,
        args: [{
                selector: 'r3-search-lifecycle', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
                template: `
    <input [value]="search.query()" (input)="onInput($event)" />
    <span data-state>{{ search.state() }}</span>
    @if (search.error(); as error) { <p role="alert">{{ error.message }}</p> }
    @for (result of search.results(); track result.id) { <p data-result>{{ result.snippet }}</p> }
    <button type="button" (click)="search.clear()">clear</button>
  `
            }]
    }], null, { source: [{ type: i0.Input, args: [{ isSignal: true, alias: "source", required: true }] }], options: [{ type: i0.Input, args: [{ isSignal: true, alias: "options", required: true }] }] }); })();
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassDebugInfo(LifecycleSearchChild, { className: "LifecycleSearchChild", filePath: "consumer.mts", lineNumber: 104 }); })();
export class LifecycleSearchParent {
    constructor() {
        this.source = inject(SEARCH_SOURCE);
        this.options = signal({ debounce: 0, initialQuery: 'seed' }, /* @ts-ignore */
        ...(ngDevMode ? [{ debugName: "options" }] : /* istanbul ignore next */ []));
    }
    static { this.ɵfac = function LifecycleSearchParent_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || LifecycleSearchParent)(); }; }
    static { this.ɵcmp = /*@__PURE__*/ i0.ɵɵdefineComponent({ type: LifecycleSearchParent, selectors: [["ng-component"]], decls: 1, vars: 2, consts: [[3, "source", "options"]], template: function LifecycleSearchParent_Template(rf, ctx) { if (rf & 1) {
            i0.ɵɵelement(0, "r3-search-lifecycle", 0);
        } if (rf & 2) {
            i0.ɵɵproperty("source", ctx.source)("options", ctx.options());
        } }, dependencies: [LifecycleSearchChild], encapsulation: 2 }); }
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(LifecycleSearchParent, [{
        type: Component,
        args: [{
                standalone: true, imports: [LifecycleSearchChild], changeDetection: ChangeDetectionStrategy.OnPush,
                template: '<r3-search-lifecycle [source]="source" [options]="options()" />'
            }]
    }], null, null); })();
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassDebugInfo(LifecycleSearchParent, { className: "LifecycleSearchParent", filePath: "consumer.mts", lineNumber: 121 }); })();
