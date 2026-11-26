# resolveLocateFile()

```ts
function resolveLocateFile(options?): ((name) => string) | undefined;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts:90](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts#L90)

Resolves the Emscripten `locateFile` hook.

Priority: `locateFile` \> `wasmPath` (wrapped into a function) \> undefined (use the default relative path).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`Oo1LoadOptions`](../interfaces/Oo1LoadOptions.md) | The load options |

## Returns

((`name`) => `string`) \| `undefined`

A `locateFile` function to pass to Emscripten, or undefined
