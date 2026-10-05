import { Component } from '@angular/core';
import { TreeChild } from './consumer.mjs';
import * as i0 from "@angular/core";
export class InvalidParent {
    accept(value) { void value; }
    static { this.ɵfac = function InvalidParent_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || InvalidParent)(); }; }
    static { this.ɵcmp = /*@__PURE__*/ i0.ɵɵdefineComponent({ type: InvalidParent, selectors: [["ng-component"]], decls: 1, vars: 1, consts: [[3, "picked", "rootId"]], template: function InvalidParent_Template(rf, ctx) { if (rf & 1) {
            i0.ɵɵelementStart(0, "r3-tree-child", 0);
            i0.ɵɵlistener("picked", function InvalidParent_Template_r3_tree_child_picked_0_listener($event) { return ctx.accept($event); });
            i0.ɵɵelementEnd();
        } if (rf & 2) {
            i0.ɵɵproperty("rootId", 0);
        } }, dependencies: [TreeChild], encapsulation: 2 }); }
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(InvalidParent, [{
        type: Component,
        args: [{ standalone: true, imports: [TreeChild], template: '<r3-tree-child [rootId]="0" (picked)="accept($event)" />' }]
    }], null, null); })();
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassDebugInfo(InvalidParent, { className: "InvalidParent", filePath: "tree-event.mts", lineNumber: 4 }); })();
