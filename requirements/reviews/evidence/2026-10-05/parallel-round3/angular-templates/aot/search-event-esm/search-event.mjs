import { Component, input } from '@angular/core';
import * as i0 from "@angular/core";
export class InvalidSearchEvent {
    constructor() {
        this.search = input.required(/* @ts-ignore */
        ...(ngDevMode ? [{ debugName: "search" }] : /* istanbul ignore next */ []));
    }
    static { this.ɵfac = function InvalidSearchEvent_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || InvalidSearchEvent)(); }; }
    static { this.ɵcmp = /*@__PURE__*/ i0.ɵɵdefineComponent({ type: InvalidSearchEvent, selectors: [["ng-component"]], inputs: { search: [1, "search"] }, decls: 3, vars: 0, consts: [[3, "input"], [3, "click"]], template: function InvalidSearchEvent_Template(rf, ctx) { if (rf & 1) {
            i0.ɵɵdomElementStart(0, "input", 0);
            i0.ɵɵdomListener("input", function InvalidSearchEvent_Template_input_input_0_listener($event) { return ctx.search().query.set($event); });
            i0.ɵɵdomElementEnd();
            i0.ɵɵdomElementStart(1, "button", 1);
            i0.ɵɵdomListener("click", function InvalidSearchEvent_Template_button_click_1_listener() { return ctx.search().query.set(42); });
            i0.ɵɵtext(2, "bad");
            i0.ɵɵdomElementEnd();
        } }, encapsulation: 2 }); }
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(InvalidSearchEvent, [{
        type: Component,
        args: [{
                standalone: true,
                template: `<input (input)="search().query.set($event)" /><button (click)="search().query.set(42)">bad</button>`
            }]
    }], null, { search: [{ type: i0.Input, args: [{ isSignal: true, alias: "search", required: true }] }] }); })();
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassDebugInfo(InvalidSearchEvent, { className: "InvalidSearchEvent", filePath: "search-event.mts", lineNumber: 7 }); })();
