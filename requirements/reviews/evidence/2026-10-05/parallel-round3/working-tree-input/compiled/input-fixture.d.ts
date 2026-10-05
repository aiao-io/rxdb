import type { RxDB } from '@aiao/rxdb';
import type { WorkingTreeResource } from '@aiao/rxdb-plugin-working-tree-angular';
import { InjectionToken } from '@angular/core';
import * as i0 from "@angular/core";
export declare const RXDB_ENTRY: InjectionToken<() => RxDB>;
export declare const WORKING_TREE_ENTRY: InjectionToken<() => WorkingTreeResource>;
export declare class RequiredWorkingTreePanel {
    readonly branchId: import("@angular/core").InputSignal<string>;
    readonly database: RxDB;
    readonly tree: WorkingTreeResource;
    lastSwitch?: Promise<void>;
    selectBranch(): Promise<void>;
    static ɵfac: i0.ɵɵFactoryDeclaration<RequiredWorkingTreePanel, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<RequiredWorkingTreePanel, "r3-required-working-tree-panel", never, { "branchId": { "alias": "branchId"; "required": true; "isSignal": true; }; }, {}, never, never, true, never>;
}
export declare class WorkingTreeInputParent {
    readonly branchId: import("@angular/core").WritableSignal<string>;
    static ɵfac: i0.ɵɵFactoryDeclaration<WorkingTreeInputParent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<WorkingTreeInputParent, "r3-working-tree-parent", never, {}, {}, never, never, true, never>;
}
