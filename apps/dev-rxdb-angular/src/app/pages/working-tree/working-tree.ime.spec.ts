import { describe, expect, it } from 'vitest';
import { isImeComposing } from './working-tree.ime';

/**
 * @fileoverview `isImeComposing` 的单测。
 *
 * @remarks
 * 两条判据各锁一边：`isComposing`（Chrome / Firefox 的组字回车）与 `keyCode` 229
 * （Safari 提交组字的回车报 `isComposing=false`）；外加两条都不命中的普通按键。
 * 入参是普通对象：判定只读这两个字段，不必造真的 KeyboardEvent。
 */

describe('isImeComposing', () => {
  it('isComposing 为 true 即组字中', () => {
    expect(isImeComposing({ isComposing: true, keyCode: 13 })).toBe(true);
    expect(isImeComposing({ isComposing: true, keyCode: 229 })).toBe(true);
  });

  it('isComposing 为 false 但 keyCode 是 229 也算组字中（Safari 提交组字的那一下回车）', () => {
    expect(isImeComposing({ isComposing: false, keyCode: 229 })).toBe(true);
  });

  it('两条都不命中才是普通按键', () => {
    expect(isImeComposing({ isComposing: false, keyCode: 13 })).toBe(false);
    expect(isImeComposing({ isComposing: false, keyCode: 27 })).toBe(false);
    expect(isImeComposing({ isComposing: false, keyCode: 0 })).toBe(false);
  });
});
