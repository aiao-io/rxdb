# commandSource()

```ts
function commandSource(commands): PaletteSource;
```

Defined in: [shell/builtins.ts:88](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/builtins.ts#L88)

A command source.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `commands` | () => readonly [`ShellCommand`](../interfaces/ShellCommand.md)[] | The command read function; re-read each time the panel opens to follow the language. |

## Returns

[`PaletteSource`](../interfaces/PaletteSource.md)

A synchronous source.
