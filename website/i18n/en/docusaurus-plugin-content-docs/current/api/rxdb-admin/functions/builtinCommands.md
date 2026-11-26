# builtinCommands()

```ts
function builtinCommands<T>(shell): ShellCommand[];
```

Defined in: [shell/builtins.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/builtins.ts#L34)

The shell's built-in command palette commands.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `shell` | [`AdminShell`](../interfaces/AdminShell.md)&lt;`T`&gt; | The shell. |

## Returns

[`ShellCommand`](../interfaces/ShellCommand.md)[]

The list of commands (labels translated into the current language).
