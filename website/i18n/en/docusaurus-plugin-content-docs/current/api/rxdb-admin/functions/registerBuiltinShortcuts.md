# registerBuiltinShortcuts()

```ts
function registerBuiltinShortcuts<T>(shell): () => void;
```

Defined in: [shell/builtins.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/builtins.ts#L15)

Registers the shell's built-in shortcuts. None of them respond while the screen is locked.

## Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-t"></a> `T` |

## Parameters

| Parameter | Type                                                   | Description |
| --------- | ------------------------------------------------------ | ----------- |
| `shell`   | [`AdminShell`](../interfaces/AdminShell.md)&lt;`T`&gt; | The shell.  |

## Returns

A function that unregisters all built-in shortcuts.

() => `void`
