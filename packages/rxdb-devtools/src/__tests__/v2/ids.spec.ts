import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSessionId, isCanonicalUuidV4, isDevToolsIdentifier } from '../../v2/ids.js';

/** 用固定字节填充 `getRandomValues`，让 UUID 构造过程完全可断言。 */
function stubCryptoWithBytes(fill: (index: number) => number): { getRandomValues: ReturnType<typeof vi.fn> } {
  const getRandomValues = vi.fn((target: Uint8Array) => {
    for (let index = 0; index < target.length; index++) {
      target[index] = fill(index);
    }
    return target;
  });
  // 刻意不提供 `randomUUID`：模拟 `http://192.168.1.10:4200` 这类非安全上下文。
  vi.stubGlobal('crypto', { getRandomValues });
  return { getRandomValues };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createSessionId', () => {
  it('MUST produce a canonical UUID v4', () => {
    const sessionId = createSessionId();

    expect(isCanonicalUuidV4(sessionId)).toBe(true);
    expect(sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('MUST NOT depend on crypto.randomUUID, which is undefined in non-secure contexts', () => {
    // happy-dom 同时提供 getRandomValues 与 randomUUID，且 isSecureContext 是 undefined，
    // 所以「sessionId 合法」这个断言在错误实现（直接调 randomUUID）下同样会绿。
    // 必须把 randomUUID 拿掉，才能真正验到这条约束。
    const { getRandomValues } = stubCryptoWithBytes(index => index * 7);

    const sessionId = createSessionId();

    expect(getRandomValues).toHaveBeenCalledTimes(1);
    expect(isCanonicalUuidV4(sessionId)).toBe(true);
  });

  it('MUST set the version and variant bits even when every random byte is zero', () => {
    stubCryptoWithBytes(() => 0x00);

    expect(createSessionId()).toBe('00000000-0000-4000-8000-000000000000');
  });

  it('MUST clear the variant high bits even when every random byte is 0xff', () => {
    stubCryptoWithBytes(() => 0xff);

    expect(createSessionId()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  });

  it('MUST NOT fall back to Math.random when getRandomValues is unavailable', () => {
    vi.stubGlobal('crypto', {});
    const random = vi.spyOn(Math, 'random');

    expect(() => createSessionId()).toThrow(/getRandomValues/u);
    expect(random).not.toHaveBeenCalled();

    random.mockRestore();
  });

  it('MUST produce distinct ids across calls', () => {
    const ids = new Set(Array.from({ length: 64 }, () => createSessionId()));

    expect(ids.size).toBe(64);
  });
});

describe('isCanonicalUuidV4', () => {
  it('MUST accept only the lowercase canonical v4 form', () => {
    expect(isCanonicalUuidV4('7f3e4d2c-1a0b-4c9d-8e7f-0a1b2c3d4e5f')).toBe(true);
    expect(isCanonicalUuidV4('7F3E4D2C-1A0B-4C9D-8E7F-0A1B2C3D4E5F')).toBe(false);
  });

  it('MUST reject other UUID versions and variants', () => {
    expect(isCanonicalUuidV4('7f3e4d2c-1a0b-1c9d-8e7f-0a1b2c3d4e5f')).toBe(false);
    expect(isCanonicalUuidV4('7f3e4d2c-1a0b-4c9d-ce7f-0a1b2c3d4e5f')).toBe(false);
  });

  it('MUST reject malformed and non-string input', () => {
    expect(isCanonicalUuidV4('')).toBe(false);
    expect(isCanonicalUuidV4('7f3e4d2c1a0b4c9d8e7f0a1b2c3d4e5f')).toBe(false);
    expect(isCanonicalUuidV4('7f3e4d2c-1a0b-4c9d-8e7f-0a1b2c3d4e5f ')).toBe(false);
    expect(isCanonicalUuidV4(undefined)).toBe(false);
    expect(isCanonicalUuidV4(42)).toBe(false);
  });
});

describe('isDevToolsIdentifier', () => {
  it('MUST accept 1 to 128 characters from the allowed ASCII set', () => {
    expect(isDevToolsIdentifier('a')).toBe(true);
    expect(isDevToolsIdentifier('req.1_x')).toBe(true);
    expect(isDevToolsIdentifier('req.1:x-Y_')).toBe(true);
    expect(isDevToolsIdentifier('-')).toBe(true);
    expect(isDevToolsIdentifier('A'.repeat(128))).toBe(true);
  });

  it('MUST reject empty, over-long and out-of-set values', () => {
    expect(isDevToolsIdentifier('')).toBe(false);
    expect(isDevToolsIdentifier('A'.repeat(129))).toBe(false);
    expect(isDevToolsIdentifier('req 1')).toBe(false);
    expect(isDevToolsIdentifier('req/1')).toBe(false);
    expect(isDevToolsIdentifier('req\n')).toBe(false);
    expect(isDevToolsIdentifier('请求')).toBe(false);
  });

  it('MUST reject non-string input', () => {
    expect(isDevToolsIdentifier(undefined)).toBe(false);
    expect(isDevToolsIdentifier(1)).toBe(false);
  });
});
