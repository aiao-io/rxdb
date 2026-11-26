# pathToPatch()

```ts
function pathToPatch(path, value): UnknownRecord;
```

Defined in: [preferences/merge.ts:172](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/merge.ts#L172)

Turns a dotted-path value into a patch object.

## Parameters

| Parameter | Type      | Description      |
| --------- | --------- | ---------------- |
| `path`    | `string`  | The dotted path. |
| `value`   | `unknown` | The value.       |

## Returns

`UnknownRecord`

A patch that can be passed to [applyPatch](applyPatch.md).
