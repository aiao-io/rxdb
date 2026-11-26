# RxDBAdapters

Defined in: [packages/rxdb/src/rxdb-adapter.ts:1164](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L1164)

The type registry of registered adapters

## Remarks

This interface is **deliberately empty**: every adapter package merges its own name
and implementation class in via `declare module '@aiao/rxdb'` (the `rxdb-adapter-sqlite` / `-sqlite-wasm` / `-wa-sqlite` /
`-pglite` / `-sqliteai` packages all do this).

Before, it carried the `[name: string]: IRxDBAdapter` index signature,
so `keyof RxDBAdapters` was always `string` and `RxDBAdapters[K]` always `IRxDBAdapter` —
**none** of those five `declare module` blocks took effect, and `getAdapter('sqlite')` could only ever get the base interface.
The index signature has been removed; the fact that "the name can be any string" is now carried by
[RxDBAdapterName](../type-aliases/RxDBAdapterName.md) and the loose overloads of `getAdapter`.

## Example

```ts
declare module '@aiao/rxdb' {
  interface RxDBAdapters {
    sqlite: RxDBAdapterSqlite;
  }
}
```
