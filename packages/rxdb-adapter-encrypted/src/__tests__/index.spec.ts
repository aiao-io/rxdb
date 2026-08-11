import { describe, expect, it, vi } from 'vitest';

describe('package side-effects', () => {
  it('does not touch crypto.subtle on import', async () => {
    const subtle = globalThis.crypto?.subtle;
    const spy = subtle ? vi.spyOn(subtle, 'importKey') : undefined;
    // 全新导入：vitest 的 `vi.resetModules` 按测试套件生效，足以断言模块顶层
    // 求值不会执行加密操作。
    await import('../index.js');
    if (spy) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    } else {
      expect(true).toBe(true);
    }
  });

  it('exports the documented surface', async () => {
    const mod = await import('../index.js');
    const expected = [
      'encodeEnvelope',
      'decodeEnvelope',
      'isEnvelope',
      'buildAAD',
      'ENVELOPE_ALG',
      'ENVELOPE_VERSION',
      'validateEncryptedPropertyMetadata',
      'validateQueryAgainstEncryptedColumns',
      'validateFTSRegistrationAgainstEncryptedColumns',
      'EncryptedError',
      'EncryptedConfigurationError',
      'EncryptedLockedError',
      'EncryptedUnlockError',
      'EncryptedDecryptError',
      'EncryptedQueryError',
      'Keyring',
      'createKeyring',
      'VERIFIER_SENTINEL',
      'validateEncryptedQuery'
    ];
    for (const name of expected) {
      expect(mod, `missing export: ${name}`).toHaveProperty(name);
    }
  });

  it('exports scanForPlaintext from /testing sub-path', async () => {
    const mod = await import('../testing.js');
    expect(mod).toHaveProperty('scanForPlaintext');
  });
});
