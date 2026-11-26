# EncryptedErrorCode

```ts
type EncryptedErrorCode =
  | 'encrypted_pk_forbidden'
  | 'encrypted_fk_forbidden'
  | 'encrypted_index_forbidden'
  | 'encrypted_unique_forbidden'
  | 'encrypted_sortable_forbidden'
  | 'encrypted_computed_forbidden'
  | 'encrypted_fts_forbidden'
  | 'unsupported_kdf'
  | 'invalid_key'
  | 'invalid_key_bytes'
  | 'no_encrypted_columns'
  | 'keyring_singleton_conflict'
  | 'locked'
  | 'verifier_mismatch'
  | 'key_provider_failed'
  | 'unlock_aborted_by_lock'
  | 'malformed_envelope'
  | 'unsupported_version'
  | 'unsupported_algorithm'
  | 'unknown_kid'
  | 'legacy_envelope_forbidden'
  | 'auth_failure'
  | 'where_on_encrypted'
  | 'order_on_encrypted'
  | 'group_on_encrypted'
  | 'projection_on_encrypted';
```

Defined in: [packages/rxdb-adapter-encrypted/src/errors.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/errors.ts#L10)

Union of all concrete subclasses' `code` literals.
