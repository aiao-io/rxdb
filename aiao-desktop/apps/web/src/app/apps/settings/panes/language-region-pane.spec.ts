import { describe, expect, it } from 'vitest';

import { effectiveLanguageOf } from './language-region-pane';

/* 面板渲染与点击行为由 apps/e2e/src/groups/language.mjs 覆盖（本产品组件不进单测，惯例如此）。 */

describe('effectiveLanguageOf', () => {
  it.each(['zh-Hans', 'zh-CN', 'zh-TW', 'zh-HK'])('%s 归一为 zh-Hans', locale => {
    expect(effectiveLanguageOf(locale)).toBe('zh-Hans');
  });

  it.each(['en', 'en-US', 'de-DE'])('%s 归一为 en（非中文设备按英文基线）', locale => {
    expect(effectiveLanguageOf(locale)).toBe('en');
  });
});
