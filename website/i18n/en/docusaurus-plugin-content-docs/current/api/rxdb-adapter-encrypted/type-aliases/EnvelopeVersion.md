# EnvelopeVersion

```ts
type EnvelopeVersion = 1 | 2;
```

Defined in: [packages/rxdb-adapter-encrypted/src/envelope.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/envelope.ts#L21)

Envelope versions that can be parsed; new writes always use v2, v1 is read only for explicit migration.