# splitLogicalPath()

```ts
function splitLogicalPath(path): 
  | {
  name: string;
  parent: readonly string[];
}
  | undefined;
```

Defined in: [provider/logical-path.ts:72](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/logical-path.ts#L72)

Splits a path into "parent segments + last segment".

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `path` | `unknown` | The path value on the wire. |

## Returns

  \| \{
  `name`: `string`;
  `parent`: readonly `string`[];
\}
  \| `undefined`

The parent segments and the last segment; `undefined` when the path is invalid or points at the root.

## Remarks

The root directory has no last segment, so `undefined` is returned: the `create-directory` / `delete` / `download` operations all require a concrete target name, and treating the root as the target is illegal input for each of them.
