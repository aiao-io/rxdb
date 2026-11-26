# has()

```ts
function has(value, path): boolean;
```

Defined in: [packages/utils/src/object/has.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/object/has.ts#L10)

Checks whether an object has the given nested own property.

## Parameters

| Parameter | Type      | Description        |
| --------- | --------- | ------------------ |
| `value`   | `unknown` | The value to check |
| `path`    | `string`  | Dot-separated path |

## Returns

`boolean`

true when every level is an own property
