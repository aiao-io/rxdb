import type { Route, UrlMatchResult, UrlSegment } from '@angular/router';

/**
 * 匹配 `canvas` 和 `canvas/:entityId` 的 UrlMatcher。
 * 合并为单条路由，避免 entityId 变化时组件销毁重建。
 */
export function canvasRouteMatcher(segments: UrlSegment[]): UrlMatchResult | null {
  if (segments.length === 1 && segments[0].path === 'canvas') {
    return { consumed: segments };
  }
  if (segments.length === 2 && segments[0].path === 'canvas') {
    return { consumed: segments, posParams: { entityId: segments[1] } };
  }
  return null;
}

/** 模型设计器路由配置 */
export const modelDesignerRoutes: Route[] = [
  {
    path: '',
    loadComponent: () => import('./designer.component'),
    children: [
      { path: '', redirectTo: 'canvas', pathMatch: 'full' },
      {
        matcher: canvasRouteMatcher,
        loadComponent: () => import('./pages/canvas.page')
      },
      {
        path: 'table/:entityId',
        loadComponent: () => import('./pages/table-shell.page'),
        children: [
          { path: '', redirectTo: 'properties', pathMatch: 'full' },
          {
            path: 'properties',
            loadComponent: () => import('./pages/properties.page')
          },
          {
            path: 'relations',
            loadComponent: () => import('./pages/relations.page')
          },
          {
            path: 'indexes',
            loadComponent: () => import('./pages/indexes.page')
          }
        ]
      }
    ]
  }
];
