import { Component } from '@angular/core';
import { TreeChild } from './consumer.mjs';
import * as i0 from "@angular/core";
export class InvalidParent {
    constructor() {
        this.wrongId = 'not-a-number';
    }
    static { this.ɵfac = function InvalidParent_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || InvalidParent)(); }; }
    static { this.ɵcmp = /*@__PURE__*/ i0.ɵɵdefineComponent({ type: InvalidParent, selectors: [["ng-component"]], decls: 1, vars: 1, consts: [[3, "rootId"]], template: function InvalidParent_Template(rf, ctx) { if (rf & 1) {
            i0.ɵɵelement(0, "r3-tree-child", 0);
        } if (rf & 2) {
            i0.ɵɵproperty("rootId", ctx.wrongId);
        } }, dependencies: [TreeChild], encapsulation: 2 }); }
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(InvalidParent, [{
        type: Component,
        args: [{ standalone: true, imports: [TreeChild], template: '<r3-tree-child [rootId]="wrongId" />' }]
    }], null, null); })();
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassDebugInfo(InvalidParent, { className: "InvalidParent", filePath: "tree-input.mts", lineNumber: 4 }); })();
