# CommitEncryptedAtRestRecognizer

```ts
type CommitEncryptedAtRestRecognizer = (value) => boolean;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-codec.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-codec.ts#L85)

Judges whether a value is already in its "encrypted at-rest form".

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `unknown` | The value in the at-rest column; the caller guarantees it is neither `null` nor `undefined` |

## Returns

`boolean`

Returns `true` when it is in at-rest form

## Remarks

The real implementation is `@aiao/rxdb-adapter-encrypted`'s `isEnvelope`. For why the shape is accepted as a
callback rather than recognized inside this package, see this file's fileoverview "the recognizer is injected
by the caller".
