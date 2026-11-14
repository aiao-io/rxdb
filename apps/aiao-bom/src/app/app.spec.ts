import { describe, expect, it } from 'vitest';
import { appRoutes } from './app.routes';

describe('旧版 BOM 入口', () => {
  it('共用领域工作区并保留既有页面地址', () => {
    expect(appRoutes.map(route => route.path)).toEqual(['', 'review', 'explosion', 'timeline', 'mapping', 'cost', 'where-used', 'instances', 'transfer', '**']);
  });
});
