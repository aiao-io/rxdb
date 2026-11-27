# getPath()

```ts
function getPath(tree, path): unknown;
```

Defined in: [preferences/merge.ts:162](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/merge.ts#L162)

Reads the value at a dotted path.

## Parameters

| Parameter | Type      | Description           |
| --------- | --------- | --------------------- |
| `tree`    | `unknown` | The preferences tree. |
| `path`    | `string`  | The dotted path.      |

## Returns

`unknown`

The value; returns `undefined` when the path does not exist.
