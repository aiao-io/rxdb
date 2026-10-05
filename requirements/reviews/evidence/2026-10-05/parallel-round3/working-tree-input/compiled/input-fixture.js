import { ChangeDetectionStrategy, Component, inject, InjectionToken, input, signal } from '@angular/core';
import * as i0 from "@angular/core";
function RequiredWorkingTreePanel_Conditional_7_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "span", 3);
    i0.ɵɵtext(1);
    i0.ɵɵdomElementEnd();
} if (rf & 2) {
    i0.ɵɵnextContext();
    const state_r1 = i0.ɵɵreadContextLet(6);
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate(state_r1.value.branchId);
} }
export const RXDB_ENTRY = new InjectionToken('R3 真实 useRxDB');
export const WORKING_TREE_ENTRY = new InjectionToken('R3 真实 useWorkingTree');
export class RequiredWorkingTreePanel {
    branchId = input.required(...(ngDevMode ? [{ debugName: "branchId" }] : []));
    database = inject(RXDB_ENTRY)();
    tree = inject(WORKING_TREE_ENTRY)();
    lastSwitch;
    selectBranch() {
        this.lastSwitch = this.tree.switchBranch(this.branchId());
        return this.lastSwitch;
    }
    static ɵfac = function RequiredWorkingTreePanel_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || RequiredWorkingTreePanel)(); };
    static ɵcmp = i0.ɵɵdefineComponent({ type: RequiredWorkingTreePanel, selectors: [["r3-required-working-tree-panel"]], inputs: { branchId: [1, "branchId"] }, decls: 10, vars: 5, consts: [["data-testid", "branch"], ["data-testid", "phase"], ["data-testid", "switch-phase"], ["data-testid", "status-branch"], ["data-testid", "switch", 3, "click"]], template: function RequiredWorkingTreePanel_Template(rf, ctx) { if (rf & 1) {
            i0.ɵɵdomElementStart(0, "span", 0);
            i0.ɵɵtext(1);
            i0.ɵɵdomElementEnd();
            i0.ɵɵdomElementStart(2, "span", 1);
            i0.ɵɵtext(3);
            i0.ɵɵdomElementEnd();
            i0.ɵɵdomElementStart(4, "span", 2);
            i0.ɵɵtext(5);
            i0.ɵɵdomElementEnd();
            i0.ɵɵdeclareLet(6);
            i0.ɵɵconditionalCreate(7, RequiredWorkingTreePanel_Conditional_7_Template, 2, 1, "span", 3);
            i0.ɵɵdomElementStart(8, "button", 4);
            i0.ɵɵdomListener("click", function RequiredWorkingTreePanel_Template_button_click_8_listener() { return ctx.selectBranch(); });
            i0.ɵɵtext(9, "\u5207\u5206\u652F");
            i0.ɵɵdomElementEnd();
        } if (rf & 2) {
            i0.ɵɵadvance();
            i0.ɵɵtextInterpolate(ctx.branchId());
            i0.ɵɵadvance(2);
            i0.ɵɵtextInterpolate(ctx.tree.statusState().phase);
            i0.ɵɵadvance(2);
            i0.ɵɵtextInterpolate(ctx.tree.switchBranchState().phase);
            i0.ɵɵadvance();
            const state_r2 = i0.ɵɵstoreLet(ctx.tree.statusState());
            i0.ɵɵadvance();
            i0.ɵɵconditional(state_r2.phase === "empty" || state_r2.phase === "success" ? 7 : -1);
        } }, encapsulation: 2 });
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(RequiredWorkingTreePanel, [{
        type: Component,
        args: [{
                selector: 'r3-required-working-tree-panel',
                standalone: true,
                changeDetection: ChangeDetectionStrategy.OnPush,
                template: `
    <span data-testid="branch">{{ branchId() }}</span>
    <span data-testid="phase">{{ tree.statusState().phase }}</span>
    <span data-testid="switch-phase">{{ tree.switchBranchState().phase }}</span>
    @let state = tree.statusState();
    @if (state.phase === 'empty' || state.phase === 'success') {
      <span data-testid="status-branch">{{ state.value.branchId }}</span>
    }
    <button (click)="selectBranch()" data-testid="switch">切分支</button>
  `
            }]
    }], null, { branchId: [{ type: i0.Input, args: [{ isSignal: true, alias: "branchId", required: true }] }] }); })();
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassDebugInfo(RequiredWorkingTreePanel, { className: "RequiredWorkingTreePanel", filePath: "input-fixture.ts", lineNumber: 23 }); })();
export class WorkingTreeInputParent {
    branchId = signal('main', ...(ngDevMode ? [{ debugName: "branchId" }] : []));
    static ɵfac = function WorkingTreeInputParent_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || WorkingTreeInputParent)(); };
    static ɵcmp = i0.ɵɵdefineComponent({ type: WorkingTreeInputParent, selectors: [["r3-working-tree-parent"]], decls: 1, vars: 1, consts: [[3, "branchId"]], template: function WorkingTreeInputParent_Template(rf, ctx) { if (rf & 1) {
            i0.ɵɵelement(0, "r3-required-working-tree-panel", 0);
        } if (rf & 2) {
            i0.ɵɵproperty("branchId", ctx.branchId());
        } }, dependencies: [RequiredWorkingTreePanel], encapsulation: 2 });
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(WorkingTreeInputParent, [{
        type: Component,
        args: [{
                selector: 'r3-working-tree-parent',
                standalone: true,
                changeDetection: ChangeDetectionStrategy.OnPush,
                imports: [RequiredWorkingTreePanel],
                template: `<r3-required-working-tree-panel [branchId]="branchId()" />`
            }]
    }], null, null); })();
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassDebugInfo(WorkingTreeInputParent, { className: "WorkingTreeInputParent", filePath: "input-fixture.ts", lineNumber: 42 }); })();
