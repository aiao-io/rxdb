# loadSubframeModuleFactory()

```ts
function loadSubframeModuleFactory(): Promise<WaSqliteModuleFactory>;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/subframe-glue.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/subframe-glue.ts#L20)

Loads the synchronous wa-sqlite module factory of `@subframe7536/sqlite-wasm`.

This build enables `ENABLE_FTS5`, so the mini program side can create FTS5 virtual tables too. The returned factory must be paired with the same package's
[SUBFRAME\_WASM\_SUBPATH](../variables/SUBFRAME_WASM_SUBPATH.md) — the glue and the wasm are a pair, and mixing them across builds results in a `LinkError`.

## Returns

`Promise`&lt;[`WaSqliteModuleFactory`](../type-aliases/WaSqliteModuleFactory.md)&gt;

## Throws

Thrown when the glue does not export a module factory, usually meaning the dependency version has drifted.
