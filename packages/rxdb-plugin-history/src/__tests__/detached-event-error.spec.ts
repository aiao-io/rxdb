import { describe, expect, it } from 'vitest';
import { isIgnorableDetachedVersionEventError } from '../detached-event-error.js';

// US-025 阶段 D 之前这组用例住在 `sync-listeners.spec.ts` 里 —— 判据当时和监听器同一个模块。
// 监听器随同步插件走了，判据留在本包（见 `detached-event-error.ts` 的文件头），用例跟着判据。
describe('isIgnorableDetachedVersionEventError', () => {
  const cases: ReadonlyArray<readonly [string, unknown, boolean]> = [
    ['errno 44', { errno: 44 }, true],
    ['AbortError', { name: 'AbortError' }, true],
    ['adapter shutdown', new Error('database is closed'), true],
    ['ordinary error', new Error('query failed'), false],
    ['null', null, false],
    ['primitive', 44, false]
  ];

  for (const [name, error, expected] of cases) {
    it(`classifies ${name}`, () => {
      expect(isIgnorableDetachedVersionEventError(error)).toBe(expected);
    });
  }
});
