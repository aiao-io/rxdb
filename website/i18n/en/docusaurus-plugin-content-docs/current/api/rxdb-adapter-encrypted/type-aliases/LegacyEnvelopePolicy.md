# LegacyEnvelopePolicy

```ts
type LegacyEnvelopePolicy = "reject" | "migration";
```

Defined in: [packages/rxdb-adapter-encrypted/src/keyring.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/keyring.ts#L85)

Read policy for v1 entity envelopes; all new writes always produce v2.