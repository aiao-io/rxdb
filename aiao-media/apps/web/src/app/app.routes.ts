import type { Routes } from '@angular/router';
// The persistent image workspace owns its three paths without remounting private state.
export const appRoutes: Routes = [{ path: '**', children: [] }];
