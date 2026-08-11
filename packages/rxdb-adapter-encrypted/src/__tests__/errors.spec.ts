import { describe, expect, it } from 'vitest';
import {
  EncryptedConfigurationError,
  EncryptedDecryptError,
  EncryptedError,
  EncryptedLockedError,
  EncryptedQueryError,
  EncryptedUnlockError,
  type EncryptedErrorCode
} from '../errors.js';

describe('errors — contract', () => {
  describe('EncryptedConfigurationError', () => {
    const codes: ReadonlyArray<EncryptedErrorCode> = [
      'encrypted_pk_forbidden',
      'encrypted_fk_forbidden',
      'encrypted_index_forbidden',
      'encrypted_unique_forbidden',
      'encrypted_sortable_forbidden',
      'encrypted_computed_forbidden',
      'encrypted_fts_forbidden',
      'unsupported_kdf',
      'invalid_key',
      'invalid_key_bytes',
      'no_encrypted_columns',
      'keyring_singleton_conflict'
    ];
    it.each(codes)('accepts code %s', code => {
      const err = new EncryptedConfigurationError({ code: code as never });
      expect(err).toBeInstanceOf(EncryptedError);
      expect(err).toBeInstanceOf(EncryptedConfigurationError);
      expect(err.code).toBe(code);
      expect(err.name).toBe('EncryptedConfigurationError');
    });
    it('carries entity/property/hint/cause', () => {
      const cause = new Error('boom');
      const err = new EncryptedConfigurationError({
        code: 'encrypted_pk_forbidden',
        entity: 'User',
        property: 'id',
        hint: 'do not encrypt the PK',
        cause
      });
      expect(err.entity).toBe('User');
      expect(err.property).toBe('id');
      expect(err.hint).toBe('do not encrypt the PK');
      expect(err.cause).toBe(cause);
    });
  });

  describe('EncryptedLockedError', () => {
    it('always has code "locked"', () => {
      const err = new EncryptedLockedError({ entity: 'U', property: 'p' });
      expect(err).toBeInstanceOf(EncryptedError);
      expect(err.code).toBe('locked');
      expect(err.name).toBe('EncryptedLockedError');
      expect(err.entity).toBe('U');
      expect(err.property).toBe('p');
    });
  });

  describe('EncryptedUnlockError', () => {
    it.each(['verifier_mismatch', 'key_provider_failed'] as const)('accepts code %s', code => {
      const err = new EncryptedUnlockError({ code });
      expect(err.code).toBe(code);
      expect(err.name).toBe('EncryptedUnlockError');
    });
  });

  describe('EncryptedDecryptError', () => {
    const codes = [
      'malformed_envelope',
      'unsupported_version',
      'unsupported_algorithm',
      'unknown_kid',
      'legacy_envelope_forbidden',
      'auth_failure'
    ] as const;
    it.each(codes)('accepts code %s', code => {
      const err = new EncryptedDecryptError({ code });
      expect(err.code).toBe(code);
      expect(err.name).toBe('EncryptedDecryptError');
    });
  });

  describe('EncryptedQueryError', () => {
    const codes = [
      'where_on_encrypted',
      'order_on_encrypted',
      'group_on_encrypted',
      'projection_on_encrypted'
    ] as const;
    it.each(codes)('accepts code %s', code => {
      const err = new EncryptedQueryError({ code, entity: 'U', property: 'p', hint: 'h' });
      expect(err.code).toBe(code);
      expect(err.entity).toBe('U');
      expect(err.property).toBe('p');
      expect(err.hint).toBe('h');
      expect(err.name).toBe('EncryptedQueryError');
    });
  });
});
