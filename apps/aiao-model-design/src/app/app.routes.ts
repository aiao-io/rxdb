import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  { path: '', pathMatch: 'full', redirectTo: 'model-designer/canvas' },
  {
    path: 'model-designer',
    loadChildren: () => import('./model-designer/designer.routes').then(module => module.modelDesignerRoutes)
  }
];
