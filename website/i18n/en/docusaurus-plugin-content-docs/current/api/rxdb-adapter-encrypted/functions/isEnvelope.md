# isEnvelope()

```ts
function isEnvelope(text): text is string;
```

Defined in: [packages/rxdb-adapter-encrypted/src/envelope.ts:180](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/envelope.ts#L180)

Lightweight check: does this string "look like" an envelope, without decoding it?

## Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `unknown` |

## Returns

`text is string`