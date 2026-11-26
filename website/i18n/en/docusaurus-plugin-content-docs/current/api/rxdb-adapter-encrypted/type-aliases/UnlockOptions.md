# UnlockOptions

```ts
type UnlockOptions = 
  | PassphraseUnlockOptions
  | CryptoKeyUnlockOptions
  | KeyBytesUnlockOptions
  | KeyProviderUnlockOptions;
```

Defined in: [packages/rxdb-adapter-encrypted/src/keyring.ts:88](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/keyring.ts#L88)

One of four mutually exclusive key sources, optionally with idle-lock and legacy-envelope migration policies.