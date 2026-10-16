import { Routes } from '@angular/router';

/** 六页路由：概览（验收面板）/ 展开 / 时间轴 / 双图映射 / 成本卷算 / 反查。 */
export const appRoutes: Routes = [
  {
    path: '',
    title: '概览 · BOM 演示',
    loadComponent: () => import('./pages/overview/overview.page').then(m => m.OverviewPage)
  },
  {
    path: 'explosion',
    title: '展开 · BOM 演示',
    loadComponent: () => import('./pages/explosion/explosion.page').then(m => m.ExplosionPage)
  },
  {
    path: 'timeline',
    title: '时间轴 · BOM 演示',
    loadComponent: () => import('./pages/timeline/timeline.page').then(m => m.TimelinePage)
  },
  {
    path: 'mapping',
    title: '双图映射 · BOM 演示',
    loadComponent: () => import('./pages/mapping/mapping.page').then(m => m.MappingPage)
  },
  {
    path: 'cost',
    title: '成本卷算 · BOM 演示',
    loadComponent: () => import('./pages/cost/cost.page').then(m => m.CostPage)
  },
  {
    path: 'where-used',
    title: '反查 · BOM 演示',
    loadComponent: () => import('./pages/where-used/where-used.page').then(m => m.WhereUsedPage)
  },
  { path: '**', redirectTo: '' }
];
