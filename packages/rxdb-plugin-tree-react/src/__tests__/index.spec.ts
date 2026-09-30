import { describe, expect, it } from 'vitest';

import * as publicApi from '../index.js';

describe('树插件 react 绑定的公开入口', () => {
  // 桶文件里全是 `export ... from`，只有真 import 它才抓得到导出名写错 / 漏导出。
  it('四个 hook 都以运行时值导出，且三端同名', () => {
    expect(Object.keys(publicApi).sort()).toEqual([
      'useCountAncestors',
      'useCountDescendants',
      'useFindAncestors',
      'useFindDescendants'
    ]);
    expect(publicApi.useFindDescendants).toBeTypeOf('function');
    expect(publicApi.useCountDescendants).toBeTypeOf('function');
    expect(publicApi.useFindAncestors).toBeTypeOf('function');
    expect(publicApi.useCountAncestors).toBeTypeOf('function');
  });
});
