# menuSource()

```ts
function menuSource<T>(shell): PaletteSource;
```

Defined in: [shell/builtins.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/builtins.ts#L59)

Menu source: one entry per menu item that has a route (descendants of routed nodes are included as usual); the subtitle is the parent path it lives in.

## Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-t"></a> `T` |

## Parameters

| Parameter | Type                                                   | Description |
| --------- | ------------------------------------------------------ | ----------- |
| `shell`   | [`AdminShell`](../interfaces/AdminShell.md)&lt;`T`&gt; | The shell.  |

## Returns

[`PaletteSource`](../interfaces/PaletteSource.md)

A synchronous source.
