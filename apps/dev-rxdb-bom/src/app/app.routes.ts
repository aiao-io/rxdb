import { Routes } from '@angular/router';

/** 物料与主数据专项页，以及独立的实例追溯页。 */
export const appRoutes: Routes = [
  {
    path: '',
    title: '概览 · BOM 演示',
    loadComponent: () => import('./pages/overview/overview.page').then(m => m.OverviewPage)
  },
  {
    path: 'review',
    title: '生产改版核对 · BOM 演示',
    loadComponent: () => import('./pages/review/review.page').then(m => m.ReviewPage)
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
  {
    path: 'instances',
    title: '实例追溯 · BOM 演示',
    loadComponent: () => import('./pages/instances/instances.page').then(m => m.InstancesPage)
  },
  { path: '**', redirectTo: '' }
];
