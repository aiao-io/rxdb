import { Component } from '@angular/core';
import { LifecycleSearchChild } from './consumer.mjs';
import * as i0 from "@angular/core";
export class InvalidParent {
    constructor() {
        this.wrongOptions = 'not-options';
    }
    static { this.ɵfac = function InvalidParent_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || InvalidParent)(); }; }
    static { this.ɵcmp = /*@__PURE__*/ i0.ɵɵdefineComponent({ type: InvalidParent, selectors: [["ng-component"]], decls: 1, vars: 2, consts: [[3, "source", "options"]], template: function InvalidParent_Template(rf, ctx) { if (rf & 1) {
            i0.ɵɵelement(0, "r3-search-lifecycle", 0);
        } if (rf & 2) {
            i0.ɵɵproperty("source", 42)("options", ctx.wrongOptions);
        } }, dependencies: [LifecycleSearchChild], encapsulation: 2 }); }
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(InvalidParent, [{
        type: Component,
        args: [{ standalone: true, imports: [LifecycleSearchChild], template: '<r3-search-lifecycle [source]="42" [options]="wrongOptions" />' }]
    }], null, null); })();
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassDebugInfo(InvalidParent, { className: "InvalidParent", filePath: "search-input.mts", lineNumber: 4 }); })();
