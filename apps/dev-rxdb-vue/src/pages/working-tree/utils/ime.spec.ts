import { describe, expect, it } from 'vitest';
import { isImeComposing } from './ime';

/**
 * @fileoverview `isImeComposing` 的纯函数单测。
 *
 * @remarks
 * 两条判据各锁一条：`isComposing`（标准口径）与 `keyCode === 229`（Safari 上屏的那一下 Enter）；
 * 普通按键两位都不沾。判定只读这两位，传普通对象即可。
 */

describe('isImeComposing', () => {
  it('isComposing 为真即组字中', () => {
    expect(isImeComposing({ isComposing: true, keyCode: 13 })).toBe(true);
  });

  it('Safari 上屏的 Enter：isComposing 为假、keyCode 是 229', () => {
    expect(isImeComposing({ isComposing: false, keyCode: 229 })).toBe(true);
  });

  it('普通的 Enter / Escape 不算组字', () => {
    expect(isImeComposing({ isComposing: false, keyCode: 13 })).toBe(false);
    expect(isImeComposing({ isComposing: false, keyCode: 27 })).toBe(false);
  });
});
