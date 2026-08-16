import { describe, expect, it } from 'vitest';

import { DEVTOOLS_ERROR_MAPPING_FIXTURES } from '../../testing/error-fixtures.js';
import { DEVTOOLS_MAPPABLE_ERROR_CODES, mapPlatformError } from '../../v2/error-mapping.js';
import type { DevToolsErrorOrigin } from '../../v2/error-mapping.js';
import { DEVTOOLS_PROVIDER_ERROR_CODES } from '../../v2/errors.js';

const ORIGINS: readonly DevToolsErrorOrigin[] = ['dom', 'node', 'rust'];

const PLATFORM_FIXTURES = DEVTOOLS_ERROR_MAPPING_FIXTURES.filter(fixture => fixture.kind === 'platform');

describe('provider error union exhaustiveness', () => {
  it('MUST give every provider error code at least one known origin', () => {
    const covered = new Set(DEVTOOLS_ERROR_MAPPING_FIXTURES.map(fixture => fixture.expected));

    // 这条断言是 US-904b 对「穷尽性无法被普通测试证明」的缓解：新增码必须**加行**。
    expect([...DEVTOOLS_PROVIDER_ERROR_CODES].filter(code => !covered.has(code))).toEqual([]);
  });

  it('MUST map every platform fixture to the code it declares', () => {
    for (const fixture of PLATFORM_FIXTURES) {
      expect(mapPlatformError(fixture.origin, fixture.error).code, fixture.name).toBe(fixture.expected);
    }
  });

  it('MUST cover every mappable code from all three platforms', () => {
    const missing = DEVTOOLS_MAPPABLE_ERROR_CODES.flatMap(code =>
      ORIGINS.filter(
        origin => !PLATFORM_FIXTURES.some(fixture => fixture.expected === code && fixture.origin === origin)
      ).map(origin => `${origin}:${code}`)
    );

    // 只给某一端加映射会直接红——这正是「三端映射到同一个码」在结构上的守卫。
    expect(missing).toEqual([]);
  });

  it('MUST name the producing module for every protocol-originated code', () => {
    for (const fixture of DEVTOOLS_ERROR_MAPPING_FIXTURES) {
      if (fixture.kind === 'protocol') expect(fixture.producedBy).toMatch(/^[a-z0-9-]+\/[a-z0-9-]+$/u);
    }
  });

  it('MUST NOT carry duplicate fixture names', () => {
    const names = DEVTOOLS_ERROR_MAPPING_FIXTURES.map(fixture => fixture.name);

    expect(new Set(names).size).toBe(names.length);
  });
});
