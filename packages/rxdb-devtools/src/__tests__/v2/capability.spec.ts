import { describe, expect, it } from 'vitest';

import {
  DEVTOOLS_CAPABILITIES,
  DEVTOOLS_CAPABILITY_RANK,
  isDevToolsCapability,
  satisfiesCapability
} from '../../v2/capability.js';

describe('capability catalogue', () => {
  it('MUST keep the catalogue and the rank table in lockstep', () => {
    // 两者分别由 `satisfies readonly DevToolsCapability[]` 与 `satisfies Record<DevToolsCapability, number>`
    // 约束住「不许多」和「不许少」，这条断言把两侧钉在一起，防止只改其中一处。
    expect([...DEVTOOLS_CAPABILITIES]).toEqual(Object.keys(DEVTOOLS_CAPABILITY_RANK));
  });

  it('MUST rank the tiers from narrowest to widest', () => {
    expect(DEVTOOLS_CAPABILITY_RANK.none).toBeLessThan(DEVTOOLS_CAPABILITY_RANK.readonly);
    expect(DEVTOOLS_CAPABILITY_RANK.readonly).toBeLessThan(DEVTOOLS_CAPABILITY_RANK.full);
  });
});

describe('isDevToolsCapability', () => {
  it('MUST accept the three known tiers', () => {
    for (const capability of DEVTOOLS_CAPABILITIES) {
      expect(isDevToolsCapability(capability)).toBe(true);
    }
  });

  it('MUST reject unknown tiers, prototype keys and non-strings', () => {
    expect(isDevToolsCapability('root')).toBe(false);
    expect(isDevToolsCapability('')).toBe(false);
    // `Object.hasOwn` 而不是 `in`：`'toString' in RANK` 为真，会让原型链上的名字成为合法档位。
    expect(isDevToolsCapability('toString')).toBe(false);
    expect(isDevToolsCapability(2)).toBe(false);
    expect(isDevToolsCapability(undefined)).toBe(false);
  });
});

describe('satisfiesCapability', () => {
  it('MUST accept an equal or wider tier', () => {
    expect(satisfiesCapability('full', 'readonly')).toBe(true);
    expect(satisfiesCapability('readonly', 'readonly')).toBe(true);
    expect(satisfiesCapability('none', 'none')).toBe(true);
  });

  it('MUST reject a narrower tier', () => {
    expect(satisfiesCapability('readonly', 'full')).toBe(false);
    expect(satisfiesCapability('none', 'readonly')).toBe(false);
  });
});
